import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FretPosition, FretRange, Tuning } from '../core/music';
import { SettingsService } from '../core/settings.service';

export type MarkerKind = 'root' | 'target' | 'question' | 'correct' | 'wrong' | 'hint' | 'note';

export interface FretMarker extends FretPosition {
  kind: MarkerKind;
  label?: string;
  /** Cor de preenchimento personalizada (ex.: mapa de calor). */
  color?: string;
}

const LABEL_W = 34;
const OPEN_W = 46;
const FRET_W = 58;
const ROW_H = 36;
const TOP = 14;
const BOTTOM = 28;
const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];

@Component({
  selector: 'app-fretboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fretboard.html',
  styleUrl: './fretboard.scss',
})
export class Fretboard {
  private readonly settings = inject(SettingsService);

  readonly tuning = input.required<Tuning>();
  readonly frets = input(12);
  readonly markers = input<FretMarker[]>([]);
  readonly range = input<FretRange | null>(null);
  readonly clickable = input(false);
  readonly positionClick = output<FretPosition>();

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly rowH = ROW_H;
  protected readonly labelW = LABEL_W;
  protected readonly top = TOP;

  protected readonly width = computed(() => LABEL_W + OPEN_W + this.frets() * FRET_W + 8);
  protected readonly height = computed(
    () => TOP + this.tuning().strings.length * ROW_H + BOTTOM,
  );
  protected readonly boardTop = TOP;
  protected readonly boardBottom = computed(() => TOP + this.tuning().strings.length * ROW_H);
  protected readonly nutX = LABEL_W + OPEN_W;
  protected readonly boardRight = computed(() => this.nutX + this.frets() * FRET_W);

  protected readonly fretNumbers = computed(() =>
    Array.from({ length: this.frets() + 1 }, (_, i) => i),
  );

  protected readonly strings = computed(() =>
    this.tuning().strings.map((midi, index) => ({
      index,
      y: this.y(index),
      label: this.settings.name(midi),
      thickness: 1.2 + (this.tuning().strings.length - 1 - index) * 0.7,
    })),
  );

  protected readonly inlays = computed(() => {
    const midY = (this.boardTop + this.boardBottom()) / 2;
    const span = this.boardBottom() - this.boardTop;
    const dots: { x: number; y: number }[] = [];
    for (let f = 1; f <= this.frets(); f++) {
      if (INLAYS.includes(f)) dots.push({ x: this.x(f), y: midY });
      if (DOUBLE_INLAYS.includes(f)) {
        dots.push({ x: this.x(f), y: this.boardTop + span * 0.27 });
        dots.push({ x: this.x(f), y: this.boardTop + span * 0.73 });
      }
    }
    return dots;
  });

  protected readonly cells = computed(() => {
    const range = this.range();
    const cells: {
      string: number;
      fret: number;
      x: number;
      y: number;
      w: number;
      active: boolean;
    }[] = [];
    for (const s of this.strings()) {
      for (const f of this.fretNumbers()) {
        const x0 = f === 0 ? LABEL_W : this.nutX + (f - 1) * FRET_W;
        const w = f === 0 ? OPEN_W : FRET_W;
        const active =
          !range ||
          (range.strings.includes(s.index) && f >= range.minFret && f <= range.maxFret);
        cells.push({ string: s.index, fret: f, x: x0, y: s.y - ROW_H / 2, w, active });
      }
    }
    return cells;
  });

  protected readonly placedMarkers = computed(() =>
    this.markers()
      .filter((m) => m.fret <= this.frets() && m.string < this.tuning().strings.length)
      .map((m) => ({ ...m, cx: this.x(m.fret), cy: this.y(m.string) })),
  );

  constructor() {
    // Em telas estreitas o braço rola na horizontal: garante que a posição
    // em destaque (pergunta ou tônica) esteja visível.
    afterRenderEffect(() => {
      const focus = this.placedMarkers().find((m) => m.kind === 'question' || m.kind === 'root');
      const el = this.scroller().nativeElement;
      if (!focus || el.scrollWidth <= el.clientWidth) return;
      const scale = el.scrollWidth / this.width();
      const px = focus.cx * scale;
      if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 40) {
        el.scrollTo({ left: px - el.clientWidth / 2, behavior: 'smooth' });
      }
    });
  }

  protected x(fret: number): number {
    return fret === 0 ? LABEL_W + OPEN_W / 2 : this.nutX + (fret - 0.5) * FRET_W;
  }

  protected y(stringIndex: number): number {
    const n = this.tuning().strings.length;
    return TOP + (n - 1 - stringIndex) * ROW_H + ROW_H / 2;
  }

  protected fretLineX(fret: number): number {
    return this.nutX + fret * FRET_W;
  }

  protected onCell(cell: { string: number; fret: number; active: boolean }): void {
    if (this.clickable() && cell.active) {
      this.positionClick.emit({ string: cell.string, fret: cell.fret });
    }
  }
}
