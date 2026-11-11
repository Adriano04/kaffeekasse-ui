import { Component, input } from '@angular/core';

import { DisplayAmount } from '../core/model/display';
import { StatusClassPipe } from './status-class.pipe';

/**
 * Betragsanzeige nach F-08: Vorzeichen und Farbe aus dem ViewModel, Ziffern
 * gleich breit. Stornierte Beträge werden durchgestrichen und ohne Farbe
 * angezeigt.
 */
@Component({
  selector: 'app-amount-display',
  imports: [StatusClassPipe],
  template: `
    @if (struck()) {
      <!-- Ohne Statusfarbe, damit ein gedimmter Eintrag (z. B. storniert) auch gedimmt aussieht. -->
      <s class="amount">{{ amount().text }}</s>
    } @else {
      <span class="amount" [class]="amount().tone | statusClass: 'amount'">{{
        amount().text
      }}</span>
    }
  `,
  styles: `
    .amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .amount--ok {
      color: var(--rs-green);
    }

    .amount--crit {
      color: var(--rs-red);
    }

    .amount--warn {
      color: var(--rs-yellow);
    }
  `,
})
export class AmountDisplay {
  /** Anzeigefertiger Betrag mit Tonalität. */
  readonly amount = input.required<DisplayAmount>();

  /** Durchgestrichen, z. B. bei stornierten Buchungen. */
  readonly struck = input(false);
}
