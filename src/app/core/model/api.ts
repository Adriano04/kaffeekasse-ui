import { IsoDate, Timestamp } from './date';
import {
  BookingSource,
  BookingType,
  ExpenseCategory,
  PaymentMethod,
  Person,
  ProductPrice,
} from './domain';
import { Cents } from './money';

// Typen der Abfragen und Befehle von CoffeeFundRepository. Sie entsprechen der
// künftigen REST-API: Die HTTP-Implementierung bildet die generierten DTOs
// darauf ab, Facades und ViewModels merken davon nichts.

// ---------------------------------------------------------------------------
// Abfragen für alle Angemeldeten
// ---------------------------------------------------------------------------

/** Konto der angemeldeten Person (F-06). */
export interface MyAccount {
  readonly person: {
    readonly id: string;
    readonly displayName: string;
    /** Kennung für den Verwendungszweck (F-37). */
    readonly referenceCode: string;
  };
  readonly balance: Cents;
}

/** Parameter des eigenen Verlaufs (F-07). */
export interface MyBookingsQuery {
  /** Älteste Buchung, die geliefert wird (Buchungsdatum, einschließlich). */
  readonly from: IsoDate;
}

/** Eintrag im eigenen Verlauf (F-07). Storno-Gegenbuchungen sind nicht enthalten. */
export interface AccountEntry {
  readonly id: string;
  readonly type: BookingType;
  /** Name des Artikels bei Konsum. */
  readonly productName: string | null;
  readonly quantity: number | null;
  readonly bookingDate: IsoDate;
  /** Erfassungszeitpunkt; die Uhrzeit sieht nur die Person selbst (NF-06). */
  readonly recordedAt: Timestamp;
  /** Wirkung auf das Konto in Cent (±). */
  readonly amount: Cents;
  /** Kontostand nach dieser Buchung; `null` bei stornierten Buchungen. */
  readonly balanceAfter: Cents | null;
  readonly note: string;
  readonly paymentMethod: PaymentMethod | null;
  /** Die Buchung wurde storniert (F-26, F-27). */
  readonly reversed: boolean;
}

/** Eigener Verlauf, neueste Buchung zuerst (F-07). */
export interface AccountHistory {
  readonly entries: readonly AccountEntry[];
  /** Beginn des gelieferten Zeitraums. */
  readonly from: IsoDate;
  /** Es gibt Buchungen vor `from` („Ältere laden“). */
  readonly hasOlder: boolean;
}

/** Artikel auf der Buchungsseite (F-04). */
export interface BookableProduct {
  readonly id: string;
  readonly name: string;
  readonly currentPrice: Cents;
  /** Angekündigter späterer Preis, falls vorhanden (F-10). */
  readonly announcedPrice: ProductPrice | null;
}

// ---------------------------------------------------------------------------
// Befehle für die eigene Person
// ---------------------------------------------------------------------------

/** Antwort auf eine Konsumbuchung (F-01 bis F-03). */
export interface ConsumptionBooked {
  readonly booking: AccountEntry;
  readonly balanceBefore: Cents;
  readonly balanceAfter: Cents;
}

/** Antwort auf einen Selbst-Storno (F-26). */
export interface OwnBookingReversed {
  /** ID der stornierten Buchung. */
  readonly bookingId: string;
  readonly productName: string | null;
  /** Gutgeschriebener Betrag in Cent. */
  readonly amount: Cents;
  readonly balanceAfter: Cents;
}

// ---------------------------------------------------------------------------
// Abfragen der Verwaltung
// ---------------------------------------------------------------------------

/** Person mit Kontostand für die Personenliste (F-09). */
export interface PersonWithBalance extends Person {
  readonly balance: Cents;
}

/** Zeile der Gesamthistorie bzw. des Kassenbuchs (F-13, F-14, F-15). Nur Datum, keine Uhrzeit (NF-06). */
export interface BookingRow {
  readonly id: string;
  readonly type: BookingType;
  readonly bookingDate: IsoDate;
  readonly personId: string | null;
  readonly personName: string | null;
  readonly productName: string | null;
  readonly quantity: number | null;
  readonly note: string;
  readonly accountAmount: Cents;
  readonly cashAmount: Cents;
  readonly paymentMethod: PaymentMethod | null;
  readonly category: ExpenseCategory | null;
  readonly source: BookingSource;
  /** Anzeigename der Person, die gebucht hat (F-13). */
  readonly recordedByName: string;
  /** Bei einem Storno: ID der stornierten Buchung. */
  readonly reversalOf: string | null;
  /** Bei einem Storno: Buchungsart der stornierten Buchung. */
  readonly reversedType: BookingType | null;
  /** Die Buchung wurde storniert. */
  readonly reversed: boolean;
}

/** Filter der Gesamthistorie (F-13). Nicht gesetzte Felder filtern nicht. */
export interface BookingFilter {
  readonly personId?: string;
  readonly type?: BookingType;
  readonly productId?: string;
  /** Buchungsdatum ab (einschließlich). */
  readonly from?: IsoDate;
  /** Buchungsdatum bis (einschließlich). */
  readonly to?: IsoDate;
  /** Freitext, der in der Notiz vorkommen muss (ohne Groß-/Kleinschreibung). */
  readonly note?: string;
}

