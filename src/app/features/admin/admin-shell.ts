import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RsTabs } from 'custom-components';

import { AdminShellViewModel } from './admin-shell.view-model';

/** Verwaltung: Tab-Leiste über den Bereichen, gekoppelt an die Kindrouten. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RsTabs],
  providers: [AdminShellViewModel],
  template: `
    <h1 class="app-page-title">Verwaltung</h1>
    <nav class="admin-shell__tabs" aria-label="Bereiche der Verwaltung">
      <rs-tabs
        [items]="vm.tabs"
        [activeIndex]="vm.activeIndex()"
        (activeIndexChange)="vm.selectTab($event)"
      />
    </nav>
    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
    }

    // Auf schmalen Bildschirmen scrollen die Tabs waagerecht statt umzubrechen.
    .admin-shell__tabs {
      margin-block-end: var(--rs-space-4);
      overflow-x: auto;
    }
  `,
})
export class AdminShell {
  protected readonly vm = inject(AdminShellViewModel);
}
