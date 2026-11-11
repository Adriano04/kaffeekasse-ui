import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RsToastService } from 'custom-components';

import { DataVersion } from '../core/data/data-version';
import { SessionPerson } from '../core/session/session.service';
import { InMemoryCoffeeFundRepository } from './in-memory-coffee-fund.repository';
import { MockSessionService } from './mock-session.service';

/** Eintrag der Personenauswahl. */
export interface PersonOption {
  readonly id: string;
  /** Anzeigename, bei Rolle Verwaltung mit Zusatz „(Verwaltung)“. */
  readonly label: string;
  /** Die Person ist angemeldet. */
  readonly selected: boolean;
}

/**
 * ViewModel der Personenauswahl (nur Prototyp). Ersetzt die spätere
 * Anmeldeseite und liest die Personen deshalb direkt aus dem Fake-Backend,
 * nicht über eine Facade.
 */
@Injectable()
export class PersonSwitcherViewModel {
  private readonly repository = inject(InMemoryCoffeeFundRepository);
  private readonly session = inject(MockSessionService);
  private readonly dataVersion = inject(DataVersion);
  private readonly router = inject(Router);
  private readonly toasts = inject(RsToastService);

  /**
   * Zuletzt geladene Personen. Beim Neuladen nach einer Änderung bleibt die
   * bisherige Liste stehen, damit die Auswahl nicht springt.
   */
  private readonly people = signal<readonly SessionPerson[]>([]);

  /** Lädt die Personen beim Start und nach jeder Änderung neu (Datenstand). */
  private readonly loader = resource({
    params: () => ({ version: this.dataVersion.version() }),
    loader: async ({ abortSignal }) => {
      const people = await this.repository.selectablePeople();
      if (!abortSignal.aborted) {
        this.people.set(people);
      }
      return people;
    },
  });

  /** Niemand ist angemeldet (z. B. nach dem Deaktivieren der angemeldeten Person). */
  readonly nobodySelected = computed(() => this.session.currentPerson() === null);

  /** Alle aktiven Personen, die angemeldete markiert. */
  readonly options = computed<readonly PersonOption[]>(() => {
    const currentId = this.session.currentPerson()?.id;
    return this.people().map((person) => ({
      id: person.id,
      label: person.roles.includes('ADMIN')
        ? `${person.displayName} (Verwaltung)`
        : person.displayName,
      selected: person.id === currentId,
    }));
  });

  /**
   * Meldet eine andere Person an; alle Facades laden danach deren Daten.
   * Steht die Verwaltung offen und hat die Person die Rolle nicht, geht es zur
   * Buchungsseite. Offene Meldungen der vorherigen Person werden geschlossen,
   * damit z. B. „Rückgängig“ nicht für die falsche Person gilt.
   */
  async switchTo(personId: string): Promise<void> {
    this.session.switchTo(personId === '' ? null : personId);
    this.toasts.clear();
    if (!this.session.isAdmin() && this.router.url.startsWith('/admin')) {
      await this.router.navigateByUrl('/book');
    }
  }
}
