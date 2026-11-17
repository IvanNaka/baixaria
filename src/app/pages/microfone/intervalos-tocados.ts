import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AudioService } from '../../core/audio.service';
import { MicrophoneService } from '../../core/microphone.service';
import {
  FretPosition,
  FretRange,
  INTERVALS,
  Tuning,
  findInterval,
  fullRange,
  midiAt,
  positionsForMidi,
  positionsInRange,
  randomItem,
  weightedPick,
} from '../../core/music';
import { notesMatch } from '../../core/pitch';
import { SessionScore } from '../../core/score';
import { SettingsService } from '../../core/settings.service';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { RangePicker } from '../../shared/range-picker';
import { ScoreBar } from '../../shared/score-bar';

type Direction = 'up' | 'down' | 'both';
type Status = 'pending' | 'correct' | 'revealed';

interface Question {
  root: FretPosition;
  rootMidi: number;
  semitones: number;
  startedAt: number;
}

const PRESETS: { label: string; semitones: number[] }[] = [
  { label: 'Básicos', semitones: [3, 4, 7, 12] },
  { label: 'Escala maior', semitones: [2, 4, 5, 7, 9, 11, 12] },
  { label: 'Todos', semitones: INTERVALS.map((i) => i.semitones) },
];

@Component({
  selector: 'app-intervalos-tocados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, RangePicker, ScoreBar],
  template: `
    <div class="card options">
      <div class="row">
        <span class="label">Intervalos:</span>
        @for (iv of allIntervals; track iv.semitones) {
          <label class="chip" [class.on]="enabled().includes(iv.semitones)" [title]="iv.name">
            <input
              type="checkbox"
              [checked]="enabled().includes(iv.semitones)"
              (change)="toggleInterval(iv.semitones)"
            />
            {{ iv.short }}
          </label>
        }
      </div>
      <div class="row">
        <span class="label">Pré-seleções:</span>
        @for (p of presets; track p.label) {
          <button type="button" class="small" (click)="applyPreset(p.semitones)">{{ p.label }}</button>
        }
        <label>
          Direção
          <select [value]="direction()" (change)="setDirection($any($event.target).value)">
            <option value="up">Ascendente</option>
            <option value="down">Descendente</option>
            <option value="both">Ambas</option>
          </select>
        </label>
      </div>
      <app-range-picker [range]="range()" (rangeChange)="setRange($event)" />
      @if (!mic.prefs().exactOctave) {
        <p class="muted small-note">
          Com "Exigir oitava exata" desligado, vale a nota certa em qualquer oitava (por exemplo, uma
          5J acima é aceita também como 4J abaixo). Ligue para treinar o desenho exato no braço.
        </p>
      }
    </div>

    <div class="card exercise">
      @if (!mic.listening()) {
        <p class="muted">Ative o microfone acima para começar.</p>
      }
      @if (question(); as q) {
        <div class="prompt">
          Toque a <strong class="big">{{ interval().short }}</strong>
          <span class="muted">({{ interval().name }})</span>
          {{ q.semitones > 0 ? 'acima' : 'abaixo' }} de
          <strong class="big">{{ settings.name(q.rootMidi) }}</strong>
          <button type="button" class="small" (click)="playRoot()">🔊 Ouvir tônica</button>
        </div>

        <div class="feedback">
          @switch (status()) {
            @case ('correct') {
              <span class="ok-text">
                Certo! {{ settings.name(q.rootMidi) }} → {{ settings.name(q.rootMidi + q.semitones) }}
              </span>
            }
            @case ('revealed') {
              <span class="err-text">
                Era {{ settings.name(q.rootMidi + q.semitones) }} — posições tracejadas no braço
              </span>
              <button type="button" class="primary" (click)="next()">Próxima</button>
            }
            @default {
              @if (wrong() !== null) {
                <span class="err-text">Você tocou {{ settings.name(wrong()!) }} — tente de novo</span>
              } @else {
                <span class="muted">Aguardando você tocar…</span>
              }
              <button type="button" class="link" (click)="reveal()">Mostrar resposta</button>
            }
          }
        </div>

        <app-fretboard
          [tuning]="settings.tuning()"
          [frets]="boardFrets()"
          [range]="range()"
          [markers]="markers()"
        />
      } @else {
        <p class="muted">Nenhum intervalo selecionado cabe nessa faixa do braço. Amplie a faixa.</p>
      }
      <app-score-bar [score]="score" />
    </div>
  `,
  styles: `
    .small-note {
      margin: 0;
      font-size: 0.85rem;
    }
  `,
})
export class IntervalosTocados {
  protected readonly mic = inject(MicrophoneService);
  protected readonly settings = inject(SettingsService);
  private readonly stats = inject(StatsService);
  private readonly audio = inject(AudioService);

