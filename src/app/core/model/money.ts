/**
 * Geldbetrag in ganzen Cent (Integer). Mit Beträgen wird nie in Gleitkomma
 * gerechnet, damit keine Rundungsfehler entstehen (NF-04).
 */
export type Cents = number;

/** Typografisches Minus (U+2212) für die Anzeige negativer Beträge. */
const MINUS = '\u2212';

/** Geschütztes Leerzeichen zwischen Zahl und Währungszeichen. */
const NBSP = '\u00a0';

const AMOUNT_PATTERN = /^([+\-\u2212]?)\s*(\d*)(?:[.,](\d{1,2}))?\s*(?:€)?$/;

const EURO_GROUPING = new Intl.NumberFormat('de-DE', {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * Wandelt eine Eingabe wie „0,80“, „0.8“, „12“, „-2,5“ oder „3,00 €“ in Cent um.
 * Komma und Punkt gelten beide als Dezimaltrennzeichen, Tausendertrennzeichen
 * sind nicht erlaubt. Die Umrechnung arbeitet nur mit ganzen Zahlen und ist
 * damit frei von Rundungsfehlern.
 *
 * @returns den Betrag in Cent oder `null` bei leerer oder ungültiger Eingabe
 *   (z. B. mehr als zwei Nachkommastellen)
 */
export function parseAmount(input: string): Cents | null {
  const match = AMOUNT_PATTERN.exec(input.trim());
  if (!match) {
    return null;
  }
  const [, sign, euroDigits, centDigits] = match;
  if (euroDigits === '' && centDigits === undefined) {
    return null;
  }
  const euros = euroDigits === '' ? 0 : Number(euroDigits);
  const cents = centDigits === undefined ? 0 : Number(centDigits.padEnd(2, '0'));
  const amount = euros * 100 + cents;
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return (sign === '-' || sign === MINUS) && amount !== 0 ? -amount : amount;
}

/**
 * Formatiert einen Betrag für die Anzeige in `de-DE`, z. B. „−2,60 €“ oder
 * „1.234,50 €“. Negative Beträge bekommen ein typografisches Minus, positive
 * kein Vorzeichen.
 */
export function formatAmount(amount: Cents): string {
  return (amount < 0 ? MINUS : '') + formatAbsolute(amount);
}

/**
 * Wie {@link formatAmount}, aber positive Beträge bekommen ein „+“, z. B. für
 * Gutschriften im Verlauf (F-07, F-08). 0,00 € bleibt ohne Vorzeichen.
 */
export function formatSignedAmount(amount: Cents): string {
  if (amount > 0) {
    return '+' + formatAbsolute(amount);
  }
  return formatAmount(amount);
}

/**
 * Formatiert einen Betrag für ein Eingabefeld, z. B. „12,50“ (ohne
 * Währungszeichen und ohne Tausendertrennzeichen), passend zu {@link parseAmount}.
 */
export function formatAmountForInput(amount: Cents): string {
  const absolute = Math.abs(amount);
  const euros = Math.trunc(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  return `${amount < 0 ? '-' : ''}${euros},${cents}`;
}

function formatAbsolute(amount: Cents): string {
  const absolute = Math.abs(amount);
  const euros = Math.trunc(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  return `${EURO_GROUPING.format(euros)},${cents}${NBSP}€`;
}
