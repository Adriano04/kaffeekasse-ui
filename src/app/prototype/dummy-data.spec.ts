import { addDays, toBerlinDate } from '../core/model/date';
import { BOOKING_TYPES, PAYMENT_METHODS, PaymentMethod } from '../core/model/domain';
import {
  announcedPrice,
  balancesByPerson,
  cashBalanceByMethod,
  currentPrice,
  reconciliation,
  reversedIds,
} from '../core/model/rules';
import { GO_LIVE_DAYS_AGO, createDummyData } from './dummy-data';

describe('Dummy-Daten', () => {
  const now = new Date('2026-10-13T10:00:00Z');
  const today = toBerlinDate(now);
  const data = createDummyData(now);
  const balances = balancesByPerson(data.journal);
  const person = (name: string) => data.people.find((p) => p.displayName === name)!;
  const product = (name: string) => data.products.find((p) => p.name === name)!;

  it('4.3 Kontrollrechnung geht auf', () => {
    const result = reconciliation(data.journal, data.people);
    expect(result.netAssets).toBe(result.opening + result.netIncome);
  });

  it('enthält die Personen der Demo plus weitere, mindestens zwei mit Rolle Verwaltung', () => {
    const names = data.people.map((p) => p.displayName);
    expect(names).toEqual(expect.arrayContaining(['Peter', 'Micha', 'Torsten', 'Sandra']));
    expect(names.length).toBeGreaterThanOrEqual(7);
    expect(
      data.people.filter((p) => p.active && p.roles.includes('ADMIN')).length,
    ).toBeGreaterThanOrEqual(2);
    expect(new Set(data.people.map((p) => p.referenceCode)).size).toBe(data.people.length);
  });

  it('deckt die Fälle für Kontostände ab (F-08, F-17, F-18)', () => {
    const active = data.people.filter((p) => p.active).map((p) => balances.get(p.id) ?? 0);
    expect(active.some((b) => b > 0)).toBe(true);
    expect(active.some((b) => b === 0)).toBe(true);
    expect(active.some((b) => b < -500 && b > -2000)).toBe(true);
    expect(active.some((b) => b <= -2000)).toBe(true);
    const inactive = data.people.filter((p) => !p.active);
    expect(inactive.some((p) => (balances.get(p.id) ?? 0) !== 0)).toBe(true);
  });

  it('meldet Micha mit Rolle Verwaltung und −7,30 € an', () => {
    const micha = person('Micha');
    expect(data.initialPersonId).toBe(micha.id);
    expect(micha.roles).toContain('ADMIN');
    expect(balances.get(micha.id)).toBe(-730);
  });

  it('enthält die Artikel der Demo mit ihren Preisen', () => {
    const prices = Object.fromEntries(
      ['Kaffee', 'Espresso', 'Tee', 'Wasser', 'Cola', 'Saft'].map((name) => [
        name,
        currentPrice(product(name), today)?.amount,
      ]),
    );
    expect(prices).toEqual({ Kaffee: 50, Espresso: 60, Tee: 50, Wasser: 80, Cola: 100, Saft: 120 });
  });

  it('enthält einen deaktivierten Artikel mit alten Buchungen', () => {
    const inactive = data.products.filter((p) => !p.active);
    expect(inactive.length).toBe(1);
    expect(data.journal.some((b) => b.productId === inactive[0].id)).toBe(true);
  });

  it('alte Buchungen behalten den alten Preis nach einer Preisänderung', () => {
    const cola = product('Cola');
    const unitPrices = new Set(
      data.journal.filter((b) => b.productId === cola.id).map((b) => b.unitPrice),
    );
    expect(unitPrices).toEqual(new Set([90, 100]));
  });

  it('enthält einen angekündigten Preis in der Zukunft', () => {
    expect(data.products.some((p) => announcedPrice(p, today) !== null)).toBe(true);
  });

  it('enthält jede Buchungsart, Einzahlungen über alle Zahlungswege und eine rückdatierte', () => {
    const types = new Set(data.journal.map((b) => b.type));
    for (const type of BOOKING_TYPES) {
      expect(types.has(type), type).toBe(true);
    }
    const payments = data.journal.filter((b) => b.type === 'PAYMENT');
    expect(new Set(payments.map((b) => b.paymentMethod))).toEqual(new Set(PAYMENT_METHODS));
    expect(payments.some((b) => b.bookingDate < toBerlinDate(new Date(b.recordedAt)))).toBe(true);
  });

  it('enthält einen Selbst-Storno und einen Storno der Verwaltung', () => {
    const reversals = data.journal.filter((b) => b.type === 'REVERSAL');
    expect(reversals.some((b) => b.source === 'APP')).toBe(true);
    expect(reversals.some((b) => b.source === 'ADMIN' && b.note !== '')).toBe(true);
    const reversed = reversedIds(data.journal);
    expect(reversals.every((r) => r.reversalOf !== null && reversed.has(r.reversalOf))).toBe(true);
    expect(data.journal.some((b) => b.cashAmount === -24_900 && reversed.has(b.id))).toBe(true);
  });

  it('hat keinen negativen Kassenbestand, weder am Ende noch zwischendurch', () => {
    expect(Object.values(cashBalanceByMethod(data.journal)).every((amount) => amount >= 0)).toBe(
      true,
    );
    const running: Record<PaymentMethod, number> = { CASH: 0, BANK: 0, PAYPAL: 0 };
    for (const booking of [...data.journal].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt),
    )) {
      if (booking.paymentMethod !== null) {
        running[booking.paymentMethod] += booking.cashAmount;
        expect(running[booking.paymentMethod], booking.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('liegt vollständig zwischen Go-live und jetzt und hat eindeutige IDs', () => {
    const goLive = addDays(today, -GO_LIVE_DAYS_AGO);
    expect(data.journal.every((b) => b.bookingDate >= goLive && new Date(b.recordedAt) < now)).toBe(
      true,
    );
    expect(new Set(data.journal.map((b) => b.id)).size).toBe(data.journal.length);
    expect(data.journal.filter((b) => b.bookingDate >= addDays(today, -90)).length).toBeGreaterThan(
      100,
    );
  });

  it('nur Klaus ist ausgeschieden und bucht seitdem nicht mehr', () => {
    const klaus = person('Klaus');
    expect(klaus.active).toBe(false);
    const lastConsumption = data.journal
      .filter((b) => b.personId === klaus.id && b.type === 'CONSUMPTION')
      .map((b) => b.bookingDate)
      .sort()
      .at(-1);
    expect(lastConsumption! < addDays(today, -60)).toBe(true);
  });
});
