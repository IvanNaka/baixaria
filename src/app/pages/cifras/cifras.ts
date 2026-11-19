import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AudioService } from '../../core/audio.service';
import { Accidental, Notation, isNatural, noteName, weightedPick } from '../../core/music';
import { SessionScore } from '../../core/score';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { ScoreBar } from '../../shared/score-bar';

/** Direção da pergunta: mostra a cifra e pede o nome, ou o contrário. */
type Mode = 'to-solfege' | 'to-letters' | 'mixed';
type Pool = 'naturals' | 'sharps' | 'flats' | 'both';
type Status = 'pending' | 'correct' | 'wrong';

/** Uma grafia de nota: classe de altura + acidente usado para escrevê-la. */
interface Spelling {
  pc: number;
  acc: Accidental;
}

interface Question {
  item: Spelling;
  /** Escrita mostrada na pergunta; a resposta é na outra. */
  from: Notation;
  startedAt: number;
}

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const ALTERED = [1, 3, 6, 8, 10];

function spellingKey(s: Spelling): string {
  return isNatural(s.pc) ? String(s.pc) : `${s.pc}${s.acc === 'sharp' ? '#' : 'b'}`;
}

function sameSpelling(a: Spelling, b: Spelling): boolean {
  return a.pc === b.pc && (isNatural(a.pc) || a.acc === b.acc);
}

