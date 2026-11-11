import {
  IsoDate,
  addDays,
  berlinDateTimeToInstant,
  toBerlinDate,
  weekday,
} from '../core/model/date';
import {
  Booking,
  ExpenseCategory,
  PaymentMethod,
  Person,
  Product,
  Settings,
} from '../core/model/domain';
import { Cents } from '../core/model/money';
import { compareChronologically, currentPrice } from '../core/model/rules';
import { PrototypeData } from './prototype-database';

// Dummy-Daten des Prototyps: rund vier Monate Betrieb seit dem Go-live. Alle
// Zeitpunkte liegen relativ zu „jetzt“, damit „letzte 3 Monate“ immer Daten
// zeigt. Der Konsum wird mit einem festen Startwert erzeugt und ist für ein
// Datum immer gleich. Die Startsalden werden so berechnet, dass jede Person
// genau ihren Ziel-Kontostand hat.

/** Tage zwischen Go-live und heute. */
export const GO_LIVE_DAYS_AGO = 120;

/** Ab diesem Tag (vor heute) ist Kakao deaktiviert; danach gibt es keinen Kakao-Konsum. */
const COCOA_LAST_DAY_AGO = 41;

/** Ab diesem Tag (vor heute) ist Klaus ausgeschieden und bucht nicht mehr. */
const KLAUS_LAST_DAY_AGO = 61;

/** Die Cola wurde vor so vielen Tagen von 0,90 € auf 1,00 € teurer. */
const COLA_PRICE_CHANGE_DAYS_AGO = 42;

/** In so vielen Tagen wird Kaffee 0,60 € kosten (angekündigter Preis). */
const COFFEE_ANNOUNCED_IN_DAYS = 14;

type ProductKey = 'coffee' | 'espresso' | 'tea' | 'water' | 'cola' | 'juice' | 'cocoa';
type PersonKey = 'micha' | 'sandra' | 'peter' | 'torsten' | 'jana' | 'ali' | 'lena' | 'klaus';

interface PersonSeed {
  readonly displayName: string;
  readonly email: string | null;
  readonly admin: boolean;
  readonly active: boolean;
  /** Kontostand heute in Cent. */
  readonly targetBalance: Cents;
  /** Wahrscheinlichkeit für den 1., 2., 3. … Bezug an einem Werktag. */
  readonly chances: readonly number[];
  /** Gewichte der bevorzugten Artikel. */
  readonly preferences: Partial<Record<ProductKey, number>>;
}

const PEOPLE: Readonly<Record<PersonKey, PersonSeed>> = {
  micha: {
    displayName: 'Micha',
    email: 'micha@buero.example',
    admin: true,
    active: true,
    targetBalance: -730,
    chances: [0.95, 0.7, 0.3],
    preferences: { espresso: 4, coffee: 3, water: 2, juice: 1 },
  },
  sandra: {
    displayName: 'Sandra',
    email: 'sandra@buero.example',
    admin: true,
    active: true,
    targetBalance: 0,
    chances: [0.8, 0.4],
    preferences: { tea: 3, coffee: 2, water: 1 },
  },
  peter: {
    displayName: 'Peter',
    email: null,
    admin: false,
    active: true,
    targetBalance: 1040,
    chances: [0.9, 0.6, 0.2],
    preferences: { coffee: 5, cola: 2, juice: 1 },
  },
  torsten: {
    displayName: 'Torsten',
    email: null,
    admin: false,
    active: true,
    targetBalance: -110,
    chances: [0.7, 0.3],
    preferences: { tea: 2, espresso: 2, water: 1 },
  },
  jana: {
    displayName: 'Jana',
    email: 'jana@buero.example',
    admin: false,
    active: true,
    targetBalance: -2350,
    chances: [0.9, 0.7, 0.4],
    preferences: { coffee: 3, cola: 3, juice: 2 },
  },
  ali: {
    displayName: 'Ali',
    email: null,
    admin: false,
    active: true,
    targetBalance: 240,
    chances: [0.6, 0.2],
    preferences: { water: 3, tea: 1 },
  },
  lena: {
    displayName: 'Lena',
    email: null,
    admin: false,
    active: true,
    targetBalance: -320,
    chances: [0.85, 0.5, 0.2],
    preferences: { cocoa: 3, coffee: 2, espresso: 2, juice: 1 },
  },
  klaus: {
    displayName: 'Klaus',
    email: null,
    admin: false,
    active: false,
    targetBalance: -460,
    chances: [0.8, 0.4],
    preferences: { coffee: 3, espresso: 1 },
  },
};

