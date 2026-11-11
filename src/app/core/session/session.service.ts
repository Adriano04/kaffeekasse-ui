import { Signal } from '@angular/core';

import { Role } from '../model/domain';

/** Angemeldete Person, wie sie die Anmeldung kennt (später aus dem Token von Keycloak). */
export interface SessionPerson {
  readonly id: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

/**
 * Anmeldung (Port, F-34, F-35). Im Prototyp simuliert (`MockSessionService`),
 * später über Keycloak. Genutzt nur von Facades, vom Repository und vom Guard
 * der Verwaltung.
 */
export abstract class SessionService {
  /** Angemeldete Person oder `null`, wenn niemand angemeldet ist. */
  abstract readonly currentPerson: Signal<SessionPerson | null>;

  /** Die angemeldete Person hat die Rolle Verwaltung. */
  abstract readonly isAdmin: Signal<boolean>;
}
