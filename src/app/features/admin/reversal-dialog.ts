import { Component, input } from '@angular/core';
import { FormField, FormRoot } from '@angular/forms/signals';
import { RsModal } from 'custom-components';

import { LabeledField } from '../../shared/labeled-field';
import { ReversalDialogModel } from './reversal-dialog.view-model';

/** Storno-Dialog der Verwaltung mit Pflicht-Begründung (F-27). */
@Component({
  selector: 'app-reversal-dialog',
  imports: [FormField, FormRoot, RsModal, LabeledField],
  template: `
    <rs-modal
      [open]="dialog().summary() !== null"
      (openChange)="dialog().cancel()"
      title="Buchung stornieren"
      variant="crit"
    >
      <form class="rs-modal__body reversal-dialog" [formRoot]="dialog().form">
        <p>{{ dialog().summary() }}</p>
        <p class="reversal-dialog__note">
          Es entsteht eine Gegenbuchung; die ursprüngliche Buchung bleibt sichtbar und wird als
          „storniert“ markiert.
        </p>
        <app-labeled-field
          [fieldId]="fieldId()"
          label="Begründung"
          [state]="dialog().form.reason()"
        >
          <input
            class="rs-input"
            [id]="fieldId()"
            [attr.aria-describedby]="fieldId() + '-hint'"
            [formField]="dialog().form.reason"
          />
        </app-labeled-field>
        <div class="rs-modal__actions">
          <button
            type="button"
            class="rs-btn rs-btn--outline rs-btn--grey"
            (click)="dialog().cancel()"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            class="rs-btn rs-btn--filled rs-btn--red"
            [disabled]="dialog().form().submitting()"
          >
            Stornieren
          </button>
        </div>
      </form>
    </rs-modal>
  `,
  styles: `
    .reversal-dialog {
      display: flex;
      flex-direction: column;
      gap: var(--rs-space-3);
    }

    .reversal-dialog__note {
      margin: 0;
      font-size: 0.8rem;
      color: var(--rs-text-dim);
    }
  `,
})
export class ReversalDialog {
  /** Zustand des Dialogs aus dem ViewModel der Seite. */
  readonly dialog = input.required<ReversalDialogModel>();

  /** Eindeutige `id` des Eingabefelds, falls mehrere Dialoge auf einer Seite stehen. */
  readonly fieldId = input('reversal-reason');
}
