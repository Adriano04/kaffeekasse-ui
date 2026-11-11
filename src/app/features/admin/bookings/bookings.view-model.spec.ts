import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RsTableRequest, RsToast, RsToastService } from 'custom-components';

import { fail } from '../../../core/model/result';
import { PrototypeDatabase } from '../../../prototype/prototype-database';
import { BEN, CLEO, COFFEE } from '../../../testing/test-data';
import {
  provideTestEnvironment,
  settle,
  testClock,
  testRepository,
} from '../../../testing/test-environment';
import { BookingsViewModel } from './bookings.view-model';

/** Ersetzt geschützte Leerzeichen, damit die Erwartungen lesbar bleiben. */
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ') ?? null;

const ALL: RsTableRequest = { page: 1, pageSize: 20, sort: null, filters: {} };

describe('BookingsViewModel', () => {
  let vm: BookingsViewModel;

  const lastToast = (): RsToast => TestBed.inject(RsToastService).toasts().at(-1)!;
  const journal = () => TestBed.inject(PrototypeDatabase).journal;

  async function setup(queryParams: Record<string, string> = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideTestEnvironment(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
        BookingsViewModel,
      ],
    });
    vm = TestBed.inject(BookingsViewModel);
    await settle();
  }

  describe('Buchung erfassen', () => {
    beforeEach(() => setup());

    it('bietet die drei Varianten an und wählt Personen mit Kontostand, aktive zuerst', () => {
      expect(vm.variantLabels).toEqual(['Einzahlung', 'Korrektur', 'Auszahlung']);
      expect(vm.activeVariant()).toBe('PAYMENT');
      vm.selectVariant(2);
      expect(vm.activeVariant()).toBe('PAYOUT');
      expect(vm.personOptions().map((o) => plain(o.label))).toEqual([
        'Anna (−0,50 €)',
        'Ben (+2,50 €)',
        'Cleo (−3,00 €) – inaktiv',
      ]);
    });

    it('F-11 verbucht eine Einzahlung, auch rückdatiert und für Inaktive', async () => {
      expect(await vm.submitPayment()).toBe(false);
      expect(vm.paymentForm.personId().errors()[0]?.message).toBe('Bitte wähle eine Person.');

      vm.paymentForm.personId().value.set(CLEO);
      vm.paymentForm.amount().value.set('3');
      vm.paymentForm.paymentMethod().value.set('BANK');
      vm.paymentForm.bookingDate().value.set(new Date(2026, 9, 5));
      expect(await vm.submitPayment()).toBe(true);

      expect(journal().at(-1)).toMatchObject({
        type: 'PAYMENT',
        personId: CLEO,
        accountAmount: 300,
        cashAmount: 300,
        paymentMethod: 'BANK',
        bookingDate: '2026-10-05',
      });
      expect(plain(lastToast().message)).toBe('Einzahlung verbucht: Cleo · +3,00 €');
      expect(vm.paymentForm().value().amount).toBe('');
    });

    it('F-11 lehnt Beträge ≤ 0 und Daten in der Zukunft ab', async () => {
      vm.paymentForm.personId().value.set(BEN);
      vm.paymentForm.amount().value.set('-5');
      vm.paymentForm.bookingDate().value.set(new Date(2026, 9, 14));
      expect(await vm.submitPayment()).toBe(false);
      expect(vm.paymentForm.amount().errors()[0]?.message).toBe(
        'Der Betrag muss größer als 0 sein.',
      );
      expect(vm.paymentForm.bookingDate().errors()[0]?.message).toBe(
        'Das Datum darf nicht in der Zukunft liegen.',
      );
    });

    it('F-11 begrenzt die Datumsauswahl auf heute und folgt dem Tageswechsel', () => {
      expect(vm.latestBookingDate()).toEqual(new Date(2026, 9, 13));
      // 22:30 UTC ist in Berlin schon der 14.
      testClock().set(new Date('2026-10-13T22:30:00Z'));
      expect(vm.latestBookingDate()).toEqual(new Date(2026, 9, 14));
    });

    it('F-12 verbucht eine Korrektur nur mit Begründung und ohne Kassenwirkung', async () => {
      vm.adjustmentForm.personId().value.set(BEN);
      vm.adjustmentForm.amount().value.set('-1,5');
      expect(await vm.submitAdjustment()).toBe(false);
      expect(vm.adjustmentForm.reason().errors()[0]?.message).toBe('Bitte gib eine Begründung an.');

      vm.adjustmentForm.reason().value.set('Striche nachgetragen');
      expect(await vm.submitAdjustment()).toBe(true);
      expect(journal().at(-1)).toMatchObject({
        type: 'ADJUSTMENT',
        accountAmount: -150,
        cashAmount: 0,
        note: 'Striche nachgetragen',
      });
    });

    it('F-28 warnt bei einer Auszahlung über dem Guthaben, ohne zu blockieren', async () => {
      vm.payoutForm.personId().value.set(BEN);
      vm.payoutForm.amount().value.set('2,50');
      expect(vm.payoutWarning()).toBeNull();
      vm.payoutForm.amount().value.set('3');
      expect(plain(vm.payoutWarning())).toBe(
        'Der Betrag ist höher als das Guthaben von Ben (2,50 €).',
      );

      expect(await vm.submitPayout()).toBe(true);
      expect(journal().at(-1)).toMatchObject({
        type: 'PAYOUT',
        accountAmount: -300,
        cashAmount: -300,
      });
    });
  });

  it('F-09 öffnet die Auszahlung für die Person aus dem Personen-Dialog', async () => {
    await setup({ payout: BEN });
    expect(vm.activeVariant()).toBe('PAYOUT');
    expect(vm.payoutForm.personId().value()).toBe(BEN);
  });

  describe('F-13 Gesamthistorie', () => {
    beforeEach(() => setup());

    it('liefert Seiten mit Datum, Art, Betrag, Herkunft und erfasst von', async () => {
      const result = await vm.loadHistory({ ...ALL, pageSize: 2 });
      expect(result.total).toBe(6);
      expect(
        result.rows.map((r) => [
          r.date,
          r.person,
          r.type,
          r.product,
          plain(r.amount.text),
          r.source,
          r.recordedBy,
        ]),
      ).toEqual([
        ['12.10.26', 'Anna', 'Konsum', 'Tee', '−0,50 €', 'App', 'Anna'],
        ['02.10.26', 'Ben', 'Einzahlung', '', '+5,00 €', 'Verwaltung', 'Anna'],
      ]);
    });

    it('übersetzt Filter und Sortierung der Tabelle in die Suche', async () => {
      const byPerson = await vm.loadHistory({
        ...ALL,
        filters: { person: BEN, type: 'CONSUMPTION' },
      });
      expect(byPerson.rows.map((r) => r.id)).toEqual(['b-4']);

      const byProduct = await vm.loadHistory({ ...ALL, filters: { product: COFFEE } });
      expect(byProduct.rows.map((r) => r.id)).toEqual(['b-4']);

      const byDate = await vm.loadHistory({
        ...ALL,
        filters: { date: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) } },
      });
      expect(byDate.rows.map((r) => r.id)).toEqual(['b-5', 'b-4']);

      const sorted = await vm.loadHistory({ ...ALL, sort: { column: 'amount', direction: 'asc' } });
      expect(sorted.rows[0].id).toBe('b-3');
    });

    it('meldet Fehler des Backends als Fehlerzustand der Tabelle', async () => {
      vi.spyOn(testRepository(), 'searchBookings').mockResolvedValue(fail('FORBIDDEN'));
      await expect(vm.loadHistory(ALL)).rejects.toThrow('Dafür fehlt dir die Berechtigung.');
    });

    it('F-27 storniert mit Pflicht-Begründung und markiert die Zeile', async () => {
      const [row] = (await vm.loadHistory({ ...ALL, filters: { person: BEN, type: 'PAYMENT' } }))
        .rows;
      vm.askReversal(row);
      expect(plain(vm.reversal.summary())).toBe('Einzahlung · Ben · +5,00 € · 02.10.26');

      expect(await vm.reversal.confirm()).toBe(false);
      vm.reversal.form.reason().value.set('Falsche Person');
      expect(await vm.reversal.confirm()).toBe(true);
      expect(vm.reversal.summary()).toBeNull();

      const rows = (await vm.loadHistory({ ...ALL, filters: { person: BEN } })).rows;
      expect(rows.map((r) => [r.type, r.reversed, r.canReverse, r.note])).toEqual([
        ['Storno: Einzahlung', false, false, 'Falsche Person'],
        ['Einzahlung', true, false, ''],
        ['Konsum', false, true, ''],
        ['Startsaldo', false, true, ''],
      ]);
      expect(vm.version()).toBeGreaterThan(0);
    });
  });
});
