import { Booking, Person, Product } from './domain';
import {
  announcedPrice,
  balanceOf,
  balancesAfter,
  cashBalanceByMethod,
  checkAdminReversal,
  checkSelfReversal,
  currentPrice,
  isReminderDue,
  isWarningDue,
  metricsOf,
  reconciliation,
  reversedIds,
  suggestPayment,
} from './rules';

let sequence = 0;

function booking(fields: Partial<Booking> & Pick<Booking, 'type'>): Booking {
  sequence++;
  return {
    id: `b-${String(sequence).padStart(3, '0')}`,
    recordedAt: `2026-10-01T08:${String(sequence % 60).padStart(2, '0')}:00.000Z`,
    bookingDate: '2026-10-01',
    personId: null,
    paymentMethod: null,
    accountAmount: 0,
    cashAmount: 0,
    productId: null,
    quantity: null,
    unitPrice: null,
    category: null,
    note: '',
    reversalOf: null,
    source: 'ADMIN',
    recordedBy: 'person-admin',
    idempotencyKey: null,
    ...fields,
  };
}

function reversal(original: Booking, fields: Partial<Booking> = {}): Booking {
  return booking({
    type: 'REVERSAL',
    personId: original.personId,
    paymentMethod: original.paymentMethod,
    accountAmount: -original.accountAmount,
    cashAmount: -original.cashAmount,
    bookingDate: original.bookingDate,
    reversalOf: original.id,
    ...fields,
  });
}

function person(id: string, active = true): Person {
  return { id, displayName: id, username: id, email: null, active, roles: [], referenceCode: id };
}