const PERSON_KEYS = Object.keys(PEOPLE) as PersonKey[];

/** Einzahlungen: [Tage vor heute, Person, Betrag in Cent, Zahlungsweg]. */
const PAYMENTS: readonly (readonly [number, PersonKey, Cents, PaymentMethod])[] = [
  [115, 'peter', 4000, 'BANK'],
  [112, 'ali', 8000, 'PAYPAL'],
  [110, 'micha', 3000, 'CASH'],
  [110, 'jana', 5000, 'PAYPAL'],
  [105, 'sandra', 2000, 'BANK'],
  [100, 'torsten', 2000, 'CASH'],
  [100, 'klaus', 2000, 'CASH'],
  [90, 'lena', 4000, 'CASH'],
  [80, 'micha', 3000, 'PAYPAL'],
  [80, 'peter', 3000, 'PAYPAL'],
  [70, 'sandra', 2000, 'BANK'],
  [60, 'torsten', 2000, 'CASH'],
  [60, 'jana', 5000, 'PAYPAL'],
  [50, 'micha', 3000, 'CASH'],
  [45, 'lena', 4000, 'BANK'],
  [35, 'sandra', 2000, 'BANK'],
  [25, 'jana', 2000, 'PAYPAL'],
  [20, 'micha', 2000, 'CASH'],
  [15, 'torsten', 1000, 'CASH'],
  [5, 'peter', 2000, 'CASH'],
];

/** Ausgaben: [Tage vor heute, Betrag in Cent, Kategorie, Zahlungsweg, Beschreibung]. */
const EXPENSES: readonly (readonly [number, Cents, ExpenseCategory, PaymentMethod, string])[] = [
  [118, 3190, 'COFFEE_BEANS', 'BANK', 'Kaffeebohnen 2 kg'],
  [118, 699, 'OTHER', 'PAYPAL', 'Spardose für die Barkasse'],
  [112, 2394, 'BEVERAGES', 'CASH', 'Getränke: Wasser, Cola, Saft'],
  [97, 3190, 'COFFEE_BEANS', 'BANK', 'Kaffeebohnen 2 kg'],
  [90, 1299, 'CLEANING', 'PAYPAL', 'Entkalker'],
  [84, 2394, 'BEVERAGES', 'CASH', 'Getränke: Wasser, Cola, Saft'],
  [76, 3190, 'COFFEE_BEANS', 'BANK', 'Kaffeebohnen 2 kg'],
  [65, 849, 'ACCESSORIES', 'CASH', 'Kaffeefilter und Rührstäbchen'],
  [56, 2394, 'BEVERAGES', 'CASH', 'Getränke: Wasser, Cola, Saft'],
  [55, 3190, 'COFFEE_BEANS', 'BANK', 'Kaffeebohnen 2 kg'],
  [30, 999, 'CLEANING', 'PAYPAL', 'Reinigungstabletten'],
  [28, 2394, 'BEVERAGES', 'CASH', 'Getränke: Wasser, Cola, Saft'],
  [13, 3190, 'COFFEE_BEANS', 'BANK', 'Kaffeebohnen 2 kg'],
];

/** Pfandrückgaben: [Tage vor heute, Betrag in Cent, Beschreibung]. */
const BOTTLE_REFUNDS: readonly (readonly [number, Cents, string])[] = [
  [95, 325, 'Leergut Wasserkästen'],
  [60, 800, 'Leergut Getränkekisten'],
  [20, 475, 'Leergut Flaschen'],
];

/** Milch wird wöchentlich bar gekauft; vor 26 Tagen hat Peter sie ausgelegt (siehe unten). */
const MILK_DAYS_AGO = Array.from({ length: 17 }, (_, i) => 117 - i * 7).filter((day) => day !== 26);