/**
 * Spalten, nach denen die Gesamthistorie sortiert werden kann. `amount` ist der
 * angezeigte Betrag: Betrag Personenkonto, bei reinen Kassenbuchungen Betrag Kasse.
 */
export type BookingSortField =
  'bookingDate' | 'personName' | 'type' | 'amount' | 'accountAmount' | 'cashAmount';

export type SortDirection = 'asc' | 'desc';

/** Suche in Gesamthistorie oder Kassenbuch mit Filter, Sortierung und Seite. */
export interface BookingQuery {
  readonly filter: BookingFilter;
  /** `null` = neueste zuerst. */
  readonly sort: { readonly field: BookingSortField; readonly direction: SortDirection } | null;
  /** Seite, beginnend bei 1. */
  readonly page: number;
  readonly pageSize: number;
}

/** Eine Seite eines Suchergebnisses. */
export interface Page<T> {
  readonly rows: readonly T[];
  /** Anzahl aller Treffer über alle Seiten. */
  readonly total: number;
}

/** Person in der aufklappbaren Liste einer Kennzahl (F-17, F-18). */
export interface MetricsPerson {
  readonly personId: string;
  readonly displayName: string;
  readonly active: boolean;
  /** Offener Betrag bzw. Guthaben als positiver Betrag. */
  readonly amount: Cents;
}

/** Stichtagswerte der Statistik (F-17 bis F-19). */
export interface Metrics {
  /** Offene Forderungen: Summe der negativen Kontostände als positiver Betrag, inklusive inaktiver Personen. */
  readonly receivables: { readonly total: Cents; readonly people: readonly MetricsPerson[] };
  /** Guthaben der Belegschaft: Summe der positiven Kontostände, inklusive inaktiver Personen. */
  readonly credit: { readonly total: Cents; readonly people: readonly MetricsPerson[] };
  /** Geschätzter Kassenbestand, gesamt und je Zahlungsweg. */
  readonly cashBalance: {
    readonly total: Cents;
    readonly byMethod: Readonly<Record<PaymentMethod, Cents>>;
  };
}

// ---------------------------------------------------------------------------
// Befehle der Verwaltung
// ---------------------------------------------------------------------------

/** Einzahlung auf ein Personenkonto (F-11). */
export interface PaymentInput {
  readonly personId: string;
  /** Betrag in Cent, nur positiv. */
  readonly amount: Cents;
  readonly paymentMethod: PaymentMethod;
  /** Zahlungsdatum, rückdatierbar, nicht in der Zukunft. */
  readonly bookingDate: IsoDate;
  readonly note: string;
}

/** Korrektur eines Personenkontos ohne Kassenwirkung (F-12). */
export interface AdjustmentInput {
  readonly personId: string;
  /** Betrag in Cent, positiv (Gutschrift) oder negativ (Belastung), nicht 0. */
  readonly amount: Cents;
  /** Pflicht-Begründung. */
  readonly reason: string;
}

/** Auszahlung von Guthaben (F-28). */
export interface PayoutInput {
  readonly personId: string;
  /** Betrag in Cent, nur positiv. */
  readonly amount: Cents;
  readonly paymentMethod: PaymentMethod;
  readonly note: string;
}

/**
 * Woher eine Ausgabe bezahlt wurde: aus einem Zahlungsweg der Kasse oder als
 * Auslage durch eine Person (I-04).
 */
export type PaidFrom = PaymentMethod | { readonly outOfPocketBy: string };

/** Ausgabe bzw. Wareneinkauf (F-14). */
export interface ExpenseInput {
  /** Belegdatum, rückdatierbar, nicht in der Zukunft. */
  readonly bookingDate: IsoDate;
  /** Betrag in Cent, nur positiv. */
  readonly amount: Cents;
  /** Beschreibung, Pflicht. */
  readonly note: string;
  readonly category: ExpenseCategory;
  readonly paidFrom: PaidFrom;
}

/** Pfandrückgabe (F-15). */
export interface BottleRefundInput {
  /** Datum der Rückgabe, rückdatierbar, nicht in der Zukunft. */
  readonly bookingDate: IsoDate;
  /** Betrag in Cent, nur positiv. */
  readonly amount: Cents;
  /** Beschreibung, Pflicht. */
  readonly note: string;
  readonly paymentMethod: PaymentMethod;
}

/** Neue Person (F-09). */
export interface NewPerson {
  readonly displayName: string;
  readonly username: string;
  readonly email: string | null;
}

/** Änderbare Daten einer Person (F-09). */
export interface PersonUpdate {
  readonly displayName: string;
  readonly email: string | null;
}

/** Neuer Artikel (F-10). */
export interface NewProduct {
  readonly name: string;
  /** Preis in Cent, gültig ab heute. */
  readonly price: Cents;
}

/** Richtung beim Verschieben eines Artikels in der Sortierung. */
export type MoveDirection = 'UP' | 'DOWN';