  protected readonly allIntervals = INTERVALS;
  protected readonly presets = PRESETS;
  protected readonly enabled = signal<number[]>([3, 4, 7, 12]);
  protected readonly direction = signal<Direction>('up');
  protected readonly range = linkedSignal<Tuning, FretRange>({
    source: this.settings.tuning,
    computation: (t, prev) => fullRange(t, prev?.value.minFret ?? 0, prev?.value.maxFret ?? 12),
  });
  protected readonly boardFrets = computed(() => Math.max(12, this.range().maxFret));

  protected readonly score = new SessionScore();
  protected readonly question = signal<Question | null>(null);
  protected readonly status = signal<Status>('pending');
  protected readonly wrong = signal<number | null>(null);
  private hadError = false;
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly interval = computed(() => findInterval(this.question()?.semitones ?? 1));

  protected readonly markers = computed<FretMarker[]>(() => {
    const q = this.question();
    if (!q) return [];
    const out: FretMarker[] = [{ ...q.root, kind: 'root', label: this.settings.name(q.rootMidi) }];
    if (this.status() !== 'pending') {
      const kind = this.status() === 'correct' ? 'correct' : 'hint';
      for (const p of positionsForMidi(this.settings.tuning(), this.range(), q.rootMidi + q.semitones)) {
        out.push({ ...p, kind, label: this.interval().short });
      }
    }
    return out;
  });

  constructor() {
    this.mic.notes$.pipe(takeUntilDestroyed()).subscribe((n) => this.onNote(n));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    this.next(false);
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

  protected setRange(r: FretRange): void {
    this.range.set(r);
    this.next();
  }

  protected next(play = true): void {
    clearTimeout(this.timer);
    const tuning = this.settings.tuning();
    const lowest = tuning.strings[0];
    const highest = tuning.strings[tuning.strings.length - 1] + 24;
    const roots = positionsInRange(this.range());

    let pool = [...this.enabled()];
    while (pool.length) {
      const size = weightedPick(pool, (s) => this.stats.weight(STAT_KEYS.micInterval, String(s)));
      const dir = this.direction() === 'both' ? randomItem(['up', 'down']) : this.direction();
      const signed = dir === 'up' ? size : -size;
      // o alvo precisa existir no instrumento (em qualquer posição)
      const valid = roots.filter((p) => {
        const target = midiAt(tuning, p) + signed;
        return target >= lowest && target <= highest;
      });
      if (!valid.length) {
        pool = pool.filter((s) => s !== size);
        continue;
      }
      const root = randomItem(valid);
      this.question.set({
        root,
        rootMidi: midiAt(tuning, root),
        semitones: signed,
        startedAt: performance.now(),
      });
      this.status.set('pending');
      this.wrong.set(null);
      this.hadError = false;
      if (play) this.playRoot();
      return;
    }
    this.question.set(null);
  }

  protected playRoot(): void {
    const q = this.question();
    if (q) this.audio.play(q.rootMidi, { force: true, duration: 1.0 });
  }

  private onNote(played: number): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;
    // tocar a própria tônica como referência não conta como erro
    if (played === q.rootMidi) return;

    const ok = notesMatch(played, q.rootMidi + q.semitones, this.mic.prefs().exactOctave);
    const key = String(Math.abs(q.semitones));
    if (!ok) {
      this.wrong.set(played);
      if (!this.hadError) this.stats.record(STAT_KEYS.micInterval, key, false);
      this.hadError = true;
      return;
    }
    if (!this.hadError) {
      this.stats.record(STAT_KEYS.micInterval, key, true, performance.now() - q.startedAt);
    }
    this.score.register(!this.hadError);
    this.status.set('correct');
    this.timer = setTimeout(() => this.next(), 1500);
  }

  protected reveal(): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;
    if (!this.hadError) this.stats.record(STAT_KEYS.micInterval, String(Math.abs(q.semitones)), false);
    this.score.register(false);
    this.status.set('revealed');
  }
}
