import { Metrics, MetricsPerson } from './api';
import { IsoDate } from './date';
import {
  Booking,
  BookingType,
  PAYMENT_METHODS,
  PaymentMethod,
  Person,
  Product,
  ProductPrice,
  Settings,
} from './domain';
import { Cents } from './money';
import { ErrorCode } from './result';

// Fachregeln als reine Funktionen. Das (Fake-)Backend wendet sie verbindlich
// an; Facades und ViewModels nutzen sie nur für Anzeige-Hinweise, z. B. ob
// „Rückgängig“ angezeigt wird.

/** Kontostand einer Person: Summe aller Beträge auf ihrem Personenkonto. */
export function balanceOf(bookings: readonly Booking[], personId: string): Cents {
  let balance = 0;
  for (const booking of bookings) {
    if (booking.personId === personId) {
      balance += booking.accountAmount;
    }
  }
  return balance;
}

/** Kontostände aller Personen, die im Journal vorkommen. */
export function balancesByPerson(bookings: readonly Booking[]): Map<string, Cents> {
  const balances = new Map<string, Cents>();
  for (const booking of bookings) {
    if (booking.personId !== null) {
      balances.set(booking.personId, (balances.get(booking.personId) ?? 0) + booking.accountAmount);
    }
  }
  return balances;
}

/** Kassenbestand je Zahlungsweg: Summe aller Kassenbeträge (F-19). */
export function cashBalanceByMethod(bookings: readonly Booking[]): Record<PaymentMethod, Cents> {
  const balances: Record<PaymentMethod, Cents> = { CASH: 0, BANK: 0, PAYPAL: 0 };
  for (const booking of bookings) {
    if (booking.paymentMethod !== null) {
      balances[booking.paymentMethod] += booking.cashAmount;
    }
  }
  return balances;
}

/** IDs aller Buchungen, zu denen es ein Storno gibt. */
export function reversedIds(bookings: readonly Booking[]): Set<string> {
  const ids = new Set<string>();
  for (const booking of bookings) {
    if (booking.reversalOf !== null) {
      ids.add(booking.reversalOf);
    }
  }
  return ids;
}