/**
 * Erzeugt den Datenbestand des Prototyps relativ zu `now`.
 *
 * Abgedeckt sind: Go-live mit Anfangsbestand je Zahlungsweg und Startsalden,
 * Konsum, Einzahlungen über alle Zahlungswege (eine rückdatiert), eine
 * Korrektur, eine Auszahlung, Ausgaben aller Kategorien, eine Auslage,
 * Pfandrückgaben, ein Selbst-Storno und ein Storno der Verwaltung (Ausgabe
 * 249,00 € statt 24,90 €).
 */
export function createDummyData(now: Date): PrototypeData {
  const today = toBerlinDate(now);
  const journal = new JournalBuilder(today);
  const id = (key: PersonKey) => `person-${key}`;
  const products = createProducts(today);
  const productByKey = new Map(
    products.map((product) => [product.id.replace('product-', ''), product]),
  );

  const micha = id('micha');
  const sandra = id('sandra');

  // Go-live: Anfangsbestand je Zahlungsweg (Startsalden folgen am Ende).
  for (const [method, amount] of [
    ['CASH', 4520],
    ['BANK', 21000],
    ['PAYPAL', 1250],
  ] as const) {
    journal.add(GO_LIVE_DAYS_AGO, '08:00', {
      type: 'OPENING_CASH',
      paymentMethod: method,
      cashAmount: amount,
      note: 'Anfangsbestand zum Go-live',
      recordedBy: micha,
    });
  }

  // Konsum an Werktagen.
  const random = mulberry32(20_260_921);
  for (let daysAgo = GO_LIVE_DAYS_AGO - 1; daysAgo >= 1; daysAgo--) {
    const date = journal.date(daysAgo);
    if (weekday(date) === 0 || weekday(date) === 6) {
      continue;
    }
    for (const key of PERSON_KEYS) {
      const seed = PEOPLE[key];
      const count = seed.chances.filter((chance) => random() < chance).length;
      const times = Array.from({ length: count }, () => 8 * 60 + Math.floor(random() * 510)).sort(
        (a, b) => a - b,
      );
      if (key === 'klaus' && daysAgo < KLAUS_LAST_DAY_AGO) {
        continue;
      }
      for (const minutes of times) {
        const productKey = pick(seed.preferences, random, daysAgo >= COCOA_LAST_DAY_AGO);
        const product = productByKey.get(productKey);
        const price = product ? currentPrice(product, date) : null;
        if (!product || !price) {
          continue;
        }
        journal.add(daysAgo, formatTime(minutes), {
          type: 'CONSUMPTION',
          personId: id(key),
          accountAmount: -price.amount,
          productId: product.id,
          quantity: 1,
          unitPrice: price.amount,
          source: 'APP',
          recordedBy: id(key),
        });
      }
    }
  }

  // Selbst-Storno: Micha hat sich beim Espresso vertippt und gleich storniert.
  const mistake = journal.add(10, '09:12', {
    type: 'CONSUMPTION',
    personId: micha,
    accountAmount: -60,
    productId: 'product-espresso',
    quantity: 1,
    unitPrice: 60,
    source: 'APP',
    recordedBy: micha,
  });
  journal.add(10, '09:13', {
    ...reversalOf(mistake),
    source: 'APP',
    recordedBy: micha,
  });

  // Einzahlungen; die von Peter vor 35 Tagen ist auf den Tag der Überweisung rückdatiert.
  PAYMENTS.forEach(([daysAgo, key, amount, method], index) => {
    journal.add(daysAgo, '12:30', {
      type: 'PAYMENT',
      personId: id(key),
      paymentMethod: method,
      accountAmount: amount,
      cashAmount: amount,
      note: method === 'CASH' ? 'Umschlag in der Kaffeedose' : '',
      recordedBy: index % 3 === 0 ? sandra : micha,
    });
  });
  journal.add(35, '12:40', {
    type: 'PAYMENT',
    bookingDate: journal.date(38),
    personId: id('peter'),
    paymentMethod: 'BANK',
    accountAmount: 3000,
    cashAmount: 3000,
    note: 'Überweisung laut Kontoauszug',
    recordedBy: micha,
  });

  // Korrektur mit Begründung (F-12).
  journal.add(70, '11:00', {
    type: 'ADJUSTMENT',
    personId: id('torsten'),
    accountAmount: 150,
    note: 'Kulanz: Maschine hat zweimal keinen Kaffee ausgegeben',
    recordedBy: micha,
  });

  // Auszahlung von Guthaben (F-28).
  journal.add(50, '13:00', {
    type: 'PAYOUT',
    personId: id('ali'),
    paymentMethod: 'CASH',
    accountAmount: -2000,
    cashAmount: -2000,
    note: 'Guthaben teilweise ausgezahlt',
    recordedBy: sandra,
  });

  // Ausgaben, Milch und die Auslage durch Peter (I-04).
  for (const [daysAgo, amount, category, method, note] of EXPENSES) {
    journal.add(daysAgo, '10:00', {
      type: 'EXPENSE',
      paymentMethod: method,
      cashAmount: -amount,
      category,
      note,
      recordedBy: micha,
    });
  }
  for (const daysAgo of MILK_DAYS_AGO) {
    journal.add(daysAgo, '09:30', {
      type: 'EXPENSE',
      paymentMethod: 'CASH',
      cashAmount: -449,
      category: 'MILK',
      note: 'Milch 6 × 1 l',
      recordedBy: sandra,
    });
  }
  journal.add(25, '16:00', {
    type: 'OUT_OF_POCKET',
    personId: id('peter'),
    accountAmount: 450,
    category: 'MILK',
    note: 'Milch 6 × 1 l, von Peter ausgelegt',
    recordedBy: micha,
  });

  // Storno der Verwaltung: Tippfehler 249,00 € statt 24,90 € (F-27).
  const typo = journal.add(34, '10:05', {
    type: 'EXPENSE',
    paymentMethod: 'BANK',
    cashAmount: -24_900,
    category: 'COFFEE_BEANS',
    note: 'Kaffeebohnen 1,5 kg',
    recordedBy: sandra,
  });
  journal.add(34, '10:20', {
    ...reversalOf(typo),
    note: 'Tippfehler: 24,90 € statt 249,00 €',
    source: 'ADMIN',
    recordedBy: sandra,
  });
  journal.add(34, '10:21', {
    type: 'EXPENSE',
    paymentMethod: 'BANK',
    cashAmount: -2490,
    category: 'COFFEE_BEANS',
    note: 'Kaffeebohnen 1,5 kg',
    recordedBy: sandra,
  });

  // Pfandrückgaben (F-15).
  for (const [daysAgo, amount, note] of BOTTLE_REFUNDS) {
    journal.add(daysAgo, '14:00', {
      type: 'BOTTLE_REFUND',
      paymentMethod: 'CASH',
      cashAmount: amount,
      note,
      recordedBy: sandra,
    });
  }

  // Startsalden: so gewählt, dass jede Person heute ihren Ziel-Kontostand hat.
  const balances = journal.balances();
  for (const key of PERSON_KEYS) {
    const openingBalance = PEOPLE[key].targetBalance - (balances.get(id(key)) ?? 0);
    if (openingBalance !== 0) {
      journal.add(GO_LIVE_DAYS_AGO, '08:05', {
        type: 'OPENING_BALANCE',
        personId: id(key),
        accountAmount: openingBalance,
        note: 'Startsaldo aus der Excel-Liste',
        recordedBy: micha,
      });
    }
  }

  return {
    people: PERSON_KEYS.map((key, index) => createPerson(key, index)),
    products,
    journal: journal.build(),
    settings: SETTINGS,
    initialPersonId: micha,
  };
}

