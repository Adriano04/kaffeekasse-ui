/**
 * Alle Fehlercodes, die das Backend (im Prototyp das Fake-Backend) melden
 * kann. Die spätere HTTP-Implementierung bildet HTTP-Fehler auf dieselben
 * Codes ab. Bedeutung siehe `Anforderungsspezifikation/Glossar.md`.
 */
export const ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PERSON_INACTIVE',
  'PRODUCT_INACTIVE',
  'REVERSAL_WINDOW_EXPIRED',
  'ALREADY_REVERSED',
  'REVERSAL_NOT_ALLOWED',
  'INVALID_AMOUNT',
  'REASON_REQUIRED',
  'REQUIRED_FIELD_MISSING',
  'INVALID_DATE',
  'INVALID_EMAIL',
  'DISPLAY_NAME_TAKEN',
  'USERNAME_TAKEN',
  'PRODUCT_NAME_TAKEN',
  'LAST_ADMIN_ACCOUNT',
  'OWN_ACCOUNT',
  'TECHNICAL_ERROR',
] as const;

/** Fehlercode einer abgelehnten Abfrage oder eines abgelehnten Befehls. */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Fachlicher Fehler, den das Backend zurückgibt (kein JavaScript-`Error`). */
export interface Failure {
  /** Was schiefgegangen ist. */
  readonly code: ErrorCode;
  /**
   * Name des Eingabefelds, auf das sich der Fehler bezieht, z. B. `displayName`.
   * Fehlt, wenn sich der Fehler auf die Aktion als Ganzes bezieht.
   */
  readonly field?: string;
}

/**
 * Antwort jeder Abfrage und jedes Befehls des Repositorys: entweder der Wert
 * oder ein {@link Failure}. Fachliche Fehler werden nicht geworfen.
 */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: Failure };

/** Erfolgreiches {@link Result}. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Abgelehntes {@link Result} mit Fehlercode und optional dem betroffenen Feld. */
export function fail<T = never>(code: ErrorCode, field?: string): Result<T> {
  return { ok: false, failure: field === undefined ? { code } : { code, field } };
}
