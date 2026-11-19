/**
 * Utilidades de teoria musical usadas pelos exercícios.
 * As alturas são representadas como números MIDI (C4 = 60).
 */

export type Accidental = 'sharp' | 'flat';
export type Notation = 'letters' | 'solfege';

const SHARP_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_LETTERS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_SOLFEGE = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const FLAT_SOLFEGE = ['Dó', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Sol♭', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'];

export const PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function isNatural(pc: number): boolean {
  return [0, 2, 4, 5, 7, 9, 11].includes(pitchClass(pc));
}

export function noteName(midiOrPc: number, notation: Notation, accidental: Accidental): string {
  const pc = pitchClass(midiOrPc);
  if (notation === 'solfege') {
    return (accidental === 'sharp' ? SHARP_SOLFEGE : FLAT_SOLFEGE)[pc];
  }
  return (accidental === 'sharp' ? SHARP_LETTERS : FLAT_LETTERS)[pc].replace('b', '♭');
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Afinações
// ---------------------------------------------------------------------------

export interface Tuning {
  id: string;
  label: string;
  /** Alturas MIDI das cordas soltas, da mais grave para a mais aguda. */
  strings: number[];
}

export const TUNINGS: Tuning[] = [
  { id: '4', label: '4 cordas (E A D G)', strings: [28, 33, 38, 43] },
  { id: '5', label: '5 cordas (B E A D G)', strings: [23, 28, 33, 38, 43] },
  { id: '6', label: '6 cordas (B E A D G C)', strings: [23, 28, 33, 38, 43, 48] },
  { id: '4-drop-d', label: '4 cordas Drop D (D A D G)', strings: [26, 33, 38, 43] },
];

export function findTuning(id: string): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

// ---------------------------------------------------------------------------
// Posições no braço
// ---------------------------------------------------------------------------

export interface FretPosition {
  /** Índice da corda: 0 = mais grave. */
  string: number;
  fret: number;
}

export function positionKey(p: FretPosition): string {
  return `${p.string}:${p.fret}`;
}

export function samePosition(a: FretPosition, b: FretPosition): boolean {
  return a.string === b.string && a.fret === b.fret;
}

export function midiAt(tuning: Tuning, p: FretPosition): number {
  return tuning.strings[p.string] + p.fret;
}

export interface FretRange {
  minFret: number;
  maxFret: number;
  /** Índices das cordas habilitadas. */
  strings: number[];
}

export function positionsInRange(range: FretRange): FretPosition[] {
  const out: FretPosition[] = [];
  for (const s of range.strings) {
    for (let f = range.minFret; f <= range.maxFret; f++) out.push({ string: s, fret: f });
  }
  return out;
}

/** Todas as posições dentro da faixa que tocam exatamente essa altura MIDI. */
export function positionsForMidi(tuning: Tuning, range: FretRange, midi: number): FretPosition[] {
  return positionsInRange(range).filter((p) => midiAt(tuning, p) === midi);
}

/** Todas as posições dentro da faixa com essa classe de altura (qualquer oitava). */
export function positionsForPitchClass(tuning: Tuning, range: FretRange, pc: number): FretPosition[] {
  return positionsInRange(range).filter((p) => pitchClass(midiAt(tuning, p)) === pitchClass(pc));
}

// ---------------------------------------------------------------------------
// Intervalos
// ---------------------------------------------------------------------------

export interface Interval {
  semitones: number;
  short: string;
  name: string;
}

export const INTERVALS: Interval[] = [
  { semitones: 1, short: '2m', name: 'Segunda menor' },
  { semitones: 2, short: '2M', name: 'Segunda maior' },
  { semitones: 3, short: '3m', name: 'Terça menor' },
  { semitones: 4, short: '3M', name: 'Terça maior' },
  { semitones: 5, short: '4J', name: 'Quarta justa' },
  { semitones: 6, short: 'TT', name: 'Trítono (4A / 5d)' },
  { semitones: 7, short: '5J', name: 'Quinta justa' },
  { semitones: 8, short: '6m', name: 'Sexta menor' },
  { semitones: 9, short: '6M', name: 'Sexta maior' },
  { semitones: 10, short: '7m', name: 'Sétima menor' },
  { semitones: 11, short: '7M', name: 'Sétima maior' },
  { semitones: 12, short: '8J', name: 'Oitava' },
];

export function findInterval(semitones: number): Interval {
  const iv = INTERVALS.find((i) => i.semitones === Math.abs(semitones));
  if (!iv) throw new Error(`Intervalo não suportado: ${semitones}`);
  return iv;
}

// ---------------------------------------------------------------------------
// Aleatoriedade
// ---------------------------------------------------------------------------

export function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Escolhe um item com probabilidade proporcional ao peso informado. */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map((i) => Math.max(0, weight(i)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return randomItem(items);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Chave estável para estatísticas por posição: altura da corda solta + casa. */
export function positionStatKey(tuning: Tuning, p: FretPosition): string {
  return `${tuning.strings[p.string]}:${p.fret}`;
}

export function fullRange(tuning: Tuning, minFret = 0, maxFret = 12): FretRange {
  return { minFret, maxFret, strings: tuning.strings.map((_, i) => i) };
}

// ---------------------------------------------------------------------------
// Mapa de intervalos
// ---------------------------------------------------------------------------

const COMPOUND_SHORT: Record<number, string> = {
  13: '9m',
  14: '9M',
  15: '10m',
  16: '10M',
  17: '11J',
  18: '11A',
  19: '12J',
  20: '13m',
  21: '13M',
  22: '14m',
  23: '14M',
  24: '15J',
};

/**
 * Rótulo curto de uma distância em semitons a partir da tônica.
 * - `degree`: só a classe do intervalo (grau), ignorando oitava e direção.
 * - `real`: distância real, com compostos (9ª, 10ª…) e "↓" para notas abaixo da tônica.
 */
export function intervalLabel(semitones: number, mode: 'degree' | 'real'): string {
  if (mode === 'degree') {
    const pc = pitchClass(semitones);
    return pc === 0 ? 'R' : findInterval(pc).short;
  }
  if (semitones === 0) return 'R';
  const abs = Math.abs(semitones);
  const short = abs <= 12 ? findInterval(abs).short : (COMPOUND_SHORT[abs] ?? `${abs}st`);
  return semitones < 0 ? `↓${short}` : short;
}

/** Cor de cada classe de intervalo (0 = tônica), legível com texto branco. */
export const INTERVAL_COLORS: Record<number, string> = {
  0: '#4f7cff',
  1: '#2a8f99',
  2: '#1f6f78',
  3: '#3f9b4a',
  4: '#237a3a',
  5: '#a8811a',
  6: '#c0343c',
  7: '#d0701a',
  8: '#9a55bf',
  9: '#75399c',
  10: '#5f6ad6',
  11: '#3d47b0',
};

/**
 * Deslocamento de casas para tocar um intervalo ascendente subindo `stringsUp` cordas,
 * numa afinação em quartas (5 semitons entre cordas vizinhas).
 */
export function shapeOffset(semitones: number, stringsUp: number): number {
  return semitones - 5 * stringsUp;
}
