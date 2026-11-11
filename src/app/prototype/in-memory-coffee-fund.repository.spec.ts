import { TestBed } from '@angular/core/testing';

import { Clock } from '../core/clock/clock';
import { CoffeeFundRepository } from '../core/data/coffee-fund.repository';
import { BookingQuery } from '../core/model/api';
import { Booking } from '../core/model/domain';
import { Result } from '../core/model/result';
import { balanceOf, cashBalanceByMethod, metricsOf } from '../core/model/rules';
import { TestClock } from '../testing/test-clock';
import {
  ANNA,
  BEN,
  CLEO,
  COCOA,
  COFFEE,
  TEA,
  TEST_NOW,
  TEST_TODAY,
  createTestData,
} from '../testing/test-data';
import { provideTestEnvironment, testClock, testSession } from '../testing/test-environment';
import { InMemoryCoffeeFundRepository } from './in-memory-coffee-fund.repository';
import { providePrototype } from './provide-prototype';
import { PrototypeDatabase } from './prototype-database';

/** Wert eines erfolgreichen Ergebnisses; bei einem Fehler schlägt der Test fehl. */
function value<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Unerwarteter Fehler: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

const ALL: BookingQuery = { filter: {}, sort: null, page: 1, pageSize: 100 };

describe('InMemoryCoffeeFundRepository', () => {
  let repository: CoffeeFundRepository;
  let db: PrototypeDatabase;
  let clock: TestClock;

  const journal = () => db.journal;
  const last = (): Booking => journal()[journal().length - 1];
  const balance = (personId: string) => balanceOf(journal(), personId);
  const cash = () => cashBalanceByMethod(journal());

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestEnvironment() });
    repository = TestBed.inject(CoffeeFundRepository);
    db = TestBed.inject(PrototypeDatabase);
    clock = testClock();
  });

  describe('4.2 Wirkung der Buchungsarten', () => {
    it('F-01 Konsum belastet das Konto zum aktuellen Preis, die Kasse bleibt gleich', async () => {
      const cashBefore = cash();
      const booked = value(await repository.bookConsumption(COFFEE, 'k1'));

      expect(booked.balanceBefore).toBe(-50);
      expect(booked.balanceAfter).toBe(-100);
      expect(booked.booking).toMatchObject({
        type: 'CONSUMPTION',
        productName: 'Kaffee',
        amount: -50,
      });
      expect(balance(ANNA)).toBe(-100);
      expect(cash()).toEqual(cashBefore);
      expect(last()).toMatchObject({
        type: 'CONSUMPTION',
        personId: ANNA,
        productId: COFFEE,
        quantity: 1,
        unitPrice: 50,
        accountAmount: -50,
        cashAmount: 0,
        source: 'APP',
        recordedBy: ANNA,
        bookingDate: TEST_TODAY,
        recordedAt: TEST_NOW.toISOString(),
        idempotencyKey: 'k1',
      });
    });

    it('F-01 alte Buchungen behalten ihren Preis (Snapshot)', async () => {
      value(await repository.bookConsumption(COFFEE, 'k1'));
      value(await repository.changePrice(COFFEE, 80, TEST_TODAY));
      value(await repository.bookConsumption(COFFEE, 'k2'));
      const consumption = journal().filter((b) => b.type === 'CONSUMPTION' && b.personId === ANNA);
      expect(consumption.map((b) => b.unitPrice)).toEqual([50, 50, 80]);
    });

    it('F-11 Einzahlung erhöht Konto und Kasse des Zahlungswegs, rückdatierbar', async () => {
      const row = value(
        await repository.recordPayment(
          {
            personId: BEN,
            amount: 2000,
            paymentMethod: 'PAYPAL',
            bookingDate: '2026-10-01',
            note: ' Überweisung ',
          },
          'k1',
        ),
      );
      expect(balance(BEN)).toBe(250 + 2000);
      expect(cash()).toEqual({ CASH: 1500, BANK: 0, PAYPAL: 2000 });
      expect(row).toMatchObject({
        type: 'PAYMENT',
        bookingDate: '2026-10-01',
        personName: 'Ben',
        note: 'Überweisung',
        source: 'ADMIN',
        recordedByName: 'Anna',
      });
    });

    it('F-12 Korrektur ändert nur das Konto', async () => {
      value(
        await repository.recordAdjustment(
          { personId: BEN, amount: -150, reason: 'Striche nachgetragen' },
          'k1',
        ),
      );
      expect(balance(BEN)).toBe(100);
      expect(cash()).toEqual({ CASH: 1500, BANK: 0, PAYPAL: 0 });
      expect(last()).toMatchObject({
        type: 'ADJUSTMENT',
        note: 'Striche nachgetragen',
        cashAmount: 0,
      });
    });

    it('F-28 Auszahlung mindert Konto und Kasse', async () => {
      value(
        await repository.recordPayout(
          { personId: BEN, amount: 250, paymentMethod: 'CASH', note: 'Austritt' },
          'k1',
        ),
      );
      expect(balance(BEN)).toBe(0);
      expect(cash().CASH).toBe(1250);
    });

    it('F-14 Ausgabe mindert die Kasse', async () => {
      value(
        await repository.recordExpense(
          {
            bookingDate: '2026-10-10',
            amount: 449,
            note: 'Milch',
            category: 'MILK',
            paidFrom: 'CASH',
          },
          'k1',
        ),
      );
      expect(cash().CASH).toBe(1051);
      expect(last()).toMatchObject({
        type: 'EXPENSE',
        category: 'MILK',
        personId: null,
        accountAmount: 0,
      });
    });

    it('I-04 Auslage gibt der Person Guthaben, die Kasse bleibt gleich', async () => {
      value(
        await repository.recordExpense(
          {
            bookingDate: TEST_TODAY,
            amount: 450,
            note: 'Milch',
            category: 'MILK',
            paidFrom: { outOfPocketBy: BEN },
          },
          'k1',
        ),
      );
      expect(balance(BEN)).toBe(700);
      expect(cash()).toEqual({ CASH: 1500, BANK: 0, PAYPAL: 0 });
      expect(last()).toMatchObject({
        type: 'OUT_OF_POCKET',
        personId: BEN,
        cashAmount: 0,
        paymentMethod: null,
      });
    });

    it('F-15 Pfandrückgabe erhöht die Kasse', async () => {
      value(
        await repository.recordBottleRefund(
          { bookingDate: TEST_TODAY, amount: 325, note: 'Leergut', paymentMethod: 'CASH' },
          'k1',
        ),
      );
      expect(cash().CASH).toBe(1825);
    });

    it('F-27 Storno hebt die Wirkung des Originals auf und verweist darauf', async () => {
      const expense = value(
        await repository.recordExpense(
          {
            bookingDate: TEST_TODAY,
            amount: 24900,
            note: 'Bohnen',
            category: 'COFFEE_BEANS',
            paidFrom: 'CASH',
          },
          'k1',
        ),
      );
      const reversal = value(await repository.reverseBooking(expense.id, 'Tippfehler'));
      expect(cash().CASH).toBe(1500);
      expect(reversal).toMatchObject({
        type: 'REVERSAL',
        reversalOf: expense.id,
        reversedType: 'EXPENSE',
        cashAmount: 24900,
        note: 'Tippfehler',
      });
      const rows = value(await repository.searchBookings(ALL)).rows;
      expect(rows.find((r) => r.id === expense.id)?.reversed).toBe(true);
    });
  });

  describe('Z-05 Journal', () => {
    it('wird nur ergänzt, nie geändert', async () => {
      const before = structuredClone([...journal()]);
      value(await repository.bookConsumption(COFFEE, 'k1'));
      value(await repository.reverseOwnBooking(last().id));
      value(await repository.reverseBooking('b-5', 'falsch erfasst'));
      value(await repository.changePrice(TEA, 70, TEST_TODAY));
      value(await repository.deactivatePerson(BEN));

      expect(journal().length).toBe(before.length + 3);
      expect(journal().slice(0, before.length)).toEqual(before);
    });

    it('gibt nur Kopien heraus', async () => {
      const settings = value(await repository.settings());
      (settings.paymentInfo as { iban: string }).iban = 'geändert';
      expect(value(await repository.settings()).paymentInfo.iban).not.toBe('geändert');
    });
  });

  describe('NF-04 Idempotenz', () => {
    it('ein bekannter Schlüssel liefert das ursprüngliche Ergebnis ohne zweite Buchung', async () => {
      const first = await repository.bookConsumption(COFFEE, 'tap-1');
      clock.advance(500);
      const second = await repository.bookConsumption(COFFEE, 'tap-1');
      expect(second).toEqual(first);
      expect(balance(ANNA)).toBe(-100);
    });

    it('ein neuer Schlüssel bucht erneut', async () => {
      value(await repository.bookConsumption(COFFEE, 'tap-1'));
      value(await repository.bookConsumption(COFFEE, 'tap-2'));
      expect(balance(ANNA)).toBe(-150);
    });

    it('gilt auch für Buchungen der Verwaltung', async () => {
      const input = {
        personId: BEN,
        amount: 500,
        paymentMethod: 'CASH' as const,
        bookingDate: TEST_TODAY,
        note: '',
      };
      value(await repository.recordPayment(input, 'form-1'));
      value(await repository.recordPayment(input, 'form-1'));
      expect(balance(BEN)).toBe(750);
    });

    it('merkt sich abgelehnte Befehle nicht, damit ein korrigierter Versuch gelingt', async () => {
      const input = {
        personId: BEN,
        amount: 0,
        paymentMethod: 'CASH' as const,
        bookingDate: TEST_TODAY,
        note: '',
      };
      expect(await repository.recordPayment(input, 'form-1')).toEqual({
        ok: false,
        failure: { code: 'INVALID_AMOUNT', field: 'amount' },
      });
      value(await repository.recordPayment({ ...input, amount: 500 }, 'form-1'));
      expect(balance(BEN)).toBe(750);
    });
  });

  describe('F-26 Selbst-Storno', () => {
    it('macht die eigene Konsumbuchung innerhalb der Frist rückgängig', async () => {
      const booked = value(await repository.bookConsumption(COFFEE, 'k1'));
      clock.advance(4 * 60_000 + 59_000);
      const reversed = value(await repository.reverseOwnBooking(booked.booking.id));
      expect(reversed).toEqual({
        bookingId: booked.booking.id,
        productName: 'Kaffee',
        amount: 50,
        balanceAfter: -50,
      });
      expect(last()).toMatchObject({
        type: 'REVERSAL',
        reversalOf: booked.booking.id,
        source: 'APP',
      });
    });

    it('ist nach Ablauf der Frist nicht mehr möglich', async () => {
      const booked = value(await repository.bookConsumption(COFFEE, 'k1'));
      clock.advance(5 * 60_000);
      expect(await repository.reverseOwnBooking(booked.booking.id)).toEqual({
        ok: false,
        failure: { code: 'REVERSAL_WINDOW_EXPIRED' },
      });
    });

    it('ist nur einmal möglich', async () => {
      const booked = value(await repository.bookConsumption(COFFEE, 'k1'));
      value(await repository.reverseOwnBooking(booked.booking.id));
      expect((await repository.reverseOwnBooking(booked.booking.id)).ok).toBe(false);
      expect(balance(ANNA)).toBe(-50);
    });

    it('gilt nur für eigene Konsumbuchungen', async () => {
      expect(await repository.reverseOwnBooking('b-4')).toEqual({
        ok: false,
        failure: { code: 'NOT_FOUND' },
      });
      testSession().switchTo(BEN);
      clock.set(new Date('2026-10-02T10:01:00Z'));
      expect(await repository.reverseOwnBooking('b-5')).toEqual({
        ok: false,
        failure: { code: 'REVERSAL_NOT_ALLOWED' },
      });
      expect(await repository.reverseOwnBooking('gibt-es-nicht')).toEqual({
        ok: false,
        failure: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('F-27 Storno durch die Verwaltung', () => {
    it('braucht eine Begründung, geht nur einmal und nicht für einen Storno', async () => {
      expect(await repository.reverseBooking('b-4', '  ')).toEqual({
        ok: false,
        failure: { code: 'REASON_REQUIRED', field: 'reason' },
      });
      const reversal = value(await repository.reverseBooking('b-4', 'Fehlbuchung'));
      expect(await repository.reverseBooking('b-4', 'nochmal')).toEqual({
        ok: false,
        failure: { code: 'ALREADY_REVERSED' },
      });
      expect(await repository.reverseBooking(reversal.id, 'Storno vom Storno')).toEqual({
        ok: false,
        failure: { code: 'REVERSAL_NOT_ALLOWED' },
      });
      expect(await repository.reverseBooking('gibt-es-nicht', 'x')).toEqual({
        ok: false,
        failure: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('F-06/F-07 eigenes Konto und Verlauf', () => {
    it('liefert Konto und Kontostand der angemeldeten Person', async () => {
      expect(value(await repository.myAccount())).toEqual({
        person: { id: ANNA, displayName: 'Anna', referenceCode: 'KK-01' },
        balance: -50,
      });
    });

    it('liefert den Verlauf neueste zuerst, mit Stand danach, ohne Gegenbuchungen', async () => {
      testSession().switchTo(BEN);
      clock.set(new Date('2026-10-13T10:00:00Z'));
      const booked = value(await repository.bookConsumption(TEA, 'k1'));
      value(await repository.reverseOwnBooking(booked.booking.id));
      value(await repository.bookConsumption(COFFEE, 'k2'));

      const history = value(await repository.myBookings({ from: '2026-09-01' }));
      expect(history.hasOlder).toBe(false);
      expect(
        history.entries.map((e) => [e.type, e.productName, e.amount, e.balanceAfter, e.reversed]),
      ).toEqual([
        ['CONSUMPTION', 'Kaffee', -50, 200, false],
        ['CONSUMPTION', 'Tee', -50, null, true],
        ['PAYMENT', null, 500, 250, false],
        ['CONSUMPTION', 'Kaffee', -50, -250, false],
        ['OPENING_BALANCE', null, -200, -200, false],
      ]);
    });

    it('liefert nur den gewünschten Zeitraum und meldet ältere Buchungen', async () => {
      testSession().switchTo(BEN);
      const history = value(await repository.myBookings({ from: '2026-10-01' }));
      expect(history.entries.map((e) => e.id)).toEqual(['b-5', 'b-4']);
      expect(history.hasOlder).toBe(true);
      expect(await repository.myBookings({ from: '01.10.2026' })).toEqual({
        ok: false,
        failure: { code: 'INVALID_DATE', field: 'from' },
      });
    });
  });

  describe('F-04 Artikel auf der Buchungsseite', () => {
    it('liefert aktive Artikel sortiert mit angekündigtem Preis', async () => {
      expect(value(await repository.bookableProducts())).toEqual([
        { id: COFFEE, name: 'Kaffee', currentPrice: 50, announcedPrice: null },
        {
          id: TEA,
          name: 'Tee',
          currentPrice: 50,
          announcedPrice: { amount: 60, validFrom: '2026-11-01' },
        },
      ]);
    });

    it('lehnt inaktive und unbekannte Artikel ab', async () => {
      expect(await repository.bookConsumption(COCOA, 'k1')).toEqual({
        ok: false,
        failure: { code: 'PRODUCT_INACTIVE' },
      });
      expect(await repository.bookConsumption('gibt-es-nicht', 'k2')).toEqual({
        ok: false,
        failure: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('NF-07 Rechteprüfung', () => {
    it('lehnt ohne Anmeldung alles ab, auch für deaktivierte Personen', async () => {
      testSession().switchTo(null);
      expect(await repository.myAccount()).toEqual({
        ok: false,
        failure: { code: 'NOT_AUTHENTICATED' },
      });
      testSession().switchTo(CLEO);
      expect(await repository.bookConsumption(COFFEE, 'k1')).toEqual({
        ok: false,
        failure: { code: 'NOT_AUTHENTICATED' },
      });
    });

    it('lehnt alle Verwaltungsfunktionen ohne Rolle Verwaltung ab', async () => {
      testSession().switchTo(BEN);
      const calls: (() => Promise<Result<unknown>>)[] = [
        () => repository.people(),
        () => repository.products(),
        () => repository.searchBookings(ALL),
        () => repository.cashBook(ALL),
        () => repository.metrics(),
        () =>
          repository.recordPayment(
            {
              personId: BEN,
              amount: 100,
              paymentMethod: 'CASH',
              bookingDate: TEST_TODAY,
              note: '',
            },
            'k',
          ),
        () => repository.recordAdjustment({ personId: BEN, amount: 100, reason: 'x' }, 'k'),
        () =>
          repository.recordPayout(
            { personId: BEN, amount: 100, paymentMethod: 'CASH', note: '' },
            'k',
          ),
        () =>
          repository.recordExpense(
            { bookingDate: TEST_TODAY, amount: 100, note: 'x', category: 'MILK', paidFrom: 'CASH' },
            'k',
          ),
        () =>
          repository.recordBottleRefund(
            { bookingDate: TEST_TODAY, amount: 100, note: 'x', paymentMethod: 'CASH' },
            'k',
          ),
        () => repository.reverseBooking('b-4', 'x'),
        () => repository.createPerson({ displayName: 'Dora', username: 'dora', email: null }),
        () => repository.updatePerson(BEN, { displayName: 'Benjamin', email: null }),
        () => repository.deactivatePerson(ANNA),
        () => repository.reactivatePerson(CLEO),
        () => repository.setAdminRole(BEN, true),
        () => repository.createProduct({ name: 'Kakao', price: 70 }),
        () => repository.changePrice(COFFEE, 10, TEST_TODAY),
        () => repository.moveProduct(COFFEE, 'DOWN'),
        () => repository.setProductActive(COFFEE, false),
        () =>
          repository.updatePaymentInfo({
            accountHolder: 'x',
            iban: 'x',
            paypalLink: 'x',
            cashNote: 'x',
          }),
      ];
      const journalLength = journal().length;
      for (const call of calls) {
        expect(await call()).toEqual({ ok: false, failure: { code: 'FORBIDDEN' } });
      }
      expect(journal().length).toBe(journalLength);
      expect(db.person(BEN)?.roles).toEqual([]);
    });
  });

  describe('Prüfung der Eingaben', () => {
    it('lehnt ungültige Beträge, Daten und fehlende Angaben mit Feldbezug ab', async () => {
      const failure = async (promise: Promise<Result<unknown>>) => {
        const result = await promise;
        return result.ok ? null : result.failure;
      };
      const payment = {
        personId: BEN,
        amount: 500,
        paymentMethod: 'CASH' as const,
        bookingDate: TEST_TODAY,
        note: '',
      };

      expect(await failure(repository.recordPayment({ ...payment, amount: -1 }, 'a'))).toEqual({
        code: 'INVALID_AMOUNT',
        field: 'amount',
      });
      expect(await failure(repository.recordPayment({ ...payment, amount: 1.5 }, 'a'))).toEqual({
        code: 'INVALID_AMOUNT',
        field: 'amount',
      });
      expect(
        await failure(repository.recordPayment({ ...payment, bookingDate: '2026-10-14' }, 'a')),
      ).toEqual({
        code: 'INVALID_DATE',
        field: 'bookingDate',
      });
      expect(
        await failure(repository.recordPayment({ ...payment, personId: 'gibt-es-nicht' }, 'a')),
      ).toEqual({
        code: 'NOT_FOUND',
        field: 'personId',
      });
      expect(
        await failure(repository.recordAdjustment({ personId: BEN, amount: 0, reason: 'x' }, 'a')),
      ).toEqual({
        code: 'INVALID_AMOUNT',
        field: 'amount',
      });
      expect(
        await failure(repository.recordAdjustment({ personId: BEN, amount: 10, reason: '' }, 'a')),
      ).toEqual({
        code: 'REASON_REQUIRED',
        field: 'reason',
      });
      const expense = {
        bookingDate: TEST_TODAY,
        amount: 100,
        note: 'x',
        category: 'MILK' as const,
        paidFrom: 'CASH' as const,
      };
      expect(await failure(repository.recordExpense({ ...expense, note: ' ' }, 'a'))).toEqual({
        code: 'REQUIRED_FIELD_MISSING',
        field: 'note',
      });
      expect(
        await failure(
          repository.recordExpense(
            { ...expense, paidFrom: { outOfPocketBy: 'gibt-es-nicht' } },
            'a',
          ),
        ),
      ).toEqual({ code: 'NOT_FOUND', field: 'paidFrom' });
      expect(
        await failure(
          repository.recordBottleRefund(
            { bookingDate: 'morgen', amount: 100, note: 'x', paymentMethod: 'CASH' },
            'a',
          ),
        ),
      ).toEqual({ code: 'INVALID_DATE', field: 'bookingDate' });
    });

    it('erlaubt Buchungen für inaktive Personen (Schlussabrechnung, F-09)', async () => {
      value(
        await repository.recordPayment(
          { personId: CLEO, amount: 300, paymentMethod: 'BANK', bookingDate: TEST_TODAY, note: '' },
          'k1',
        ),
      );
      expect(balance(CLEO)).toBe(0);
    });
  });

  describe('F-09 Personen', () => {
    it('legt eine Person mit fortlaufender Kennung an', async () => {
      const person = value(
        await repository.createPerson({
          displayName: ' Dora ',
          username: 'dora',
          email: ' dora@buero.example ',
        }),
      );
      expect(person).toMatchObject({
        displayName: 'Dora',
        username: 'dora',
        email: 'dora@buero.example',
        active: true,
        roles: [],
        referenceCode: 'KK-04',
        balance: 0,
      });
    });

    it('prüft Anzeigename (unter aktiven), Benutzername (unter allen) und E-Mail', async () => {
      const create = (displayName: string, username: string, email: string | null = null) =>
        repository.createPerson({ displayName, username, email });

      expect(await create('ben', 'ben2')).toEqual({
        ok: false,
        failure: { code: 'DISPLAY_NAME_TAKEN', field: 'displayName' },
      });
      expect(await create('Cleo B.', 'CLEO')).toEqual({
        ok: false,
        failure: { code: 'USERNAME_TAKEN', field: 'username' },
      });
      expect(await create('', 'x')).toEqual({
        ok: false,
        failure: { code: 'REQUIRED_FIELD_MISSING', field: 'displayName' },
      });
      expect(await create('Dora', ' ')).toEqual({
        ok: false,
        failure: { code: 'REQUIRED_FIELD_MISSING', field: 'username' },
      });
      expect(await create('Dora', 'dora', 'keine-mail')).toEqual({
        ok: false,
        failure: { code: 'INVALID_EMAIL', field: 'email' },
      });

      // Der Name einer inaktiven Person ist frei; reaktivieren geht dann nicht mehr.
      value(await create('Cleo', 'cleo2'));
      expect(await repository.reactivatePerson(CLEO)).toEqual({
        ok: false,
        failure: { code: 'DISPLAY_NAME_TAKEN', field: 'displayName' },
      });
    });

    it('bearbeitet, deaktiviert und reaktiviert Personen', async () => {
      expect(
        value(await repository.updatePerson(BEN, { displayName: 'Benjamin', email: '' })),
      ).toMatchObject({
        displayName: 'Benjamin',
        email: null,
        balance: 250,
      });
      expect(value(await repository.deactivatePerson(BEN)).active).toBe(false);
      expect(value(await repository.reactivatePerson(BEN)).active).toBe(true);
      expect(
        await repository.updatePerson('gibt-es-nicht', { displayName: 'x', email: null }),
      ).toEqual({
        ok: false,
        failure: { code: 'NOT_FOUND' },
      });
    });

    it('F-35 das letzte aktive Verwaltungskonto lässt sich weder deaktivieren noch herabstufen', async () => {
      expect(await repository.deactivatePerson(ANNA)).toEqual({
        ok: false,
        failure: { code: 'LAST_ADMIN_ACCOUNT' },
      });
      expect(await repository.setAdminRole(ANNA, false)).toEqual({
        ok: false,
        failure: { code: 'LAST_ADMIN_ACCOUNT' },
      });
      expect(db.person(ANNA)).toMatchObject({ active: true, roles: ['ADMIN'] });
    });

    it('das eigene Konto lässt sich nicht deaktivieren oder herabstufen, das der Vertretung schon', async () => {
      value(await repository.setAdminRole(BEN, true));
      expect(await repository.deactivatePerson(ANNA)).toEqual({
        ok: false,
        failure: { code: 'OWN_ACCOUNT' },
      });
      expect(await repository.setAdminRole(ANNA, false)).toEqual({
        ok: false,
        failure: { code: 'OWN_ACCOUNT' },
      });
      expect(value(await repository.setAdminRole(BEN, false)).roles).toEqual([]);
    });

    it('vergibt die Rolle Verwaltung nur an aktive Personen', async () => {
      expect(await repository.setAdminRole(CLEO, true)).toEqual({
        ok: false,
        failure: { code: 'PERSON_INACTIVE' },
      });
    });

    it('liefert alle Personen mit Kontostand', async () => {
      expect(
        value(await repository.people()).map((p) => [p.displayName, p.active, p.balance]),
      ).toEqual([
        ['Anna', true, -50],
        ['Ben', true, 250],
        ['Cleo', false, -300],
      ]);
    });
  });

  describe('F-10 Artikel', () => {
    it('legt Artikel am Ende der Sortierung an und prüft den Namen', async () => {
      const product = value(await repository.createProduct({ name: 'Wasser', price: 80 }));
      expect(product).toMatchObject({
        sortOrder: 4,
        active: true,
        prices: [{ amount: 80, validFrom: TEST_TODAY }],
      });
      expect(await repository.createProduct({ name: 'kaffee', price: 50 })).toEqual({
        ok: false,
        failure: { code: 'PRODUCT_NAME_TAKEN', field: 'name' },
      });
      expect(await repository.createProduct({ name: 'Saft', price: 0 })).toEqual({
        ok: false,
        failure: { code: 'INVALID_AMOUNT', field: 'price' },
      });
    });

    it('kündigt Preise an, ersetzt einen Preis mit gleichem Datum und lehnt Daten in der Vergangenheit ab', async () => {
      value(await repository.changePrice(COFFEE, 60, '2026-11-01'));
      value(await repository.changePrice(COFFEE, 55, '2026-11-01'));
      const coffee = value(await repository.products()).find((p) => p.id === COFFEE);
      expect(coffee?.prices).toEqual([
        { amount: 50, validFrom: '2026-09-01' },
        { amount: 55, validFrom: '2026-11-01' },
      ]);
      expect(await repository.changePrice(COFFEE, 60, '2026-10-12')).toEqual({
        ok: false,
        failure: { code: 'INVALID_DATE', field: 'validFrom' },
      });
    });

    it('verschiebt Artikel und deaktiviert sie', async () => {
      value(await repository.moveProduct(TEA, 'UP'));
      value(await repository.moveProduct(TEA, 'UP'));
      expect(value(await repository.products()).map((p) => p.id)).toEqual([TEA, COFFEE, COCOA]);
      value(await repository.setProductActive(TEA, false));
      expect(value(await repository.bookableProducts()).map((p) => p.id)).toEqual([COFFEE]);
    });
  });

  describe('F-13 Gesamthistorie und Kassenbuch', () => {
    it('liefert neueste zuerst, nur mit Datum, mit Herkunft und erfasst von', async () => {
      const page = value(await repository.searchBookings(ALL));
      expect(page.total).toBe(6);
      expect(page.rows.map((r) => r.id)).toEqual(['b-6', 'b-5', 'b-4', 'b-3', 'b-2', 'b-1']);
      expect(page.rows[0]).toMatchObject({
        personName: 'Anna',
        productName: 'Tee',
        source: 'APP',
        recordedByName: 'Anna',
      });
      expect(Object.keys(page.rows[0])).not.toContain('recordedAt');
    });

    it('filtert nach Person, Art, Artikel, Zeitraum und Notiz', async () => {
      value(
        await repository.recordAdjustment(
          { personId: BEN, amount: 100, reason: 'Kulanz Maschine' },
          'k1',
        ),
      );
      const ids = async (filter: BookingQuery['filter']) =>
        value(await repository.searchBookings({ ...ALL, filter })).rows.map((r) => r.id);

      expect(await ids({ personId: BEN, type: 'CONSUMPTION' })).toEqual(['b-4']);
      expect(await ids({ productId: TEA })).toEqual(['b-6']);
      expect(await ids({ from: '2026-10-01', to: '2026-10-02' })).toEqual(['b-5', 'b-4']);
      expect((await ids({ note: 'kulanz' })).length).toBe(1);
      expect(await repository.searchBookings({ ...ALL, filter: { from: 'gestern' } })).toEqual({
        ok: false,
        failure: { code: 'INVALID_DATE', field: 'from' },
      });
    });

    it('sortiert und blättert', async () => {
      const sorted = value(
        await repository.searchBookings({
          ...ALL,
          sort: { field: 'accountAmount', direction: 'asc' },
          pageSize: 2,
          page: 1,
        }),
      );
      expect(sorted.total).toBe(6);
      expect(sorted.rows.map((r) => r.accountAmount)).toEqual([-300, -200]);
      const byAmount = value(
        await repository.searchBookings({ ...ALL, sort: { field: 'amount', direction: 'desc' } }),
      );
      // Betrag Personenkonto, bei reinen Kassenbuchungen Betrag Kasse (Anfangsbestand 10,00 €).
      expect(byAmount.rows.map((r) => r.id).slice(0, 2)).toEqual(['b-1', 'b-5']);
      const page3 = value(await repository.searchBookings({ ...ALL, pageSize: 2, page: 3 }));
      expect(page3.rows.map((r) => r.id)).toEqual(['b-2', 'b-1']);
    });

    it('Kassenbuch enthält Buchungen mit Kassenwirkung plus Auslagen', async () => {
      value(
        await repository.recordExpense(
          {
            bookingDate: TEST_TODAY,
            amount: 450,
            note: 'Milch',
            category: 'MILK',
            paidFrom: { outOfPocketBy: BEN },
          },
          'k1',
        ),
      );
      value(await repository.recordAdjustment({ personId: BEN, amount: 100, reason: 'x' }, 'k2'));
      const types = value(await repository.cashBook(ALL)).rows.map((r) => r.type);
      expect(types).toEqual(['OUT_OF_POCKET', 'PAYMENT', 'OPENING_CASH']);
    });
  });

  describe('F-17 bis F-19 Kennzahlen und F-37 Zahlungsinformationen', () => {
    it('liefert die Kennzahlen aus dem Journal', async () => {
      expect(value(await repository.metrics())).toEqual(metricsOf(journal(), db.people));
    });

    it('übernimmt geänderte Zahlungsinformationen sofort', async () => {
      value(
        await repository.updatePaymentInfo({
          accountHolder: ' Neu ',
          iban: 'DE00',
          paypalLink: 'https://paypal.example/neu',
          cashNote: 'Dose',
        }),
      );
      expect(value(await repository.settings()).paymentInfo).toEqual({
        accountHolder: 'Neu',
        iban: 'DE00',
        paypalLink: 'https://paypal.example/neu',
        cashNote: 'Dose',
      });
    });
  });

  describe('technische Fehler', () => {
    it('meldet unerwartete Ausnahmen als TECHNICAL_ERROR', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(db, 'person').mockImplementation(() => {
        throw new Error('kaputt');
      });
      expect(await repository.myAccount()).toEqual({
        ok: false,
        failure: { code: 'TECHNICAL_ERROR' },
      });
    });
  });

  describe('Prototyp: Personenauswahl', () => {
    it('liefert die aktiven Personen nach Namen', async () => {
      const people = await TestBed.inject(InMemoryCoffeeFundRepository).selectablePeople();
      expect(people.map((p) => p.displayName)).toEqual(['Anna', 'Ben']);
    });
  });
});

describe('InMemoryCoffeeFundRepository mit Verzögerung', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        { provide: Clock, useValue: new TestClock(TEST_NOW) },
        providePrototype({ data: createTestData, delayMs: 800 }),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('antwortet erst nach der eingestellten Verzögerung', async () => {
    let answered = false;
    const pending = TestBed.inject(CoffeeFundRepository)
      .myAccount()
      .then((result) => (answered = result.ok));
    await vi.advanceTimersByTimeAsync(799);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(answered).toBe(true);
  });
});
