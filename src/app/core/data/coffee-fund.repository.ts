import {
  AccountHistory,
  AdjustmentInput,
  BookableProduct,
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
} from '../model/api';
import { IsoDate } from '../model/date';
import { PaymentInfo, Product, Settings } from '../model/domain';
import { Cents } from '../model/money';
import { Result } from '../model/result';

/**
 * Zugriff auf das Backend der Kaffeekasse (Port). Die Schnittstelle ist so
 * geschnitten wie die künftige REST-API und dient als Entwurf für deren
 * OpenAPI: Abfragen liefern genau das, was eine Ansicht braucht, Befehle
 * bilden Anwendungsfälle ab.
 *
 * Alle Methoden sind asynchron und liefern ein {@link Result}; fachliche Fehler
 * werden nicht geworfen. Befehle für die eigene Person bekommen keine
 * Personen-ID, das Backend kennt die angemeldete Person (K-14). Verwaltungs-
 * methoden prüft das Backend auf die Rolle Verwaltung (NF-07).
 *
 * Implementierungen: im Prototyp `InMemoryCoffeeFundRepository`, später eine
 * HTTP-Implementierung über den generierten OpenAPI-Client.
 */
export abstract class CoffeeFundRepository {
  // -------------------------------------------------------------------------
  // Für alle Angemeldeten
  // -------------------------------------------------------------------------

  /** Konto und Kontostand der angemeldeten Person (F-06). */
  abstract myAccount(): Promise<Result<MyAccount>>;

  /** Eigene Buchungen ab einem Datum, neueste zuerst, mit „Stand danach“ (F-07). */
  abstract myBookings(query: MyBookingsQuery): Promise<Result<AccountHistory>>;

  /** Aktive Artikel für die Buchungsseite, sortiert, mit aktuellem und angekündigtem Preis (F-04). */
  abstract bookableProducts(): Promise<Result<readonly BookableProduct[]>>;

  /** Einstellungen inklusive Zahlungsinformationen und Schwellen (F-37). */
  abstract settings(): Promise<Result<Settings>>;

  /**
   * Bucht einen Artikel zum aktuell gültigen Preis auf das eigene Konto (F-01).
   * Ein bereits bekannter Idempotenz-Schlüssel liefert das ursprüngliche
   * Ergebnis, ohne erneut zu buchen (NF-04).
   */
  abstract bookConsumption(
    productId: string,
    idempotencyKey: string,
  ): Promise<Result<ConsumptionBooked>>;

  /** Storniert eine eigene Konsumbuchung innerhalb der Storno-Frist (F-26). */
  abstract reverseOwnBooking(bookingId: string): Promise<Result<OwnBookingReversed>>;

  // -------------------------------------------------------------------------
  // Abfragen der Verwaltung
  // -------------------------------------------------------------------------

  /** Alle Personen mit Kontostand, inklusive inaktiver (F-09). */
  abstract people(): Promise<Result<readonly PersonWithBalance[]>>;

  /** Alle Artikel mit Preisverlauf, inklusive inaktiver, sortiert (F-10). */
  abstract products(): Promise<Result<readonly Product[]>>;

  /** Gesamthistorie mit Filter, Sortierung und Seite (F-13). */
  abstract searchBookings(query: BookingQuery): Promise<Result<Page<BookingRow>>>;

  /** Kassenbuch: alle Buchungen mit Kassenwirkung plus Auslagen (F-14, F-15). */
  abstract cashBook(query: BookingQuery): Promise<Result<Page<BookingRow>>>;

  /** Stichtagswerte der Statistik (F-17 bis F-19). */
  abstract metrics(): Promise<Result<Metrics>>;

  // -------------------------------------------------------------------------
  // Buchungen der Verwaltung
  // -------------------------------------------------------------------------

  /** Verbucht eine Einzahlung: Personenkonto + und Kasse + (F-11). */
  abstract recordPayment(input: PaymentInput, idempotencyKey: string): Promise<Result<BookingRow>>;

  /** Verbucht eine Korrektur ohne Kassenwirkung (F-12). */
  abstract recordAdjustment(
    input: AdjustmentInput,
    idempotencyKey: string,
  ): Promise<Result<BookingRow>>;

  /** Verbucht eine Auszahlung von Guthaben: Personenkonto − und Kasse − (F-28). */
  abstract recordPayout(input: PayoutInput, idempotencyKey: string): Promise<Result<BookingRow>>;

  /** Erfasst eine Ausgabe aus der Kasse oder eine Auslage durch eine Person (F-14, I-04). */
  abstract recordExpense(input: ExpenseInput, idempotencyKey: string): Promise<Result<BookingRow>>;

  /** Erfasst eine Pfandrückgabe: Kasse + (F-15). */
  abstract recordBottleRefund(
    input: BottleRefundInput,
    idempotencyKey: string,
  ): Promise<Result<BookingRow>>;

  /** Storniert eine Buchung ohne Frist mit Pflicht-Begründung (F-27). Liefert die Gegenbuchung. */
  abstract reverseBooking(bookingId: string, reason: string): Promise<Result<BookingRow>>;

  // -------------------------------------------------------------------------
  // Stammdaten der Verwaltung
  // -------------------------------------------------------------------------

  /** Legt eine Person an (F-09). Benutzerkonto und Initialpasswort entstehen später in Keycloak. */
  abstract createPerson(input: NewPerson): Promise<Result<PersonWithBalance>>;

  /** Ändert Anzeigename und E-Mail einer Person (F-09). */
  abstract updatePerson(personId: string, input: PersonUpdate): Promise<Result<PersonWithBalance>>;

  /** Deaktiviert eine Person; die Historie bleibt (F-09). */
  abstract deactivatePerson(personId: string): Promise<Result<PersonWithBalance>>;

  /** Reaktiviert eine Person (F-09). */
  abstract reactivatePerson(personId: string): Promise<Result<PersonWithBalance>>;

  /** Vergibt oder entzieht die Rolle Verwaltung (F-09, F-35). */
  abstract setAdminRole(personId: string, granted: boolean): Promise<Result<PersonWithBalance>>;

  /** Legt einen Artikel am Ende der Sortierung an (F-10). */
  abstract createProduct(input: NewProduct): Promise<Result<Product>>;

  /** Setzt einen Preis ab einem Datum; alte Buchungen behalten ihren Preis (F-10). */
  abstract changePrice(
    productId: string,
    amount: Cents,
    validFrom: IsoDate,
  ): Promise<Result<Product>>;

  /** Verschiebt einen Artikel in der Sortierung um eine Position (F-10). */
  abstract moveProduct(productId: string, direction: MoveDirection): Promise<Result<void>>;

  /** Aktiviert oder deaktiviert einen Artikel (F-10). */
  abstract setProductActive(productId: string, active: boolean): Promise<Result<Product>>;

  /** Ändert die Zahlungsinformationen (F-37). */
  abstract updatePaymentInfo(paymentInfo: PaymentInfo): Promise<Result<Settings>>;
}
