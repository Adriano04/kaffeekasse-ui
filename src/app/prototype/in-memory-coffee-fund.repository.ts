import { Injectable, InjectionToken, inject } from '@angular/core';

import { Clock } from '../core/clock/clock';
import { CoffeeFundRepository } from '../core/data/coffee-fund.repository';
import {
  AccountEntry,
  AccountHistory,
  AdjustmentInput,
  BookableProduct,
  BookingFilter,
  BookingQuery,
  BookingRow,
  BottleRefundInput,
  ConsumptionBooked,
  ExpenseInput,
  Metrics,
  MoveDirection,
  MyAccount,
  MyBookingsQuery,
  NewPerson,
  NewProduct,
  OwnBookingReversed,
  Page,
  PaymentInput,
  PayoutInput,
  PersonUpdate,
  PersonWithBalance,
} from '../core/model/api';
import { IsoDate, isValidIsoDate, toBerlinDate } from '../core/model/date';
import {
  Booking,
  BookingSource,
  BookingType,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  PAYMENT_METHODS,
  PaymentInfo,
  PaymentMethod,
  Person,
  Product,
  Settings,
} from '../core/model/domain';
import { BOOKING_TYPE_LABELS } from '../core/model/labels';
import { Cents } from '../core/model/money';
import { Result, fail, ok } from '../core/model/result';
import {
  announcedPrice,
  balanceOf,
  balancesAfter,
  balancesByPerson,
  checkAdminReversal,
  checkSelfReversal,
  compareChronologically,
  currentPrice,
  effectiveTypes,
  metricsOf,
  reversedIds,
} from '../core/model/rules';
import { SessionPerson, SessionService } from '../core/session/session.service';
import { PrototypeDatabase } from './prototype-database';

/** Künstliche Verzögerung je Anfrage in Millisekunden, um Ladezustände zu prüfen. */
export const PROTOTYPE_DELAY_MS = new InjectionToken<number>('PROTOTYPE_DELAY_MS', {
  factory: () => 0,
});

/** Buchungsarten, die im Kassenbuch erscheinen: Kassenwirkung oder Auslage. */
const CASH_BOOK_TYPES: ReadonlySet<BookingType> = new Set<BookingType>([
  'OPENING_CASH',
  'PAYMENT',
  'PAYOUT',
  'EXPENSE',
  'OUT_OF_POCKET',
  'BOTTLE_REFUND',
]);

const MAX_PAGE_SIZE = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fake-Backend des Prototyps. Verhält sich wie der spätere Server: Es hält
 * Journal und Stammdaten privat und gibt nur Kopien heraus, ermittelt die
 * angemeldete Person aus dem {@link SessionService} (Ersatz für das Token),
 * prüft die Rolle Verwaltung (NF-07) und wendet alle Fachregeln verbindlich an.
 * Kontostände und Kassenbestände werden nie gespeichert, sondern aus dem
 * Journal berechnet.
 */
@Injectable()
export class InMemoryCoffeeFundRepository extends CoffeeFundRepository {
  private readonly db = inject(PrototypeDatabase);
  private readonly session = inject(SessionService);
  private readonly clock = inject(Clock);
  private readonly delayMs = inject(PROTOTYPE_DELAY_MS);

  // -------------------------------------------------------------------------
  // Nur Prototyp
  // -------------------------------------------------------------------------

  /**
   * Aktive Personen für die simulierte Anmeldung, nach Namen sortiert. Nur im
   * Prototyp, nicht Teil des Ports: Ersetzt die spätere Anmeldeseite.
   */
  selectablePeople(): Promise<readonly SessionPerson[]> {
    return this.respond(() =>
      ok(
        this.db.people
          .filter((person) => person.active)
          .sort(byName)
          .map((person) => ({
            id: person.id,
            displayName: person.displayName,
            roles: person.roles,
          })),
      ),
    ).then((result) => (result.ok ? result.value : []));
  }

  // -------------------------------------------------------------------------
  // Für alle Angemeldeten
  // -------------------------------------------------------------------------

