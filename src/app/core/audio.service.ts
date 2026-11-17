import { Injectable, inject } from '@angular/core';
import { midiToFrequency } from './music';
import { SettingsService } from './settings.service';

/** Sintetizador simples de "corda dedilhada" via Web Audio API. */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly settings = inject(SettingsService);
  private ctx?: AudioContext;
  /** Até quando (performance.now) há som da própria app saindo nos alto-falantes. */
  private busyUntil = 0;

  /** True enquanto a app está tocando (o microfone deve ignorar esse período). */
  isPlaying(): boolean {
    return performance.now() < this.busyUntil;
  }

  private context(): AudioContext | undefined {
    if (typeof AudioContext === 'undefined') return undefined;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Toca uma nota. `force` ignora a configuração de som desligado. */
  play(midi: number, opts: { delay?: number; duration?: number; force?: boolean } = {}): void {
    const s = this.settings.settings();
    if (!s.sound && !opts.force) return;
    const ctx = this.context();
    if (!ctx) return;

    this.busyUntil = Math.max(
      this.busyUntil,
      performance.now() + ((opts.delay ?? 0) + (opts.duration ?? 1.4)) * 1000 + 150,
    );

    const pitch = midi + (s.octaveUp ? 12 : 0);
    const freq = midiToFrequency(pitch);
    const start = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.duration ?? 1.4;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, start);
    out.gain.exponentialRampToValueAtTime(0.5, start + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(Math.min(freq * 10, 4000), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 120), start + dur * 0.6);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.35;

    const sine = ctx.createOscillator();
    sine.type = 'sine';
    sine.frequency.value = freq;

    saw.connect(sawGain).connect(filter);
    sine.connect(filter);
    filter.connect(out).connect(ctx.destination);

    for (const osc of [saw, sine]) {
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  }

  /** Toca duas notas: melódico (uma depois da outra) ou harmônico (juntas). */
  playInterval(a: number, b: number, harmonic = false, force = false): void {
    if (harmonic) {
      this.play(a, { force, duration: 1.8 });
      this.play(b, { force, duration: 1.8 });
    } else {
      this.play(a, { force, duration: 1.1 });
      this.play(b, { force, delay: 0.75, duration: 1.4 });
    }
  }
}
