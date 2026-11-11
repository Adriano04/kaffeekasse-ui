import { Component, effect, inject, untracked, viewChild } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import { RsCellDef, RsDatepicker, RsFilterDef, RsTable, RsTableColumn } from 'custom-components';

import { AmountDisplay } from '../../../shared/amount-display';
import { LabeledField } from '../../../shared/labeled-field';
import { StatusClassPipe } from '../../../shared/status-class.pipe';
import { BookingRowView } from '../booking-rows';
import { ReversalDialog } from '../reversal-dialog';
import { CashViewModel } from './cash.view-model';

/** Verwaltung › Kasse (F-14, F-15, F-27, F-37, I-04). */
@Component({
  selector: 'app-cash-page',
  imports: [
    FormField,
    FormRoot,
    RsTable,
    RsTableColumn,
    RsCellDef,
    RsFilterDef,
    RsDatepicker,
    AmountDisplay,
    LabeledField,
    StatusClassPipe,
    ReversalDialog,
  ],
  templateUrl: './cash-page.html',
  styleUrl: '../admin-page.scss',
  providers: [CashViewModel],
})
export class CashPage {
  protected readonly vm = inject(CashViewModel);
  private readonly cashBook = viewChild(RsTable);

  /** Stornierte Buchungen gedimmt; „storniert“ steht zusätzlich als Badge in der Zeile. */
  protected readonly rowClass = (row: BookingRowView) =>
    row.reversed ? 'rs-table__row--muted' : null;

  constructor() {
    // Brücke zur imperativen API von RsTable, wie in Verwaltung › Buchungen.
    let firstRun = true;
    effect(() => {
      this.vm.version();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => this.cashBook()?.reload());
    });
  }
}