  override myAccount(): Promise<Result<MyAccount>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      if (!actor.ok) {
        return actor;
      }
      const person = actor.value;
      return ok({
        person: {
          id: person.id,
          displayName: person.displayName,
          referenceCode: person.referenceCode,
        },
        balance: balanceOf(this.db.journal, person.id),
      });
    });
  }

  override myBookings(query: MyBookingsQuery): Promise<Result<AccountHistory>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      if (!actor.ok) {
        return actor;
      }
      if (!isValidIsoDate(query.from)) {
        return fail('INVALID_DATE', 'from');
      }
      const own = this.db.journal.filter((booking) => booking.personId === actor.value.id);
      const reversed = reversedIds(own);
      const after = balancesAfter(own);
      const visible = own.filter((booking) => booking.type !== 'REVERSAL');
      const entries = visible
        .filter((booking) => booking.bookingDate >= query.from)
        .sort((a, b) => compareChronologically(b, a))
        .map((booking) => this.toAccountEntry(booking, after, reversed));
      return ok({
        entries,
        from: query.from,
        hasOlder: visible.some((booking) => booking.bookingDate < query.from),
      });
    });
  }

  override bookableProducts(): Promise<Result<readonly BookableProduct[]>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      if (!actor.ok) {
        return actor;
      }
      const today = this.today();
      const bookable: BookableProduct[] = [];
      for (const product of [...this.db.products].sort(bySortOrder)) {
        const price = currentPrice(product, today);
        if (product.active && price) {
          bookable.push({
            id: product.id,
            name: product.name,
            currentPrice: price.amount,
            announcedPrice: announcedPrice(product, today),
          });
        }
      }
      return ok(bookable);
    });
  }

  override settings(): Promise<Result<Settings>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      return actor.ok ? ok(this.db.settings) : actor;
    });
  }

  override bookConsumption(
    productId: string,
    idempotencyKey: string,
  ): Promise<Result<ConsumptionBooked>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      if (!actor.ok) {
        return actor;
      }
      const person = actor.value;
      return this.idempotent(person, idempotencyKey, () => {
        const product = this.db.product(productId);
        if (!product) {
          return fail('NOT_FOUND');
        }
        const price = currentPrice(product, this.today());
        if (!product.active || !price) {
          return fail('PRODUCT_INACTIVE');
        }
        const balanceBefore = balanceOf(this.db.journal, person.id);
        const booking = this.append({
          type: 'CONSUMPTION',
          bookingDate: this.today(),
          personId: person.id,
          accountAmount: -price.amount,
          productId: product.id,
          quantity: 1,
          unitPrice: price.amount,
          source: 'APP',
          recordedBy: person.id,
          idempotencyKey,
        });
        const balanceAfter = balanceBefore - price.amount;
        return ok({
          booking: this.toAccountEntry(booking, new Map([[booking.id, balanceAfter]]), new Set()),
          balanceBefore,
          balanceAfter,
        });
      });
    });
  }

  override reverseOwnBooking(bookingId: string): Promise<Result<OwnBookingReversed>> {
    return this.respond(() => {
      const actor = this.requirePerson();
      if (!actor.ok) {
        return actor;
      }
      const person = actor.value;
      const booking = this.db.booking(bookingId);
      if (!booking) {
        return fail('NOT_FOUND');
      }
      const blocker = checkSelfReversal(booking, {
        personId: person.id,
        reversed: reversedIds(this.db.journal),
        now: this.clock.now(),
        windowMinutes: this.db.settings.reversalWindowMinutes,
      });
      if (blocker !== null) {
        return fail(blocker);
      }
      this.appendReversal(booking, person, 'APP', '');
      return ok({
        bookingId: booking.id,
        productName: this.productName(booking.productId),
        amount: -booking.accountAmount,
        balanceAfter: balanceOf(this.db.journal, person.id),
      });
    });
  }

  // -------------------------------------------------------------------------
  // Abfragen der Verwaltung
  // -------------------------------------------------------------------------

  override people(): Promise<Result<readonly PersonWithBalance[]>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const balances = balancesByPerson(this.db.journal);
      return ok(
        [...this.db.people]
          .sort(byName)
          .map((person) => ({ ...person, balance: balances.get(person.id) ?? 0 })),
      );
    });
  }

  override products(): Promise<Result<readonly Product[]>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      return actor.ok ? ok([...this.db.products].sort(bySortOrder)) : actor;
    });
  }

  override searchBookings(query: BookingQuery): Promise<Result<Page<BookingRow>>> {
    return this.respond(() => this.search(query, () => true));
  }

  override cashBook(query: BookingQuery): Promise<Result<Page<BookingRow>>> {
    return this.respond(() => this.search(query, (type) => CASH_BOOK_TYPES.has(type)));
  }

  override metrics(): Promise<Result<Metrics>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      return actor.ok ? ok(metricsOf(this.db.journal, this.db.people)) : actor;
    });
  }

  // -------------------------------------------------------------------------
  // Buchungen der Verwaltung
  // -------------------------------------------------------------------------

  override recordPayment(input: PaymentInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return this.adminBooking(idempotencyKey, (admin) => {
      const invalid =
        this.checkPerson(input.personId) ??
        checkPositive(input.amount) ??
        checkPaymentMethod(input.paymentMethod) ??
        this.checkPastDate(input.bookingDate);
      if (invalid) {
        return invalid;
      }
      return ok(
        this.append({
          type: 'PAYMENT',
          bookingDate: input.bookingDate,
          personId: input.personId,
          paymentMethod: input.paymentMethod,
          accountAmount: input.amount,
          cashAmount: input.amount,
          note: input.note.trim(),
          source: 'ADMIN',
          recordedBy: admin.id,
          idempotencyKey,
        }),
      );
    });
  }

  override recordAdjustment(
    input: AdjustmentInput,
    idempotencyKey: string,
  ): Promise<Result<BookingRow>> {
    return this.adminBooking(idempotencyKey, (admin) => {
      const invalid =
        this.checkPerson(input.personId) ??
        (Number.isSafeInteger(input.amount) && input.amount !== 0
          ? null
          : fail<never>('INVALID_AMOUNT', 'amount')) ??
        checkReason(input.reason);
      if (invalid) {
        return invalid;
      }
      return ok(
        this.append({
          type: 'ADJUSTMENT',
          bookingDate: this.today(),
          personId: input.personId,
          accountAmount: input.amount,
          note: input.reason.trim(),
          source: 'ADMIN',
          recordedBy: admin.id,
          idempotencyKey,
        }),
      );
    });
  }

  override recordPayout(input: PayoutInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return this.adminBooking(idempotencyKey, (admin) => {
      const invalid =
        this.checkPerson(input.personId) ??
        checkPositive(input.amount) ??
        checkPaymentMethod(input.paymentMethod);
      if (invalid) {
        return invalid;
      }
      return ok(
        this.append({
          type: 'PAYOUT',
          bookingDate: this.today(),
          personId: input.personId,
          paymentMethod: input.paymentMethod,
          accountAmount: -input.amount,
          cashAmount: -input.amount,
          note: input.note.trim(),
          source: 'ADMIN',
          recordedBy: admin.id,
          idempotencyKey,
        }),
      );
    });
  }

  override recordExpense(input: ExpenseInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return this.adminBooking(idempotencyKey, (admin) => {
      const invalid =
        this.checkPastDate(input.bookingDate) ??
        checkPositive(input.amount) ??
        checkRequired(input.note, 'note') ??
        checkCategory(input.category) ??
        this.checkPaidFrom(input.paidFrom);
      if (invalid) {
        return invalid;
      }
      const common = {
        bookingDate: input.bookingDate,
        category: input.category,
        note: input.note.trim(),
        source: 'ADMIN' as const,
        recordedBy: admin.id,
        idempotencyKey,
      };
      if (typeof input.paidFrom === 'string') {
        return ok(
          this.append({
            ...common,
            type: 'EXPENSE',
            paymentMethod: input.paidFrom,
            cashAmount: -input.amount,
          }),
        );
      }
      // Auslage (I-04): Die Person bekommt Guthaben, die Kasse ändert sich nicht.
      return ok(
        this.append({
          ...common,
          type: 'OUT_OF_POCKET',
          personId: input.paidFrom.outOfPocketBy,
          accountAmount: input.amount,
        }),
      );
    });
  }

  override recordBottleRefund(
    input: BottleRefundInput,
    idempotencyKey: string,
  ): Promise<Result<BookingRow>> {
    return this.adminBooking(idempotencyKey, (admin) => {
      const invalid =
        this.checkPastDate(input.bookingDate) ??
        checkPositive(input.amount) ??
        checkRequired(input.note, 'note') ??
        checkPaymentMethod(input.paymentMethod);
      if (invalid) {
        return invalid;
      }
      return ok(
        this.append({
          type: 'BOTTLE_REFUND',
          bookingDate: input.bookingDate,
          paymentMethod: input.paymentMethod,
          cashAmount: input.amount,
          note: input.note.trim(),
          source: 'ADMIN',
          recordedBy: admin.id,
          idempotencyKey,
        }),
      );
    });
  }

  override reverseBooking(bookingId: string, reason: string): Promise<Result<BookingRow>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const invalidReason = checkReason(reason);
      if (invalidReason) {
        return invalidReason;
      }
      const booking = this.db.booking(bookingId);
      if (!booking) {
        return fail('NOT_FOUND');
      }
      const blocker = checkAdminReversal(booking, reversedIds(this.db.journal));
      if (blocker !== null) {
        return fail(blocker);
      }
      const reversal = this.appendReversal(booking, actor.value, 'ADMIN', reason.trim());
      return ok(this.toRow(reversal));
    });
  }

  // -------------------------------------------------------------------------
  // Stammdaten der Verwaltung
  // -------------------------------------------------------------------------

  override createPerson(input: NewPerson): Promise<Result<PersonWithBalance>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const invalid =
        this.checkDisplayName(input.displayName, null) ??
        this.checkUsername(input.username) ??
        checkEmail(input.email);
      if (invalid) {
        return invalid;
      }
      const person: Person = {
        id: this.db.newId('person'),
        displayName: input.displayName.trim(),
        username: input.username.trim(),
        email: normalizeEmail(input.email),
        active: true,
        roles: [],
        referenceCode: this.nextReferenceCode(),
      };
      this.db.savePerson(person);
      return ok(this.withBalance(person));
    });
  }

  override updatePerson(personId: string, input: PersonUpdate): Promise<Result<PersonWithBalance>> {
    return this.updatePersonAs(personId, (person) => {
      const invalid =
        (person.active ? this.checkDisplayName(input.displayName, person.id) : null) ??
        checkRequired(input.displayName, 'displayName') ??
        checkEmail(input.email);
      if (invalid) {
        return invalid;
      }
      return ok({
        ...person,
        displayName: input.displayName.trim(),
        email: normalizeEmail(input.email),
      });
    });
  }

  override deactivatePerson(personId: string): Promise<Result<PersonWithBalance>> {
    return this.updatePersonAs(personId, (person, admin) => {
      if (!person.active) {
        return ok(person);
      }
      const invalid = this.checkLastAdmin(person) ?? checkNotSelf(person, admin);
      return invalid ?? ok({ ...person, active: false });
    });
  }

  override reactivatePerson(personId: string): Promise<Result<PersonWithBalance>> {
    return this.updatePersonAs(personId, (person) => {
      if (person.active) {
        return ok(person);
      }
      const invalid = this.checkDisplayName(person.displayName, person.id);
      return invalid ?? ok({ ...person, active: true });
    });
  }

  override setAdminRole(personId: string, granted: boolean): Promise<Result<PersonWithBalance>> {
    return this.updatePersonAs(personId, (person, admin) => {
      const isAdmin = person.roles.includes('ADMIN');
      if (granted) {
        if (!person.active) {
          return fail('PERSON_INACTIVE');
        }
        return ok(isAdmin ? person : { ...person, roles: [...person.roles, 'ADMIN'] });
      }
      if (!isAdmin) {
        return ok(person);
      }
      const invalid = this.checkLastAdmin(person) ?? checkNotSelf(person, admin);
      return invalid ?? ok({ ...person, roles: person.roles.filter((role) => role !== 'ADMIN') });
    });
  }

  override createProduct(input: NewProduct): Promise<Result<Product>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const invalid =
        checkRequired(input.name, 'name') ??
        (this.db.products.some((product) => sameName(product.name, input.name))
          ? fail<never>('PRODUCT_NAME_TAKEN', 'name')
          : null) ??
        checkPositive(input.price, 'price');
      if (invalid) {
        return invalid;
      }
      const product: Product = {
        id: this.db.newId('product'),
        name: input.name.trim(),
        sortOrder: Math.max(0, ...this.db.products.map((p) => p.sortOrder)) + 1,
        active: true,
        prices: [{ amount: input.price, validFrom: this.today() }],
      };
      this.db.saveProduct(product);
      return ok(product);
    });
  }

  override changePrice(
    productId: string,
    amount: Cents,
    validFrom: IsoDate,
  ): Promise<Result<Product>> {
    return this.updateProductAs(productId, (product) => {
      const invalid =
        checkPositive(amount) ??
        (isValidIsoDate(validFrom) && validFrom >= this.today()
          ? null
          : fail<never>('INVALID_DATE', 'validFrom'));
      if (invalid) {
        return invalid;
      }
      const prices = product.prices
        .filter((price) => price.validFrom !== validFrom)
        .concat({ amount, validFrom })
        .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      return ok({ ...product, prices });
    });
  }

  override moveProduct(productId: string, direction: MoveDirection): Promise<Result<void>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const sorted = [...this.db.products].sort(bySortOrder);
      const index = sorted.findIndex((product) => product.id === productId);
      if (index === -1) {
        return fail('NOT_FOUND');
      }
      const neighbor = sorted[direction === 'UP' ? index - 1 : index + 1];
      if (neighbor) {
        const product = sorted[index];
        this.db.saveProduct({ ...product, sortOrder: neighbor.sortOrder });
        this.db.saveProduct({ ...neighbor, sortOrder: product.sortOrder });
      }
      return ok(undefined);
    });
  }

  override setProductActive(productId: string, active: boolean): Promise<Result<Product>> {
    return this.updateProductAs(productId, (product) => ok({ ...product, active }));
  }

  override updatePaymentInfo(paymentInfo: PaymentInfo): Promise<Result<Settings>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const settings: Settings = {
        ...this.db.settings,
        paymentInfo: {
          accountHolder: paymentInfo.accountHolder.trim(),
          iban: paymentInfo.iban.trim(),
          paypalLink: paymentInfo.paypalLink.trim(),
          cashNote: paymentInfo.cashNote.trim(),
        },
      };
      this.db.saveSettings(settings);
      return ok(settings);
    });
  }

  // -------------------------------------------------------------------------
  // Hilfsfunktionen
  // -------------------------------------------------------------------------

  /**
   * Führt eine Anfrage aus wie ein Server: optional verzögert, Ergebnis als
   * Kopie (wie nach einer Übertragung über HTTP), unerwartete Fehler als
   * `TECHNICAL_ERROR`.
   */
  private async respond<T>(action: () => Result<T>): Promise<Result<T>> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    try {
      return structuredClone(action());
    } catch (error) {
      console.error('Fake-Backend: unerwarteter Fehler', error);
      return fail('TECHNICAL_ERROR');
    }
  }

  /** Angemeldete, aktive Person (Ersatz für die Prüfung des Tokens). */
  private requirePerson(): Result<Person> {
    const id = this.session.currentPerson()?.id;
    const person = id === undefined ? undefined : this.db.person(id);
    if (!person) {
      return fail('NOT_AUTHENTICATED');
    }
    return person.active ? ok(person) : fail('PERSON_INACTIVE');
  }

  /** Angemeldete Person mit Rolle Verwaltung, geprüft gegen den Datenbestand (NF-07). */
  private requireAdmin(): Result<Person> {
    const actor = this.requirePerson();
    if (!actor.ok) {
      return actor;
    }
    return actor.value.roles.includes('ADMIN') ? actor : fail('FORBIDDEN');
  }

  /**
   * Liefert für einen bekannten Idempotenz-Schlüssel das ursprüngliche
   * Ergebnis, ohne den Befehl erneut auszuführen (NF-04). Gemerkt werden nur
   * erfolgreiche Befehle, damit ein korrigierter neuer Versuch möglich bleibt.
   */
  private idempotent<T>(actor: Person, key: string, action: () => Result<T>): Result<T> {
    const scopedKey = `${actor.id}:${key}`;
    const known = this.db.knownResult<T>(scopedKey);
    if (known) {
      return known;
    }
    const result = action();
    if (result.ok) {
      this.db.rememberResult(scopedKey, result);
    }
    return result;
  }

  /** Buchung der Verwaltung: Rechteprüfung, Idempotenz, Antwort als Zeile der Historie. */
  private adminBooking(
    idempotencyKey: string,
    action: (admin: Person) => Result<Booking>,
  ): Promise<Result<BookingRow>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      return this.idempotent(actor.value, idempotencyKey, () => {
        const booked = action(actor.value);
        return booked.ok ? ok(this.toRow(booked.value)) : booked;
      });
    });
  }

  /** Ändert eine Person als Verwaltung und liefert sie mit Kontostand. */
  private updatePersonAs(
    personId: string,
    change: (person: Person, admin: Person) => Result<Person>,
  ): Promise<Result<PersonWithBalance>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const person = this.db.person(personId);
      if (!person) {
        return fail('NOT_FOUND');
      }
      const changed = change(person, actor.value);
      if (!changed.ok) {
        return changed;
      }
      this.db.savePerson(changed.value);
      return ok(this.withBalance(changed.value));
    });
  }

  /** Ändert einen Artikel als Verwaltung. */
  private updateProductAs(
    productId: string,
    change: (product: Product) => Result<Product>,
  ): Promise<Result<Product>> {
    return this.respond(() => {
      const actor = this.requireAdmin();
      if (!actor.ok) {
        return actor;
      }
      const product = this.db.product(productId);
      if (!product) {
        return fail('NOT_FOUND');
      }
      const changed = change(product);
      if (changed.ok) {
        this.db.saveProduct(changed.value);
      }
      return changed;
    });
  }

  /** Gesamthistorie bzw. Kassenbuch: filtern, sortieren, eine Seite ausschneiden (F-13). */
  private search(
    query: BookingQuery,
    includeType: (type: BookingType) => boolean,
  ): Result<Page<BookingRow>> {
    const actor = this.requireAdmin();
    if (!actor.ok) {
      return actor;
    }
    const filter = query.filter;
    for (const field of ['from', 'to'] as const) {
      const value = filter[field];
      if (value !== undefined && !isValidIsoDate(value)) {
        return fail('INVALID_DATE', field);
      }
    }
    const journal = this.db.journal;
    const types = effectiveTypes(journal);
    const reversed = reversedIds(journal);
    const matching = journal.filter(
      (booking) => includeType(types.get(booking.id) ?? booking.type) && matches(booking, filter),
    );
    const rows = matching
      .sort((a, b) => compareChronologically(b, a))
      .map((booking) => this.toRow(booking, reversed, types));
    if (query.sort) {
      const { field, direction } = query.sort;
      const factor = direction === 'asc' ? 1 : -1;
      // Stabile Sortierung: Bei gleichen Werten bleibt „neueste zuerst“.
      rows.sort((a, b) => factor * compareRows(a, b, field));
    }
    const pageSize = Math.min(Math.max(1, Math.trunc(query.pageSize) || 1), MAX_PAGE_SIZE);
    const page = Math.max(1, Math.trunc(query.page) || 1);
    return ok({ rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length });
  }

  private append(
    booking: Partial<Booking> & Pick<Booking, 'type' | 'bookingDate' | 'source' | 'recordedBy'>,
  ): Booking {
    return this.db.append({
      recordedAt: this.clock.now().toISOString(),
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
      idempotencyKey: null,
      ...booking,
    });
  }

  /**
   * Gegenbuchung zu einer Buchung: gleiche Bezüge, negierte Beträge, Verweis
   * auf das Original. Sie trägt das Buchungsdatum des Originals, damit
   * Auswertungen nach Zeitraum den Fehler im richtigen Zeitraum aufheben.
   */
  private appendReversal(
    original: Booking,
    actor: Person,
    source: BookingSource,
    note: string,
  ): Booking {
    return this.append({
      type: 'REVERSAL',
      bookingDate: original.bookingDate,
      personId: original.personId,
      paymentMethod: original.paymentMethod,
      accountAmount: negate(original.accountAmount),
      cashAmount: negate(original.cashAmount),
      productId: original.productId,
      quantity: original.quantity,
      unitPrice: original.unitPrice,
      category: original.category,
      note,
      reversalOf: original.id,
      source,
      recordedBy: actor.id,
    });
  }

  private toAccountEntry(
    booking: Booking,
    after: ReadonlyMap<string, Cents>,
    reversed: ReadonlySet<string>,
  ): AccountEntry {
    return {
      id: booking.id,
      type: booking.type,
      productName: this.productName(booking.productId),
      quantity: booking.quantity,
      bookingDate: booking.bookingDate,
      recordedAt: booking.recordedAt,
      amount: booking.accountAmount,
      balanceAfter: after.get(booking.id) ?? null,
      note: booking.note,
      paymentMethod: booking.paymentMethod,
      reversed: reversed.has(booking.id),
    };
  }

  private toRow(
    booking: Booking,
    reversed: ReadonlySet<string> = reversedIds(this.db.journal),
    types: ReadonlyMap<string, BookingType> = effectiveTypes(this.db.journal),
  ): BookingRow {
    return {
      id: booking.id,
      type: booking.type,
      bookingDate: booking.bookingDate,
      personId: booking.personId,
      personName:
        booking.personId === null ? null : (this.db.person(booking.personId)?.displayName ?? null),
      productName: this.productName(booking.productId),
      quantity: booking.quantity,
      note: booking.note,
      accountAmount: booking.accountAmount,
      cashAmount: booking.cashAmount,
      paymentMethod: booking.paymentMethod,
      category: booking.category,
      source: booking.source,
      recordedByName: this.db.person(booking.recordedBy)?.displayName ?? '',
      reversalOf: booking.reversalOf,
      reversedType: booking.type === 'REVERSAL' ? (types.get(booking.id) ?? null) : null,
      reversed: reversed.has(booking.id),
    };
  }

  private withBalance(person: Person): PersonWithBalance {
    return { ...person, balance: balanceOf(this.db.journal, person.id) };
  }

  private productName(productId: string | null): string | null {
    return productId === null ? null : (this.db.product(productId)?.name ?? null);
  }

  private today(): IsoDate {
    return toBerlinDate(this.clock.now());
  }

  private checkPerson(personId: string): Result<never> | null {
    return this.db.person(personId) ? null : fail('NOT_FOUND', 'personId');
  }

  private checkPastDate(date: string): Result<never> | null {
    return isValidIsoDate(date) && date <= this.today()
      ? null
      : fail('INVALID_DATE', 'bookingDate');
  }

  private checkPaidFrom(paidFrom: ExpenseInput['paidFrom']): Result<never> | null {
    if (typeof paidFrom === 'string') {
      return PAYMENT_METHODS.includes(paidFrom) ? null : fail('REQUIRED_FIELD_MISSING', 'paidFrom');
    }
    return this.db.person(paidFrom?.outOfPocketBy) ? null : fail('NOT_FOUND', 'paidFrom');
  }

  /** Anzeigename: Pflicht, eindeutig unter den aktiven Personen (F-09). */
  private checkDisplayName(displayName: string, ownId: string | null): Result<never> | null {
    const required = checkRequired(displayName, 'displayName');
    if (required) {
      return required;
    }
    const taken = this.db.people.some(
      (person) => person.active && person.id !== ownId && sameName(person.displayName, displayName),
    );
    return taken ? fail('DISPLAY_NAME_TAKEN', 'displayName') : null;
  }

  /** Benutzername: Pflicht, eindeutig unter allen Personen (F-09). */
  private checkUsername(username: string): Result<never> | null {
    const required = checkRequired(username, 'username');
    if (required) {
      return required;
    }
    return this.db.people.some((person) => sameName(person.username, username))
      ? fail('USERNAME_TAKEN', 'username')
      : null;
  }

  /** Das letzte aktive Verwaltungskonto darf weder deaktiviert noch herabgestuft werden (F-09, F-35). */
  private checkLastAdmin(person: Person): Result<never> | null {
    if (!person.active || !person.roles.includes('ADMIN')) {
      return null;
    }
    const activeAdmins = this.db.people.filter((p) => p.active && p.roles.includes('ADMIN'));
    return activeAdmins.length <= 1 ? fail('LAST_ADMIN_ACCOUNT') : null;
  }

  private nextReferenceCode(): string {
    const numbers = this.db.people.map((person) =>
      Number(/(\d+)$/.exec(person.referenceCode)?.[1] ?? 0),
    );
    return `KK-${String(Math.max(0, ...numbers) + 1).padStart(2, '0')}`;
  }
}

