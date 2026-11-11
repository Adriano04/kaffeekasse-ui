import { Component } from '@angular/core';

import { environment } from '../../environments/environment';

/** Fußzeile; im Prototyp mit dem Hinweis auf die Dummy-Daten (statt „Daten sind für alle sichtbar“, Z-03). */
@Component({
  selector: 'app-footer',
  template: `
    @if (prototype) {
      <footer class="app-footer">
        Prototyp mit Dummy-Daten – Änderungen gehen beim Neuladen verloren
      </footer>
    }
  `,
  styles: `
    .app-footer {
      padding: var(--rs-space-4);
      text-align: center;
      font-size: 0.75rem;
      color: var(--rs-text-dim);
    }
  `,
})
export class Footer {
  protected readonly prototype = environment.prototype;
}
