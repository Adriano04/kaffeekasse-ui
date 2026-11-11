import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { SessionService } from './session.service';

/**
 * Lässt die Verwaltung nur mit Rolle Verwaltung laden (F-35), sonst geht es
 * zur Buchungsseite. Reine Bedienführung: Verbindlich prüft das Backend
 * (NF-07).
 */
export const adminGuard: CanMatchFn = () =>
  inject(SessionService).isAdmin() || inject(Router).createUrlTree(['/book']);
