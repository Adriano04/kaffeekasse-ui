import {
  ReadonlyFieldTree,
  SchemaPath,
  TreeValidationResult,
  email,
  required,
  validate,
} from '@angular/forms/signals';
import { RsToastService } from 'custom-components';

import { PersonWithBalance } from '../../core/model/api';
import { IsoDate, isoDateFromLocalDate } from '../../core/model/date';
import { balanceDisplay } from '../../core/model/display';
import { errorMessage } from '../../core/model/error-messages';
import { Cents, parseAmount } from '../../core/model/money';
import { Failure } from '../../core/model/result';

// Gemeinsame Regeln der Formulare in der Verwaltung (Signal Forms). Die
// Prüfungen hier sind Komfort für die Eingabe; verbindlich prüft das Backend.

/** Pflichtfeld mit deutscher Meldung. */
export function requiredText(
  path: SchemaPath<string>,
  message = 'Bitte fülle dieses Feld aus.',
): void {
  required(path, { message });
}

/** Optionale E-Mail-Adresse. */
export function optionalEmail(path: SchemaPath<string>): void {
  email(path, { message: 'Bitte gib eine gültige E-Mail-Adresse an.' });
}

/**
 * Betrag als Text, z. B. „12,50“ oder „-2“ (NF-04: höchstens zwei Nachkommastellen).
 *
 * @param sign `positive` = größer als 0, `nonzero` = positiv oder negativ, nicht 0
 */
export function amountField(path: SchemaPath<string>, sign: 'positive' | 'nonzero'): void {
  required(path, { message: 'Bitte gib einen Betrag ein.' });
  validate(path, ({ value }) => {
    if (value().trim() === '') {
      return undefined;
    }
    const amount = parseAmount(value());
    if (amount === null) {
      return { kind: 'amount', message: 'Bitte gib einen Betrag wie 12,50 ein.' };
    }
    if (sign === 'positive' && amount <= 0) {
      return { kind: 'amount', message: 'Der Betrag muss größer als 0 sein.' };
    }
    if (sign === 'nonzero' && amount === 0) {
      return { kind: 'amount', message: 'Der Betrag darf nicht 0 sein.' };
    }
    return undefined;
  });
}

/** Datum aus der Datumsauswahl, Pflicht und nicht in der Zukunft (rückdatierbar, F-11, F-14, F-15). */
export function pastDateField(path: SchemaPath<Date | null>, today: () => IsoDate): void {
  required(path, { message: 'Bitte wähle ein Datum.' });
  validate(path, ({ value }) => {
    const date = value();
    return date && isoDateFromLocalDate(date) > today()
      ? { kind: 'date', message: 'Das Datum darf nicht in der Zukunft liegen.' }
      : undefined;
  });
}

/** Datum aus der Datumsauswahl, Pflicht und nicht in der Vergangenheit (gültig ab, F-10). */
export function futureDateField(path: SchemaPath<Date | null>, today: () => IsoDate): void {
  required(path, { message: 'Bitte wähle ein Datum.' });
  validate(path, ({ value }) => {
    const date = value();
    return date && isoDateFromLocalDate(date) < today()
      ? { kind: 'date', message: 'Das Datum darf nicht in der Vergangenheit liegen.' }
      : undefined;
  });
}

/** Betrag aus einem bereits geprüften Formularfeld. */
export function amountOf(text: string): Cents {
  return parseAmount(text) ?? 0;
}

/**
 * Antwort für `submit()` bei einem abgelehnten Befehl: Fehler mit Feldbezug
 * erscheinen am Feld (`kind: 'server'`), alle anderen als kritischer Toast.
 *
 * @param fields Formularfelder nach dem Feldnamen des Backends, z. B. `{ amount: form.amount }`
 */
export function failureToFormErrors(
  failure: Failure,
  fields: Readonly<Record<string, ReadonlyFieldTree<unknown>>>,
  toasts: RsToastService,
): TreeValidationResult {
  const fieldTree = failure.field === undefined ? undefined : fields[failure.field];
  if (fieldTree) {
    return [{ kind: 'server', fieldTree, message: errorMessage(failure) }];
  }
  toasts.show({ message: errorMessage(failure), variant: 'crit' });
  return undefined;
}

/** Auswahlmöglichkeit eines nativen Auswahlfelds. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Personen für ein Auswahlfeld, aktive zuerst, mit Kontostand. Inaktive
 * bleiben wählbar (z. B. Schlussabrechnung, F-09), wenn `includeInactive`.
 */
export function toPersonOptions(
  people: readonly PersonWithBalance[],
  includeInactive: boolean,
): SelectOption[] {
  return [...people]
    .filter((person) => includeInactive || person.active)
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((person) => ({
      value: person.id,
      label:
        `${person.displayName} (${balanceDisplay(person.balance).text})` +
        (person.active ? '' : ' – inaktiv'),
    }));
}
