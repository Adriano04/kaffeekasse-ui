import { BookingSource, BookingType, ExpenseCategory, PaymentMethod } from './domain';

/** Anzeigenamen der Buchungsarten. */
export const BOOKING_TYPE_LABELS: Readonly<Record<BookingType, string>> = {
  CONSUMPTION: 'Konsum',
  REVERSAL: 'Storno',
  PAYMENT: 'Einzahlung',
  PAYOUT: 'Auszahlung',
  ADJUSTMENT: 'Korrektur',
  OPENING_BALANCE: 'Startsaldo',
  OPENING_CASH: 'Anfangsbestand',
  EXPENSE: 'Ausgabe',
  OUT_OF_POCKET: 'Auslage',
  BOTTLE_REFUND: 'Pfandrückgabe',
};

/** Anzeigenamen der Zahlungswege (K-04). */
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Bar',
  BANK: 'Überweisung',
  PAYPAL: 'PayPal',
};

/** Anzeigenamen der Ausgabenkategorien (F-14). */
export const EXPENSE_CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> = {
  COFFEE_BEANS: 'Kaffeebohnen',
  MILK: 'Milch',
  BEVERAGES: 'Getränke',
  ACCESSORIES: 'Zubehör',
  CLEANING: 'Reinigung/Entkalker',
  OTHER: 'Sonstiges',
};

/** Anzeigenamen der Herkunft einer Buchung (F-13). */
export const BOOKING_SOURCE_LABELS: Readonly<Record<BookingSource, string>> = {
  APP: 'App',
  ADMIN: 'Verwaltung',
};
