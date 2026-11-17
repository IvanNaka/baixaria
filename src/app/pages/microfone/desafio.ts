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
import { MicrophoneService } from '../../core/microphone.service';
import { PITCH_CLASSES, Tuning, isNatural, pitchClass } from '../../core/music';
import { SettingsService } from '../../core/settings.service';
import { loadJson, saveJson } from '../../core/storage';

type Kind = 'naturais' | 'cromatica' | 'quartas' | 'maior';
type Phase = 'idle' | 'ready' | 'running' | 'done';

interface ChallengeRecord {
  bestMs: number;
}

const RECORDS_KEY = 'baixo-estudo:desafios';

const KINDS: { id: Kind; label: string; help: string }[] = [
  {
    id: 'naturais',
    label: 'Notas naturais na corda',
    help: 'Toque as notas naturais da corda escolhida, da casa 0 até a 12, subindo.',
  },
  {
    id: 'cromatica',
    label: 'Cromática na corda',
    help: 'Toque todas as casas de 0 a 12 da corda escolhida, subindo.',
  },
  {
    id: 'quartas',
    label: 'Ciclo de quartas',
    help: 'C, F, B♭, E♭… As 12 notas em qualquer posição — ótimo para fixar o braço todo.',
  },
  {
    id: 'maior',
    label: 'Escala maior',
    help: 'Uma oitava subindo e descendo, a partir da tônica escolhida.',
  },
];

const MAJOR_UP_DOWN = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];

