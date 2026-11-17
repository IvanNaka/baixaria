import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MicrophoneService } from '../../core/microphone.service';
import { SettingsService } from '../../core/settings.service';

const MIN_DB = -60;

@Component({
  selector: 'app-mic-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card panel">
      @if (!mic.listening()) {
        <div class="off">
          <button type="button" class="primary big" [disabled]="mic.starting()" (click)="mic.start()">
            🎤 {{ mic.starting() ? 'Ativando…' : 'Ativar microfone' }}
          </button>
          <p class="muted">
            Toque no seu baixo e a app reconhece a nota. Funciona melhor com cabo numa interface de
            áudio ou com o microfone perto do amplificador. Em ambiente silencioso, o microfone do
            celular ou notebook também serve.
          </p>
        </div>
      } @else {
        <div class="on">
          <div class="note" [class.fresh]="mic.reading() !== null">
            <span class="label">Ouvindo</span>
            <strong>{{ current() }}</strong>
          </div>

          <div class="meter-wrap">
            <span class="label">Volume</span>
            <div class="meter" title="A linha marca o volume mínimo para reconhecer uma nota">
              <span class="fill" [style.width.%]="mic.level() * 100"></span>
              <span class="threshold" [style.left.%]="thresholdPct()"></span>
            </div>
            <label class="sens">
              Sensibilidade
              <input
                type="range"
                min="20"
                max="55"
                step="1"
                [value]="-thresholdDb()"
                (input)="setThreshold(-$any($event.target).valueAsNumber)"
              />
            </label>
          </div>

          <div class="controls">
            @if (mic.devices().length > 1) {
              <select
                aria-label="Entrada de áudio"
                [value]="mic.prefs().deviceId"
                (change)="mic.updatePrefs({ deviceId: $any($event.target).value })"
              >
                <option value="">Entrada padrão</option>
                @for (d of mic.devices(); track d.id) {
                  <option [value]="d.id" [selected]="d.id === mic.prefs().deviceId">{{ d.label }}</option>
                }
              </select>
            }
            <label
              class="chip"
              [class.on]="mic.prefs().exactOctave"
              title="Desligado: aceita a nota certa em qualquer oitava. Microfones pequenos às vezes confundem a oitava dos graves."
            >
              <input
                type="checkbox"
                [checked]="mic.prefs().exactOctave"
                (change)="mic.updatePrefs({ exactOctave: !mic.prefs().exactOctave })"
              />
              Exigir oitava exata
            </label>
            <button type="button" (click)="mic.stop()">Desativar</button>
          </div>
        </div>
      }
      @if (mic.error(); as err) {
        <p class="err-text">{{ err }}</p>
      }
    </div>
  `,
  styles: `
    .panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .off {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 20px;
      align-items: center;
    }
    .off p {
      margin: 0;
      flex: 1 1 300px;
    }
    .big {
      font-size: 1.1rem;
      padding: 12px 22px;
    }
    .on {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 28px;
      align-items: center;
    }
    .label {
      display: block;
      color: var(--muted);
      font-size: 0.78rem;
    }
    .note strong {
      font-size: 1.6rem;
      display: inline-block;
      min-width: 3.5em;
      color: var(--muted);
    }
    .note.fresh strong {
      color: var(--accent);
    }
    .meter-wrap {
      flex: 1 1 220px;
    }
    .meter {
      position: relative;
      height: 10px;
      background: var(--surface-2);
      border-radius: 5px;
      overflow: hidden;
      margin: 4px 0 6px;
    }
    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--ok);
      transition: width 60ms linear;
    }
    .threshold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--text);
    }
    .sens {
      font-size: 0.82rem;
      color: var(--muted);
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
  `,
})
export class MicPanel {
  protected readonly mic = inject(MicrophoneService);
  private readonly settings = inject(SettingsService);

  protected readonly thresholdDb = computed(() => 20 * Math.log10(this.mic.prefs().minRms));
  protected readonly thresholdPct = computed(() => ((this.thresholdDb() - MIN_DB) / -MIN_DB) * 100);

  protected readonly current = computed(() => {
    const r = this.mic.reading();
    if (r) return this.settings.name(r.midi) + Math.floor(r.midi / 12 - 1);
    const last = this.mic.lastNote();
    return last === null ? '—' : this.settings.name(last) + Math.floor(last / 12 - 1);
  });

  protected setThreshold(db: number): void {
    this.mic.updatePrefs({ minRms: Math.pow(10, db / 20) });
  }
}
