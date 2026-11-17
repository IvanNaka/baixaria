import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { AudioService } from '../../core/audio.service';
import {
  FretPosition,
  FretRange,
  INTERVALS,
  Interval,
  Tuning,
  findInterval,
  fullRange,
  midiAt,
  positionsForMidi,
  positionsInRange,
  randomItem,
  samePosition,
  weightedPick,
} from '../../core/music';
import { SessionScore } from '../../core/score';
import { SettingsService } from '../../core/settings.service';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { RangePicker } from '../../shared/range-picker';
import { ScoreBar } from '../../shared/score-bar';

type Mode = 'identify' | 'find' | 'ear';
type Direction = 'up' | 'down' | 'both';
type Status = 'pending' | 'correct' | 'wrong';

interface Question {
  root: FretPosition;
  rootMidi: number;
  /** Distância com sinal: positivo = ascendente. */
  semitones: number;
  /** Posição do alvo exibida (identify / ear). */
  target: FretPosition;
  /** Todas as posições que contam como certas (find). */
  targets: FretPosition[];
  startedAt: number;
}

const PRESETS: { label: string; semitones: number[] }[] = [
  { label: 'Básicos (3m 3M 5J 8J)', semitones: [3, 4, 7, 12] },
  { label: 'Escala maior', semitones: [2, 4, 5, 7, 9, 11, 12] },
  { label: 'Todos', semitones: INTERVALS.map((i) => i.semitones) },
];

/** Distância máxima de casas entre tônica e alvo no modo "formas próximas". */
const SHAPE_SPAN = 4;

