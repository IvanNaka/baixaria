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
  PITCH_CLASSES,
  Tuning,
  fullRange,
  isNatural,
  midiAt,
  pitchClass,
  positionStatKey,
  positionsInRange,
  samePosition,
  weightedPick,
} from '../../core/music';
import { SessionScore } from '../../core/score';
import { SettingsService } from '../../core/settings.service';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { RangePicker } from '../../shared/range-picker';
import { ScoreBar } from '../../shared/score-bar';

type Mode = 'identify' | 'find' | 'all';
type Status = 'pending' | 'correct' | 'wrong';

interface Question {
  pc: number;
  /** identify: posição marcada; find: posição de referência sorteada. */
  position: FretPosition;
  /** Posições que contam como resposta certa. */
  targets: FretPosition[];
  startedAt: number;
}

@Component({
  selector: 'app-notas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, RangePicker, ScoreBar],
  templateUrl: './notas.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Notas {
  protected readonly settings = inject(SettingsService);
  private readonly stats = inject(StatsService);
  private readonly audio = inject(AudioService);

  protected readonly modes: { id: Mode; label: string; help: string }[] = [
    { id: 'identify', label: 'Qual é a nota?', help: 'Uma posição é marcada no braço: escolha o nome da nota.' },
    { id: 'find', label: 'Encontre na corda', help: 'Clique na casa da nota pedida, na corda indicada.' },
    { id: 'all', label: 'Todas as posições', help: 'Encontre todas as ocorrências da nota dentro da faixa escolhida.' },
  ];

  protected readonly mode = signal<Mode>('identify');
  protected readonly naturalsOnly = signal(false);
  protected readonly range = linkedSignal<Tuning, FretRange>({
    source: this.settings.tuning,
    computation: (t, prev) => fullRange(t, prev?.value.minFret ?? 0, prev?.value.maxFret ?? 12),
  });
  protected readonly boardFrets = computed(() => Math.max(12, this.range().maxFret));

  protected readonly score = new SessionScore();
  protected readonly question = signal<Question | null>(null);
  protected readonly status = signal<Status>('pending');
  /** Nota escolhida (modo identify). */
  protected readonly picked = signal<number | null>(null);
  /** Cliques feitos no braço (modos find/all). */
  protected readonly clicks = signal<{ pos: FretPosition; ok: boolean }[]>([]);

  private timer?: ReturnType<typeof setTimeout>;

  protected readonly answerButtons = computed(() =>
    PITCH_CLASSES.filter((pc) => !this.naturalsOnly() || isNatural(pc)).map((pc) => ({
      pc,
      label: this.settings.name(pc),
    })),
  );

  protected readonly foundCount = computed(() => this.clicks().filter((c) => c.ok).length);

  protected readonly markers = computed<FretMarker[]>(() => {
    const q = this.question();
    if (!q) return [];
    const st = this.status();
    const name = this.settings.name(q.pc);
    const mode = this.mode();
    const out: FretMarker[] = [];

    if (mode === 'identify') {
      out.push({
        ...q.position,
        kind: st === 'pending' ? 'question' : st === 'correct' ? 'correct' : 'wrong',
        label: st === 'pending' ? '?' : name,
      });
      return out;
    }

    for (const c of this.clicks()) {
      out.push({
        ...c.pos,
        kind: c.ok ? 'correct' : 'wrong',
        label: c.ok ? name : this.settings.name(midiAt(this.settings.tuning(), c.pos)),
      });
    }
    if (st !== 'pending') {
      for (const t of q.targets) {
        if (!this.clicks().some((c) => samePosition(c.pos, t))) {
          out.push({ ...t, kind: 'hint', label: name });
        }
      }
    }
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    this.next();
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
    this.score.reset();
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
    const range = this.range();
    let candidates = positionsInRange(range).filter(
      (p) => !this.naturalsOnly() || isNatural(midiAt(tuning, p)),
    );
    const prev = this.question();
    if (prev && candidates.length > 1) {
      candidates = candidates.filter((p) => !samePosition(p, prev.position));
    }
    if (candidates.length === 0) {
      this.question.set(null);
      return;
    }

    const position = weightedPick(candidates, (p) => {
      const pc = pitchClass(midiAt(tuning, p));
      return (
        this.stats.weight(STAT_KEYS.notePc, String(pc)) +
        this.stats.weight(STAT_KEYS.notePosition, positionStatKey(tuning, p))
      );
    });
    const pc = pitchClass(midiAt(tuning, position));
    const sameClass = (p: FretPosition) => pitchClass(midiAt(tuning, p)) === pc;

    let targets: FretPosition[];
    switch (this.mode()) {
      case 'identify':
        targets = [position];
        break;
      case 'find':
        targets = positionsInRange(range).filter((p) => p.string === position.string && sameClass(p));
        break;
      case 'all':
        targets = positionsInRange(range).filter(sameClass);
        break;
    }

    this.question.set({ pc, position, targets, startedAt: performance.now() });
    this.status.set('pending');
    this.picked.set(null);
    this.clicks.set([]);
  }

  /** Modo identify: usuário escolheu um nome de nota. */
  protected answer(pc: number): void {
    const q = this.question();
    if (!q || this.status() !== 'pending' || this.mode() !== 'identify') return;
    this.picked.set(pc);
    this.finish(pc === q.pc, q.position);
    this.audio.play(midiAt(this.settings.tuning(), q.position));
  }

  /** Modos find/all: usuário clicou no braço. */
  protected onPosition(pos: FretPosition): void {
    const q = this.question();
    if (!q || this.status() !== 'pending' || this.mode() === 'identify') return;
    if (this.clicks().some((c) => samePosition(c.pos, pos))) return;

    const tuning = this.settings.tuning();
    this.audio.play(midiAt(tuning, pos));
    const ok = q.targets.some((t) => samePosition(t, pos));
    this.clicks.update((c) => [...c, { pos, ok }]);

    if (this.mode() === 'find') {
      this.finish(ok, ok ? pos : q.targets[0]);
      return;
    }

    // modo "todas": continua até encontrar todas; qualquer clique errado
    // faz a pergunta contar como erro no final
    if (this.foundCount() === q.targets.length) {
      this.finish(this.clicks().every((c) => c.ok), q.position);
    }
  }

  protected giveUp(): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;
    this.finish(false, q.position);
  }

  private finish(ok: boolean, statPos: FretPosition): void {
    const q = this.question()!;
    const tuning = this.settings.tuning();
    const elapsed = performance.now() - q.startedAt;
    this.stats.record(STAT_KEYS.notePc, String(q.pc), ok, elapsed);
    this.stats.record(STAT_KEYS.notePosition, positionStatKey(tuning, statPos), ok, elapsed);
    this.score.register(ok);
    this.status.set(ok ? 'correct' : 'wrong');
    if (ok) this.timer = setTimeout(() => this.next(), 900);
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' || e.key === ' ') && this.status() !== 'pending') {
      e.preventDefault();
      this.next();
    }
  }
}
