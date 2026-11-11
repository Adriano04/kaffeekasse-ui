import { Booking, Person, Product, Settings } from '../core/model/domain';
import { Result } from '../core/model/result';

/** Datenbestand, mit dem das Fake-Backend startet. */
export interface PrototypeData {
  readonly people: readonly Person[];
  readonly products: readonly Product[];
  /** Journal in beliebiger Reihenfolge; IDs müssen eindeutig sein. */
  readonly journal: readonly Booking[];
  readonly settings: Settings;
  /** Person, die beim Start angemeldet ist. */
  readonly initialPersonId: string;
}

/**
 * Speicher des Fake-Backends, entspricht der späteren Datenbank. Lebt nur im
 * Speicher; nach dem Neuladen der Seite ist alles wieder im Ausgangszustand.
 *
 * Personen, Artikel und Einstellungen werden als Ganzes ersetzt (Stammdaten).
 * Das Journal wird nur ergänzt, nie geändert oder gelöscht (Z-05, NF-04).
 */
export class PrototypeDatabase {
  private readonly _people: Person[];
  private readonly _products: Product[];
  private readonly _journal: Booking[];
  private _settings: Settings;
  private readonly idempotentResults = new Map<string, Result<unknown>>();
  private sequence = 100_000;

  /** Person, die beim Start angemeldet ist. */
  readonly initialPersonId: string;

  constructor(data: PrototypeData) {
    const copy = structuredClone(data);
    this._people = [...copy.people];
    this._products = [...copy.products];
    this._journal = [...copy.journal];
    this._settings = copy.settings;
    this.initialPersonId = copy.initialPersonId;
  }

  get people(): readonly Person[] {
    return this._people;
  }

  get products(): readonly Product[] {
    return this._products;
  }

  /** Alle Buchungen in der Reihenfolge ihrer Erfassung. */
  get journal(): readonly Booking[] {
    return this._journal;
  }

  get settings(): Settings {
    return this._settings;
  }

  person(id: string): Person | undefined {
    return this._people.find((person) => person.id === id);
  }

  product(id: string): Product | undefined {
    return this._products.find((product) => product.id === id);
  }

  booking(id: string): Booking | undefined {
    return this._journal.find((booking) => booking.id === id);
  }

  /** Legt eine Person an oder ersetzt sie (gleiche ID). */
  savePerson(person: Person): void {
    replaceOrAdd(this._people, person);
  }

  /** Legt einen Artikel an oder ersetzt ihn (gleiche ID). */
  saveProduct(product: Product): void {
    replaceOrAdd(this._products, product);
  }

  saveSettings(settings: Settings): void {
    this._settings = settings;
  }

  /** Hängt eine Buchung an das Journal an und vergibt ihre ID. */
  append(booking: Omit<Booking, 'id'>): Booking {
    const stored: Booking = { id: this.newId('booking'), ...booking };
    this._journal.push(stored);
    return stored;
  }

  /** Neue, eindeutige ID mit Präfix, z. B. `person-100001`. */
  newId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  /** Ergebnis eines früheren Befehls mit diesem Idempotenz-Schlüssel (NF-04). */
  knownResult<T>(key: string): Result<T> | undefined {
    return this.idempotentResults.get(key) as Result<T> | undefined;
  }

  /** Merkt sich das Ergebnis eines Befehls zum Idempotenz-Schlüssel. */
  rememberResult(key: string, result: Result<unknown>): void {
    this.idempotentResults.set(key, result);
  }
}

function replaceOrAdd<T extends { readonly id: string }>(items: T[], item: T): void {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    items.push(item);
  } else {
    items[index] = item;
  }
}
