import { Injectable, inject } from '@angular/core';

import { CoffeeFundRepository } from '../data/coffee-fund.repository';
import { DataVersion } from '../data/data-version';
import { PaymentInfo, Settings } from '../model/domain';
import { Result } from '../model/result';
import { SessionService } from '../session/session.service';
import { Query, createQuery, runCommand } from './query';

/**
 * Einstellungen der Kaffeekasse: Name, Zahlungsinformationen, Schwellen und
 * Storno-Frist. Lesen dürfen alle Angemeldeten, ändern nur die Verwaltung.
 */
@Injectable({ providedIn: 'root' })
export class SettingsFacade {
  private readonly repository = inject(CoffeeFundRepository);
  private readonly session = inject(SessionService);
  private readonly dataVersion = inject(DataVersion);

  /** Aktuelle Einstellungen. */
  readonly settings: Query<Settings> = createQuery({
    key: () => this.session.currentPerson()?.id,
    load: () => this.repository.settings(),
  });

  /** Ändert die Zahlungsinformationen; sie wirken sofort in „Mein Konto“ (F-37). */
  updatePaymentInfo(paymentInfo: PaymentInfo): Promise<Result<Settings>> {
    return runCommand(this.dataVersion, () => this.repository.updatePaymentInfo(paymentInfo));
  }
}
