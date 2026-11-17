import { Injectable, computed, effect, signal } from '@angular/core';
import { Accidental, Notation, Tuning, findTuning, noteName } from './music';
import { loadJson, saveJson } from './storage';

export interface Settings {
  tuningId: string;
  notation: Notation;
  accidental: Accidental;
  sound: boolean;
  /** Toca as notas uma oitava acima — ajuda em alto-falantes de notebook/celular. */
  octaveUp: boolean;
}

const KEY = 'baixo-estudo:settings';
const DEFAULTS: Settings = {
  tuningId: '4',
  notation: 'letters',
  accidental: 'sharp',
  sound: true,
  octaveUp: true,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<Settings>(loadJson(KEY, DEFAULTS));
  readonly tuning = computed<Tuning>(() => findTuning(this.settings().tuningId));

  constructor() {
    effect(() => saveJson(KEY, this.settings()));
  }

  update(patch: Partial<Settings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  /** Nome de nota formatado conforme as preferências atuais. */
  name(midiOrPc: number): string {
    const s = this.settings();
    return noteName(midiOrPc, s.notation, s.accidental);
  }

  /** Nome da corda solta (ex.: "Lá", "A"). */
  stringName(stringIndex: number): string {
    return this.name(this.tuning().strings[stringIndex]);
  }
}
