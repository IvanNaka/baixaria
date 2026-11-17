import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { FretRange } from '../core/music';
import { SettingsService } from '../core/settings.service';

const FRET_OPTIONS = [0, 1, 2, 3, 4, 5, 7, 9, 12, 15, 17, 19, 21, 24];

@Component({
  selector: 'app-range-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <label>
        Da casa
        <select [value]="range().minFret" (change)="setMin($any($event.target).value)">
          @for (f of fretOptions(); track f) {
            <option [value]="f" [selected]="f === range().minFret">{{ f }}</option>
          }
        </select>
      </label>
      <label>
        até a casa
        <select [value]="range().maxFret" (change)="setMax($any($event.target).value)">
          @for (f of fretOptions(); track f) {
            @if (f > 0) {
              <option [value]="f" [selected]="f === range().maxFret">{{ f }}</option>
            }
          }
        </select>
      </label>
      <span class="strings">
        Cordas:
        @for (s of strings(); track s.index) {
          <label class="chip" [class.on]="s.on">
            <input type="checkbox" [checked]="s.on" (change)="toggleString(s.index)" />
            {{ s.label }}
          </label>
        }
      </span>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      align-items: center;
    }
    .strings {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
  `,
})
export class RangePicker {
  private readonly settings = inject(SettingsService);
  readonly range = model.required<FretRange>();
  readonly maxFrets = input(24);

  protected readonly fretOptions = computed(() =>
    FRET_OPTIONS.filter((f) => f <= this.maxFrets()),
  );

  protected readonly strings = computed(() =>
    this.settings.tuning().strings.map((_, index) => ({
      index,
      label: this.settings.stringName(index),
      on: this.range().strings.includes(index),
    })).reverse(),
  );

  protected setMin(v: string): void {
    const min = Number(v);
    this.range.update((r) => ({ ...r, minFret: min, maxFret: Math.max(r.maxFret, min + 1) }));
  }

  protected setMax(v: string): void {
    const max = Number(v);
    this.range.update((r) => ({ ...r, maxFret: max, minFret: Math.min(r.minFret, max - 1) }));
  }

  protected toggleString(i: number): void {
    this.range.update((r) => {
      const has = r.strings.includes(i);
      if (has && r.strings.length === 1) return r; // pelo menos uma corda
      const strings = has ? r.strings.filter((s) => s !== i) : [...r.strings, i].sort();
      return { ...r, strings };
    });
  }
}
