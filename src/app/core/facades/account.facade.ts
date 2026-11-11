import { Injectable, Signal, inject } from '@angular/core';

import { CoffeeFundRepository } from '../data/coffee-fund.repository';
import { DataVersion } from '../data/data-version';
import {
  AccountHistory,
  BookableProduct,
  ConsumptionBooked,
  MyAccount,
  OwnBookingReversed,
} from '../model/api';
import { IsoDate } from '../model/date';
import { Result } from '../model/result';
import { SessionService } from '../session/session.service';
import { Query, createQuery, runCommand } from './query';

/**
 * Konto der angemeldeten Person: Kontostand, eigene Buchungen, Konsum buchen
 * und Selbst-Storno (F-01 bis F-08, F-26). Buchen und Mein Konto teilen sich
 * die hier geladenen Daten.
 */
@Injectable({ providedIn: 'root' })
export class AccountFacade {
  private readonly repository = inject(CoffeeFundRepository);
  private readonly session = inject(SessionService);
  private readonly dataVersion = inject(DataVersion);
  private readonly personKey = () => this.session.currentPerson()?.id;

  /** Angemeldete Person oder `null`. */
  readonly currentPerson = this.session.currentPerson;

  /** Die angemeldete Person hat die Rolle Verwaltung. */
  readonly isAdmin = this.session.isAdmin;

  /** Konto und Kontostand der angemeldeten Person (F-06). */
  readonly account: Query<MyAccount> = createQuery({
    key: this.personKey,
    load: () => this.repository.myAccount(),
  });

  /** Aktive Artikel für die Buchungsseite (F-04). */
  readonly bookableProducts: Query<readonly BookableProduct[]> = createQuery({
    key: this.personKey,
    load: () => this.repository.bookableProducts(),
  });

  /**
   * Eigener Verlauf ab einem Datum (F-07). Erzeugt eine eigene Abfrage, die so
   * lange lebt wie der aufrufende Injection Context (in der Regel das
   * ViewModel). Lädt neu, wenn sich `from` ändert („Ältere laden“).
   */
  history(from: Signal<IsoDate>): Query<AccountHistory> {
    return createQuery({
      key: this.personKey,
      params: () => ({ from: from() }),
      load: (params) => this.repository.myBookings(params),
    });
  }

  /** Bucht einen Artikel auf das eigene Konto (F-01). */
  bookConsumption(productId: string, idempotencyKey: string): Promise<Result<ConsumptionBooked>> {
    return runCommand(this.dataVersion, () =>
      this.repository.bookConsumption(productId, idempotencyKey),
    );
  }

  /** Macht eine eigene Konsumbuchung innerhalb der Storno-Frist rückgängig (F-26). */
  reverseOwnBooking(bookingId: string): Promise<Result<OwnBookingReversed>> {
    return runCommand(this.dataVersion, () => this.repository.reverseOwnBooking(bookingId));
  }
}
