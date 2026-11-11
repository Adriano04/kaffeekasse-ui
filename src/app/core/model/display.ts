import { Cents, formatAmount, formatSignedAmount } from './money';

/**
 * Tonalität einer Anzeige. Die View bildet sie 1:1 auf die Status-Modifier
 * von custom-components ab (`positive` → `--ok`, `negative` → `--crit`,
 * `neutral` → `--neutral`, `warning` → `--warn`).
 */
export type Tone = 'positive' | 'negative' | 'neutral' | 'warning';

/** Anzeigefertiger Betrag mit Vorzeichen und Tonalität (F-08). */
export interface DisplayAmount {
  /** Betrag mit Vorzeichen, z. B. „−7,30 €“ oder „+10,40 €“. */
  readonly text: string;
  readonly tone: Tone;
}

/** Anzeigefertiger Kontostand. */
export interface BalanceDisplay extends DisplayAmount {
  /** Bedeutung als Text, damit sie nicht nur an der Farbe hängt (NF-03). */
  readonly hint: string;
}

/**
 * Betrag einer Buchung nach F-08: Belastungen mit „−“ und negativ,
 * Gutschriften mit „+“ und positiv, 0,00 € neutral.
 */
export function displayAmount(amount: Cents): DisplayAmount {
  if (amount < 0) {
    return { text: formatAmount(amount), tone: 'negative' };
  }
  if (amount > 0) {
    return { text: formatSignedAmount(amount), tone: 'positive' };
  }
  return { text: formatAmount(0), tone: 'neutral' };
}

/**
 * Darstellung eines Kontostands nach F-08: negativ rot mit „−“ und „offen“,
 * positiv grün mit „+“ und „Guthaben“, genau 0,00 € neutral.
 */
export function balanceDisplay(balance: Cents): BalanceDisplay {
  const hint = balance < 0 ? 'offen' : balance > 0 ? 'Guthaben' : 'ausgeglichen';
  return { ...displayAmount(balance), hint };
}