function checkPositive(amount: Cents, field = 'amount'): Result<never> | null {
  return Number.isSafeInteger(amount) && amount > 0 ? null : fail('INVALID_AMOUNT', field);
}

function checkPaymentMethod(method: PaymentMethod): Result<never> | null {
  return PAYMENT_METHODS.includes(method) ? null : fail('REQUIRED_FIELD_MISSING', 'paymentMethod');
}

function checkCategory(category: ExpenseCategory): Result<never> | null {
  return EXPENSE_CATEGORIES.includes(category) ? null : fail('REQUIRED_FIELD_MISSING', 'category');
}

function checkRequired(value: string | null | undefined, field: string): Result<never> | null {
  return value && value.trim() !== '' ? null : fail('REQUIRED_FIELD_MISSING', field);
}

function checkReason(reason: string): Result<never> | null {
  return reason && reason.trim() !== '' ? null : fail('REASON_REQUIRED', 'reason');
}

function checkEmail(email: string | null): Result<never> | null {
  const normalized = normalizeEmail(email);
  return normalized === null || EMAIL_PATTERN.test(normalized)
    ? null
    : fail('INVALID_EMAIL', 'email');
}

/** Sich selbst deaktivieren oder die eigene Rolle entziehen geht nicht; das macht die Vertretung. */
function checkNotSelf(person: Person, admin: Person): Result<never> | null {
  return person.id === admin.id ? fail('OWN_ACCOUNT') : null;
}