/** Fachliche Reihenfolge: Buchungsdatum, dann Erfassungszeitpunkt, dann ID. */
export function compareChronologically(a: Booking, b: Booking): number {
  return (
    a.bookingDate.localeCompare(b.bookingDate) ||
    a.recordedAt.localeCompare(b.recordedAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * „Stand danach“ je Buchung einer Person (F-07): laufende Summe in fachlicher
 * Reihenfolge. Stornierte Buchungen und ihre Gegenbuchungen zählen nicht mit
 * (zusammen ergeben sie 0) und bekommen keinen Stand.
 *
 * @param bookings die Buchungen genau einer Person
 */
export function balancesAfter(bookings: readonly Booking[]): Map<string, Cents> {
  const reversed = reversedIds(bookings);
  const result = new Map<string, Cents>();
  let balance = 0;
  for (const booking of [...bookings].sort(compareChronologically)) {
    if (reversed.has(booking.id) || booking.type === 'REVERSAL') {
      continue;
    }
    balance += booking.accountAmount;
    result.set(booking.id, balance);
  }
  return result;
}

/** Aktuell gültiger Preis: jüngster Preis mit `validFrom` ≤ `today`, sonst `null`. */
export function currentPrice(product: Product, today: IsoDate): ProductPrice | null {
  let current: ProductPrice | null = null;
  for (const price of product.prices) {
    if (price.validFrom <= today && (current === null || price.validFrom >= current.validFrom)) {
      current = price;
    }
  }
  return current;
}

/** Nächster angekündigter Preis: frühester Preis mit `validFrom` > `today`, sonst `null` (F-10). */
export function announcedPrice(product: Product, today: IsoDate): ProductPrice | null {
  let next: ProductPrice | null = null;
  for (const price of product.prices) {
    if (price.validFrom > today && (next === null || price.validFrom < next.validFrom)) {
      next = price;
    }
  }
  return next;
}

/** Ende der Storno-Frist einer Buchung (F-26). */
export function reversalWindowEnd(
  booking: Pick<Booking, 'recordedAt'>,
  windowMinutes: number,
): Date {
  return new Date(new Date(booking.recordedAt).getTime() + windowMinutes * 60_000);
}

/**
 * Prüft den Selbst-Storno (F-26): nur eigene Konsumbuchungen, nur innerhalb
 * der Storno-Frist ab Erfassung, nur einmal.
 *
 * @returns `null`, wenn der Storno erlaubt ist, sonst den Fehlercode
 */
export function checkSelfReversal(
  booking: Booking,
  context: {
    readonly personId: string;
    readonly reversed: ReadonlySet<string>;
    readonly now: Date;
    readonly windowMinutes: number;
  },
): ErrorCode | null {
  if (booking.personId !== context.personId) {
    return 'NOT_FOUND';
  }
  if (booking.type !== 'CONSUMPTION') {
    return 'REVERSAL_NOT_ALLOWED';
  }
  if (context.reversed.has(booking.id)) {
    return 'ALREADY_REVERSED';
  }
  if (context.now.getTime() >= reversalWindowEnd(booking, context.windowMinutes).getTime()) {
    return 'REVERSAL_WINDOW_EXPIRED';
  }
  return null;
}

/**
 * Prüft den Storno durch die Verwaltung (F-27): jede Buchung außer einem
 * Storno, ohne Frist, nur einmal.
 *
 * @returns `null`, wenn der Storno erlaubt ist, sonst den Fehlercode
 */
export function checkAdminReversal(
  booking: Booking,
  reversed: ReadonlySet<string>,
): ErrorCode | null {
  if (booking.type === 'REVERSAL') {
    return 'REVERSAL_NOT_ALLOWED';
  }
  if (reversed.has(booking.id)) {
    return 'ALREADY_REVERSED';
  }
  return null;
}

/**
 * Vorgeschlagener Zahlbetrag bei offenem Saldo (F-37, Kapitel 4.4).
 *
 * Annahme: Der Katalog ist nicht eindeutig (F-37: „aufgerundet auf 5 oder
 * 10 €“, 4.4: −7,30 € → „Zahle 20 €“). Für den Prototyp wird die Schuld auf
 * volle 10 € aufgerundet: −7,30 € → 10 €, −10,00 € → 10 €, −12,40 € → 20 €.
 *
 * @returns den Zahlbetrag in Cent oder `null`, wenn nichts offen ist
 */
export function suggestPayment(balance: Cents): Cents | null {
  if (balance >= 0) {
    return null;
  }
  return Math.ceil(-balance / 1000) * 1000;
}

/** Zahlungshinweis fällig: Kontostand ≤ Erinnerungsschwelle (F-06, F-31). */
export function isReminderDue(
  balance: Cents,
  settings: Pick<Settings, 'reminderThreshold'>,
): boolean {
  return balance <= settings.reminderThreshold;
}

/** Warnung beim Buchen fällig: Kontostand ≤ Warnschwelle (F-03, K-06). */
export function isWarningDue(
  balance: Cents,
  settings: Pick<Settings, 'warningThreshold'>,
): boolean {
  return balance <= settings.warningThreshold;
}

/**
 * Stichtagswerte der Statistik (F-17 bis F-19). Personenlisten absteigend nach
 * Betrag, inaktive Personen eingeschlossen.
 */
export function metricsOf(bookings: readonly Booking[], people: readonly Person[]): Metrics {
  const balances = balancesByPerson(bookings);
  const receivables: MetricsPerson[] = [];
  const credit: MetricsPerson[] = [];
  for (const person of people) {
    const balance = balances.get(person.id) ?? 0;
    const entry = { personId: person.id, displayName: person.displayName, active: person.active };
    if (balance < 0) {
      receivables.push({ ...entry, amount: -balance });
    } else if (balance > 0) {
      credit.push({ ...entry, amount: balance });
    }
  }
  const byAmount = (a: MetricsPerson, b: MetricsPerson) =>
    b.amount - a.amount || a.displayName.localeCompare(b.displayName, 'de');
  const byMethod = cashBalanceByMethod(bookings);
  return {
    receivables: {
      total: sum(receivables.map((p) => p.amount)),
      people: receivables.sort(byAmount),
    },
    credit: { total: sum(credit.map((p) => p.amount)), people: credit.sort(byAmount) },
    cashBalance: { total: sum(PAYMENT_METHODS.map((m) => byMethod[m])), byMethod },
  };
}

/**
 * Fachlich wirksame Buchungsart: bei einem Storno die Art der stornierten
 * Buchung, sonst die eigene.
 */
export function effectiveTypes(bookings: readonly Booking[]): Map<string, BookingType> {
  const typeById = new Map(bookings.map((b) => [b.id, b.type] as const));
  const result = new Map<string, BookingType>();
  for (const booking of bookings) {
    const type =
      booking.type === 'REVERSAL' && booking.reversalOf !== null
        ? (typeById.get(booking.reversalOf) ?? booking.type)
        : booking.type;
    result.set(booking.id, type);
  }
  return result;
}

/** Beide Seiten der Kontrollrechnung aus Kapitel 4.3. */
export interface Reconciliation {
  /** Kassenbestand + offene Forderungen − Guthaben (Kassenvermögen). */
  readonly netAssets: Cents;
  /** Anfangsbestand − Summe der Startsalden. */
  readonly opening: Cents;
  /** Ergebnis: Umsatz − Ausgaben + Pfandrückgaben ± Korrekturen − Auslagen. */
  readonly netIncome: Cents;
}

/**
 * Kontrollrechnung („Stimmt die Kasse?“, Kapitel 4.3). Es muss immer gelten:
 * `netAssets === opening + netIncome`. Stornos wirken wie die stornierte
 * Buchungsart mit umgekehrtem Vorzeichen.
 */
export function reconciliation(
  bookings: readonly Booking[],
  people: readonly Person[],
): Reconciliation {
  const metrics = metricsOf(bookings, people);
  const types = effectiveTypes(bookings);
  let opening = 0;
  let netIncome = 0;
  for (const booking of bookings) {
    switch (types.get(booking.id)) {
      case 'OPENING_CASH':
        opening += booking.cashAmount;
        break;
      case 'OPENING_BALANCE':
        opening -= booking.accountAmount;
        break;
      case 'CONSUMPTION':
      case 'ADJUSTMENT':
      case 'OUT_OF_POCKET':
        // Belastung der Person ist Ertrag, Gutschrift ist Aufwand (Tabelle 4.2).
        netIncome -= booking.accountAmount;
        break;
      case 'EXPENSE':
      case 'BOTTLE_REFUND':
        netIncome += booking.cashAmount;
        break;
      default:
        // Einzahlung und Auszahlung verschieben nur Geld zwischen Konto und Kasse.
        break;
    }
  }
  return {
    netAssets: metrics.cashBalance.total + metrics.receivables.total - metrics.credit.total,
    opening,
    netIncome,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
