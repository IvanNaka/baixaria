import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { AudioService } from '../../core/audio.service';
import {
  FretPosition,
  FretRange,
  INTERVALS,
  INTERVAL_COLORS,
  Tuning,
  fullRange,
  intervalLabel,
  midiAt,
  pitchClass,
  positionsInRange,
  shapeOffset,
} from '../../core/music';
import { SettingsService } from '../../core/settings.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';

type LabelMode = 'degree' | 'real';
type ClickAction = 'root' | 'play';

/** Distância máxima (em casas) da tônica no modo "região da mão". */
const HAND_SPAN = 4;

const PRESETS: { label: string; semitones: number[] }[] = [
  { label: 'Tríade maior', semitones: [4, 7] },
  { label: 'Tríade menor', semitones: [3, 7] },
  { label: 'Acorde 7', semitones: [4, 7, 10] },
  { label: 'm7', semitones: [3, 7, 10] },
  { label: '7M', semitones: [4, 7, 11] },
  { label: 'Pentatônica menor', semitones: [3, 5, 7, 10] },
  { label: 'Pentatônica maior', semitones: [2, 4, 7, 9] },
  { label: 'Escala maior', semitones: [2, 4, 5, 7, 9, 11] },
  { label: 'Escala menor', semitones: [2, 3, 5, 7, 8, 10] },
  { label: 'Todos', semitones: INTERVALS.filter((i) => i.semitones < 12).map((i) => i.semitones) },
];

@Component({
  selector: 'app-mapa-intervalos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard],
  templateUrl: './mapa-intervalos.html',
  styleUrl: './mapa-intervalos.scss',
})
export class MapaIntervalos {
  protected readonly settings = inject(SettingsService);
  private readonly audio = inject(AudioService);

  protected readonly presets = PRESETS;
  protected readonly intervals = INTERVALS.filter((i) => i.semitones < 12);
  protected readonly colors = INTERVAL_COLORS;

  /** Tônica: começa no Lá da corda Mi (casa 5). */
  protected readonly root = linkedSignal<Tuning, FretPosition>({
    source: this.settings.tuning,
    computation: (t) => {
      const e = t.strings.findIndex((m) => pitchClass(m) === 4);
      const string = e >= 0 ? e : 0;
      return { string, fret: pitchClass(9 - t.strings[string]) };
    },
  });
  protected readonly frets = signal(12);
  protected readonly labelMode = signal<LabelMode>('degree');
  protected readonly clickAction = signal<ClickAction>('root');
  protected readonly handRegion = signal(false);
  /** Classes de intervalo visíveis (1–11); a tônica sempre aparece. */
  protected readonly enabled = signal<number[]>([4, 7]);
  /** Intervalo em destaque na tabela de formas (passar o mouse / tocar). */
  protected readonly focused = signal<number | null>(null);

  protected readonly rootMidi = computed(() => midiAt(this.settings.tuning(), this.root()));

  protected readonly rootInfo = computed(() => {
    const r = this.root();
    return {
      name: this.settings.name(this.rootMidi()),
      string: this.settings.stringName(r.string),
      fret: r.fret,
    };
  });

  /** No modo "região da mão", esmaece o que está fora da região. */
  protected readonly range = computed<FretRange | null>(() => {
    if (!this.handRegion()) return null;
    const f = this.root().fret;
    return {
      ...fullRange(this.settings.tuning()),
      minFret: Math.max(0, f - HAND_SPAN),
      maxFret: Math.min(this.frets(), f + HAND_SPAN),
    };
  });

  protected readonly markers = computed<FretMarker[]>(() => {
    const tuning = this.settings.tuning();
    const root = this.root();
    const rootMidi = this.rootMidi();
    const enabled = this.enabled();
    const focused = this.focused();
    const range = this.range();
    const out: FretMarker[] = [];

    for (const p of positionsInRange(fullRange(tuning, 0, this.frets()))) {
      const d = midiAt(tuning, p) - rootMidi;
      const pc = pitchClass(d);
      if (pc !== 0 && !enabled.includes(pc)) continue;
      if (focused !== null && pc !== 0 && pc !== focused) continue;
      if (range && (p.fret < range.minFret || p.fret > range.maxFret)) continue;
      if (this.labelMode() === 'real' && Math.abs(d) > 24) continue;

      const isRoot = p.string === root.string && p.fret === root.fret;
      out.push({
        ...p,
        kind: isRoot ? 'root' : 'note',
        label: intervalLabel(d, this.labelMode()),
        color: isRoot ? undefined : INTERVAL_COLORS[pc],
      });
    }
    return out;
  });

  /** Tabela de formas: onde cada intervalo fica em relação à tônica. */
  protected readonly shapes = computed(() =>
    // intervalos visíveis + a oitava, que serve de referência para todos
    [...this.intervals.filter((iv) => this.enabled().includes(iv.semitones)), INTERVALS[INTERVALS.length - 1]]
      .map((iv) => ({
        ...iv,
        note: this.settings.name(this.rootMidi() + iv.semitones),
        cells: [0, 1, 2].map((up) => this.formatOffset(shapeOffset(iv.semitones, up), up)),
      })),
  );

  protected readonly hasDropTuning = computed(() => {
    const s = this.settings.tuning().strings;
    return s.some((m, i) => i > 0 && m - s[i - 1] !== 5);
  });

  protected isOn(semitones: number): boolean {
    return this.enabled().includes(semitones);
  }

  protected toggle(semitones: number): void {
    this.focused.set(null);
    this.enabled.update((list) =>
      list.includes(semitones) ? list.filter((s) => s !== semitones) : [...list, semitones].sort((a, b) => a - b),
    );
  }

  protected applyPreset(semitones: number[]): void {
    this.focused.set(null);
    this.enabled.set([...semitones]);
  }

  protected onPosition(p: FretPosition): void {
    const midi = midiAt(this.settings.tuning(), p);
    if (this.clickAction() === 'root') {
      this.root.set(p);
      this.audio.play(midi, { force: true });
    } else {
      this.audio.playInterval(this.rootMidi(), midi, false, true);
    }
  }

  protected playShape(semitones: number): void {
    this.audio.playInterval(this.rootMidi(), this.rootMidi() + semitones, false, true);
  }

  private formatOffset(offset: number, stringsUp: number): string {
    // formas que exigem esticar mais de 5 casas não são práticas
    if (offset < -5 || offset > 5 || (stringsUp === 0 && offset === 0)) return '—';
    if (offset === 0) return 'mesma casa';
    const n = Math.abs(offset);
    return `${n} casa${n > 1 ? 's' : ''} ${offset > 0 ? 'à frente' : 'atrás'}`;
  }
}
