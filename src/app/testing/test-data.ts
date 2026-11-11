import { berlinDateTimeToInstant } from '../core/model/date';
import { Booking, Person, Product, Settings } from '../core/model/domain';
import { PrototypeData } from '../prototype/prototype-database';

/** „Jetzt“ in Tests: Dienstag, 13.10.2026, 12:00 Uhr in Berlin. */
export const TEST_NOW = new Date('2026-10-13T10:00:00Z');

/** Heute in Tests (Europe/Berlin). */
export const TEST_TODAY = '2026-10-13';

export const ANNA = 'person-anna';
export const BEN = 'person-ben';
export const CLEO = 'person-cleo';
export const COFFEE = 'product-coffee';
export const TEA = 'product-tea';
export const COCOA = 'product-cocoa';

/**
 * Kleiner Testdatenbestand:
 * - Anna: Verwaltung, Kontostand −0,50 €
 * - Ben: Kontostand +2,50 €
 * - Cleo: inaktiv, Kontostand −3,00 €
 * - Kaffee 0,50 €, Tee 0,50 € (ab 01.11.2026: 0,60 €), Kakao inaktiv
 * - Barkasse 15,00 €
 */
export function createTestData(): PrototypeData {
  const people: Person[] = [
    person(ANNA, 'Anna', ['ADMIN'], true, 'KK-01'),
    person(BEN, 'Ben', [], true, 'KK-02'),
    person(CLEO, 'Cleo', [], false, 'KK-03'),
  ];
  const products: Product[] = [
    {
      id: COFFEE,
      name: 'Kaffee',
      sortOrder: 1,
      active: true,
      prices: [{ amount: 50, validFrom: '2026-09-01' }],
    },
    {
      id: TEA,
      name: 'Tee',
      sortOrder: 2,
      active: true,
      prices: [
        { amount: 50, validFrom: '2026-09-01' },
        { amount: 60, validFrom: '2026-11-01' },
      ],
    },
    {
      id: COCOA,
      name: 'Kakao',
      sortOrder: 3,
      active: false,
      prices: [{ amount: 70, validFrom: '2026-09-01' }],
    },
  ];
  const journal: Booking[] = [
    booking('b-1', '2026-09-01', '08:00', {
      type: 'OPENING_CASH',
      paymentMethod: 'CASH',
      cashAmount: 1000,
    }),
    booking('b-2', '2026-09-01', '08:05', {
      type: 'OPENING_BALANCE',
      personId: BEN,
      accountAmount: -200,
    }),
    booking('b-3', '2026-09-01', '08:05', {
      type: 'OPENING_BALANCE',
      personId: CLEO,
      accountAmount: -300,
    }),
    booking('b-4', '2026-10-01', '09:00', {
      type: 'CONSUMPTION',
      personId: BEN,
      accountAmount: -50,
      productId: COFFEE,
      quantity: 1,
      unitPrice: 50,
      source: 'APP',
      recordedBy: BEN,
    }),
    booking('b-5', '2026-10-02', '12:00', {
      type: 'PAYMENT',
      personId: BEN,
      paymentMethod: 'CASH',
      accountAmount: 500,
      cashAmount: 500,
    }),
    booking('b-6', '2026-10-12', '15:00', {
      type: 'CONSUMPTION',
      personId: ANNA,
      accountAmount: -50,
      productId: TEA,
      quantity: 1,
      unitPrice: 50,
      source: 'APP',
      recordedBy: ANNA,
    }),
  ];
  return { people, products, journal, settings: TEST_SETTINGS, initialPersonId: ANNA };
}

export const TEST_SETTINGS: Settings = {
  name: 'Kaffeekasse',
  subtitle: 'Testbüro',
  paymentInfo: {
    accountHolder: 'Anna Test',
    iban: 'DE02 1203 0000 0000 2020 51',
    paypalLink: 'https://paypal.example/test',
    cashNote: 'Umschlag in die Dose.',
  },
  reminderThreshold: -500,
  warningThreshold: -2000,
  reversalWindowMinutes: 5,
};

function person(
  id: string,
  displayName: string,
  roles: Person['roles'],
  active: boolean,
  referenceCode: string,
): Person {
  return {
    id,
    displayName,
    username: displayName.toLowerCase(),
    email: null,
    active,
    roles,
    referenceCode,
  };
}

/** Buchung für Testdaten mit sinnvollen Standardwerten, Zeit in Europe/Berlin. */
export function booking(
  id: string,
  date: string,
  time: string,
  fields: Partial<Booking> & Pick<Booking, 'type'>,
): Booking {
  return {
    id,
    recordedAt: berlinDateTimeToInstant(date, time).toISOString(),
    bookingDate: date,
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
    recordedBy: ANNA,
    idempotencyKey: null,
    ...fields,
  };
}
