import { TestBed } from '@angular/core/testing';

import { fail } from '../../../core/model/result';
import { provideTestEnvironment, settle, testRepository } from '../../../testing/test-environment';
import { CREDIT_NOTE, StatisticsViewModel } from './statistics.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ') ?? null;

describe('StatisticsViewModel', () => {
  it('F-17 zeigt offene Forderungen inklusive inaktiver Personen, absteigend', async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), StatisticsViewModel] });
    const vm = TestBed.inject(StatisticsViewModel);
    await settle();

    const receivables = vm.receivables()!;
    expect(plain(receivables.total)).toBe('3,50 €');
    expect(receivables.people.map((p) => [p.name, plain(p.amount), p.inactive])).toEqual([
      ['Cleo', '3,00 €', true],
      ['Anna', '0,50 €', false],
    ]);
    expect(receivables.toggleLabel).toBe('2 Personen anzeigen');
  });

  it('F-18 zeigt das Guthaben mit Hinweistext', async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), StatisticsViewModel] });
    const vm = TestBed.inject(StatisticsViewModel);
    await settle();

    expect(plain(vm.credit()?.total)).toBe('2,50 €');
    expect(vm.credit()?.toggleLabel).toBe('1 Person anzeigen');
    expect(vm.creditNote).toBe(CREDIT_NOTE);
  });

  it('F-19 zeigt den Kassenbestand gesamt und je Zahlungsweg', async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), StatisticsViewModel] });
    const vm = TestBed.inject(StatisticsViewModel);
    await settle();

    expect(plain(vm.cashBalance()?.total)).toBe('15,00 €');
    expect(vm.cashBalance()?.byMethod.map((m) => [m.label, plain(m.amount)])).toEqual([
      ['Bar', '15,00 €'],
      ['Überweisung', '0,00 €'],
      ['PayPal', '0,00 €'],
    ]);
  });

  it('meldet einen Ladefehler und lädt auf Wunsch erneut', async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), StatisticsViewModel] });
    const load = vi.spyOn(testRepository(), 'metrics').mockResolvedValue(fail('TECHNICAL_ERROR'));
    const vm = TestBed.inject(StatisticsViewModel);
    await settle();
    expect(vm.loadError()).toBe('Das hat nicht geklappt. Bitte versuche es noch einmal.');

    load.mockRestore();
    vm.retry();
    await settle();
    expect(vm.loadError()).toBeNull();
    expect(vm.receivables()).not.toBeNull();
  });
});
