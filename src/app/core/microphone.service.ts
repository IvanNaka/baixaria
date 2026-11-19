import { Injectable, effect, inject, signal } from '@angular/core';
import { PitchDetector } from 'pitchy';
import { Subject } from 'rxjs';
import { AudioService } from './audio.service';
import { MAX_FREQ, MIN_FREQ, NoteStabilizer, frequencyToNote, rms } from './pitch';
import { loadJson, saveJson } from './storage';

export interface LiveReading {
  freq: number;
  midi: number;
  cents: number;
  clarity: number;
}

export interface MicPrefs {
  deviceId: string;
  /** Volume mínimo (RMS) para considerar que há uma nota. */
  minRms: number;
  /** Exige a oitava exata nos exercícios em que isso faz sentido. */
  exactOctave: boolean;
}

const PREFS_KEY = 'baixo-estudo:microfone';
const DEFAULT_PREFS: MicPrefs = { deviceId: '', minRms: 0.008, exactOctave: false };

/** Janela de análise: ~170 ms a 48 kHz, suficiente para o Si grave (31 Hz). */
const WINDOW = 8192;
const TICK_MS = 30;

@Injectable({ providedIn: 'root' })
export class MicrophoneService {
  private readonly audio = inject(AudioService);

  readonly prefs = signal<MicPrefs>(loadJson(PREFS_KEY, DEFAULT_PREFS));
  readonly listening = signal(false);
  readonly starting = signal(false);
  readonly error = signal<string | null>(null);
  readonly devices = signal<{ id: string; label: string }[]>([]);
  /** Volume atual (0–1, escala aproximadamente logarítmica para o medidor). */
  readonly level = signal(0);
  /** Leitura contínua (para o afinador); null quando não há nota clara. */
  readonly reading = signal<LiveReading | null>(null);
  /** Aviso não fatal (ex.: entrada sem sinal). */
  readonly warning = signal<string | null>(null);
  /** Diagnóstico bruto: volume em dB, frequência e confiança da última leitura. */
  readonly diagnostics = signal<{ db: number; freq: number | null; clarity: number }>({
    db: -Infinity,
    freq: null,
    clarity: 0,
  });
  /** Nome da entrada efetivamente em uso. */
  readonly activeDevice = signal<string | null>(null);
  /** Último ataque de nota estável detectado. */
  readonly lastNote = signal<number | null>(null);
  /** Emite a nota MIDI a cada novo ataque estável. */
  readonly notes$ = new Subject<number>();

  private ctx?: AudioContext;
  private stream?: MediaStream;
  private analyser?: AnalyserNode;
  private timer?: ReturnType<typeof setInterval>;
  private readonly buffer = new Float32Array(WINDOW);
  private readonly detector = PitchDetector.forFloat32Array(WINDOW);
  private readonly stabilizer = new NoteStabilizer();
  private silentSince: number | null = null;

