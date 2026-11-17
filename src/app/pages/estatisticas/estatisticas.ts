import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  INTERVALS,
  PITCH_CLASSES,
  fullRange,
  positionStatKey,
  positionsInRange,
} from '../../core/music';
import { SettingsService } from '../../core/settings.service';
import { STAT_KEYS, StatsService } from '../../core/stats.service';
import { FretMarker, Fretboard } from '../../shared/fretboard';
import { StatRow, StatsTable } from './stats-table';

/** Vermelho (0%) → amarelo → verde (100%). */
function heatColor(pct: number): string {
  const hue = Math.round(pct * 130);
  return `hsl(${hue} 70% 42%)`;
}

@Component({
  selector: 'app-estatisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Fretboard, StatsTable],
  templateUrl: './estatisticas.html',
})
export class Estatisticas {
  protected readonly settings = inject(SettingsService);
  protected readonly stats = inject(StatsService);

  private row(exercise: string, item: string, label: string, sub?: string): StatRow {
    const s = this.stats.get(exercise, item);
    const acc = this.stats.accuracy(s);
    return {
      label,
      sub,
      ok: s.ok,
      err: s.err,
      pct: acc === null ? null : Math.round(acc * 100),
      avgSec: s.ok > 0 ? s.timeMs / s.ok / 1000 : null,
    };
  }

  protected readonly noteRows = computed(() => {
    this.stats.data();
    return PITCH_CLASSES.map((pc) => this.row(STAT_KEYS.notePc, String(pc), this.settings.name(pc)));
  });

  protected readonly intervalRows = computed(() => {
    this.stats.data();
    return INTERVALS.map((iv) => this.row(STAT_KEYS.intervalVisual, String(iv.semitones), iv.short, iv.name));
  });

  protected readonly earRows = computed(() => {
    this.stats.data();
    return INTERVALS.map((iv) => this.row(STAT_KEYS.intervalEar, String(iv.semitones), iv.short, iv.name));
  });

  protected readonly heatMarkers = computed<FretMarker[]>(() => {
    this.stats.data();
    const tuning = this.settings.tuning();
    const out: FretMarker[] = [];
    for (const p of positionsInRange(fullRange(tuning, 0, 24))) {
      const s = this.stats.get(STAT_KEYS.notePosition, positionStatKey(tuning, p));
      const acc = this.stats.accuracy(s);
      if (acc === null) continue;
      out.push({ ...p, kind: 'note', color: heatColor(acc), label: `${Math.round(acc * 100)}` });
    }
    return out;
  });

  protected readonly heatFrets = computed(() =>
    Math.max(12, ...this.heatMarkers().map((m) => m.fret)),
  );

  protected readonly hasData = computed(() => Object.keys(this.stats.data()).length > 0);

  protected reset(): void {
    if (confirm('Apagar todo o histórico de estatísticas?')) this.stats.reset();
  }
}
