import { Injectable, inject } from '@angular/core';

import { CoffeeFundRepository } from '../data/coffee-fund.repository';
import { Metrics } from '../model/api';
import { SessionService } from '../session/session.service';
import { Query, createQuery } from './query';

/** Kennzahlen der Statistik: offene Forderungen, Guthaben, Kassenbestand (F-17 bis F-19). */
@Injectable({ providedIn: 'root' })
export class MetricsFacade {
  private readonly repository = inject(CoffeeFundRepository);
  private readonly session = inject(SessionService);

  /** Stichtagswerte; lädt nur mit Rolle Verwaltung. */
  readonly metrics: Query<Metrics> = createQuery({
    key: () => (this.session.isAdmin() ? this.session.currentPerson()?.id : undefined),
    load: () => this.repository.metrics(),
  });
}
