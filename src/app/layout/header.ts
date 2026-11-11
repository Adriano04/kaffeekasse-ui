import { Component, DOCUMENT, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { PersonSwitcher } from '../prototype/person-switcher';
import { HeaderViewModel } from './header.view-model';

/** Kopfzeile der Anwendung mit Hauptnavigation und, im Prototyp, der Personenauswahl. */
@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, PersonSwitcher],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  providers: [HeaderViewModel],
})
export class Header {
  protected readonly vm = inject(HeaderViewModel);
  private readonly document = inject(DOCUMENT);

  /**
   * Sprunglink zum Inhalt. Ein reiner Fragment-Link würde wegen
   * `<base href="/">` zur Startseite navigieren, deshalb wird der Fokus
   * direkt gesetzt.
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('content')?.focus();
  }
}
