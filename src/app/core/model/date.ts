/**
 * Fachliches Datum ohne Uhrzeit im Format `YYYY-MM-DD`, bezogen auf die
 * Zeitzone Europe/Berlin (z. B. Buchungsdatum, gültig ab).
 */
export type IsoDate = string;

/** Zeitpunkt als ISO-String in UTC, z. B. `2026-09-21T12:28:00.000Z` (NF-04). */
export type Timestamp = string;

/** Zeitzone, in der angezeigt und ausgewertet wird (NF-04, F-32). */
export const TIME_ZONE = 'Europe/Berlin';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const BERLIN_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface DateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function berlinParts(instant: Date): DateTimeParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of BERLIN_PARTS.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Ungültiges Datum: ${date}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Prüft, ob `value` ein gültiges Datum im Format `YYYY-MM-DD` ist (z. B. kein 31.02.). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Kalendertag des Zeitpunkts in Europe/Berlin, z. B. für das Buchungsdatum eines Konsums. */
export function toBerlinDate(instant: Date): IsoDate {
  const { year, month, day } = berlinParts(instant);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Zeitpunkt zu Datum und Uhrzeit in Europe/Berlin, mit Sommer- und Winterzeit.
 *
 * @param time Uhrzeit im Format `HH:MM`
 */
export function berlinDateTimeToInstant(date: IsoDate, time: string): Date {
  const { year, month, day } = parseIsoDate(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!timeMatch) {
    throw new Error(`Ungültige Uhrzeit: ${time}`);
  }
  const asUtc = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  // Der Versatz zu UTC hängt vom Zeitpunkt selbst ab (Sommerzeit). Deshalb einmal
  // mit dem Versatz der Schätzung rechnen und bei einem Wechsel nachkorrigieren.
  let instant = asUtc - berlinOffset(new Date(asUtc));
  const corrected = berlinOffset(new Date(instant));
  if (corrected !== asUtc - instant) {
    instant = asUtc - corrected;
  }
  return new Date(instant);
}

/** Versatz von Europe/Berlin gegenüber UTC in Millisekunden zum Zeitpunkt `instant`. */
function berlinOffset(instant: Date): number {
  const p = berlinParts(instant);
  const wallClock = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Addiert Kalendertage zu einem Datum (negative Werte ziehen ab). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(result.getUTCFullYear(), 4)}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/**
 * Addiert Kalendermonate zu einem Datum. Gibt es den Tag im Zielmonat nicht,
 * gilt der letzte Tag des Monats (31.03. minus ein Monat = 28.02.).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${pad(targetYear, 4)}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** Wochentag eines Datums: 0 = Sonntag bis 6 = Samstag. */
export function weekday(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Kurzes Datum wie in der Demo, z. B. „21.09.26“. */
export function formatDate(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${pad(day)}.${pad(month)}.${pad(year % 100)}`;
}

/** Datum mit vierstelligem Jahr, z. B. „01.11.2026“ (Bestätigung einer Preisänderung). */
export function formatDateLong(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${pad(day)}.${pad(month)}.${pad(year, 4)}`;
}

/** Tag und Monat, z. B. „01.11.“ (angekündigter Preis auf der Buchungsseite). */
export function formatDayMonth(date: IsoDate): string {
  const { month, day } = parseIsoDate(date);
  return `${pad(day)}.${pad(month)}.`;
}

/** Datum und Uhrzeit in Europe/Berlin wie in der Demo, z. B. „21.09.26 14:28“. */
export function formatDateTime(timestamp: Timestamp): string {
  const p = berlinParts(new Date(timestamp));
  return `${pad(p.day)}.${pad(p.month)}.${pad(p.year % 100)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Kalendertag eines Datums, wie ihn ein Datumsauswahl-Widget liefert (lokale
 * Mitternacht), als `YYYY-MM-DD`. Nimmt Jahr, Monat und Tag des lokalen
 * Kalenders und rechnet nicht über UTC um.
 */
export function isoDateFromLocalDate(date: Date): IsoDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Gegenstück zu {@link isoDateFromLocalDate}: lokale Mitternacht des Kalendertags. */
export function localDateFromIsoDate(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(year, month - 1, day);
}
