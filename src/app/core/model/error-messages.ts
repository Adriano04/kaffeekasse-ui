import { ErrorCode, Failure } from './result';

const MESSAGES: Record<ErrorCode, string> = {
  NOT_AUTHENTICATED: 'Du bist nicht angemeldet. Bitte melde dich erneut an.',
  FORBIDDEN: 'Dafür fehlt dir die Berechtigung.',
  NOT_FOUND: 'Der Eintrag wurde nicht gefunden. Vielleicht wurde er inzwischen geändert.',
  PERSON_INACTIVE: 'Die Person ist deaktiviert.',
  PRODUCT_INACTIVE: 'Dieser Artikel kann gerade nicht gebucht werden.',
  REVERSAL_WINDOW_EXPIRED:
    'Die Frist zum Rückgängigmachen ist abgelaufen. Bitte wende dich an die Verwaltung.',
  ALREADY_REVERSED: 'Die Buchung wurde bereits storniert.',
  REVERSAL_NOT_ALLOWED: 'Diese Buchung kann nicht storniert werden.',
  INVALID_AMOUNT: 'Bitte gib einen gültigen Betrag ein.',
  REASON_REQUIRED: 'Bitte gib eine Begründung an.',
  REQUIRED_FIELD_MISSING: 'Bitte fülle dieses Feld aus.',
  INVALID_DATE: 'Bitte gib ein gültiges Datum an.',
  INVALID_EMAIL: 'Bitte gib eine gültige E-Mail-Adresse an.',
  DISPLAY_NAME_TAKEN: 'Dieser Anzeigename ist bereits vergeben.',
  USERNAME_TAKEN: 'Dieser Benutzername ist bereits vergeben.',
  PRODUCT_NAME_TAKEN: 'Einen Artikel mit diesem Namen gibt es bereits.',
  LAST_ADMIN_ACCOUNT:
    'Das ist das letzte aktive Verwaltungskonto. Vergib die Rolle Verwaltung zuerst an eine weitere Person.',
  OWN_ACCOUNT: 'Das geht nicht für dein eigenes Konto. Bitte wende dich an deine Vertretung.',
  TECHNICAL_ERROR: 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
};

/**
 * Deutsche Meldung für Nutzer:innen zu einem Fehler. Die einzige Stelle, an der
 * Fehlercodes in Text übersetzt werden.
 */
export function errorMessage(failure: Failure): string {
  return MESSAGES[failure.code];
}
