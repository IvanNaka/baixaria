import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AudioService } from '../../core/audio.service';
import {
  FretPosition,
  INTERVALS,
  PITCH_CLASSES,
  fullRange,
  isNatural,
  midiAt,
  pitchClass,
  positionsInRange,
} from '../../core/music';
import { SettingsService } from '../../core/settings.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';

type View = 'notes' | 'intervals';

@Component({
  selector: 'app-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard],
  template: `
    <section class="page">
      <header class="page-head">
        <h1>Mapa do braço</h1>
        <p class="muted">Explore livremente. Clique em qualquer casa para ouvir a nota.</p>
      </header>

      <div class="card options">
        <div class="row">
          <label>
            Mostrar
            <select [value]="view()" (change)="view.set($any($event.target).value)">
              <option value="notes">Nomes das notas</option>
              <option value="intervals">Intervalos a partir de uma tônica</option>
            </select>
          </label>
          <label>
            Casas
            <select [value]="frets()" (change)="frets.set(+$any($event.target).value)">
              <option [value]="12" [selected]="frets() === 12">0–12</option>
              <option [value]="17" [selected]="frets() === 17">0–17</option>
              <option [value]="20" [selected]="frets() === 20">0–20</option>
              <option [value]="24" [selected]="frets() === 24">0–24</option>
            </select>
          </label>
          @if (view() === 'notes') {
            <label class="chip" [class.on]="naturalsOnly()">
              <input type="checkbox" [checked]="naturalsOnly()" (change)="naturalsOnly.set(!naturalsOnly())" />
              Só naturais
            </label>
          }
        </div>
        <div class="row">
          <span class="label">{{ view() === 'notes' ? 'Destacar nota:' : 'Tônica:' }}</span>
          @if (view() === 'notes') {
            <button type="button" class="small" [class.active]="focus() === null" (click)="focus.set(null)">
              Todas
            </button>
          }
          @for (pc of pitchClasses; track pc) {
            <button
              type="button"
              class="small"
              [class.active]="focus() === pc"
              (click)="focus.set(pc)"
            >
              {{ settings.name(pc) }}
            </button>
          }
        </div>
      </div>

      <div class="card">
        <app-fretboard
          [tuning]="settings.tuning()"
          [frets]="frets()"
          [markers]="markers()"
          [clickable]="true"
          (positionClick)="play($event)"
        />
        @if (view() === 'intervals' && focus() === null) {
          <p class="muted">Escolha uma tônica acima para ver os intervalos.</p>
        }
      </div>
    </section>
  `,
})
export class Mapa {
  protected readonly settings = inject(SettingsService);
  private readonly audio = inject(AudioService);

  protected readonly pitchClasses = PITCH_CLASSES;
  protected readonly view = signal<View>('notes');
  protected readonly frets = signal(12);
  protected readonly naturalsOnly = signal(false);
  protected readonly focus = signal<number | null>(null);

  protected readonly markers = computed<FretMarker[]>(() => {
    const tuning = this.settings.tuning();
    const focus = this.focus();
    const out: FretMarker[] = [];
    for (const p of positionsInRange(fullRange(tuning, 0, this.frets()))) {
      const pc = pitchClass(midiAt(tuning, p));
      if (this.view() === 'notes') {
        if (this.naturalsOnly() && !isNatural(pc)) continue;
        if (focus !== null && pc !== focus) continue;
        out.push({ ...p, kind: isNatural(pc) ? 'note' : 'target', label: this.settings.name(pc) });
      } else if (focus !== null) {
        const dist = pitchClass(pc - focus);
        if (dist === 0) {
          out.push({ ...p, kind: 'root', label: 'R' });
        } else {
          const iv = INTERVALS.find((i) => i.semitones === dist)!;
          out.push({ ...p, kind: 'note', label: iv.short });
        }
      }
    }
    return out;
  });

  protected play(p: FretPosition): void {
    this.audio.play(midiAt(this.settings.tuning(), p), { force: true });
  }
}
