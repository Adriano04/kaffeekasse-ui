import { Injectable, inject } from '@angular/core';

import { CoffeeFundRepository } from '../data/coffee-fund.repository';
import { DataVersion } from '../data/data-version';
import {
  AdjustmentInput,
  BookingQuery,
  BookingRow,
  BottleRefundInput,
  ExpenseInput,
  Page,
  PaymentInput,
  PayoutInput,
} from '../model/api';
import { Result } from '../model/result';
import { runCommand, runRequest } from './query';

/**
 * Journal aus Sicht der Verwaltung: Buchungen erfassen, Gesamthistorie und
 * Kassenbuch durchsuchen, stornieren (F-11 bis F-15, F-27, F-28).
 */
@Injectable({ providedIn: 'root' })
export class JournalFacade {
  private readonly repository = inject(CoffeeFundRepository);
  private readonly dataVersion = inject(DataVersion);

  /**
   * Datenstand. Tabellen, die seitenweise vom Backend laden, rufen bei einer
   * neuen Version `reload()` auf.
   */
  readonly version = this.dataVersion.version;

  /** Gesamthistorie mit Filter, Sortierung und Seite (F-13). */
  searchBookings(query: BookingQuery): Promise<Result<Page<BookingRow>>> {
    return runRequest(() => this.repository.searchBookings(query));
  }

  /** Kassenbuch: Buchungen mit Kassenwirkung plus Auslagen (F-14, F-15). */
  cashBook(query: BookingQuery): Promise<Result<Page<BookingRow>>> {
    return runRequest(() => this.repository.cashBook(query));
  }

  /** Verbucht eine Einzahlung (F-11). */
  recordPayment(input: PaymentInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () => this.repository.recordPayment(input, idempotencyKey));
  }

  /** Verbucht eine Korrektur (F-12). */
  recordAdjustment(input: AdjustmentInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () =>
      this.repository.recordAdjustment(input, idempotencyKey),
    );
  }

  /** Verbucht eine Auszahlung (F-28). */
  recordPayout(input: PayoutInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () => this.repository.recordPayout(input, idempotencyKey));
  }

  /** Erfasst eine Ausgabe oder Auslage (F-14, I-04). */
  recordExpense(input: ExpenseInput, idempotencyKey: string): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () => this.repository.recordExpense(input, idempotencyKey));
  }

  /** Erfasst eine Pfandrückgabe (F-15). */
  recordBottleRefund(
    input: BottleRefundInput,
    idempotencyKey: string,
  ): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () =>
      this.repository.recordBottleRefund(input, idempotencyKey),
    );
  }

  /** Storniert eine Buchung mit Begründung (F-27). */
  reverseBooking(bookingId: string, reason: string): Promise<Result<BookingRow>> {
    return runCommand(this.dataVersion, () => this.repository.reverseBooking(bookingId, reason));
  }
}
