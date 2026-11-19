import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  OnInit,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MicrophoneService } from '../../core/microphone.service';
import {
  FretPosition,
  FretRange,
  PITCH_CLASSES,
  Tuning,
  fullRange,
  isNatural,
  midiAt,
  pitchClass,
  positionsForPitchClass,
  positionsInRange,
  weightedPick,
} from '../../core/music';
import { notesMatch } from '../../core/pitch';
import { SessionScore } from '../../core/score';
import { SettingsService } from '../../core/settings.service';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { RangePicker } from '../../shared/range-picker';
import { ScoreBar } from '../../shared/score-bar';

type Status = 'pending' | 'correct' | 'revealed';

interface Question {
  pc: number;
  /** Só no modo "corda". */
  string: number | null;
  /** Alturas exatas aceitas (modo corda) — vazio no modo nota. */
  midis: number[];
  startedAt: number;
}

@Component({
  selector: 'app-toque-nota',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, RangePicker, ScoreBar],
  template: `
    <div class="card options">
      @if (mode() === 'string') {
        <app-range-picker [range]="range()" (rangeChange)="setRange($event)" />
      }
      <label class="chip" [class.on]="naturalsOnly()">
        <input type="checkbox" [checked]="naturalsOnly()" (change)="toggleNaturals()" />
        Só notas naturais
      </label>
    </div>

    <div class="card exercise">
      @if (!mic.listening()) {
        <p class="muted">Ative o microfone acima para começar.</p>
      }
      @if (question(); as q) {
        <div class="prompt">
          Toque
          <strong class="huge">{{ settings.name(q.pc) }}</strong>
          @if (q.string !== null) {
            na corda <strong class="big">{{ settings.stringName(q.string) }}</strong>
            <span class="muted">(casas {{ range().minFret }}–{{ range().maxFret }})</span>
          } @else {
            <span class="muted">em qualquer lugar do braço</span>
          }
        </div>

        <div class="feedback">
          @switch (status()) {
            @case ('correct') {
              <span class="ok-text">Certo! ✓</span>
            }
            @case ('revealed') {
              <span class="err-text">As posições de {{ settings.name(q.pc) }} estão no braço abaixo.</span>
              <button type="button" class="primary" (click)="next()">Próxima</button>
            }
            @default {
              @if (wrong() !== null) {
                <span class="err-text">Você tocou {{ settings.name(wrong()!) }} — tente de novo</span>
              } @else {
                <span class="muted">Aguardando você tocar…</span>
              }
              <button type="button" class="link" (click)="reveal()">Mostrar resposta</button>
              <button type="button" class="link" (click)="skip()">Pular</button>
            }
          }
        </div>

        <app-fretboard
          [tuning]="settings.tuning()"
          [frets]="boardFrets()"
          [range]="mode() === 'string' ? range() : null"
          [markers]="markers()"
        />
      }
      <app-score-bar [score]="score" />
    </div>
  `,
  styles: `
    .prompt .huge {
      font-size: 2.6rem;
      color: var(--accent);
      line-height: 1;
    }
  `,
})
export class ToqueNota implements OnInit {
  protected readonly mic = inject(MicrophoneService);
  protected readonly settings = inject(SettingsService);
  private readonly stats = inject(StatsService);

  readonly mode = input.required<'note' | 'string'>();

  protected readonly naturalsOnly = signal(false);
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

  private get statKey(): string {
    return this.mode() === 'note' ? STAT_KEYS.micNote : STAT_KEYS.micString;
  }

  /** Depois da resposta, mostra onde a nota fica no braço. */
  protected readonly markers = computed<FretMarker[]>(() => {
    const q = this.question();
    if (!q || this.status() === 'pending') return [];
    const tuning = this.settings.tuning();
    const kind = this.status() === 'correct' ? 'correct' : 'hint';
    const range = this.mode() === 'string' ? this.range() : fullRange(tuning, 0, this.boardFrets());
    return positionsForPitchClass(tuning, range, q.pc)
      .filter((p) => q.string === null || p.string === q.string)
      .map((p) => ({ ...p, kind, label: this.settings.name(q.pc) }));
  });

  constructor() {
    this.mic.notes$.pipe(takeUntilDestroyed()).subscribe((n) => this.onNote(n));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit(): void {
    this.next();
  }

  protected setRange(r: FretRange): void {
    this.range.set(r);
    this.next();
  }

  protected toggleNaturals(): void {
    this.naturalsOnly.update((v) => !v);
    this.next();
  }

  protected next(): void {
    clearTimeout(this.timer);
    const tuning = this.settings.tuning();
    const prevPc = this.question()?.pc;
    let q: Question | null = null;

    if (this.mode() === 'note') {
      let pcs = PITCH_CLASSES.filter((pc) => !this.naturalsOnly() || isNatural(pc));
      if (pcs.length > 1) pcs = pcs.filter((pc) => pc !== prevPc);
      const pc = weightedPick(pcs, (p) => this.stats.weight(this.statKey, String(p)));
      q = { pc, string: null, midis: [], startedAt: performance.now() };
    } else {
      const candidates = positionsInRange(this.range()).filter((p) => {
        const pc = pitchClass(midiAt(tuning, p));
        return (!this.naturalsOnly() || isNatural(pc)) && pc !== prevPc;
      });
      if (candidates.length) {
        const pos: FretPosition = weightedPick(candidates, (p) =>
          this.stats.weight(this.statKey, String(pitchClass(midiAt(tuning, p)))),
        );
        const pc = pitchClass(midiAt(tuning, pos));
        const midis = positionsInRange(this.range())
          .filter((p) => p.string === pos.string && pitchClass(midiAt(tuning, p)) === pc)
          .map((p) => midiAt(tuning, p));
        q = { pc, string: pos.string, midis, startedAt: performance.now() };
      }
    }

    this.question.set(q);
    this.status.set('pending');
    this.wrong.set(null);
    this.hadError = false;
  }

  private onNote(played: number): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;

    const ok =
      q.string === null
        ? pitchClass(played) === q.pc
        : q.midis.some((m) => notesMatch(played, m, this.mic.prefs().exactOctave));

    if (!ok) {
      this.wrong.set(played);
      if (!this.hadError) this.stats.record(this.statKey, String(q.pc), false);
      this.hadError = true;
      return;
    }

    if (!this.hadError) {
      this.stats.record(this.statKey, String(q.pc), true, performance.now() - q.startedAt);
    }
    this.score.register(!this.hadError);
    this.status.set('correct');
    this.timer = setTimeout(() => this.next(), 1300);
  }

  protected reveal(): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;
    if (!this.hadError) this.stats.record(this.statKey, String(q.pc), false);
    this.score.register(false);
    this.status.set('revealed');
  }

  protected skip(): void {
    this.reveal();
    this.next();
  }
}