@Component({
  selector: 'app-intervalos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, RangePicker, ScoreBar],
  templateUrl: './intervalos.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Intervalos {
  protected readonly settings = inject(SettingsService);
  private readonly stats = inject(StatsService);
  private readonly audio = inject(AudioService);

  protected readonly modes: { id: Mode; label: string }[] = [
    { id: 'identify', label: 'Identifique no braço' },
    { id: 'find', label: 'Encontre o intervalo' },
    { id: 'ear', label: 'Treino de ouvido' },
  ];
  protected readonly presets = PRESETS;
  protected readonly allIntervals = INTERVALS;

  protected readonly mode = signal<Mode>('identify');
  protected readonly enabled = signal<number[]>([3, 4, 7, 12]);
  protected readonly direction = signal<Direction>('up');
  protected readonly nearShapes = signal(true);
  protected readonly harmonic = signal(false);
  protected readonly range = linkedSignal<Tuning, FretRange>({
    source: this.settings.tuning,
    computation: (t, prev) => fullRange(t, prev?.value.minFret ?? 0, prev?.value.maxFret ?? 12),
  });
  protected readonly boardFrets = computed(() => Math.max(12, this.range().maxFret));

  protected readonly score = new SessionScore();
  protected readonly question = signal<Question | null>(null);
  protected readonly status = signal<Status>('pending');
  protected readonly picked = signal<number | null>(null);
  protected readonly clicks = signal<{ pos: FretPosition; ok: boolean }[]>([]);

  private timer?: ReturnType<typeof setTimeout>;

  protected readonly answerButtons = computed(() =>
    INTERVALS.filter((i) => this.enabled().includes(i.semitones)),
  );

  protected readonly currentInterval = computed<Interval | null>(() => {
    const q = this.question();
    return q ? findInterval(q.semitones) : null;
  });

  private get statKey(): string {
    return this.mode() === 'ear' ? STAT_KEYS.intervalEar : STAT_KEYS.intervalVisual;
  }

  protected readonly markers = computed<FretMarker[]>(() => {
    const q = this.question();
    if (!q) return [];
    const st = this.status();
    const mode = this.mode();
    const iv = findInterval(q.semitones);
    const revealed = st !== 'pending';
    const out: FretMarker[] = [];

    if (mode === 'ear' && !revealed) return out;

    out.push({
      ...q.root,
      kind: 'root',
      label: revealed ? this.settings.name(q.rootMidi) : 'R',
    });

    if (mode === 'find') {
      for (const c of this.clicks()) {
        out.push({ ...c.pos, kind: c.ok ? 'correct' : 'wrong', label: c.ok ? iv.short : '✕' });
      }
      if (revealed) {
        for (const t of q.targets) {
          if (!this.clicks().some((c) => c.ok && samePosition(c.pos, t))) {
            out.push({ ...t, kind: 'hint', label: iv.short });
          }
        }
      }
      return out;
    }

    out.push({
      ...q.target,
      kind: !revealed ? 'question' : st === 'correct' ? 'correct' : 'wrong',
      label: revealed ? iv.short : '?',
    });
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    this.next();
  }

  // ------------------------------------------------------------------ opções

  protected setMode(m: Mode): void {
    this.mode.set(m);
    this.score.reset();
    this.next();
  }

  protected setRange(r: FretRange): void {
    this.range.set(r);
    this.next();
  }

  protected toggleInterval(semitones: number): void {
    this.enabled.update((list) => {
      if (list.includes(semitones)) return list.length > 1 ? list.filter((s) => s !== semitones) : list;
      return [...list, semitones].sort((a, b) => a - b);
    });
    this.next();
  }

  protected applyPreset(semitones: number[]): void {
    this.enabled.set([...semitones]);
    this.next();
  }

  protected setDirection(d: Direction): void {
    this.direction.set(d);
    this.next();
  }

  protected toggleNear(): void {
    this.nearShapes.update((v) => !v);
    this.next();
  }

  protected toggleHarmonic(): void {
    this.harmonic.update((v) => !v);
    this.replay();
  }

  // ---------------------------------------------------------------- perguntas

  protected next(): void {
    clearTimeout(this.timer);
    const tuning = this.settings.tuning();
    const range = this.range();
    const all = positionsInRange(range);

    let pool = [...this.enabled()];
    while (pool.length > 0) {
      const size = weightedPick(pool, (s) => this.stats.weight(this.statKey, String(s)));
      const dir = this.direction() === 'both' ? randomItem(['up', 'down']) : this.direction();
      const signed = dir === 'up' ? size : -size;

      const pairs: { root: FretPosition; target: FretPosition }[] = [];
      for (const root of all) {
        const targetMidi = midiAt(tuning, root) + signed;
        for (const target of positionsForMidi(tuning, range, targetMidi)) {
          if (this.nearShapes() && Math.abs(target.fret - root.fret) > SHAPE_SPAN) continue;
          pairs.push({ root, target });
        }
      }

      if (pairs.length === 0) {
        pool = pool.filter((s) => s !== size);
        continue;
      }

      const { root, target } = randomItem(pairs);
      const rootMidi = midiAt(tuning, root);
      this.question.set({
        root,
        rootMidi,
        semitones: signed,
        target,
        targets: positionsForMidi(tuning, range, rootMidi + signed),
        startedAt: performance.now(),
      });
      this.status.set('pending');
      this.picked.set(null);
      this.clicks.set([]);
      if (this.mode() === 'ear') this.replay();
      return;
    }
    this.question.set(null);
  }

  protected replay(): void {
    const q = this.question();
    if (!q) return;
    this.audio.playInterval(q.rootMidi, q.rootMidi + q.semitones, this.harmonic(), true);
  }

  protected playRoot(): void {
    const q = this.question();
    if (q) this.audio.play(q.rootMidi, { force: true });
  }

  /** Modos identify / ear. */
  protected answer(semitones: number): void {
    const q = this.question();
    if (!q || this.status() !== 'pending' || this.mode() === 'find') return;
    this.picked.set(semitones);
    this.finish(semitones === Math.abs(q.semitones));
    if (this.mode() === 'identify') {
      this.audio.playInterval(q.rootMidi, q.rootMidi + q.semitones, false);
    }
  }

  /** Modo find. */
  protected onPosition(pos: FretPosition): void {
    const q = this.question();
    if (!q || this.status() !== 'pending' || this.mode() !== 'find') return;
    const midi = midiAt(this.settings.tuning(), pos);
    const ok = midi === q.rootMidi + q.semitones;
    this.clicks.set([{ pos, ok }]);
    this.audio.playInterval(q.rootMidi, midi, false);
    this.finish(ok);
  }

  protected giveUp(): void {
    if (this.question() && this.status() === 'pending') this.finish(false);
  }

  private finish(ok: boolean): void {
    const q = this.question()!;
    this.stats.record(
      this.statKey,
      String(Math.abs(q.semitones)),
      ok,
      performance.now() - q.startedAt,
    );
    this.score.register(ok);
    this.status.set(ok ? 'correct' : 'wrong');
    if (ok) this.timer = setTimeout(() => this.next(), this.mode() === 'ear' ? 1600 : 1100);
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' || e.key === ' ') && this.status() !== 'pending') {
      e.preventDefault();
      this.next();
    } else if (e.key.toLowerCase() === 'r' && this.mode() === 'ear') {
      this.replay();
    }
  }
}
