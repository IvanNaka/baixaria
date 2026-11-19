import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MicrophoneService } from '../../core/microphone.service';
import { frequencyToMidiFloat } from '../../core/pitch';
import { SettingsService } from '../../core/settings.service';

@Component({
  selector: 'app-afinador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card tuner">
      @if (!mic.listening()) {
        <p class="muted">Ative o microfone acima para usar o afinador.</p>
      }
      <div class="strings">
        @for (s of strings(); track s.index) {
          <span class="string" [class.active]="s.index === nearest()?.index">{{ s.label }}</span>
        }
      </div>

      <div class="display" [class.in-tune]="inTune()">
        <div class="name">{{ noteLabel() }}</div>
        <div class="freq muted">
          @if (mic.reading(); as r) {
            {{ r.freq.toFixed(1) }} Hz · {{ r.cents > 0 ? '+' : '' }}{{ r.cents }} cents
          } @else {
            toque uma corda solta
          }
        </div>
      </div>

      <div class="scale" aria-hidden="true">
        <span class="tick center"></span>
        @for (t of ticks; track t) {
          <span class="tick" [style.left.%]="50 + t"></span>
        }
        <span class="needle" [style.left.%]="needlePct()" [class.hidden]="!mic.reading()"></span>
      </div>
      <div class="scale-labels muted"><span>♭ −50</span><span>0</span><span>+50 ♯</span></div>

      @if (nearest(); as n) {
        <p class="hint" [class.ok-text]="inTune()">
          @if (inTune()) {
            Corda {{ n.label }} afinada ✓
          } @else if (n.diff < 0) {
            Corda {{ n.label }}: está baixa — aperte a tarraxa
          } @else {
            Corda {{ n.label }}: está alta — afrouxe a tarraxa
          }
        </p>
      }
    </div>
  `,
  styles: `
    .tuner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
    }
    .strings {
      display: flex;
      gap: 8px;
    }
    .string {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      border: 1px solid var(--border);
      background: var(--surface-2);
      font-weight: 700;
    }
    .string.active {
      border-color: var(--accent);
      color: var(--accent);
    }
    .display .name {
      font-size: 4rem;
      font-weight: 800;
      line-height: 1.1;
    }
    .display.in-tune .name {
      color: var(--ok);
    }
    .scale {
      position: relative;
      width: min(100%, 520px);
      height: 44px;
      border-bottom: 2px solid var(--border);
    }
    .tick {
      position: absolute;
      bottom: 0;
      width: 1px;
      height: 12px;
      background: var(--muted);
    }
    .tick.center {
      left: 50%;
      height: 28px;
      width: 2px;
      background: var(--ok);
    }
    .needle {
      position: absolute;
      bottom: 0;
      width: 4px;
      height: 40px;
      margin-left: -2px;
      border-radius: 2px;
      background: var(--accent);
      transition: left 90ms linear;
    }
    .needle.hidden {
      opacity: 0.15;
    }
    .scale-labels {
      width: min(100%, 520px);
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
    }
    .hint {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class Afinador {
  protected readonly mic = inject(MicrophoneService);
  private readonly settings = inject(SettingsService);

  protected readonly ticks = [-40, -30, -20, -10, 10, 20, 30, 40];

  protected readonly strings = computed(() =>
    this.settings.tuning().strings.map((midi, index) => ({
      index,
      midi,
      label: this.settings.name(midi),
    })),
  );

  protected readonly noteLabel = computed(() => {
    const r = this.mic.reading();
    return r ? this.settings.name(r.midi) + Math.floor(r.midi / 12 - 1) : '—';
  });

  protected readonly needlePct = computed(() => {
    const cents = this.mic.reading()?.cents ?? 0;
    return 50 + Math.max(-50, Math.min(50, cents));
  });

  /** Corda solta mais próxima da nota ouvida (diferença em semitons, com sinal). */
  protected readonly nearest = computed(() => {
    const r = this.mic.reading();
    if (!r) return null;
    const exact = frequencyToMidiFloat(r.freq);
    let best: { index: number; label: string; diff: number } | null = null;
    for (const s of this.strings()) {
      const diff = exact - s.midi;
      if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { ...s, diff };
    }
    return best && Math.abs(best.diff) <= 1.5 ? best : null;
  });

  protected readonly inTune = computed(() => {
    const n = this.nearest();
    return n !== null && Math.abs(n.diff) * 100 <= 5;
  });
}
