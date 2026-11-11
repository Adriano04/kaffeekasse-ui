import { Component, effect, inject, untracked, viewChild } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import {
  RsCellDef,
  RsDatepicker,
  RsFilterDef,
  RsTable,
  RsTableColumn,
  RsTabs,
} from 'custom-components';

import { AmountDisplay } from '../../../shared/amount-display';
import { LabeledField } from '../../../shared/labeled-field';
import { StatusClassPipe } from '../../../shared/status-class.pipe';
import { BookingRowView } from '../booking-rows';
import { ReversalDialog } from '../reversal-dialog';
import { BookingsViewModel } from './bookings.view-model';

/** Verwaltung › Buchungen (F-11 bis F-13, F-27, F-28). */
@Component({
  selector: 'app-bookings-page',
  imports: [
    FormField,
    FormRoot,
    RsTabs,
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
  templateUrl: './bookings-page.html',
  styleUrl: '../admin-page.scss',
  providers: [BookingsViewModel],
})
export class BookingsPage {
  protected readonly vm = inject(BookingsViewModel);
  private readonly history = viewChild(RsTable);

  /** Stornierte Buchungen gedimmt; „storniert“ steht zusätzlich als Badge in der Zeile. */
  protected readonly rowClass = (row: BookingRowView) =>
    row.reversed ? 'rs-table__row--muted' : null;

  constructor() {
    // Brücke zur imperativen API von RsTable: Im fetchData-Modus lädt die Tabelle nur über
    // reload() neu. Der erste Lauf entfällt, den ersten Ladevorgang macht die Tabelle selbst.
    let firstRun = true;
    effect(() => {
      this.vm.version();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => this.history()?.reload());
    });
  }
}
