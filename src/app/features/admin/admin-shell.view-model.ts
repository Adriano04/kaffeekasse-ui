import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** Bereich der Verwaltung mit Kindroute und Beschriftung. */
export interface AdminSection {
  readonly path: string;
  readonly label: string;
}

/** Bereiche der Verwaltung in der Reihenfolge der Tabs. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { path: 'bookings', label: 'Buchungen' },
  { path: 'people', label: 'Personen' },
  { path: 'products', label: 'Artikel' },
  { path: 'cash', label: 'Kasse' },
  { path: 'statistics', label: 'Statistik' },
];

/** ViewModel der Verwaltung: Tabs, gekoppelt an die Kindrouten. */
@Injectable()
export class AdminShellViewModel {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Beschriftungen der Tabs. */
  readonly tabs = ADMIN_SECTIONS.map((section) => section.label);

  /** Index des aktiven Tabs, aus der URL. */
  readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const index = ADMIN_SECTIONS.findIndex((section) => path.startsWith(`/admin/${section.path}`));
    return Math.max(index, 0);
  });

  /** Wechselt den Bereich über die Route. */
  selectTab(index: number): void {
    const section = ADMIN_SECTIONS[index];
    if (section && index !== this.activeIndex()) {
      void this.router.navigate(['/admin', section.path]);
    }
  }
}
