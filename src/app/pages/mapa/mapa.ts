import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AudioService } from '../../core/audio.service';
import {
  FretPosition,
  PITCH_CLASSES,
  fullRange,
  isNatural,
  midiAt,
  pitchClass,
  positionsInRange,
} from '../../core/music';
import { SettingsService } from '../../core/settings.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { MapaIntervalos } from './mapa-intervalos';

type View = 'notas' | 'intervalos';

@Component({
  selector: 'app-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, MapaIntervalos],
  template: `
    <section class="page">
      <header class="page-head">
        <h1>Mapa do braço</h1>
        <p class="muted">Consulte o braço livremente. Clique em qualquer casa para ouvir.</p>
      </header>

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          [class.active]="view() === 'notas'"
          [attr.aria-selected]="view() === 'notas'"
          (click)="setView('notas')"
        >
          Notas
        </button>
        <button
          type="button"
          role="tab"
          [class.active]="view() === 'intervalos'"
          [attr.aria-selected]="view() === 'intervalos'"
          (click)="setView('intervalos')"
        >
          Intervalos
        </button>
      </div>

      @if (view() === 'intervalos') {
        <app-mapa-intervalos />
      } @else {
        <div class="card options">
          <div class="row">
            <label>
              Casas
              <select [value]="frets()" (change)="frets.set(+$any($event.target).value)">
                @for (f of [12, 17, 20, 24]; track f) {
                  <option [value]="f" [selected]="f === frets()">0–{{ f }}</option>
                }
              </select>
            </label>
            <label class="chip" [class.on]="naturalsOnly()">
              <input type="checkbox" [checked]="naturalsOnly()" (change)="naturalsOnly.set(!naturalsOnly())" />
              Só naturais
            </label>
          </div>
          <div class="row">
            <span class="label">Destacar nota:</span>
            <button type="button" class="small" [class.active]="focus() === null" (click)="focus.set(null)">
              Todas
            </button>
            @for (pc of pitchClasses; track pc) {
              <button type="button" class="small" [class.active]="focus() === pc" (click)="focus.set(pc)">
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
        </div>
      }
    </section>
  `,
})
export class Mapa {
  protected readonly settings = inject(SettingsService);
  private readonly audio = inject(AudioService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pitchClasses = PITCH_CLASSES;
  protected readonly view = signal<View>(
    this.route.snapshot.queryParamMap.get('ver') === 'intervalos' ? 'intervalos' : 'notas',
  );
  protected readonly frets = signal(12);
  protected readonly naturalsOnly = signal(false);
  protected readonly focus = signal<number | null>(null);

  protected readonly markers = computed<FretMarker[]>(() => {
    const tuning = this.settings.tuning();
    const focus = this.focus();
    const out: FretMarker[] = [];
    for (const p of positionsInRange(fullRange(tuning, 0, this.frets()))) {
      const pc = pitchClass(midiAt(tuning, p));
      if (this.naturalsOnly() && !isNatural(pc)) continue;
      if (focus !== null && pc !== focus) continue;
      out.push({ ...p, kind: isNatural(pc) ? 'note' : 'target', label: this.settings.name(pc) });
    }
    return out;
  });

  protected setView(v: View): void {
    this.view.set(v);
    // mantém a aba no endereço, para poder voltar direto a ela
    void this.router.navigate([], {
      queryParams: { ver: v === 'intervalos' ? 'intervalos' : null },
      replaceUrl: true,
    });
  }

  protected play(p: FretPosition): void {
    this.audio.play(midiAt(this.settings.tuning(), p), { force: true });
  }
}
