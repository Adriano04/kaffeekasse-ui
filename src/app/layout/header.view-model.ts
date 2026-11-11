import { Injectable, computed, inject } from '@angular/core';

import { environment } from '../../environments/environment';
import { AccountFacade } from '../core/facades/account.facade';
import { SettingsFacade } from '../core/facades/settings.facade';
import { ThemeService } from '../services/theme.service';

/** Eintrag der Hauptnavigation. */
export interface NavLink {
  readonly path: string;
  readonly label: string;
}

/** ViewModel der Kopfzeile: Titel, Hauptnavigation und Dark/Light-Umschalter. */
@Injectable()
export class HeaderViewModel {
  private readonly account = inject(AccountFacade);
  private readonly settings = inject(SettingsFacade);
  private readonly theme = inject(ThemeService);

  /** Name der Kaffeekasse aus den Einstellungen. */
  readonly title = computed(() => this.settings.settings.value()?.name ?? 'Kaffeekasse');

  /** Untertitel aus den Einstellungen, z. B. „Bürostüble“. */
  readonly subtitle = computed(() => this.settings.settings.value()?.subtitle ?? '');

  /** Hauptnavigation; „Verwaltung“ nur mit Rolle Verwaltung (F-35). */
  readonly links = computed<readonly NavLink[]>(() => [
    { path: '/book', label: 'Buchen' },
    { path: '/account', label: 'Mein Konto' },
    ...(this.account.isAdmin() ? [{ path: '/admin', label: 'Verwaltung' }] : []),
  ]);

  /** Personenauswahl des Prototyps anzeigen. */
  readonly showPersonSwitcher = environment.prototype;

  /** Die helle Darstellung ist aktiv. */
  readonly lightMode = this.theme.lightMode;

  /** Beschriftung des Umschalters: die Darstellung, zu der er wechselt. */
  readonly themeToggle = computed(() =>
    this.lightMode()
      ? { icon: '☾', label: 'Dunkel', ariaLabel: 'Zur dunklen Darstellung wechseln' }
      : { icon: '☀', label: 'Hell', ariaLabel: 'Zur hellen Darstellung wechseln' },
  );

  /** Wechselt zwischen dunkler und heller Darstellung. */
  toggleTheme(): void {
    this.theme.toggleTheme();
  }
}
