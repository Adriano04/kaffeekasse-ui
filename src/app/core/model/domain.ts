import { IsoDate, Timestamp } from './date';
import { Cents } from './money';

/** Zahlungsweg (K-04). Jeder Zahlungsweg hat einen eigenen Kassenbestand (F-19). */
export type PaymentMethod = 'CASH' | 'BANK' | 'PAYPAL';

/** Alle Zahlungswege in der Reihenfolge der Anzeige. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'BANK', 'PAYPAL'];

/** Kategorie einer Ausgabe (F-14). */
export type ExpenseCategory =
  'COFFEE_BEANS' | 'MILK' | 'BEVERAGES' | 'ACCESSORIES' | 'CLEANING' | 'OTHER';

/** Alle Ausgabenkategorien in der Reihenfolge der Anzeige. */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'COFFEE_BEANS',
  'MILK',
  'BEVERAGES',
  'ACCESSORIES',
  'CLEANING',
  'OTHER',
];

/**
 * Buchungsart. Die Wirkung auf Personenkonto, Kasse und Ergebnis steht in
 * Tabelle 4.2 des Anforderungskatalogs.
 */
export type BookingType =
  | 'CONSUMPTION'
  | 'REVERSAL'
  | 'PAYMENT'
  | 'PAYOUT'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'OPENING_CASH'
  | 'EXPENSE'
  | 'OUT_OF_POCKET'
  | 'BOTTLE_REFUND';

/** Alle Buchungsarten in der Reihenfolge der Anzeige (z. B. im Filter der Gesamthistorie). */
export const BOOKING_TYPES: readonly BookingType[] = [
  'CONSUMPTION',
  'PAYMENT',
  'PAYOUT',
  'ADJUSTMENT',
  'EXPENSE',
  'OUT_OF_POCKET',
  'BOTTLE_REFUND',
  'REVERSAL',
  'OPENING_BALANCE',
  'OPENING_CASH',
];

/** Herkunft einer Buchung: App der Person selbst oder Verwaltung (F-13). */
export type BookingSource = 'APP' | 'ADMIN';

/** Rolle einer Person. Ohne Rolle ist die Person normale Nutzer:in. */
export type Role = 'ADMIN';

/** Person mit Personenkonto (F-09). */
export interface Person {
  readonly id: string;
  /** Anzeigename, eindeutig unter den aktiven Personen. */
  readonly displayName: string;
  /** Benutzername für die Anmeldung, eindeutig unter allen Personen. */
  readonly username: string;
  /** E-Mail-Adresse, optional (erst für F-41 nötig, NF-06). */
  readonly email: string | null;
  /** Deaktivierte Personen können sich nicht anmelden; ihre Historie bleibt. */
  readonly active: boolean;
  readonly roles: readonly Role[];
  /** Kennung der Person für den Verwendungszweck einer Überweisung (F-37). */
  readonly referenceCode: string;
}

/** Preis eines Artikels ab einem Datum (Preisverlauf, F-10). */
export interface ProductPrice {
  readonly amount: Cents;
  /** Erster Tag, an dem der Preis gilt (Europe/Berlin). */
  readonly validFrom: IsoDate;
}

/** Artikel, der auf der Buchungsseite gebucht werden kann (F-04, F-10). */
export interface Product {
  readonly id: string;
  readonly name: string;
  /** Position auf der Buchungsseite, aufsteigend. */
  readonly sortOrder: number;
  /** Deaktivierte Artikel verschwinden von der Buchungsseite, bleiben aber in der Historie. */
  readonly active: boolean;
  /** Preisverlauf, sortiert nach `validFrom`. */
  readonly prices: readonly ProductPrice[];
}

/**
 * Eintrag im Journal. Das Journal wird nur ergänzt, nie geändert (Z-05,
 * NF-04). Kontostände und Kassenbestände werden aus den Beträgen berechnet.
 */
export interface Booking {
  readonly id: string;
  readonly type: BookingType;
  /** Erfassungszeitpunkt. */
  readonly recordedAt: Timestamp;
  /** Fachliches Datum, bei Verwaltungsbuchungen rückdatierbar. */
  readonly bookingDate: IsoDate;
  /** Betroffene Person, `null` bei reinen Kassenbuchungen. */
  readonly personId: string | null;
  /** Zahlungsweg bei Buchungen mit Kassenwirkung. */
  readonly paymentMethod: PaymentMethod | null;
  /** Wirkung auf das Personenkonto in Cent (±). */
  readonly accountAmount: Cents;
  /** Wirkung auf die Kasse des Zahlungswegs in Cent (±). */
  readonly cashAmount: Cents;
  readonly productId: string | null;
  readonly quantity: number | null;
  /** Einzelpreis zum Buchungszeitpunkt (Preis-Snapshot, F-01). */
  readonly unitPrice: Cents | null;
  readonly category: ExpenseCategory | null;
  /** Notiz, bei Ausgaben die Beschreibung, bei Korrektur und Storno die Begründung. */
  readonly note: string;
  /** Bei einem Storno: ID der stornierten Buchung. */
  readonly reversalOf: string | null;
  readonly source: BookingSource;
  /** Person, die die Buchung erfasst hat. */
  readonly recordedBy: string;
  readonly idempotencyKey: string | null;
}

/** Zahlungsinformationen für „Mein Konto“ (F-37). */
export interface PaymentInfo {
  /** Kontoinhaber:in des Bankkontos. */
  readonly accountHolder: string;
  readonly iban: string;
  readonly paypalLink: string;
  /** Hinweis zur Barzahlung, z. B. „Umschlag mit Namen in die Kasse“. */
  readonly cashNote: string;
}

/** Einstellungen der Kaffeekasse. */
export interface Settings {
  readonly name: string;
  readonly subtitle: string;
  readonly paymentInfo: PaymentInfo;
  /** Ab diesem Kontostand (≤) erscheint der Zahlungshinweis (F-06, F-31). */
  readonly reminderThreshold: Cents;
  /** Ab diesem Kontostand (≤) warnt die Buchungsbestätigung (F-03, K-06). */
  readonly warningThreshold: Cents;
  /** Storno-Frist für den Selbst-Storno in Minuten (F-26). */
  readonly reversalWindowMinutes: number;
}
