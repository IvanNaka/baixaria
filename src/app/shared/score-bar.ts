import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SessionScore } from '../core/score';

@Component({
  selector: 'app-score-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="score">
      <span><strong>{{ score().correct() }}</strong>/{{ score().total() }} acertos</span>
      <span><strong>{{ score().accuracy() }}%</strong> precisão</span>
      <span>Sequência <strong>{{ score().streak() }}</strong></span>
      <span>Melhor <strong>{{ score().best() }}</strong></span>
      <button type="button" class="link" (click)="score().reset()">Zerar placar</button>
    </div>
  `,
  styles: `
    .score {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      align-items: center;
      color: var(--muted);
      font-size: 0.92rem;
    }
    strong {
      color: var(--text);
    }
  `,
})
export class ScoreBar {
  readonly score = input.required<SessionScore>();
}
