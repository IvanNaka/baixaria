import { Injectable, effect, signal } from '@angular/core';
import { loadJson, saveJson } from './storage';

export interface ItemStats {
  ok: number;
  err: number;
  /** Tempo total de resposta (ms) das respostas certas. */
  timeMs: number;
}

/** exercício -> item -> estatísticas */
export type StatsData = Record<string, Record<string, ItemStats>>;

export const STAT_KEYS = {
  notePc: 'notas:classe',
  notePosition: 'notas:posicao',
  namesToSolfege: 'cifras:para-solfejo',
  namesToLetters: 'cifras:para-cifra',
  intervalVisual: 'intervalos:visual',
  intervalEar: 'intervalos:ouvido',
} as const;

const KEY = 'baixo-estudo:stats';

@Injectable({ providedIn: 'root' })
export class StatsService {
  readonly data = signal<StatsData>(loadJson<StatsData>(KEY, {}));

  constructor() {
    effect(() => saveJson(KEY, this.data()));
  }

  record(exercise: string, item: string, correct: boolean, timeMs = 0): void {
    this.data.update((d) => {
      const ex = { ...(d[exercise] ?? {}) };
      const cur = ex[item] ?? { ok: 0, err: 0, timeMs: 0 };
      ex[item] = correct
        ? { ...cur, ok: cur.ok + 1, timeMs: cur.timeMs + timeMs }
        : { ...cur, err: cur.err + 1 };
      return { ...d, [exercise]: ex };
    });
  }

  get(exercise: string, item: string): ItemStats {
    return this.data()[exercise]?.[item] ?? { ok: 0, err: 0, timeMs: 0 };
  }

  /**
   * Peso para sorteio adaptativo: itens com mais erros (ou nunca praticados)
   * aparecem com mais frequência.
   */
  weight(exercise: string, item: string): number {
    const { ok, err } = this.get(exercise, item);
    if (ok + err === 0) return 2;
    return 0.3 + (err + 1) / (ok + 1);
  }

  accuracy(s: ItemStats): number | null {
    const total = s.ok + s.err;
    return total === 0 ? null : s.ok / total;
  }

  reset(): void {
    this.data.set({});
  }
}
