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

  constructor() {
    effect(() => {
      const p = this.prefs();
      saveJson(PREFS_KEY, p);
      this.stabilizer.setMinRms(p.minRms);
    });
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

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(
        'Este navegador não permite acesso ao microfone aqui. Use um navegador atualizado e ' +
          'abra a app em https:// ou em http://localhost.',
      );
      return;
    }

    this.starting.set(true);
    try {
      const deviceId = this.prefs().deviceId;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // processamentos pensados para voz atrapalham a detecção de notas
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaStreamSource(this.stream);
      // corta agudos que só confundem o detector (a nota mais aguda do baixo fica bem abaixo)
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1500;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = WINDOW;
      source.connect(lowpass).connect(this.analyser);

      this.stabilizer.reset();
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.listening.set(true);
      await this.refreshDevices();
    } catch (e) {
      this.cleanup();
      this.error.set(this.describeError(e));
    } finally {
      this.starting.set(false);
    }
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

  private async refreshDevices(): Promise<void> {
    const all = await navigator.mediaDevices.enumerateDevices();
    this.devices.set(
      all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Entrada ${i + 1}` })),
    );
  }

  private tick(): void {
    if (!this.analyser || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const volume = rms(this.buffer);
    this.level.set(Math.min(1, Math.max(0, (20 * Math.log10(volume + 1e-9) + 60) / 60)));

    const t = performance.now();
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

    this.reading.set(
      freq !== null && clarity >= 0.8 ? { freq, clarity, ...frequencyToNote(freq) } : null,
    );

    const note = this.stabilizer.push({ t, freq, clarity, rms: volume });
    if (note !== null) {
      this.lastNote.set(note);
      this.notes$.next(note);
    }
  }

  private describeError(e: unknown): string {
    const name = (e as { name?: string })?.name;
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Permissão do microfone negada. Libere o acesso nas configurações do site (ícone ao lado do endereço) e tente de novo.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'Nenhum microfone encontrado. Conecte um microfone ou interface de áudio e tente de novo.';
      case 'NotReadableError':
        return 'O microfone está sendo usado por outro programa.';
      default:
        return `Não foi possível acessar o microfone (${name ?? String(e)}).`;
    }
  }
}
