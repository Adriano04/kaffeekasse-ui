import { TestBed } from '@angular/core/testing';
import { RsTableRequest, RsToast, RsToastService } from 'custom-components';

import { AccountFacade } from '../../../core/facades/account.facade';
import { cashBalanceByMethod } from '../../../core/model/rules';
import { PrototypeDatabase } from '../../../prototype/prototype-database';
import { BEN } from '../../../testing/test-data';
import {
  provideTestEnvironment,
  settle,
  testClock,
  testSession,
} from '../../../testing/test-environment';
import { CashViewModel } from './cash.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ') ?? null;

const ALL: RsTableRequest = { page: 1, pageSize: 20, sort: null, filters: {} };

describe('CashViewModel', () => {
  let vm: CashViewModel;

  const lastToast = (): RsToast => TestBed.inject(RsToastService).toasts().at(-1)!;
  const db = () => TestBed.inject(PrototypeDatabase);
  const cash = () => cashBalanceByMethod(db().journal);

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), CashViewModel] });
    vm = TestBed.inject(CashViewModel);
    await settle();
  });

  describe('F-14 Ausgabe erfassen', () => {
    it('mindert die Kasse des gewählten Zahlungswegs', async () => {
      vm.expenseForm.amount().value.set('4,49');
      vm.expenseForm.note().value.set('Milch');
      vm.expenseForm.category().value.set('MILK');
      vm.expenseForm.bookingDate().value.set(new Date(2026, 9, 10));
      expect(await vm.submitExpense()).toBe(true);

      expect(cash().CASH).toBe(1500 - 449);
      expect(db().journal.at(-1)).toMatchObject({
        type: 'EXPENSE',
        category: 'MILK',
        bookingDate: '2026-10-10',
      });
      expect(plain(lastToast().message)).toBe('Ausgabe erfasst: Milch · 4,49 €');
      expect(vm.expenseForm().value().note).toBe('');
    });

    it('verlangt Betrag und Beschreibung', async () => {
      expect(await vm.submitExpense()).toBe(false);
      expect(vm.expenseForm.amount().errors()[0]?.message).toBe('Bitte gib einen Betrag ein.');
      expect(vm.expenseForm.note().errors()[0]?.message).toBe('Bitte gib eine Beschreibung ein.');
      expect(vm.expenseForm.outOfPocketBy().errors()).toEqual([]);
    });

    it('I-04 Auslage: verlangt die Person, gibt ihr Guthaben, die Kasse bleibt gleich', async () => {
      vm.expenseForm.amount().value.set('4,50');
      vm.expenseForm.note().value.set('Milch');
      vm.expenseForm.paidFrom().value.set('OUT_OF_POCKET');
      expect(vm.isOutOfPocket()).toBe(true);
      expect(vm.personOptions().map((o) => o.value)).not.toContain('person-cleo');

      expect(await vm.submitExpense()).toBe(false);
      expect(vm.expenseForm.outOfPocketBy().errors()[0]?.message).toBe(
        'Bitte wähle die Person, die ausgelegt hat.',
      );

      vm.expenseForm.outOfPocketBy().value.set(BEN);
      expect(await vm.submitExpense()).toBe(true);
      expect(cash()).toEqual({ CASH: 1500, BANK: 0, PAYPAL: 0 });
      expect(plain(lastToast().message)).toBe('Auslage erfasst: Ben bekommt 4,50 € Guthaben');
    });
  });

  it('F-14/F-15 begrenzen die Datumsauswahl auf heute und folgen dem Tageswechsel', () => {
    expect(vm.latestBookingDate()).toEqual(new Date(2026, 9, 13));
    // 22:30 UTC ist in Berlin schon der 14.
    testClock().set(new Date('2026-10-13T22:30:00Z'));
    expect(vm.latestBookingDate()).toEqual(new Date(2026, 9, 14));
  });

  it('F-15 erfasst eine Pfandrückgabe', async () => {
    vm.refundForm.amount().value.set('3,25');
    vm.refundForm.note().value.set('Leergut');
    expect(await vm.submitBottleRefund()).toBe(true);
    expect(cash().CASH).toBe(1825);
    expect(plain(lastToast().message)).toBe('Pfandrückgabe erfasst: 3,25 €');
  });

  describe('Kassenbuch', () => {
    it('zeigt Buchungen mit Kassenwirkung plus Auslagen mit Zahlungsweg und Kassenbetrag', async () => {
      vm.expenseForm.amount().value.set('4,50');
      vm.expenseForm.note().value.set('Milch');
      vm.expenseForm.category().value.set('MILK');
      vm.expenseForm.paidFrom().value.set('OUT_OF_POCKET');
      vm.expenseForm.outOfPocketBy().value.set(BEN);
      await vm.submitExpense();

      const rows = (await vm.loadCashBook(ALL)).rows;
      expect(rows.map((r) => [r.type, r.category, r.paymentMethod, plain(r.amount.text)])).toEqual([
        ['Auslage', 'Milch', 'Auslage: Ben', '−4,50 €'],
        ['Einzahlung', '', 'Bar', '+5,00 €'],
        ['Anfangsbestand', '', 'Bar', '+10,00 €'],
      ]);
    });

    it('F-27 storniert eine Ausgabe mit Begründung', async () => {
      vm.expenseForm.amount().value.set('249');
      vm.expenseForm.note().value.set('Kaffeebohnen');
      await vm.submitExpense();
      const [row] = (await vm.loadCashBook(ALL)).rows;

      vm.askReversal(row);
      vm.reversal.form.reason().value.set('Tippfehler: 24,90 € statt 249,00 €');
      expect(await vm.reversal.confirm()).toBe(true);

      expect(cash().CASH).toBe(1500);
      const rows = (await vm.loadCashBook({ ...ALL, filters: { type: 'REVERSAL' } })).rows;
      expect(rows.map((r) => [r.type, r.note])).toEqual([
        ['Storno: Ausgabe', 'Tippfehler: 24,90 € statt 249,00 €'],
      ]);
    });
  });

  describe('F-37 Einstellungen', () => {
    it('übernimmt die gespeicherten Zahlungsinformationen und speichert Änderungen sofort wirksam', async () => {
      expect(vm.paymentInfoForm().value()).toEqual({
        accountHolder: 'Anna Test',
        iban: 'DE02 1203 0000 0000 2020 51',
        paypalLink: 'https://paypal.example/test',
        cashNote: 'Umschlag in die Dose.',
      });

      vm.paymentInfoForm.iban().value.set('DE11 2222');
      expect(await vm.submitPaymentInfo()).toBe(true);
      await settle();
      expect(lastToast().message).toBe('Zahlungsinformationen gespeichert');

      testSession().switchTo(BEN);
      const account = TestBed.inject(AccountFacade);
      await settle();
      expect(account.currentPerson()?.id).toBe(BEN);
      expect(db().settings.paymentInfo.iban).toBe('DE11 2222');
    });

    it('verwirft keine laufende Eingabe, wenn eine andere Buchung den Datenstand ändert', async () => {
      vm.paymentInfoForm.cashNote().value.set('Neuer Hinweis');
      vm.refundForm.amount().value.set('1');
      vm.refundForm.note().value.set('Leergut');
      await vm.submitBottleRefund();
      await settle();
      expect(vm.paymentInfoForm().value().cashNote).toBe('Neuer Hinweis');
    });
  });
});