const SETTINGS: Settings = {
  name: 'Kaffeekasse',
  subtitle: 'Bürostüble',
  paymentInfo: {
    accountHolder: 'Kaffeekasse Bürostüble (Micha)',
    iban: 'DE02 1203 0000 0000 2020 51',
    paypalLink: 'https://paypal.example/kaffeekasse',
    cashNote: 'Bargeld in einem Umschlag mit deinem Namen in die Kaffeedose legen.',
  },
  reminderThreshold: -500,
  warningThreshold: -2000,
  reversalWindowMinutes: 5,
};

function createPerson(key: PersonKey, index: number): Person {
  const seed = PEOPLE[key];
  return {
    id: `person-${key}`,
    displayName: seed.displayName,
    username: key,
    email: seed.email,
    active: seed.active,
    roles: seed.admin ? ['ADMIN'] : [],
    referenceCode: `KK-${String(index + 1).padStart(2, '0')}`,
  };
}

function createProducts(today: IsoDate): Product[] {
  const goLive = addDays(today, -GO_LIVE_DAYS_AGO);
  const product = (key: ProductKey, name: string, sortOrder: number, amount: Cents): Product => ({
    id: `product-${key}`,
    name,
    sortOrder,
    active: true,
    prices: [{ amount, validFrom: goLive }],
  });
  const coffee = product('coffee', 'Kaffee', 1, 50);
  const cola = product('cola', 'Cola', 5, 90);
  return [
    {
      ...coffee,
      prices: [
        ...coffee.prices,
        { amount: 60, validFrom: addDays(today, COFFEE_ANNOUNCED_IN_DAYS) },
      ],
    },
    product('espresso', 'Espresso', 2, 60),
    product('tea', 'Tee', 3, 50),
    product('water', 'Wasser', 4, 80),
    {
      ...cola,
      prices: [
        ...cola.prices,
        { amount: 100, validFrom: addDays(today, -COLA_PRICE_CHANGE_DAYS_AGO) },
      ],
    },
    product('juice', 'Saft', 6, 120),
    { ...product('cocoa', 'Kakao', 7, 70), active: false },
  ];
}