function formatTime(ms: number): string {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

@Component({
  selector: 'app-desafio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card options">
      <div class="row">
        <label>
          Desafio
          <select [value]="kind()" (change)="setKind($any($event.target).value)">
            @for (k of kinds; track k.id) {
              <option [value]="k.id" [selected]="k.id === kind()">{{ k.label }}</option>
            }
          </select>
        </label>
        @if (kind() === 'naturais' || kind() === 'cromatica') {
          <label>
            Corda
            <select [value]="stringIndex()" (change)="setString(+$any($event.target).value)">
              @for (s of strings(); track s.index) {
                <option [value]="s.index" [selected]="s.index === stringIndex()">{{ s.label }}</option>
              }
            </select>
          </label>
        }
        @if (kind() === 'maior') {
          <label>
            Tônica
            <select [value]="root()" (change)="setRoot(+$any($event.target).value)">
              @for (pc of pitchClasses; track pc) {
                <option [value]="pc" [selected]="pc === root()">{{ settings.name(pc) }}</option>
              }
            </select>
          </label>
        }
      </div>
      <p class="muted help">{{ help() }}</p>
    </div>

    <div class="card exercise">
      @if (!mic.listening()) {
        <p class="muted">Ative o microfone acima para começar.</p>
      }

      <div class="top">
        <div class="clock" [class.running]="phase() === 'running'">{{ clock() }}</div>
        <div class="meta muted">
          <span>Erros: <strong>{{ errors() }}</strong></span>
          <span>Recorde: <strong>{{ recordLabel() }}</strong></span>
        </div>
      </div>

      <div class="sequence">
        @for (n of sequenceLabels(); track $index) {
          <span
            class="step"
            [class.done]="$index < index()"
            [class.current]="$index === index() && phase() !== 'idle' && phase() !== 'done'"
          >
            {{ n }}
          </span>
        }
      </div>

      <div class="feedback">
        @switch (phase()) {
          @case ('idle') {
            <button type="button" class="primary" [disabled]="!mic.listening()" (click)="arm()">
              Começar
            </button>
          }
          @case ('ready') {
            <span>O cronômetro começa quando você tocar a primeira nota:
              <strong class="big">{{ sequenceLabels()[0] }}</strong></span>
            <button type="button" class="link" (click)="cancel()">Cancelar</button>
          }
          @case ('running') {
            <span>Próxima: <strong class="big">{{ sequenceLabels()[index()] }}</strong></span>
            @if (wrong() !== null) {
              <span class="err-text">Você tocou {{ settings.name(wrong()!) }}</span>
            }
            <button type="button" class="link" (click)="cancel()">Cancelar</button>
          }
          @case ('done') {
            <span class="ok-text">
              Concluído em {{ clock() }} com {{ errors() }} erro(s).
              @if (newRecord()) {
                🏆 Novo recorde!
              }
            </span>
            <button type="button" class="primary" (click)="arm()">De novo</button>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .help {
      margin: 0;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px 24px;
    }
    .clock {
      font-size: 2.6rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--muted);
    }
    .clock.running {
      color: var(--text);
    }
    .meta {
      display: flex;
      gap: 18px;
    }
    .meta strong {
      color: var(--text);
    }
    .sequence {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .step {
      min-width: 44px;
      padding: 8px 6px;
      text-align: center;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      font-weight: 600;
    }
    .step.done {
      background: var(--ok);
      border-color: var(--ok);
      color: #fff;
    }
    .step.current {
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent);
    }
    .big {
      font-size: 1.4rem;
      color: var(--accent);
    }
  `,
})
export class Desafio {
  protected readonly mic = inject(MicrophoneService);
  protected readonly settings = inject(SettingsService);

  protected readonly kinds = KINDS;
  protected readonly pitchClasses = PITCH_CLASSES;

  protected readonly kind = signal<Kind>('naturais');
  protected readonly stringIndex = linkedSignal<Tuning, number>({
    source: this.settings.tuning,
    computation: (t) => (t.strings.length > 4 ? 1 : 0), // corda Mi
  });
  protected readonly root = signal(0);

  protected readonly phase = signal<Phase>('idle');
  protected readonly index = signal(0);
  protected readonly errors = signal(0);
  protected readonly wrong = signal<number | null>(null);
  protected readonly elapsed = signal(0);
  protected readonly newRecord = signal(false);
  private startedAt = 0;
  private ticker?: ReturnType<typeof setInterval>;
  private readonly records = signal<Partial<Record<string, ChallengeRecord>>>(loadJson(RECORDS_KEY, {}));

  protected readonly strings = computed(() =>
    this.settings.tuning().strings.map((_, index) => ({
      index,
      label: this.settings.stringName(index),
    })).reverse(),
  );

  protected readonly help = computed(() => KINDS.find((k) => k.id === this.kind())!.help);

  /** Sequência de notas (MIDI); a comparação é feita pela classe de altura. */
  protected readonly sequence = computed<number[]>(() => {
    const open = this.settings.tuning().strings[this.stringIndex()] ?? 28;
    switch (this.kind()) {
      case 'naturais':
        return Array.from({ length: 13 }, (_, f) => open + f).filter((m) => isNatural(m));
      case 'cromatica':
        return Array.from({ length: 13 }, (_, f) => open + f);
      case 'quartas':
        return Array.from({ length: 12 }, (_, i) => 36 + ((i * 5) % 12));
      case 'maior':
        return MAJOR_UP_DOWN.map((d) => 36 + this.root() + d);
    }
  });

  protected readonly sequenceLabels = computed(() => {
    // no ciclo de quartas, bemóis são a grafia natural
    const flats = this.kind() === 'quartas';
    return this.sequence().map((m) =>
      flats ? this.settings.nameWith(m, 'flat') : this.settings.name(m),
    );
  });

  private readonly recordId = computed(() => {
    switch (this.kind()) {
      case 'naturais':
      case 'cromatica':
        return `${this.kind()}:${this.settings.tuning().strings[this.stringIndex()]}`;
      case 'maior':
        return `maior:${this.root()}`;
      default:
        return this.kind();
    }
  });

  protected readonly recordLabel = computed(() => {
    const r = this.records()[this.recordId()];
    return r ? formatTime(r.bestMs) : '—';
  });

  protected readonly clock = computed(() => formatTime(this.elapsed()));

  constructor() {
    this.mic.notes$.pipe(takeUntilDestroyed()).subscribe((n) => this.onNote(n));
    inject(DestroyRef).onDestroy(() => clearInterval(this.ticker));
  }

  protected setKind(k: Kind): void {
    this.kind.set(k);
    this.cancel();
  }

  protected setString(i: number): void {
    this.stringIndex.set(i);
    this.cancel();
  }

  protected setRoot(pc: number): void {
    this.root.set(pc);
    this.cancel();
  }

  protected arm(): void {
    clearInterval(this.ticker);
    this.phase.set('ready');
    this.index.set(0);
    this.errors.set(0);
    this.wrong.set(null);
    this.elapsed.set(0);
    this.newRecord.set(false);
  }

  protected cancel(): void {
    clearInterval(this.ticker);
    this.phase.set('idle');
    this.index.set(0);
    this.errors.set(0);
    this.wrong.set(null);
    this.elapsed.set(0);
  }

  private onNote(played: number): void {
    const phase = this.phase();
    if (phase !== 'ready' && phase !== 'running') return;
    const seq = this.sequence();
    const expected = seq[this.index()];

    if (pitchClass(played) !== pitchClass(expected)) {
      // antes de começar, notas erradas são ignoradas (aquecimento)
      if (phase === 'running') {
        this.errors.update((e) => e + 1);
        this.wrong.set(played);
      }
      return;
    }

    this.wrong.set(null);
    if (phase === 'ready') {
      this.phase.set('running');
      this.startedAt = performance.now();
      this.ticker = setInterval(() => this.elapsed.set(performance.now() - this.startedAt), 100);
    }

    const nextIndex = this.index() + 1;
    this.index.set(nextIndex);
    if (nextIndex >= seq.length) this.finish();
  }

  private finish(): void {
    clearInterval(this.ticker);
    const ms = performance.now() - this.startedAt;
    this.elapsed.set(ms);
    this.phase.set('done');

    const id = this.recordId();
    const prev = this.records()[id];
    if (!prev || ms < prev.bestMs) {
      this.newRecord.set(true);
      this.records.update((r) => ({ ...r, [id]: { ...prev, bestMs: ms } }));
      saveJson(RECORDS_KEY, this.records());
    }
  }
}
