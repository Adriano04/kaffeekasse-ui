import { TestBed } from '@angular/core/testing';
import { RsToast, RsToastService } from 'custom-components';

import { AccountFacade } from '../../core/facades/account.facade';
import { JournalFacade } from '../../core/facades/journal.facade';
import { MasterDataFacade } from '../../core/facades/master-data.facade';
import { fail } from '../../core/model/result';
import { ANNA, BEN, COFFEE, booking, createTestData } from '../../testing/test-data';
import {
  TestEnvironmentOptions,
  provideTestEnvironment,
  settle,
  testClock,
  testRepository,
  testSession,
} from '../../testing/test-environment';
import { AccountViewModel } from './account.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ') ?? null;

describe('AccountViewModel', () => {
  let vm: AccountViewModel;

  async function setup(options: TestEnvironmentOptions = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [provideTestEnvironment(options), AccountViewModel],
    });
    vm = TestBed.inject(AccountViewModel);
    await settle();
  }

  const adjust = async (personId: string, amount: number) => {
    const result = await TestBed.inject(JournalFacade).recordAdjustment(
      { personId, amount, reason: 'Test' },
      `adjust-${personId}-${amount}`,
    );
    expect(result.ok).toBe(true);
    await settle();
  };

  const lastToast = (): RsToast => TestBed.inject(RsToastService).toasts().at(-1)!;

  describe('F-06/F-08 Kontostand', () => {
    beforeEach(() => setup());

    it('zeigt den Kontostand groß mit Vorzeichen, Farbe und Text', () => {
      expect(plain(vm.balance()?.text)).toBe('−0,50 €');
      expect(vm.balance()).toMatchObject({ tone: 'negative', hint: 'offen' });
    });

    it('zeigt Guthaben grün mit „+“', async () => {
      testSession().switchTo(BEN);
      await settle();
      expect(plain(vm.balance()?.text)).toBe('+2,50 €');
      expect(vm.balance()?.tone).toBe('positive');
    });
  });

  describe('F-06/F-37 Zahlungshinweis ab −5,00 €', () => {
    beforeEach(() => setup());

    it('erscheint nicht oberhalb der Erinnerungsschwelle', async () => {
      expect(vm.paymentHint()).toBeNull();
      await adjust(ANNA, -449);
      expect(plain(vm.balance()?.text)).toBe('−4,99 €');
      expect(vm.paymentHint()).toBeNull();
    });

    it('schlägt einen auf volle 10 € aufgerundeten Zahlbetrag vor', async () => {
      await adjust(ANNA, -680);
      const hint = vm.paymentHint()!;
      expect([plain(hint.balance), plain(hint.suggestedPayment), plain(hint.outcome)]).toEqual([
        '−7,30 €',
        '10,00 €',
        'dann hast du 2,70 € Guthaben',
      ]);
    });

    it('erscheint genau ab −5,00 € und meldet bei glattem Betrag ein ausgeglichenes Konto', async () => {
      await adjust(ANNA, -450);
      expect(plain(vm.paymentHint()?.suggestedPayment)).toBe('10,00 €');
      await adjust(ANNA, -500);
      expect(plain(vm.paymentHint()?.balance)).toBe('−10,00 €');
      expect(vm.paymentHint()?.outcome).toBe('dann ist dein Konto ausgeglichen');
    });
  });

  describe('F-07 Verlauf', () => {
    beforeEach(() => setup());

    it('zeigt die eigenen Buchungen neueste zuerst mit Art, Datum, Betrag und Stand danach', async () => {
      testSession().switchTo(BEN);
      await settle();

      expect(
        vm.entries().map((e) => ({
          label: e.label,
          labelTone: e.labelTone,
          date: e.date,
          details: e.details,
          amount: plain(e.amount.text),
          balanceAfter: plain(e.balanceAfter),
        })),
      ).toEqual([
        {
          label: 'Einzahlung',
          labelTone: 'positive',
          date: '02.10.26 12:00',
          details: 'Bar',
          amount: '+5,00 €',
          balanceAfter: 'Stand 2,50 €',
        },
        {
          label: 'Kaffee',
          labelTone: 'negative',
          date: '01.10.26 09:00',
          details: null,
          amount: '−0,50 €',
          balanceAfter: 'Stand −2,50 €',
        },
        {
          label: 'Startsaldo',
          labelTone: 'negative',
          date: '01.09.26 08:05',
          details: null,
          amount: '−2,00 €',
          balanceAfter: 'Stand −2,00 €',
        },
      ]);
      expect(vm.period()).toBe('seit 13.07.26');
      expect(vm.hasOlder()).toBe(false);
    });

    it('zeigt bei Korrekturen die Notiz und bei rückdatierten Buchungen nur das Datum', async () => {
      await TestBed.inject(JournalFacade).recordAdjustment(
        { personId: ANNA, amount: 150, reason: 'Kulanz Maschine' },
        'k1',
      );
      await TestBed.inject(JournalFacade).recordPayment(
        {
          personId: ANNA,
          amount: 1000,
          paymentMethod: 'BANK',
          bookingDate: '2026-10-05',
          note: 'Kontoauszug',
        },
        'k2',
      );
      await settle();

      const adjustment = vm.entries().find((e) => e.label === 'Korrektur');
      expect(adjustment?.details).toBe('Kulanz Maschine');
      expect(adjustment?.date).toBe('13.10.26 12:00');
      const payment = vm.entries().find((e) => e.label === 'Einzahlung');
      expect(payment?.date).toBe('05.10.26');
      expect(payment?.details).toBe('Überweisung · Kontoauszug');
    });

    it('zeigt stornierte Buchungen gedimmt und ohne Stand, die Gegenbuchung nicht', async () => {
      const booked = await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k1');
      await vm.undo(booked.ok ? booked.value.booking.id : '');
      await settle();

      expect(vm.entries().map((e) => [e.label, e.reversed, plain(e.balanceAfter)])).toEqual([
        ['Kaffee', true, null],
        ['Tee', false, 'Stand −0,50 €'],
      ]);
      expect(vm.entries()[0].labelTone).toBe('neutral');
    });

    it('lädt ältere Buchungen nach und behält dabei die bisherigen', async () => {
      TestBed.resetTestingModule();
      await setup({
        data: () => {
          const data = createTestData();
          const old = booking('b-0', '2026-06-20', '09:00', {
            type: 'CONSUMPTION',
            personId: ANNA,
            accountAmount: -50,
            productId: COFFEE,
            quantity: 1,
            unitPrice: 50,
            source: 'APP',
          });
          return { ...data, journal: [old, ...data.journal] };
        },
      });
      expect(vm.entries().length).toBe(1);
      expect(vm.hasOlder()).toBe(true);

      vm.loadOlder();
      expect(vm.loadingOlder()).toBe(true);
      expect(vm.loadOlderLabel()).toBe('Wird geladen …');
      expect(vm.entries().length).toBe(1);
      await settle();

      expect(vm.period()).toBe('seit 13.04.26');
      expect(vm.entries().map((e) => e.date)).toEqual(['12.10.26 15:00', '20.06.26 09:00']);
      expect(vm.hasOlder()).toBe(false);
    });

    it('meldet einen leeren Verlauf', async () => {
      const created = await TestBed.inject(MasterDataFacade).createPerson({
        displayName: 'Dora',
        username: 'dora',
        email: null,
      });
      testSession().switchTo(created.ok ? created.value.id : null);
      await settle();
      expect(vm.entries()).toEqual([]);
      expect(vm.emptyMessage()).toBe('Keine Buchungen in diesem Zeitraum.');
    });
  });

  describe('F-26 Rückgängig im Verlauf', () => {
    beforeEach(() => setup());

    it('steht nur an der letzten Konsumbuchung und verschwindet nach Ablauf der Frist von selbst', async () => {
      await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k1');
      testClock().advance(60_000);
      await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k2');
      await settle();

      expect(vm.entries().map((e) => e.canUndo)).toEqual([true, false, false]);
      expect(plain(vm.entries()[0].undoLabel)).toBe('Kaffee vom 13.10.26 12:01 rückgängig machen');

      testClock().advance(5 * 60_000 - 1);
      expect(vm.entries()[0].canUndo).toBe(true);
      testClock().advance(1);
      expect(vm.entries()[0].canUndo).toBe(false);
    });

    it('macht die Buchung rückgängig und meldet den neuen Stand', async () => {
      const booked = await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k1');
      await settle();
      await vm.undo(booked.ok ? booked.value.booking.id : '');
      await settle();

      expect(plain(lastToast().message)).toBe('Kaffee storniert · jetzt −0,50 €');
      expect(plain(vm.balance()?.text)).toBe('−0,50 €');
      expect(vm.entries()[0].canUndo).toBe(false);
    });

    it('meldet, wenn die Frist inzwischen abgelaufen ist', async () => {
      const booked = await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k1');
      testClock().advance(5 * 60_000);
      await vm.undo(booked.ok ? booked.value.booking.id : '');
      expect(lastToast()).toMatchObject({ variant: 'crit' });
      expect(lastToast().message).toContain('Frist');
    });
  });

  describe('F-37 Zahlungsinformationen', () => {
    beforeEach(() => setup());

    it('zeigt Bar, Überweisung mit Verwendungszweck und PayPal aus den Einstellungen', () => {
      expect(vm.paymentInfo()).toEqual({
        accountHolder: 'Anna Test',
        iban: 'DE02 1203 0000 0000 2020 51',
        paypalLink: 'https://paypal.example/test',
        cashNote: 'Umschlag in die Dose.',
        paymentReference: 'Kaffeekasse KK-01 Anna',
      });
    });
  });

  describe('Lade- und Fehlerzustände', () => {
    it('zeigt einen Ladefehler und lädt auf Wunsch erneut', async () => {
      TestBed.configureTestingModule({ providers: [provideTestEnvironment(), AccountViewModel] });
      const load = vi
        .spyOn(testRepository(), 'myBookings')
        .mockResolvedValue(fail('TECHNICAL_ERROR'));
      vm = TestBed.inject(AccountViewModel);
      await settle();
      expect(vm.loadError()).toBe('Das hat nicht geklappt. Bitte versuche es noch einmal.');

      load.mockRestore();
      vm.retry();
      await settle();
      expect(vm.loadError()).toBeNull();
      expect(vm.entries().length).toBe(1);
    });

    it('meldet, wenn niemand angemeldet ist', async () => {
      await setup();
      testSession().switchTo(null);
      expect(vm.signedOut()).toBe(true);
    });
  });
});