type BookingFields = Partial<Omit<Booking, 'id'>> & Pick<Booking, 'type' | 'recordedBy'>;

/** Sammelt Buchungen und vergibt am Ende IDs in chronologischer Reihenfolge. */
class JournalBuilder {
  private readonly bookings: Booking[] = [];

  constructor(private readonly today: IsoDate) {}

  /** Datum `daysAgo` Tage vor heute. */
  date(daysAgo: number): IsoDate {
    return addDays(this.today, -daysAgo);
  }

  /** Fügt eine Buchung `daysAgo` Tage vor heute zur Uhrzeit `time` (Europe/Berlin) hinzu. */
  add(daysAgo: number, time: string, fields: BookingFields): Booking {
    const date = this.date(daysAgo);
    const booking: Booking = {
      id: `tmp-${this.bookings.length + 1}`,
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
      idempotencyKey: null,
      ...fields,
    };
    this.bookings.push(booking);
    return booking;
  }

  /** Kontostände aller bisher erfassten Buchungen. */
  balances(): Map<string, Cents> {
    const balances = new Map<string, Cents>();
    for (const booking of this.bookings) {
      if (booking.personId !== null) {
        balances.set(
          booking.personId,
          (balances.get(booking.personId) ?? 0) + booking.accountAmount,
        );
      }
    }
    return balances;
  }

  /** Journal mit endgültigen IDs `b-00001` … in chronologischer Reihenfolge. */
  build(): Booking[] {
    const sorted = [...this.bookings].sort(compareChronologically);
    const ids = new Map(
      sorted.map((booking, index) => [booking.id, `b-${String(index + 1).padStart(5, '0')}`]),
    );
    return sorted.map((booking) => ({
      ...booking,
      id: ids.get(booking.id) ?? booking.id,
      reversalOf: booking.reversalOf === null ? null : (ids.get(booking.reversalOf) ?? null),
    }));
  }
}

/** Felder einer Gegenbuchung zu `original` (negierte Beträge, Verweis). */
function reversalOf(original: Booking): BookingFields {
  return {
    type: 'REVERSAL',
    bookingDate: original.bookingDate,
    personId: original.personId,
    paymentMethod: original.paymentMethod,
    accountAmount: original.accountAmount === 0 ? 0 : -original.accountAmount,
    cashAmount: original.cashAmount === 0 ? 0 : -original.cashAmount,
    productId: original.productId,
    quantity: original.quantity,
    unitPrice: original.unitPrice,
    category: original.category,
    reversalOf: original.id,
    recordedBy: original.recordedBy,
  };
}

/** Wählt einen Artikel nach Gewichten; Kakao nur, solange er aktiv war. */
function pick(
  preferences: Partial<Record<ProductKey, number>>,
  random: () => number,
  cocoaAvailable: boolean,
): ProductKey {
  const options = (Object.entries(preferences) as [ProductKey, number][]).filter(
    ([key]) => key !== 'cocoa' || cocoaAvailable,
  );
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [key, weight] of options) {
    roll -= weight;
    if (roll < 0) {
      return key;
    }
  }
  return options[options.length - 1][0];
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Kleiner Zufallszahlengenerator mit festem Startwert (Mulberry32), damit die Daten reproduzierbar sind. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