describe('Fachregeln', () => {
  beforeEach(() => (sequence = 0));

  describe('4.2 Kontostand und Kassenbestand', () => {
    it('Kontostand ist die Summe der Beträge auf dem Personenkonto', () => {
      const bookings = [
        booking({ type: 'OPENING_BALANCE', personId: 'p1', accountAmount: -200 }),
        booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -50 }),
        booking({
          type: 'PAYMENT',
          personId: 'p1',
          paymentMethod: 'CASH',
          accountAmount: 1000,
          cashAmount: 1000,
        }),
        booking({ type: 'CONSUMPTION', personId: 'p2', accountAmount: -60 }),
      ];
      expect(balanceOf(bookings, 'p1')).toBe(750);
      expect(balanceOf(bookings, 'p2')).toBe(-60);
      expect(balanceOf(bookings, 'p3')).toBe(0);
    });

    it('F-19 Kassenbestand je Zahlungsweg ist die Summe der Kassenbeträge', () => {
      const bookings = [
        booking({ type: 'OPENING_CASH', paymentMethod: 'CASH', cashAmount: 1000 }),
        booking({
          type: 'PAYMENT',
          personId: 'p1',
          paymentMethod: 'BANK',
          accountAmount: 500,
          cashAmount: 500,
        }),
        booking({ type: 'EXPENSE', paymentMethod: 'CASH', cashAmount: -449 }),
        booking({ type: 'BOTTLE_REFUND', paymentMethod: 'CASH', cashAmount: 325 }),
        booking({ type: 'OUT_OF_POCKET', personId: 'p1', accountAmount: 450 }),
      ];
      expect(cashBalanceByMethod(bookings)).toEqual({ CASH: 876, BANK: 500, PAYPAL: 0 });
    });
  });

  describe('F-07 Stand danach', () => {
    it('rechnet in der Reihenfolge Buchungsdatum, dann Erfassung', () => {
      const first = booking({
        type: 'CONSUMPTION',
        personId: 'p1',
        accountAmount: -50,
        bookingDate: '2026-10-05',
      });
      const backdated = booking({
        type: 'PAYMENT',
        personId: 'p1',
        paymentMethod: 'BANK',
        accountAmount: 1000,
        cashAmount: 1000,
        bookingDate: '2026-10-01',
      });
      const after = balancesAfter([first, backdated]);
      expect(after.get(backdated.id)).toBe(1000);
      expect(after.get(first.id)).toBe(950);
    });

    it('lässt stornierte Buchungen und ihre Gegenbuchungen aus', () => {
      const a = booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -50 });
      const b = booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -60 });
      const storno = reversal(a);
      const c = booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -80 });
      const after = balancesAfter([a, b, storno, c]);
      expect(after.has(a.id)).toBe(false);
      expect(after.has(storno.id)).toBe(false);
      expect(after.get(b.id)).toBe(-60);
      expect(after.get(c.id)).toBe(-140);
    });
  });

  describe('F-10 Preise', () => {
    const product: Product = {
      id: 'coffee',
      name: 'Kaffee',
      sortOrder: 1,
      active: true,
      prices: [
        { amount: 40, validFrom: '2026-01-01' },
        { amount: 50, validFrom: '2026-09-01' },
        { amount: 70, validFrom: '2027-01-01' },
        { amount: 60, validFrom: '2026-11-01' },
      ],
    };

    it('aktueller Preis ist der jüngste mit gültig ab ≤ heute', () => {
      expect(currentPrice(product, '2026-10-13')?.amount).toBe(50);
      expect(currentPrice(product, '2026-09-01')?.amount).toBe(50);
      expect(currentPrice(product, '2026-08-31')?.amount).toBe(40);
      expect(currentPrice(product, '2025-12-31')).toBeNull();
    });

    it('angekündigter Preis ist der nächste in der Zukunft', () => {
      expect(announcedPrice(product, '2026-10-13')).toEqual({
        amount: 60,
        validFrom: '2026-11-01',
      });
      expect(announcedPrice(product, '2026-11-01')).toEqual({
        amount: 70,
        validFrom: '2027-01-01',
      });
      expect(announcedPrice(product, '2027-01-01')).toBeNull();
    });
  });

  describe('F-26 Selbst-Storno', () => {
    const consumption = booking({
      type: 'CONSUMPTION',
      personId: 'p1',
      accountAmount: -50,
      recordedAt: '2026-10-13T10:00:00.000Z',
    });
    const context = (overrides: Partial<Parameters<typeof checkSelfReversal>[1]> = {}) => ({
      personId: 'p1',
      reversed: new Set<string>(),
      now: new Date('2026-10-13T10:04:59.000Z'),
      windowMinutes: 5,
      ...overrides,
    });

    it('ist innerhalb der Frist erlaubt', () => {
      expect(checkSelfReversal(consumption, context())).toBeNull();
    });

    it('ist nach Ablauf der Frist nicht mehr erlaubt', () => {
      expect(
        checkSelfReversal(consumption, context({ now: new Date('2026-10-13T10:05:00.000Z') })),
      ).toBe('REVERSAL_WINDOW_EXPIRED');
    });

    it('ist nur einmal möglich', () => {
      expect(checkSelfReversal(consumption, context({ reversed: new Set([consumption.id]) }))).toBe(
        'ALREADY_REVERSED',
      );
    });

    it('gilt nur für eigene Konsumbuchungen', () => {
      expect(checkSelfReversal(consumption, context({ personId: 'p2' }))).toBe('NOT_FOUND');
      const payment = booking({
        type: 'PAYMENT',
        personId: 'p1',
        recordedAt: consumption.recordedAt,
      });
      expect(checkSelfReversal(payment, context())).toBe('REVERSAL_NOT_ALLOWED');
    });
  });

  describe('F-27 Storno durch die Verwaltung', () => {
    it('ist für jede Buchung außer einem Storno möglich, ohne Frist, nur einmal', () => {
      const expense = booking({ type: 'EXPENSE', paymentMethod: 'BANK', cashAmount: -24900 });
      const storno = reversal(expense);
      expect(checkAdminReversal(expense, new Set())).toBeNull();
      expect(checkAdminReversal(expense, reversedIds([expense, storno]))).toBe('ALREADY_REVERSED');
      expect(checkAdminReversal(storno, new Set())).toBe('REVERSAL_NOT_ALLOWED');
    });
  });

  describe('F-37 Zahlbetrag-Vorschlag', () => {
    it.each([
      [-730, 1000],
      [-1000, 1000],
      [-1001, 2000],
      [-1240, 2000],
      [-1, 1000],
    ])('schlägt bei %i Cent %i Cent vor (volle 10 €)', (balance, expected) => {
      expect(suggestPayment(balance)).toBe(expected);
    });

    it('schlägt ohne Schuld nichts vor', () => {
      expect(suggestPayment(0)).toBeNull();
      expect(suggestPayment(500)).toBeNull();
    });
  });

  describe('Schwellen (F-03, F-06, K-06)', () => {
    const settings = { reminderThreshold: -500, warningThreshold: -2000 };

    it('Erinnerungshinweis ab ≤ −5,00 €', () => {
      expect(isReminderDue(-499, settings)).toBe(false);
      expect(isReminderDue(-500, settings)).toBe(true);
    });

    it('Warnhinweis beim Buchen ab ≤ −20,00 €', () => {
      expect(isWarningDue(-1999, settings)).toBe(false);
      expect(isWarningDue(-2000, settings)).toBe(true);
    });
  });

  describe('F-17 bis F-19 Kennzahlen', () => {
    it('summiert Forderungen und Guthaben inklusive inaktiver Personen, absteigend', () => {
      const people = [person('a'), person('b'), person('c', false), person('d'), person('e')];
      const bookings = [
        booking({ type: 'OPENING_BALANCE', personId: 'a', accountAmount: -470 }),
        booking({ type: 'OPENING_BALANCE', personId: 'b', accountAmount: -1000 }),
        booking({ type: 'OPENING_BALANCE', personId: 'c', accountAmount: -300 }),
        booking({ type: 'OPENING_BALANCE', personId: 'd', accountAmount: 1040 }),
        booking({ type: 'OPENING_CASH', paymentMethod: 'CASH', cashAmount: 1702 }),
        booking({ type: 'OPENING_CASH', paymentMethod: 'PAYPAL', cashAmount: 100 }),
      ];
      const metrics = metricsOf(bookings, people);
      expect(metrics.receivables.total).toBe(1770);
      expect(metrics.receivables.people.map((p) => [p.personId, p.amount, p.active])).toEqual([
        ['b', 1000, true],
        ['a', 470, true],
        ['c', 300, false],
      ]);
      expect(metrics.credit).toEqual({
        total: 1040,
        people: [{ personId: 'd', displayName: 'd', active: true, amount: 1040 }],
      });
      expect(metrics.cashBalance).toEqual({
        total: 1802,
        byMethod: { CASH: 1702, BANK: 0, PAYPAL: 100 },
      });
    });
  });

  describe('4.3 Kontrollrechnung', () => {
    it('geht für jede Buchungsart und jeden Storno auf', () => {
      const people = [person('p1'), person('p2')];
      const consumption = booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -50 });
      const expense = booking({ type: 'EXPENSE', paymentMethod: 'BANK', cashAmount: -24900 });
      const outOfPocket = booking({ type: 'OUT_OF_POCKET', personId: 'p2', accountAmount: 450 });
      const bookings = [
        booking({ type: 'OPENING_CASH', paymentMethod: 'CASH', cashAmount: 5000 }),
        booking({ type: 'OPENING_BALANCE', personId: 'p1', accountAmount: -300 }),
        consumption,
        reversal(consumption),
        booking({ type: 'CONSUMPTION', personId: 'p1', accountAmount: -60 }),
        booking({
          type: 'PAYMENT',
          personId: 'p1',
          paymentMethod: 'PAYPAL',
          accountAmount: 2000,
          cashAmount: 2000,
        }),
        booking({
          type: 'PAYOUT',
          personId: 'p2',
          paymentMethod: 'CASH',
          accountAmount: -100,
          cashAmount: -100,
        }),
        booking({ type: 'ADJUSTMENT', personId: 'p2', accountAmount: 150 }),
        expense,
        reversal(expense),
        booking({ type: 'EXPENSE', paymentMethod: 'BANK', cashAmount: -2490 }),
        outOfPocket,
        booking({ type: 'BOTTLE_REFUND', paymentMethod: 'CASH', cashAmount: 800 }),
      ];
      const result = reconciliation(bookings, people);
      // Ergebnis: Konsum 0,60 − Korrektur 1,50 − Ausgabe 24,90 − Auslage 4,50 + Pfand 8,00
      expect(result.netIncome).toBe(60 - 150 - 2490 - 450 + 800);
      expect(result.opening).toBe(5000 + 300);
      expect(result.netAssets).toBe(result.opening + result.netIncome);
    });
  });
});
