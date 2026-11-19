import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MicrophoneService } from '../../core/microphone.service';
import { Afinador } from './afinador';
import { Desafio } from './desafio';
import { IntervalosTocados } from './intervalos-tocados';
import { MicPanel } from './mic-panel';
import { ToqueNota } from './toque-nota';

type Tab = 'afinador' | 'nota' | 'corda' | 'intervalos' | 'desafio';

@Component({
  selector: 'app-microfone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MicPanel, Afinador, ToqueNota, IntervalosTocados, Desafio],
  template: `
    <section class="page">
      <header class="page-head">
        <h1>Tocar no baixo</h1>
        <p class="muted">
          Exercícios em que você responde tocando o instrumento. A app ouve pelo microfone e reconhece
          a nota.
        </p>
      </header>

      <app-mic-panel />

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            [class.active]="tab() === t.id"
            [attr.aria-selected]="tab() === t.id"
            (click)="tab.set(t.id)"
          >
            {{ t.label }}
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('afinador') {
          <app-afinador />
        }
        @case ('nota') {
          <app-toque-nota mode="note" />
        }
        @case ('corda') {
          <app-toque-nota mode="string" />
        }
        @case ('intervalos') {
          <app-intervalos-tocados />
        }
        @case ('desafio') {
          <app-desafio />
        }
      }
    </section>
  `,
})
export class Microfone {
  private readonly mic = inject(MicrophoneService);

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'afinador', label: 'Afinador' },
    { id: 'nota', label: 'Toque a nota' },
    { id: 'corda', label: 'Toque na corda' },
    { id: 'intervalos', label: 'Intervalos' },
    { id: 'desafio', label: 'Desafio cronometrado' },
  ];
  protected readonly tab = signal<Tab>('afinador');

  constructor() {
    // libera o microfone ao sair da página
    inject(DestroyRef).onDestroy(() => this.mic.stop());
  }
}