@Component({
  selector: 'app-cifras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScoreBar],
  templateUrl: './cifras.html',
  styleUrl: './cifras.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Cifras {
  private readonly stats = inject(StatsService);
  private readonly audio = inject(AudioService);

  protected readonly modes: { id: Mode; label: string }[] = [
    { id: 'to-solfege', label: 'C D E → Dó Ré Mi' },
    { id: 'to-letters', label: 'Dó Ré Mi → C D E' },
    { id: 'mixed', label: 'Misturado' },
  ];
  protected readonly pools: { id: Pool; label: string }[] = [
    { id: 'naturals', label: 'Só naturais' },
    { id: 'sharps', label: 'Com sustenidos (♯)' },
    { id: 'flats', label: 'Com bemóis (♭)' },
    { id: 'both', label: 'Sustenidos e bemóis' },
  ];

  protected readonly mode = signal<Mode>('to-solfege');
  protected readonly pool = signal<Pool>('naturals');
  protected readonly showTable = signal(false);

  protected readonly score = new SessionScore();
  protected readonly question = signal<Question | null>(null);
  protected readonly status = signal<Status>('pending');
  protected readonly picked = signal<Spelling | null>(null);
  protected readonly lastTime = signal<number | null>(null);
  /** Letra digitada aguardando ♯/♭ (resposta pelo teclado). */
  protected readonly pendingLetter = signal<string | null>(null);

  private timer?: ReturnType<typeof setTimeout>;
  private keyTimer?: ReturnType<typeof setTimeout>;

  /** Grafias que entram no exercício, na ordem da escala cromática. */
  protected readonly items = computed<Spelling[]>(() => {
    const pool = this.pool();
    const out: Spelling[] = [];
    for (let pc = 0; pc < 12; pc++) {
      if (NATURALS.includes(pc)) out.push({ pc, acc: 'sharp' });
      else {
        if (pool === 'sharps' || pool === 'both') out.push({ pc, acc: 'sharp' });
        if (pool === 'flats' || pool === 'both') out.push({ pc, acc: 'flat' });
      }
    }
    return out;
  });

  protected readonly answerNotation = computed<Notation>(() =>
    this.question()?.from === 'letters' ? 'solfege' : 'letters',
  );

  protected readonly answers = computed(() =>
    this.items().map((item) => ({ item, label: this.name(item, this.answerNotation()) })),
  );

  /** Tabela de referência: as 7 naturais e, se houver, as alteradas. */
  protected readonly table = computed(() => {
    const naturals = NATURALS.map((pc) => ({ pc, acc: 'sharp' as Accidental }));
    const altered = this.items().filter((i) => ALTERED.includes(i.pc));
    return [...naturals, ...altered].map((i) => ({
      letters: this.name(i, 'letters'),
      solfege: this.name(i, 'solfege'),
    }));
  });

  private get statKey(): string {
    return this.question()?.from === 'letters' ? STAT_KEYS.namesToSolfege : STAT_KEYS.namesToLetters;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.keyTimer);
    });
    this.next();
  }

  protected name(s: Spelling, notation: Notation): string {
    return noteName(s.pc, notation, s.acc);
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
    this.score.reset();
    this.next();
  }

  protected setPool(p: Pool): void {
    this.pool.set(p);
    this.next();
  }

  protected next(): void {
    clearTimeout(this.timer);
    const mode = this.mode();
    const from: Notation =
      mode === 'to-solfege' ? 'letters' : mode === 'to-letters' ? 'solfege' : Math.random() < 0.5 ? 'letters' : 'solfege';
    const key = from === 'letters' ? STAT_KEYS.namesToSolfege : STAT_KEYS.namesToLetters;

    const prev = this.question()?.item;
    let candidates = this.items();
    if (prev && candidates.length > 1) candidates = candidates.filter((i) => !sameSpelling(i, prev));
    const item = weightedPick(candidates, (i) => this.stats.weight(key, spellingKey(i)));

    this.question.set({ item, from, startedAt: performance.now() });
    this.status.set('pending');
    this.picked.set(null);
    this.pendingLetter.set(null);
  }

  protected answer(s: Spelling): void {
    const q = this.question();
    if (!q || this.status() !== 'pending') return;
    const ok = sameSpelling(s, q.item);
    const elapsed = performance.now() - q.startedAt;
    this.picked.set(s);
    this.stats.record(this.statKey, spellingKey(q.item), ok, elapsed);
    this.score.register(ok);
    this.lastTime.set(ok ? elapsed / 1000 : null);
    this.status.set(ok ? 'correct' : 'wrong');
    this.audio.play(36 + q.item.pc, { duration: 0.9 });
    if (ok) this.timer = setTimeout(() => this.next(), 700);
  }

  /** Errou escolhendo uma nota enarmônica (mesmo som, outro nome)? */
  protected readonly enharmonicMiss = computed(() => {
    const p = this.picked();
    const q = this.question();
    return this.status() === 'wrong' && p !== null && q !== null && p.pc === q.item.pc;
  });

  // ------------------------------------------------------------- teclado

  /**
   * Respostas em cifra podem ser digitadas: letra (A–G) e, se houver acidentes,
   * "#" ou "b" logo em seguida. Enter/espaço avança depois de responder.
   */
  protected onKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' || e.key === ' ') && this.status() !== 'pending') {
      e.preventDefault();
      this.next();
      return;
    }
    if (this.status() !== 'pending' || this.answerNotation() !== 'letters') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const pending = this.pendingLetter();
    if (pending && (e.key === '#' || e.key === 'b')) {
      e.preventDefault();
      this.answerTyped(pending, e.key === '#' ? 'sharp' : 'flat');
      return;
    }
    const letter = e.key.toUpperCase();
    if (!/^[A-G]$/.test(letter)) return;
    e.preventDefault();
    if (this.pool() === 'naturals') {
      this.answerTyped(letter, null);
    } else {
      // espera um instante por "#" ou "b"; sem acidente, vale a natural
      this.pendingLetter.set(letter);
      clearTimeout(this.keyTimer);
      this.keyTimer = setTimeout(() => this.answerTyped(letter, null), 700);
    }
  }

  private answerTyped(letter: string, acc: Accidental | null): void {
    clearTimeout(this.keyTimer);
    this.pendingLetter.set(null);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter]!;
    const pc = acc === 'sharp' ? (base + 1) % 12 : acc === 'flat' ? (base + 11) % 12 : base;
    // grafias como E# ou Cb não fazem parte do exercício: ignora a tecla
    if (acc && isNatural(pc)) return;
    this.answer({ pc, acc: acc ?? 'sharp' });
  }
}
