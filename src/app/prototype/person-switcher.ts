import { Component, inject } from '@angular/core';

import { PersonSwitcherViewModel } from './person-switcher.view-model';

/**
 * Simulierte Anmeldung des Prototyps: wechselt die angemeldete Person. Steht
 * nur bei `environment.prototype` in der Kopfzeile und ist deutlich als
 * Prototyp-Funktion gekennzeichnet.
 */
@Component({
  selector: 'app-person-switcher',
  providers: [PersonSwitcherViewModel],
  template: `
    <label class="person-switcher__label" for="person-switcher">
      <span class="rs-badge rs-badge--warn">Prototyp</span>
      angemeldet als
    </label>
    <div class="rs-select-wrap">
      <select
        #select
        id="person-switcher"
        class="rs-select person-switcher__select"
        (change)="vm.switchTo(select.value)"
      >
        @if (vm.nobodySelected()) {
          <option value="" selected disabled>niemand</option>
        }
        @for (option of vm.options(); track option.id) {
          <!-- [selected] statt [value] am select: Die Optionen entstehen erst nach dem Binding. -->
          <option [value]="option.id" [selected]="option.selected">{{ option.label }}</option>
        }
      </select>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--rs-space-2) var(--rs-space-3);
      padding-block-start: var(--rs-space-2);
      border-top: 1px dashed var(--rs-yellow-dim);
      font-size: 0.8rem;
      color: var(--rs-text-dim);
    }

    .person-switcher__label {
      display: inline-flex;
      align-items: center;
      gap: var(--rs-space-2);
    }

    @media (pointer: coarse) {
      .person-switcher__select {
        min-height: 48px;
      }
    }
  `,
})
export class PersonSwitcher {
  protected readonly vm = inject(PersonSwitcherViewModel);
}
