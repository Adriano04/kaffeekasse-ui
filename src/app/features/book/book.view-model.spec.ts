import { TestBed } from '@angular/core/testing';
import { RsToast, RsToastService } from 'custom-components';

import { JournalFacade } from '../../core/facades/journal.facade';
import { fail } from '../../core/model/result';
import { PrototypeDatabase } from '../../prototype/prototype-database';
import { ANNA, BEN, COCOA, COFFEE, TEA } from '../../testing/test-data';
import {
  provideTestEnvironment,
  settle,
  testClock,
  testRepository,
  testSession,
} from '../../testing/test-environment';
import { BookViewModel, CONFIRMATION_DURATION_MS, DOUBLE_TAP_MS } from './book.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | undefined) => text?.replace(/\s/g, ' ');

describe('BookViewModel', () => {
  let vm: BookViewModel;
  let toasts: RsToastService;

  const lastToast = (): RsToast => toasts.toasts().at(-1)!;
  const consumptionCount = () =>
    TestBed.inject(PrototypeDatabase).journal.filter((b) => b.type === 'CONSUMPTION').length;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), BookViewModel] });
    vm = TestBed.inject(BookViewModel);
    toasts = TestBed.inject(RsToastService);
    await settle();
  });

  describe('F-02/F-08 Kontostand', () => {
    it('zeigt den Kontostand der angemeldeten Person mit Vorzeichen, Farbe und Text', () => {
      expect(vm.personName()).toBe('Anna');
      expect(plain(vm.balance()?.text)).toBe('−0,50 €');
      expect(vm.balance()).toMatchObject({ tone: 'negative', hint: 'offen' });
    });

    it('zeigt Guthaben mit „+“ und lädt nach einem Personenwechsel neu', async () => {
      testSession().switchTo(BEN);
      expect(vm.balance()).toBeNull();
      await settle();
      expect(plain(vm.balance()?.text)).toBe('+2,50 €');
      expect(vm.balance()).toMatchObject({ tone: 'positive', hint: 'Guthaben' });
    });
  });

  describe('F-04 Artikelkacheln', () => {
    it('zeigt die aktiven Artikel sortiert, mit Preis und angekündigtem Preis', () => {
      const tiles = vm.tiles().map((tile) => ({
        ...tile,
        price: plain(tile.price),
        announcement: plain(tile.announcement ?? undefined) ?? null,
        ariaLabel: plain(tile.ariaLabel),
      }));
      expect(tiles).toEqual([
        {
          id: COFFEE,
          name: 'Kaffee',
          price: '0,50 €',
          announcement: null,
          ariaLabel: 'Kaffee für 0,50 € buchen',
          busy: false,
        },
        {
          id: TEA,
          name: 'Tee',
          price: '0,50 €',
          announcement: 'ab 01.11.: 0,60 €',
          ariaLabel: 'Tee für 0,50 € buchen (ab 01.11.: 0,60 €)',
          busy: false,
        },
      ]);
      expect(vm.loading()).toBe(false);
      expect(vm.empty()).toBe(false);
    });
  });

  describe('F-01/F-03 Buchen', () => {
    it('bucht mit einem Tap und bestätigt mit Werten aus der Antwort', async () => {
      await vm.bookProduct(COFFEE);

      const toast = lastToast();
      expect(plain(toast.message)).toBe('Kaffee gebucht · 0,50 € · vorher −0,50 € → jetzt −1,00 €');
      expect(toast).toMatchObject({ variant: 'ok', duration: CONFIRMATION_DURATION_MS });
      expect(toast.title).toBeUndefined();
      expect(toast.action?.label).toBe('Rückgängig');

      await settle();
      expect(plain(vm.balance()?.text)).toBe('−1,00 €');
    });

    it('ignoriert einen zweiten Tap auf dieselbe Kachel innerhalb von 1 s, danach bucht er erneut', async () => {
      const before = consumptionCount();
      await vm.bookProduct(COFFEE);
      testClock().advance(DOUBLE_TAP_MS - 1);
      await vm.bookProduct(COFFEE);
      expect(consumptionCount()).toBe(before + 1);

      await vm.bookProduct(TEA);
      expect(consumptionCount()).toBe(before + 2);

      testClock().advance(1);
      await vm.bookProduct(COFFEE);
      expect(consumptionCount()).toBe(before + 3);
    });

    it('markiert die Kachel, solange die Buchung läuft', async () => {
      const booking = vm.bookProduct(COFFEE);
      expect(vm.tiles().find((tile) => tile.id === COFFEE)?.busy).toBe(true);
      await booking;
      expect(vm.tiles().find((tile) => tile.id === COFFEE)?.busy).toBe(false);
    });

    it('warnt ab der Warnschwelle mit „Bitte bald ausgleichen“, ohne zu blockieren (K-06)', async () => {
      await TestBed.inject(JournalFacade).recordAdjustment(
        { personId: ANNA, amount: -1950, reason: 'Test' },
        'k1',
      );
      await vm.bookProduct(COFFEE);

      const toast = lastToast();
      expect(toast).toMatchObject({ variant: 'warn', title: 'Bitte bald ausgleichen' });
      expect(plain(toast.message)).toContain('jetzt −20,50 €');
    });

    it('meldet abgelehnte Buchungen als kritischen Toast', async () => {
      await vm.bookProduct(COCOA);
      expect(lastToast()).toMatchObject({
        variant: 'crit',
        message: 'Dieser Artikel kann gerade nicht gebucht werden.',
      });
    });
  });

  describe('F-26 Rückgängig in der Bestätigung', () => {
    it('storniert innerhalb der Frist und meldet den neuen Stand', async () => {
      await vm.bookProduct(COFFEE);
      testClock().advance(4 * 60_000);
      lastToast().action!.handler();
      await settle();

      expect(plain(lastToast().message)).toBe('Kaffee storniert · jetzt −0,50 €');
      expect(lastToast().variant).toBe('ok');
      expect(plain(vm.balance()?.text)).toBe('−0,50 €');
    });

    it('meldet nach Ablauf der Frist, dass nur noch die Verwaltung stornieren kann', async () => {
      await vm.bookProduct(COFFEE);
      testClock().advance(5 * 60_000);
      lastToast().action!.handler();
      await settle();

      expect(lastToast()).toMatchObject({
        variant: 'crit',
        message:
          'Die Frist zum Rückgängigmachen ist abgelaufen. Bitte wende dich an die Verwaltung.',
      });
    });
  });

  describe('Lade- und Fehlerzustände', () => {
    it('zeigt einen Ladefehler und lädt auf Wunsch erneut', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideTestEnvironment(), BookViewModel] });
      const load = vi
        .spyOn(testRepository(), 'bookableProducts')
        .mockResolvedValue(fail('TECHNICAL_ERROR'));
      vm = TestBed.inject(BookViewModel);
      await settle();

      expect(vm.loadError()).toBe('Das hat nicht geklappt. Bitte versuche es noch einmal.');
      load.mockRestore();
      vm.retry();
      await settle();
      expect(vm.loadError()).toBeNull();
      expect(vm.tiles().length).toBe(2);
    });

    it('meldet, wenn niemand angemeldet ist', () => {
      testSession().switchTo(null);
      expect(vm.signedOut()).toBe(true);
    });
  });
});
