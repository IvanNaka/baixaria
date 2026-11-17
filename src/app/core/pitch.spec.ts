import { PitchDetector } from 'pitchy';
import { NoteStabilizer, frequencyToNote, notesMatch } from './pitch';
import { midiToFrequency } from './music';

const SR = 48000;
const N = 8192;

/** Tom sintético parecido com baixo: harmônicos fortes e fundamental fraca. */
function bassTone(midi: number, fundamental = 0.2): Float32Array {
  const f = midiToFrequency(midi);
  const buf = new Float32Array(N);
  for (let h = 1; h <= 10; h++) {
    const amp = h === 1 ? fundamental : 1 / h;
    for (let i = 0; i < N; i++) buf[i] += amp * Math.sin((2 * Math.PI * f * h * i) / SR + h);
  }
  return buf;
}

describe('pitch', () => {
  it('converte frequência em nota e cents', () => {
    expect(frequencyToNote(440)).toEqual({ midi: 69, cents: 0 });
    expect(frequencyToNote(41.2)).toEqual({ midi: 28, cents: 0 });
    expect(frequencyToNote(41)).toEqual({ midi: 28, cents: -9 });
    expect(frequencyToNote(445).cents).toBe(20);
  });

  it('detecta na oitava certa as notas do baixo de 5 cordas (B0 a G4)', () => {
    const detector = PitchDetector.forFloat32Array(N);
    for (let midi = 23; midi <= 67; midi++) {
      const [freq, clarity] = detector.findPitch(bassTone(midi), SR);
      expect(frequencyToNote(freq).midi).withContext(`midi ${midi}`).toBe(midi);
      expect(clarity).toBeGreaterThan(0.85);
    }
  });

  it('compara notas com e sem oitava exata', () => {
    expect(notesMatch(40, 28, false)).toBeTrue();
    expect(notesMatch(40, 28, true)).toBeFalse();
    expect(notesMatch(29, 28, false)).toBeFalse();
  });

  describe('NoteStabilizer', () => {
    const f = (midi: number) => midiToFrequency(midi);
    const read = (t: number, freq: number | null, rms = 0.1) => ({ t, freq, clarity: 0.95, rms });

    it('emite uma única vez depois que a nota fica estável', () => {
      const s = new NoteStabilizer();
      const out: number[] = [];
      for (let t = 0; t <= 600; t += 30) {
        const n = s.push(read(t, f(33)));
        if (n !== null) out.push(n);
      }
      expect(out).toEqual([33]);
    });

    it('ignora saltos de oitava momentâneos e emite a oitava predominante', () => {
      const s = new NoteStabilizer();
      const out: number[] = [];
      const seq = [45, 33, 33, 45, 33, 33, 33, 33];
      seq.forEach((m, i) => {
        const n = s.push(read(i * 30, f(m)));
        if (n !== null) out.push(n);
      });
      expect(out).toEqual([33]);
    });

    it('não emite ruídos curtos', () => {
      const s = new NoteStabilizer();
      expect(s.push(read(0, f(40)))).toBeNull();
      expect(s.push(read(30, f(41)))).toBeNull();
      expect(s.push(read(60, f(42)))).toBeNull();
    });

    it('permite tocar a mesma nota de novo após silêncio', () => {
      const s = new NoteStabilizer();
      const out: number[] = [];
      let t = 0;
      const play = (ms: number, freq: number | null, rms: number) => {
        for (const end = t + ms; t < end; t += 30) {
          const n = s.push(read(t, freq, rms));
          if (n !== null) out.push(n);
        }
      };
      play(300, f(28), 0.1);
      play(300, null, 0.001);
      play(300, f(28), 0.1);
      expect(out).toEqual([28, 28]);
    });

    it('detecta novo ataque da mesma nota sem silêncio entre elas', () => {
      const s = new NoteStabilizer();
      const out: number[] = [];
      let t = 0;
      let level = 0.2;
      for (; t < 600; t += 30, level *= 0.9) {
        const n = s.push(read(t, f(38), level));
        if (n !== null) out.push(n);
      }
      for (const end = t + 300; t < end; t += 30) {
        const n = s.push(read(t, f(38), 0.2));
        if (n !== null) out.push(n);
      }
      expect(out).toEqual([38, 38]);
    });
  });
});
