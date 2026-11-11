import { RsTableDateRange, RsTableRequest } from 'custom-components';

import { BookingQuery, BookingRow, BookingSortField } from '../../core/model/api';
import { formatDate, isoDateFromLocalDate } from '../../core/model/date';
import { DisplayAmount, Tone, displayAmount } from '../../core/model/display';
import { BookingType } from '../../core/model/domain';
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../core/model/labels';
import { Cents } from '../../core/model/money';

// Aufbereitung der Buchungszeilen für Gesamthistorie und Kassenbuch (F-13 bis
// F-15) sowie Übersetzung des Tabellenzustands von RsTable in eine Suche.

/** Anzeigefertige Zeile der Gesamthistorie bzw. des Kassenbuchs. */
export interface BookingRowView {
  readonly id: string;
  /** Nur das Datum, keine Uhrzeit (NF-06). */
  readonly date: string;
  readonly person: string;
  /** Buchungsart, bei einem Storno mit der stornierten Art, z. B. „Storno: Ausgabe“. */
  readonly type: string;
  readonly typeTone: Tone;
  readonly product: string;
  readonly note: string;
  readonly category: string;
  /** Zahlungsweg bzw. „Auslage: Peter“. */
  readonly paymentMethod: string;
  readonly amount: DisplayAmount;
  /** Herkunft: App oder Verwaltung (F-13). */
  readonly source: string;
  readonly recordedBy: string;
  /** Die Buchung wurde storniert (gedimmt, Badge „storniert“). */
  readonly reversed: boolean;
  /** Storno durch die Verwaltung möglich (F-27). */
  readonly canReverse: boolean;
  /** Kurzbeschreibung für den Storno-Dialog. */
  readonly summary: string;
}

/**
 * Bereitet eine Buchungszeile auf.
 *
 * @param row welche konvertiert wird.
 * @param amountOf welcher Betrag angezeigt wird: in der Gesamthistorie der
 *   Betrag Personenkonto bzw. Kasse, im Kassenbuch der Betrag Kasse
 */
export function toBookingRowView(
  row: BookingRow,
  amountOf: (row: BookingRow) => Cents,
): BookingRowView {
  const typeLabel = BOOKING_TYPE_LABELS[row.type];
  const type =
    row.type === 'REVERSAL' && row.reversedType
      ? `${typeLabel}: ${BOOKING_TYPE_LABELS[row.reversedType]}`
      : typeLabel;
  const amount = displayAmount(amountOf(row));
  const date = formatDate(row.bookingDate);
  const person = row.personName ?? '–';
  return {
    id: row.id,
    date,
    person,
    type,
    typeTone: row.type === 'REVERSAL' || row.reversed ? 'neutral' : amount.tone,
    product: row.productName ?? '',
    note: row.note,
    category: row.category ? EXPENSE_CATEGORY_LABELS[row.category] : '',
    paymentMethod:
      row.type === 'OUT_OF_POCKET' || row.reversedType === 'OUT_OF_POCKET'
        ? `Auslage: ${person}`
        : row.paymentMethod
          ? PAYMENT_METHOD_LABELS[row.paymentMethod]
          : '',
    amount,
    source: BOOKING_SOURCE_LABELS[row.source],
    recordedBy: row.recordedByName,
    reversed: row.reversed,
    canReverse: row.type !== 'REVERSAL' && !row.reversed,
    summary: [typeLabel, row.productName, row.personName, amount.text, date]
      .filter((part) => part)
      .join(' · '),
  };
}

/** Betrag der Gesamthistorie: Personenkonto, bei reinen Kassenbuchungen die Kasse. */
export function historyAmount(row: BookingRow): Cents {
  return row.accountAmount || row.cashAmount;
}

/** Betrag des Kassenbuchs: die Kasse; bei einer Auslage der ausgelegte Betrag. */
export function cashBookAmount(row: BookingRow): Cents {
  return row.cashAmount || -row.accountAmount;
}

/**
 * Übersetzt den Zustand von RsTable (Seite, Sortierung, Filter je Spalte) in
 * eine Suche des Repositorys. Filter-Schlüssel sind die Spalten-Keys:
 * `date` (Zeitraum), `person`, `type`, `product` und `note`.
 */
export function toBookingQuery(
  request: RsTableRequest,
  sortFields: Readonly<Record<string, BookingSortField>>,
): BookingQuery {
  const filters = request.filters;
  const range = filters['date'] as RsTableDateRange | undefined;
  const sortField = request.sort ? sortFields[request.sort.column] : undefined;
  return {
    filter: {
      personId: text(filters['person']),
      type: text(filters['type']) as BookingType | undefined,
      productId: text(filters['product']),
      from: range?.from ? isoDateFromLocalDate(range.from) : undefined,
      to: range?.to ? isoDateFromLocalDate(range.to) : undefined,
      note: text(filters['note']),
    },
    sort:
      request.sort && sortField ? { field: sortField, direction: request.sort.direction } : null,
    page: request.page,
    pageSize: request.pageSize,
  };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
