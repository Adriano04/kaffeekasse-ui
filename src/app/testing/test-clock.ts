import { Signal, WritableSignal, signal } from '@angular/core';

import { Clock } from '../core/clock/clock';

/** Uhr für Tests: steht still, bis sie gestellt oder vorgespult wird. */
export class TestClock extends Clock {
  private readonly _current: WritableSignal<Date>;
  override readonly current: Signal<Date>;

  constructor(start: Date) {
    super();
    this._current = signal(new Date(start));
    this.current = this._current.asReadonly();
  }

  override now(): Date {
    return new Date(this._current());
  }

  /** Stellt die Uhr auf einen Zeitpunkt. */
  set(date: Date): void {
    this._current.set(new Date(date));
  }

  /** Spult die Uhr um `ms` Millisekunden vor. */
  advance(ms: number): void {
    this._current.update((date) => new Date(date.getTime() + ms));
  }
}
