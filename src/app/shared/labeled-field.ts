import { Component, Signal, computed, input } from '@angular/core';

/** Was {@link LabeledField} vom Zustand eines Signal-Forms-Feldes braucht. */
export interface FieldStatus {
  readonly touched: Signal<boolean>;
  readonly errors: Signal<readonly { readonly message?: string }[]>;
}

/**
 * Formularfeld mit Beschriftung, Fehler-, Warn- oder Hinweistext (`.rs-field`).
 * Das Eingabeelement wird hineinprojiziert und braucht die `id` aus `fieldId`;
 * es verweist per `aria-describedby="<fieldId>-hint"` auf den Text darunter.
 *
 * Für Widgets ohne eigenes beschriftbares Element (z. B. `rs-datepicker`)
 * `group` setzen: Dann beschriftet die Hülle das Widget als Gruppe.
 */
@Component({
  selector: 'app-labeled-field',
  template: `
    <div
      class="rs-field"
      [class.rs-field--error]="showError()"
      [class.rs-field--warn]="showWarning()"
      [attr.role]="group() ? 'group' : null"
      [attr.aria-labelledby]="group() ? labelId() : null"
    >
      @if (group()) {
        <span class="rs-field__label" [id]="labelId()">{{ label() }}</span>
      } @else {
        <label class="rs-field__label" [id]="labelId()" [for]="fieldId()">{{ label() }}</label>
      }
      <ng-content />
      @if (message(); as text) {
        <span class="rs-field__hint" [id]="hintId()">{{ text }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class LabeledField {
  /** `id` des Eingabeelements; daraus entstehen die IDs von Beschriftung und Hinweis. */
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  /** Zustand des Signal-Forms-Feldes; Fehler erscheinen, sobald es berührt wurde. */
  readonly state = input<FieldStatus | null>(null);
  /** Warnung, die nicht blockiert (`.rs-field--warn`), z. B. Auszahlung über dem Guthaben. */
  readonly warning = input<string | null>(null);
  /** Dauerhafter Hinweis unter dem Feld. */
  readonly hint = input<string | null>(null);
  /** Beschriftet das Widget als Gruppe statt per `<label for>`. */
  readonly group = input(false);

  /** Erste Fehlermeldung, sobald das Feld berührt wurde. */
  protected readonly error = computed(() => {
    const state = this.state();
    if (!state || !state.touched()) {
      return null;
    }
    return state.errors()[0]?.message ?? null;
  });

  protected readonly showError = computed(() => this.error() !== null);
  protected readonly showWarning = computed(() => !this.showError() && this.warning() !== null);
  protected readonly message = computed(() => this.error() ?? this.warning() ?? this.hint());
  protected readonly labelId = computed(() => `${this.fieldId()}-label`);
  protected readonly hintId = computed(() => `${this.fieldId()}-hint`);
}
