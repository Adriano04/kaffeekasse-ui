import { Injectable, computed, inject, signal } from '@angular/core';

import { DataVersion } from '../core/data/data-version';
import { SessionPerson, SessionService } from '../core/session/session.service';
import { PrototypeDatabase } from './prototype-database';

/**
 * Simulierte Anmeldung des Prototyps. Ersetzt später Keycloak; die
 * Personenauswahl in der Kopfzeile wechselt die angemeldete Person.
 */
@Injectable()
export class MockSessionService extends SessionService {
  private readonly database = inject(PrototypeDatabase);
  private readonly dataVersion = inject(DataVersion);
  private readonly personId = signal<string | null>(this.database.initialPersonId);

  /**
   * Angemeldete Person aus dem Datenbestand. Hängt am Datenstand, damit eine
   * Änderung von Name oder Rolle sofort sichtbar ist. Deaktivierte Personen
   * gelten als abgemeldet.
   */
  override readonly currentPerson = computed<SessionPerson | null>(
    () => {
      this.dataVersion.version();
      const id = this.personId();
      const person = id === null ? undefined : this.database.person(id);
      if (!person || !person.active) {
        return null;
      }
      return { id: person.id, displayName: person.displayName, roles: [...person.roles] };
    },
    { equal: samePerson },
  );

  override readonly isAdmin = computed(
    () => this.currentPerson()?.roles.includes('ADMIN') ?? false,
  );

  /** Meldet die Person mit dieser ID an (`null` = niemand angemeldet). Nur im Prototyp. */
  switchTo(personId: string | null): void {
    this.personId.set(personId);
  }
}

function samePerson(a: SessionPerson | null, b: SessionPerson | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.id === b.id &&
    a.displayName === b.displayName &&
    a.roles.length === b.roles.length &&
    a.roles.every((role) => b.roles.includes(role))
  );
}
