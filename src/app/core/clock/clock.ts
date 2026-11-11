import { DestroyRef, Injectable, Provider, Signal, inject, signal } from '@angular/core';

/**
 * Uhr der Anwendung. Wird überall statt `new Date()` verwendet, damit Tests
 * die Zeit steuern können.
 */
export abstract class Clock {
  /**
   * Aktuelle Zeit als Signal für zeitabhängige Anzeigen. Ändert sich in
   * Abständen, damit z. B. „Rückgängig“ nach Ablauf der Storno-Frist ohne
   * weitere Aktion verschwindet.
   */
  abstract readonly current: Signal<Date>;

  /** Genauer aktueller Zeitpunkt, z. B. für Zeitstempel von Befehlen. */
  abstract now(): Date;
}

/** Abstand, in dem {@link SystemClock.current} aktualisiert wird. */
export const CLOCK_TICK_MS = 10_000;

/** Uhr auf Basis der Systemzeit; aktualisiert `current` alle 10 Sekunden. */
@Injectable()
export class SystemClock extends Clock {
  private readonly _current = signal(new Date());
  override readonly current = this._current.asReadonly();

  constructor() {
    super();
    const timer = setInterval(() => this._current.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  override now(): Date {
    return new Date();
  }
}

/** Registriert {@link SystemClock} als {@link Clock}. */
export function provideClock(): Provider {
  return { provide: Clock, useClass: SystemClock };
}
