import { computed, signal } from '@angular/core';

/** Placar da sessão atual de um exercício. */
export class SessionScore {
  readonly correct = signal(0);
  readonly total = signal(0);
  readonly streak = signal(0);
  readonly best = signal(0);
  readonly accuracy = computed(() =>
    this.total() === 0 ? 0 : Math.round((this.correct() / this.total()) * 100),
  );

  register(ok: boolean): void {
    this.total.update((t) => t + 1);
    if (ok) {
      this.correct.update((c) => c + 1);
      this.streak.update((s) => s + 1);
      this.best.update((b) => Math.max(b, this.streak()));
    } else {
      this.streak.set(0);
    }
  }

  reset(): void {
    this.correct.set(0);
    this.total.set(0);
    this.streak.set(0);
    this.best.set(0);
  }
}
