import {
  INTERVALS,
  TUNINGS,
  findTuning,
  fullRange,
  isNatural,
  midiAt,
  midiToFrequency,
  noteName,
  pitchClass,
  positionsForMidi,
  positionsForPitchClass,
  weightedPick,
} from './music';

describe('music', () => {
  const bass4 = findTuning('4');

  it('nomeia notas em cifra e solfejo', () => {
    expect(noteName(28, 'letters', 'sharp')).toBe('E');
    expect(noteName(1, 'letters', 'sharp')).toBe('C#');
    expect(noteName(1, 'letters', 'flat')).toBe('D♭');
    expect(noteName(33, 'solfege', 'sharp')).toBe('Lá');
    expect(noteName(10, 'solfege', 'flat')).toBe('Si♭');
  });

  it('calcula a classe de altura inclusive para valores negativos', () => {
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(43)).toBe(7);
  });

  it('identifica notas naturais', () => {
    expect([0, 2, 4, 5, 7, 9, 11].every(isNatural)).toBeTrue();
    expect([1, 3, 6, 8, 10].some(isNatural)).toBeFalse();
  });

  it('afina o baixo de 4 cordas em E A D G', () => {
    expect(bass4.strings.map((m) => noteName(m, 'letters', 'sharp'))).toEqual(['E', 'A', 'D', 'G']);
    expect(midiToFrequency(28)).toBeCloseTo(41.2, 1);
  });

  it('casa 5 de uma corda = corda solta seguinte', () => {
    for (let s = 0; s < bass4.strings.length - 1; s++) {
      expect(midiAt(bass4, { string: s, fret: 5 })).toBe(midiAt(bass4, { string: s + 1, fret: 0 }));
    }
  });

  it('encontra posições pela altura exata e pela classe', () => {
    const range = fullRange(bass4, 0, 12);
    // A1 (33): corda E casa 5 e corda A solta
    expect(positionsForMidi(bass4, range, 33)).toEqual([
      { string: 0, fret: 5 },
      { string: 1, fret: 0 },
    ]);
    // Todas as notas Lá entre as casas 0 e 12
    const as = positionsForPitchClass(bass4, range, 9);
    expect(as.length).toBe(5); // E5, A0, A12, D7, G2
    expect(as.every((p) => pitchClass(midiAt(bass4, p)) === 9)).toBeTrue();
  });

  it('tem 12 intervalos de 1 a 12 semitons', () => {
    expect(INTERVALS.map((i) => i.semitones)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('todas as afinações têm cordas em ordem crescente', () => {
    for (const t of TUNINGS) {
      expect([...t.strings].sort((a, b) => a - b)).toEqual(t.strings);
    }
  });

  it('sorteio ponderado nunca escolhe item de peso zero', () => {
    for (let i = 0; i < 200; i++) {
      expect(weightedPick(['a', 'b'], (x) => (x === 'a' ? 0 : 1))).toBe('b');
    }
  });
});
