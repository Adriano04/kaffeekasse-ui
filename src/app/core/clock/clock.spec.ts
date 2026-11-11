import { TestBed } from '@angular/core/testing';

import { CLOCK_TICK_MS, Clock, provideClock } from './clock';

describe('SystemClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideClock()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('liefert die Systemzeit und aktualisiert current alle 10 Sekunden', () => {
    const clock = TestBed.inject(Clock);
    expect(clock.current().toISOString()).toBe('2026-10-13T10:00:00.000Z');

    vi.advanceTimersByTime(CLOCK_TICK_MS - 1);
    expect(clock.now().toISOString()).toBe('2026-10-13T10:00:09.999Z');
    expect(clock.current().toISOString()).toBe('2026-10-13T10:00:00.000Z');

    vi.advanceTimersByTime(1);
    expect(clock.current().toISOString()).toBe('2026-10-13T10:00:10.000Z');
  });

  it('räumt das Intervall beim Zerstören auf', () => {
    TestBed.inject(Clock);
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
