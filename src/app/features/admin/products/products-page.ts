import { Component, inject } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import { RsCellDef, RsDatepicker, RsModal, RsTable, RsTableColumn } from 'custom-components';

import { LabeledField } from '../../../shared/labeled-field';
import { ProductRow, ProductsViewModel } from './products.view-model';

/** Verwaltung › Artikel (F-10). */
@Component({
  selector: 'app-products-page',
  imports: [
    FormField,
    FormRoot,
    RsTable,
    RsTableColumn,
    RsCellDef,
    RsModal,
    RsDatepicker,
    LabeledField,
  ],
  templateUrl: './products-page.html',
  styleUrl: '../admin-page.scss',
  providers: [ProductsViewModel],
})
export class ProductsPage {
  protected readonly vm = inject(ProductsViewModel);

  /** Gedimmte Zeilen für inaktive Artikel; „inaktiv“ steht zusätzlich als Text in der Zeile. */
  protected readonly rowClass = (row: ProductRow) => (row.active ? null : 'rs-table__row--muted');
}
