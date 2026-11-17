import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface StatRow {
  label: string;
  sub?: string;
  ok: number;
  err: number;
  pct: number | null;
  avgSec: number | null;
}

@Component({
  selector: 'app-stats-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="card">
      <h2>{{ title() }}</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Precisão</th>
            <th class="num">✓</th>
            <th class="num">✕</th>
            <th class="num">Tempo</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.label) {
            <tr [class.empty]="r.pct === null">
              <th [title]="r.sub ?? ''">{{ r.label }}</th>
              <td>
                <div class="bar">
                  @if (r.pct !== null) {
                    <span
                      [style.width.%]="r.pct"
                      [style.background]="'hsl(' + r.pct * 1.3 + ' 70% 42%)'"
                    ></span>
                    <em>{{ r.pct }}%</em>
                  } @else {
                    <em>—</em>
                  }
                </div>
              </td>
              <td class="num">{{ r.ok }}</td>
              <td class="num">{{ r.err }}</td>
              <td class="num">
                {{ r.avgSec === null ? '—' : (r.avgSec | number: '1.1-1') + 's' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th,
    td {
      padding: 4px 6px;
      text-align: left;
    }
    thead th {
      color: var(--muted);
      font-weight: 500;
      font-size: 0.8rem;
    }
    tbody th {
      white-space: nowrap;
      width: 3.5em;
    }
    .num {
      text-align: right;
      width: 3em;
      font-variant-numeric: tabular-nums;
    }
    tr.empty {
      color: var(--muted);
    }
    .bar {
      position: relative;
      height: 18px;
      background: var(--surface-2);
      border-radius: 4px;
      overflow: hidden;
      min-width: 80px;
    }
    .bar span {
      position: absolute;
      inset: 0 auto 0 0;
    }
    .bar em {
      position: relative;
      font-style: normal;
      font-size: 0.75rem;
      padding-left: 6px;
      line-height: 18px;
      color: var(--text);
    }
  `,
})
export class StatsTable {
  readonly title = input.required<string>();
  readonly rows = input.required<StatRow[]>();
}
