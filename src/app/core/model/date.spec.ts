import {
  addDays,
  addMonths,
  berlinDateTimeToInstant,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDayMonth,
  isValidIsoDate,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  toBerlinDate,
  weekday,
} from './date';

describe('NF-04 Datum und Zeit in Europe/Berlin', () => {
  it('bestimmt den Kalendertag in Berlin, nicht in UTC', () => {
    // 22:30 UTC ist in der Sommerzeit schon 00:30 am Folgetag.
    expect(toBerlinDate(new Date('2026-10-12T22:30:00Z'))).toBe('2026-10-13');
    // 23:30 UTC ist in der Winterzeit 00:30 am Folgetag.
    expect(toBerlinDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(toBerlinDate(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
  });

  it('formatiert Zeitpunkte wie in der Demo', () => {
    expect(formatDateTime('2026-09-21T12:28:00.000Z')).toBe('21.09.26 14:28');
    expect(formatDateTime('2026-01-05T07:05:00.000Z')).toBe('05.01.26 08:05');
  });

  it('formatiert fachliche Daten', () => {
    expect(formatDate('2026-09-21')).toBe('21.09.26');
    expect(formatDateLong('2026-11-01')).toBe('01.11.2026');
    expect(formatDayMonth('2026-11-01')).toBe('01.11.');
  });

  it('rechnet Berliner Uhrzeit in UTC um, mit Sommer- und Winterzeit', () => {
    expect(berlinDateTimeToInstant('2026-09-21', '14:28').toISOString()).toBe(
      '2026-09-21T12:28:00.000Z',
    );
    expect(berlinDateTimeToInstant('2026-12-01', '14:28').toISOString()).toBe(
      '2026-12-01T13:28:00.000Z',
    );
    // Tag der Umstellung auf Sommerzeit (29.03.2026, 02:00 → 03:00)
    expect(berlinDateTimeToInstant('2026-03-29', '01:30').toISOString()).toBe(
      '2026-03-29T00:30:00.000Z',
    );
    expect(berlinDateTimeToInstant('2026-03-29', '12:00').toISOString()).toBe(
      '2026-03-29T10:00:00.000Z',
    );
    // Tag der Umstellung auf Winterzeit (25.10.2026)
    expect(berlinDateTimeToInstant('2026-10-25', '12:00').toISOString()).toBe(
      '2026-10-25T11:00:00.000Z',
    );
  });

  it('addiert Tage über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-10-13', -120)).toBe('2026-06-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('addiert Monate und nimmt bei fehlendem Tag den Monatsletzten', () => {
    expect(addMonths('2026-10-13', -3)).toBe('2026-07-13');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });

  it('bestimmt den Wochentag', () => {
    expect(weekday('2026-10-13')).toBe(2);
    expect(weekday('2026-10-18')).toBe(0);
  });

  it('erkennt gültige Daten', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('13.10.2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('Datum aus Datumsauswahl', () => {
  it('übernimmt den lokalen Kalendertag ohne Umrechnung über UTC', () => {
    expect(isoDateFromLocalDate(new Date(2026, 9, 13))).toBe('2026-10-13');
    expect(isoDateFromLocalDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
    expect(isoDateFromLocalDate(localDateFromIsoDate('2026-03-29'))).toBe('2026-03-29');
  });
});
