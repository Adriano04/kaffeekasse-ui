import { computed, inject, signal } from '@angular/core';
import { FieldTree, TreeValidationResult, form, submit } from '@angular/forms/signals';
import { RsToastService } from 'custom-components';

import { JournalFacade } from '../../core/facades/journal.facade';
import { failureToFormErrors, requiredText } from './form-rules';

/** Buchung, die storniert werden soll. */
export interface ReversalTarget {
  readonly bookingId: string;
  /** Kurzbeschreibung, z. B. „Ausgabe · 249,00 € · 09.09.26“. */
  readonly summary: string;
}

interface ReversalModel {
  reason: string;
}

/**
 * Zustand des Storno-Dialogs der Verwaltung mit Pflicht-Begründung (F-27).
 * Teil der ViewModels von Buchungen und Kasse; muss im Injection Context
 * erzeugt werden (Feld-Initialisierer des ViewModels).
 */
export class ReversalDialogModel {
  private readonly journal = inject(JournalFacade);
  private readonly toasts = inject(RsToastService);
  private readonly target = signal<ReversalTarget | null>(null);
  private readonly model = signal<ReversalModel>({ reason: '' });

  /** Formular mit der Begründung. */
  readonly form = form(
    this.model,
    (reversal) => requiredText(reversal.reason, 'Bitte gib eine Begründung an.'),
    { submission: { action: (fields) => this.reverse(fields) } },
  );

  /** Kurzbeschreibung der Buchung; `null` = Dialog geschlossen. */
  readonly summary = computed(() => this.target()?.summary ?? null);

  /** Öffnet den Dialog für eine Buchung. */
  ask(target: ReversalTarget): void {
    this.form().reset({ reason: '' });
    this.target.set(target);
  }

  /** Storniert mit der eingegebenen Begründung. */
  confirm(): Promise<boolean> {
    return submit(this.form);
  }

  /** Schließt den Dialog ohne zu stornieren. */
  cancel(): void {
    this.target.set(null);
  }

  private async reverse(fields: FieldTree<ReversalModel>): Promise<TreeValidationResult> {
    const target = this.target();
    if (!target) {
      return undefined;
    }
    const result = await this.journal.reverseBooking(target.bookingId, fields().value().reason);
    if (!result.ok) {
      return failureToFormErrors(result.failure, { reason: fields.reason }, this.toasts);
    }
    this.target.set(null);
    this.toasts.show({ message: `Storniert: ${target.summary}`, variant: 'ok' });
    return undefined;
  }
}