  constructor() {
    effect(() => {
      const p = this.prefs();
      saveJson(PREFS_KEY, p);
      this.stabilizer.setMinRms(p.minRms);
    });
    // lista as entradas já de início e acompanha conexões/desconexões
    if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator) {
      void this.refreshDevices();
      navigator.mediaDevices.addEventListener('devicechange', () => void this.refreshDevices());
    }
  }

  updatePrefs(patch: Partial<MicPrefs>): void {
    const deviceChanged = patch.deviceId !== undefined && patch.deviceId !== this.prefs().deviceId;
    this.prefs.update((p) => ({ ...p, ...patch }));
    if (deviceChanged && this.listening()) {
      this.stop();
      void this.start();
    }
  }

  async start(): Promise<void> {
    if (this.listening() || this.starting()) return;
    this.error.set(null);
    this.warning.set(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(
        'O navegador só libera o microfone em páginas seguras. Abra a app em http://localhost ' +
          '(no mesmo computador) ou por https:// — pelo endereço de rede (http://192.168…) o ' +
          'microfone fica bloqueado. Veja no README como rodar com https.',
      );
      return;
    }

    this.starting.set(true);
    // O AudioContext é criado ainda dentro do clique: Safari/iOS (e às vezes o Chrome)
    // deixam suspenso um contexto criado depois de um "await", e aí só chega silêncio.
    let ctx = new AudioContext();
    void ctx.resume();
    try {
      this.stream = await this.openStream();
      const track = this.stream.getAudioTracks()[0];

      let source: MediaStreamAudioSourceNode;
      try {
        source = ctx.createMediaStreamSource(this.stream);
      } catch {
        // Firefox: taxa de amostragem do microfone diferente da do contexto
        void ctx.close();
        ctx = new AudioContext({ sampleRate: track.getSettings().sampleRate });
        source = ctx.createMediaStreamSource(this.stream);
      }
      this.ctx = ctx;
      if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);

      // corta agudos que só confundem o detector (a nota mais aguda do baixo fica bem abaixo)
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1500;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = WINDOW;
      source.connect(lowpass).connect(this.analyser);

      this.activeDevice.set(track.label || null);
      track.addEventListener('ended', () => {
        this.stop();
        this.error.set('A entrada de áudio foi desconectada.');
      });

      this.stabilizer.reset();
      this.silentSince = null;
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.listening.set(true);
      await this.refreshDevices();
    } catch (e) {
      void ctx.close();
      this.cleanup();
      this.error.set(this.describeError(e));
      await this.refreshDevices();
    } finally {
      this.starting.set(false);
    }
  }

  /** Abre a entrada escolhida; se ela não existir mais, cai para a padrão. */
  private async openStream(): Promise<MediaStream> {
    const base: MediaTrackConstraints = {
      // processamentos pensados para voz atrapalham a detecção de notas
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    const deviceId = this.prefs().deviceId;
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...base, deviceId: { exact: deviceId } },
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw e;
        this.prefs.update((p) => ({ ...p, deviceId: '' }));
        this.warning.set('A entrada escolhida não foi encontrada; usando a entrada padrão.');
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: base });
  }

  /** Tenta retomar o processamento de áudio (quando o navegador o deixou suspenso). */
  async resume(): Promise<void> {
    await this.ctx?.resume().catch(() => undefined);
    this.warning.set(null);
    this.silentSince = null;
  }

  stop(): void {
    this.cleanup();
    this.listening.set(false);
    this.level.set(0);
    this.reading.set(null);
  }

  private cleanup(): void {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = undefined;
    this.ctx = undefined;
    this.analyser = undefined;
  }

  async refreshDevices(): Promise<void> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      // antes da permissão alguns navegadores devolvem entradas sem id nem nome
      const inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
      this.devices.set(
        inputs.map((d, i) => ({ id: d.deviceId, label: d.label || `Microfone ${i + 1}` })),
      );
    } catch {
      this.devices.set([]);
    }
  }

  private tick(): void {
    if (!this.analyser || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const volume = rms(this.buffer);
    const db = 20 * Math.log10(volume + 1e-9);
    this.level.set(Math.min(1, Math.max(0, (db + 70) / 70)));

    const t = performance.now();
    this.checkSilence(t, volume);
    // enquanto a app toca um som, o microfone o captaria: ignora esse trecho
    if (this.audio.isPlaying()) {
      this.reading.set(null);
      this.stabilizer.push({ t, freq: null, clarity: 0, rms: 0 });
      return;
    }

    let freq: number | null = null;
    let clarity = 0;
    if (volume >= this.prefs().minRms) {
      [freq, clarity] = this.detector.findPitch(this.buffer, this.ctx.sampleRate);
      if (!(freq >= MIN_FREQ && freq <= MAX_FREQ)) freq = null;
    }

    this.diagnostics.set({ db, freq, clarity });
    this.reading.set(
      freq !== null && clarity >= 0.8 ? { freq, clarity, ...frequencyToNote(freq) } : null,
    );

    const note = this.stabilizer.push({ t, freq, clarity, rms: volume });
    if (note !== null) {
      this.lastNote.set(note);
      this.notes$.next(note);
    }
  }

  /** Avisa quando nada chega da entrada (silêncio digital absoluto por 2,5 s). */
  private checkSilence(t: number, volume: number): void {
    if (volume > 0) {
      this.silentSince = null;
      if (this.warning()?.startsWith('Nenhum sinal')) this.warning.set(null);
      return;
    }
    this.silentSince ??= t;
    if (t - this.silentSince > 2500 && !this.warning()) {
      this.warning.set(
        this.ctx?.state === 'running'
          ? 'Nenhum sinal chegando desta entrada. Confira se é o dispositivo certo, se ele não ' +
              'está mudo no sistema e se o ganho da interface está aberto.'
          : 'Nenhum sinal: o navegador pausou o áudio. Clique em "Retomar áudio".',
      );
    }
  }

  private describeError(e: unknown): string {
    const name = (e as { name?: string })?.name;
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return (
          'Permissão do microfone negada. Libere o acesso nas configurações do site (ícone ao ' +
          'lado do endereço) e confira também se o sistema permite que o navegador use o ' +
          'microfone (Windows: Configurações › Privacidade › Microfone; macOS: Ajustes › ' +
          'Privacidade e Segurança › Microfone).'
        );
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'Nenhum microfone encontrado. Conecte um microfone ou interface de áudio e tente de novo.';
      case 'NotReadableError':
        return (
          'Não foi possível abrir a entrada: ela pode estar em uso exclusivo por outro programa ' +
          '(DAW, Zoom, driver ASIO…). Feche-o ou escolha outra entrada.'
        );
      case 'NotSupportedError':
      case 'AbortError':
        return (
          'O navegador não conseguiu abrir o microfone. Recarregue a página, confira as ' +
          'permissões do site e, se usar interface de áudio, escolha outra entrada na lista.'
        );
      default:
        return `Não foi possível acessar o microfone (${name ?? ''} ${(e as Error)?.message ?? String(e)}).`;
    }
  }
}
