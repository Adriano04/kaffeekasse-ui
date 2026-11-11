import { Component, inject } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import { RsCellDef, RsModal, RsTable, RsTableColumn } from 'custom-components';

import { AmountDisplay } from '../../../shared/amount-display';
import { LabeledField } from '../../../shared/labeled-field';
import { PeopleViewModel, PersonRow } from './people.view-model';

/** Verwaltung › Personen (F-09, F-35). */
@Component({
  selector: 'app-people-page',
  imports: [
    FormField,
    FormRoot,
    RsTable,
    RsTableColumn,
    RsCellDef,
    RsModal,
    AmountDisplay,
    LabeledField,
  ],
  templateUrl: './people-page.html',
  styleUrl: '../admin-page.scss',
  providers: [PeopleViewModel],
})
export class PeoplePage {
  protected readonly vm = inject(PeopleViewModel);

  /** Gedimmte Zeilen für inaktive Personen; „inaktiv“ steht zusätzlich als Text in der Zeile. */
  protected readonly rowClass = (row: PersonRow) => (row.active ? null : 'rs-table__row--muted');
}
