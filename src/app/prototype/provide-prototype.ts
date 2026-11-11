import { DOCUMENT, EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';

import { Clock } from '../core/clock/clock';
import { CoffeeFundRepository } from '../core/data/coffee-fund.repository';
import { SessionService } from '../core/session/session.service';
import { createDummyData } from './dummy-data';
import {
  InMemoryCoffeeFundRepository,
  PROTOTYPE_DELAY_MS,
} from './in-memory-coffee-fund.repository';
import { MockSessionService } from './mock-session.service';
import { PrototypeData, PrototypeDatabase } from './prototype-database';

/** Einstellungen von {@link providePrototype}. */
export interface PrototypeOptions {
  /** Erzeugt den Datenbestand beim Start. Standard: Dummy-Daten relativ zur Uhr. */
  readonly data?: (now: Date) => PrototypeData;
  /**
   * Künstliche Verzögerung je Anfrage in Millisekunden. Standard: der
   * URL-Parameter `?delay=800` beim Start, sonst 0.
   */
  readonly delayMs?: number;
}

/**
 * Registriert die Prototyp-Implementierungen von {@link CoffeeFundRepository}
 * (Fake-Backend mit Dummy-Daten) und {@link SessionService} (simulierte
 * Anmeldung). Für die Anbindung an Backend und Keycloak wird nur dieser
 * Aufruf in `app.config.ts` ersetzt.
 */
export function providePrototype(options: PrototypeOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: PrototypeDatabase,
      useFactory: () =>
        new PrototypeDatabase((options.data ?? createDummyData)(inject(Clock).now())),
    },
    {
      provide: PROTOTYPE_DELAY_MS,
      useFactory: () => options.delayMs ?? delayFromUrl(inject(DOCUMENT)),
    },
    MockSessionService,
    { provide: SessionService, useExisting: MockSessionService },
    InMemoryCoffeeFundRepository,
    { provide: CoffeeFundRepository, useExisting: InMemoryCoffeeFundRepository },
  ]);
}

/** Liest `?delay=<ms>` aus der URL, mit der die Anwendung gestartet wurde. */
function delayFromUrl(document: Document): number {
  const value = Number(new URLSearchParams(document.location?.search ?? '').get('delay'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
