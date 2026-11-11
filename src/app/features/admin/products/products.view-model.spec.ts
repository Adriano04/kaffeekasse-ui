import { TestBed } from '@angular/core/testing';
import { RsToast, RsToastService } from 'custom-components';

import { AccountFacade } from '../../../core/facades/account.facade';
import { COCOA, COFFEE, TEA } from '../../../testing/test-data';
import { provideTestEnvironment, settle, testClock } from '../../../testing/test-environment';
import { ProductsViewModel } from './products.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ') ?? null;

describe('ProductsViewModel', () => {
  let vm: ProductsViewModel;

  const lastToast = (): RsToast => TestBed.inject(RsToastService).toasts().at(-1)!;
  const row = (id: string) => vm.rows().find((r) => r.id === id)!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), ProductsViewModel] });
    vm = TestBed.inject(ProductsViewModel);
    await settle();
  });

  it('F-10 zeigt alle Artikel mit Preis, angekündigtem Preis und Status', () => {
    expect(
      vm.rows().map((r) => [r.name, plain(r.currentPrice), plain(r.announcedPrice), r.statusLabel]),
    ).toEqual([
      ['Kaffee', '0,50 €', null, 'aktiv'],
      ['Tee', '0,50 €', '0,60 € ab 01.11.26', 'aktiv'],
      ['Kakao', '0,70 €', null, 'inaktiv'],
    ]);
    expect([row(COFFEE).canMoveUp, row(COCOA).canMoveDown]).toEqual([false, false]);
  });

  it('F-10 legt einen Artikel am Ende an und prüft Name und Preis', async () => {
    expect(await vm.submitCreate()).toBe(false);
    expect(vm.createForm.price().errors()[0]?.message).toBe('Bitte gib einen Betrag ein.');

    vm.createForm.name().value.set('kaffee');
    vm.createForm.price().value.set('0,8');
    await vm.submitCreate();
    expect(vm.createForm.name().errors()[0]?.message).toBe(
      'Einen Artikel mit diesem Namen gibt es bereits.',
    );

    vm.createForm.name().value.set('Wasser');
    expect(await vm.submitCreate()).toBe(true);
    await settle();
    expect(vm.rows().at(-1)).toMatchObject({ name: 'Wasser' });
    expect(plain(vm.rows().at(-1)?.currentPrice)).toBe('0,80 €');
  });

  describe('F-10 Preis ändern mit ausdrücklicher Bestätigung', () => {
    it('fragt nach und speichert erst im zweiten Schritt', async () => {
      vm.startPriceChange(COFFEE);
      expect(plain(vm.priceChange()?.currentPrice)).toBe('0,50 €');
      expect(vm.priceForm().value().amount).toBe('0,50');

      vm.priceForm.amount().value.set('0,60');
      vm.priceForm.validFrom().value.set(new Date(2026, 10, 1));
      await vm.submitPriceChange();
      expect(plain(vm.confirmation())).toBe('Preis Kaffee 0,50 € → 0,60 € ab 01.11.2026?');
      expect(plain(row(COFFEE).announcedPrice)).toBeNull();

      await vm.submitPriceChange();
      await settle();
      expect(vm.priceChange()).toBeNull();
      expect(plain(row(COFFEE).announcedPrice)).toBe('0,60 € ab 01.11.26');
      expect(lastToast().message).toBe('Preis für Kaffee gespeichert');
    });

    it('nennt „ab sofort“ und wirkt sofort auf die Buchungsseite', async () => {
      vm.startPriceChange(COFFEE);
      vm.priceForm.amount().value.set('0,55');
      await vm.submitPriceChange();
      expect(plain(vm.confirmation())).toBe('Preis Kaffee 0,50 € → 0,55 € ab sofort (13.10.2026)?');
      await vm.submitPriceChange();
      const account = TestBed.inject(AccountFacade);
      await settle();
      const products = account.bookableProducts.value();
      expect(products?.find((p) => p.id === COFFEE)?.currentPrice).toBe(55);
    });

    it('beginnt die Datumsauswahl für „gültig ab“ heute und folgt dem Tageswechsel', () => {
      expect(vm.earliestValidFrom()).toEqual(new Date(2026, 9, 13));
      // 22:30 UTC ist in Berlin schon der 14.
      testClock().set(new Date('2026-10-13T22:30:00Z'));
      expect(vm.earliestValidFrom()).toEqual(new Date(2026, 9, 14));
    });

    it('lehnt Daten in der Vergangenheit ab und geht von der Bestätigung zurück', async () => {
      vm.startPriceChange(TEA);
      vm.priceForm.validFrom().value.set(new Date(2026, 9, 1));
      expect(await vm.submitPriceChange()).toBe(false);
      expect(vm.priceForm.validFrom().errors()[0]?.message).toBe(
        'Das Datum darf nicht in der Vergangenheit liegen.',
      );

      vm.priceForm.validFrom().value.set(new Date(2026, 9, 13));
      await vm.submitPriceChange();
      expect(vm.confirmation()).not.toBeNull();
      vm.editPriceAgain();
      expect(vm.confirmation()).toBeNull();
    });
  });

  it('F-10 zeigt den Preisverlauf neuester Preis zuerst', () => {
    vm.showPriceHistory(TEA);
    expect(vm.priceHistory()?.entries.map((e) => [plain(e.price), e.validFrom, e.status])).toEqual([
      ['0,60 €', '01.11.26', 'angekündigt'],
      ['0,50 €', '01.09.26', 'aktuell'],
    ]);
    vm.closePriceHistory();
    expect(vm.priceHistory()).toBeNull();
  });

  it('F-10 verschiebt, deaktiviert und aktiviert Artikel', async () => {
    await vm.move(TEA, 'UP');
    await settle();
    expect(vm.rows().map((r) => r.id)).toEqual([TEA, COFFEE, COCOA]);

    await vm.setActive(TEA, false);
    await settle();
    expect(row(TEA).active).toBe(false);
    expect(lastToast().message).toBe('Tee deaktiviert');

    await vm.setActive(COCOA, true);
    await settle();
    expect(row(COCOA).statusLabel).toBe('aktiv');
  });
});
