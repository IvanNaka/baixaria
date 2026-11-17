/**
 * Lógica pura de detecção de notas (sem dependência do navegador),
 * para poder ser testada isoladamente.
 */

/** Faixa de frequências aceitas: B0 (~31 Hz) com folga até ~C5. */
export const MIN_FREQ = 27;
export const MAX_FREQ = 700;

export function frequencyToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function frequencyToNote(freq: number): { midi: number; cents: number } {
  const exact = frequencyToMidiFloat(freq);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) || 0 };
}

export function rms(buf: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export interface PitchReading {
  /** Momento da leitura em ms. */
  t: number;
  /** Frequência estimada (Hz) ou null se não houver altura definida. */
  freq: number | null;
  /** Confiança do detector (0–1). */
  clarity: number;
  /** Volume RMS do sinal. */
  rms: number;
}

export interface StabilizerOptions {
  /** Tempo que a nota precisa se manter estável para ser aceita. */
  stableMs: number;
  /** Tempo sem sinal válido para considerar a nota encerrada. */
  releaseMs: number;
  minClarity: number;
  minRms: number;
}

export const DEFAULT_STABILIZER: StabilizerOptions = {
  stableMs: 120,
  releaseMs: 150,
  minClarity: 0.85,
  minRms: 0.008,
};

/**
 * Converte leituras contínuas em eventos discretos de "nota tocada":
 * emite uma vez por ataque, quando a altura se mantém estável.
 *
 * - Saltos de oitava momentâneos (comuns no baixo por causa dos harmônicos)
 *   não reiniciam a nota; a oitava emitida é a mais frequente na janela.
 * - Um novo ataque (salto de volume) permite repetir a mesma nota.
 */
export class NoteStabilizer {
  private candidatePc: number | null = null;
  private since = 0;
  private emitted = false;
  private lastValidAt = -Infinity;
  private counts = new Map<number, number>();
  private envelope = 0;

  private readonly opts: StabilizerOptions;

  constructor(opts: Partial<StabilizerOptions> = {}) {
    this.opts = { ...DEFAULT_STABILIZER, ...opts };
  }

  setMinRms(minRms: number): void {
    this.opts.minRms = minRms;
  }

  reset(): void {
    this.candidatePc = null;
    this.emitted = false;
    this.counts.clear();
  }

  /** Processa uma leitura; retorna a nota MIDI quando um novo ataque se estabiliza. */
  push(r: PitchReading): number | null {
    const { stableMs, releaseMs, minClarity, minRms } = this.opts;

    // detecção de ataque: volume sobe bem acima do envelope (que decai devagar)
    const onset = r.rms > minRms && r.rms > this.envelope * 1.8;
    this.envelope = Math.max(r.rms, this.envelope * 0.9);
    if (onset && this.emitted) this.reset();

    const valid =
      r.freq !== null &&
      r.freq >= MIN_FREQ &&
      r.freq <= MAX_FREQ &&
      r.clarity >= minClarity &&
      r.rms >= minRms;

    if (!valid) {
      if (r.t - this.lastValidAt > releaseMs) this.reset();
      return null;
    }
    this.lastValidAt = r.t;

    const { midi } = frequencyToNote(r.freq!);
    const pc = ((midi % 12) + 12) % 12;

    if (pc !== this.candidatePc) {
      this.candidatePc = pc;
      this.since = r.t;
      this.emitted = false;
      this.counts.clear();
    }
    this.counts.set(midi, (this.counts.get(midi) ?? 0) + 1);

    if (!this.emitted && r.t - this.since >= stableMs) {
      this.emitted = true;
      let best = midi;
      let bestCount = 0;
      for (const [m, c] of this.counts) {
        if (c > bestCount || (c === bestCount && m < best)) {
          best = m;
          bestCount = c;
        }
      }
      return best;
    }
    return null;
  }
}

/** Compara a nota tocada com a esperada, exigindo ou não a oitava exata. */
export function notesMatch(played: number, expected: number, exactOctave: boolean): boolean {
  return exactOctave ? played === expected : (((played - expected) % 12) + 12) % 12 === 0;
}
