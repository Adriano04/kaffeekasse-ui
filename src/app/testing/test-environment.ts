import { ApplicationRef, EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Clock } from '../core/clock/clock';
import { InMemoryCoffeeFundRepository } from '../prototype/in-memory-coffee-fund.repository';
import { MockSessionService } from '../prototype/mock-session.service';
import { providePrototype } from '../prototype/provide-prototype';
import { PrototypeData } from '../prototype/prototype-database';
import { TestClock } from './test-clock';
import { TEST_NOW, createTestData } from './test-data';

/** Einstellungen von {@link provideTestEnvironment}. */
export interface TestEnvironmentOptions {
  /** Datenbestand; Standard: {@link createTestData}. */
  readonly data?: () => PrototypeData;
  /** Startzeit der {@link TestClock}; Standard: {@link TEST_NOW}. */
  readonly now?: Date;
}

/**
 * Testumgebung mit echtem Fake-Backend, simulierter Anmeldung und
 * {@link TestClock}, ohne Verzögerung.
 */
export function provideTestEnvironment(
  options: TestEnvironmentOptions = {},
): (Provider | EnvironmentProviders)[] {
  return [
    { provide: Clock, useValue: new TestClock(options.now ?? TEST_NOW) },
    providePrototype({ data: options.data ?? createTestData, delayMs: 0 }),
  ];
}

/** Die {@link TestClock} der Testumgebung. */
export function testClock(): TestClock {
  return TestBed.inject(Clock) as TestClock;
}

/** Die simulierte Anmeldung der Testumgebung. */
export function testSession(): MockSessionService {
  return TestBed.inject(MockSessionService);
}

/** Das Fake-Backend der Testumgebung. */
export function testRepository(): InMemoryCoffeeFundRepository {
  return TestBed.inject(InMemoryCoffeeFundRepository);
}

/** Wartet, bis alle Effekte gelaufen und alle Abfragen geladen sind. */
export async function settle(): Promise<void> {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
}
