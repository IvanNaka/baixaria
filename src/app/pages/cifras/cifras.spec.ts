import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cifras } from './cifras';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Cifras', () => {
  let c: any;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Cifras],
      providers: [provideZonelessChangeDetection()],
    });
    c = TestBed.createComponent(Cifras).componentInstance;
  });

  function ask(pc: number, acc: 'sharp' | 'flat', from: 'letters' | 'solfege'): void {
    c.question.set({ item: { pc, acc }, from, startedAt: performance.now() });
    c.status.set('pending');
    c.picked.set(null);
  }

  const key = (k: string) => c.onKey(new KeyboardEvent('keydown', { key: k }));

  it('mostra a cifra e oferece os nomes em solfejo', () => {
    ask(4, 'sharp', 'letters');
    expect(c.name(c.question().item, 'letters')).toBe('E');
    expect(c.answers().map((a: any) => a.label)).toEqual(['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si']);
  });

  it('aceita a resposta certa e recusa a errada', () => {
    ask(9, 'sharp', 'letters');
    c.answer({ pc: 9, acc: 'sharp' });
    expect(c.status()).toBe('correct');

    ask(9, 'sharp', 'letters');
    c.answer({ pc: 7, acc: 'sharp' });
    expect(c.status()).toBe('wrong');
    expect(c.enharmonicMiss()).toBeFalse();
  });

  it('diferencia notas enarmônicas: C# é Dó#, não Ré♭', () => {
    c.setPool('both');
    ask(1, 'sharp', 'letters');
    expect(c.answers().map((a: any) => a.label)).toContain('Ré♭');
    c.answer({ pc: 1, acc: 'flat' });
    expect(c.status()).toBe('wrong');
    expect(c.enharmonicMiss()).toBeTrue();
  });

  it('responde cifras pelo teclado, inclusive "b" minúsculo como Si', () => {
    c.setMode('to-letters');
    ask(4, 'sharp', 'solfege');
    key('e');
    expect(c.status()).toBe('correct');

    ask(11, 'sharp', 'solfege');
    key('b');
    expect(c.status()).toBe('correct');
  });

  it('com acidentes, combina letra + # ou b e ignora grafias inexistentes', () => {
    c.setMode('to-letters');
    c.setPool('both');
    ask(10, 'flat', 'solfege'); // Si♭
    key('b');
    expect(c.pendingLetter()).toBe('B');
    key('b');
    expect(c.status()).toBe('correct');

    ask(6, 'sharp', 'solfege'); // Fá#
    key('e');
    key('#'); // E# não existe no exercício
    expect(c.status()).toBe('pending');
    key('f');
    key('#');
    expect(c.status()).toBe('correct');
  });
});