function normalizeEmail(email: string | null): string | null {
  const trimmed = email?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');
}

function negate(amount: Cents): Cents {
  return amount === 0 ? 0 : -amount;
}

function byName(a: Person, b: Person): number {
  return a.displayName.localeCompare(b.displayName, 'de');
}

function bySortOrder(a: Product, b: Product): number {
  return a.sortOrder - b.sortOrder;
}

function matches(booking: Booking, filter: BookingFilter): boolean {
  return (
    (filter.personId === undefined || booking.personId === filter.personId) &&
    (filter.type === undefined || booking.type === filter.type) &&
    (filter.productId === undefined || booking.productId === filter.productId) &&
    (filter.from === undefined || booking.bookingDate >= filter.from) &&
    (filter.to === undefined || booking.bookingDate <= filter.to) &&
    (filter.note === undefined ||
      booking.note.toLocaleLowerCase('de').includes(filter.note.trim().toLocaleLowerCase('de')))
  );
}

function compareRows(
  a: BookingRow,
  b: BookingRow,
  field: NonNullable<BookingQuery['sort']>['field'],
): number {
  switch (field) {
    case 'bookingDate':
      return a.bookingDate.localeCompare(b.bookingDate);
    case 'personName':
      return (a.personName ?? '').localeCompare(b.personName ?? '', 'de');
    case 'type':
      return BOOKING_TYPE_LABELS[a.type].localeCompare(BOOKING_TYPE_LABELS[b.type], 'de');
    case 'amount':
      return (a.accountAmount || a.cashAmount) - (b.accountAmount || b.cashAmount);
    case 'accountAmount':
      return a.accountAmount - b.accountAmount;
    case 'cashAmount':
      return a.cashAmount - b.cashAmount;
  }
}
