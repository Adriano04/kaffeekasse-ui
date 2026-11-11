import { Injectable, inject } from '@angular/core';

import { CoffeeFundRepository } from '../data/coffee-fund.repository';
import { DataVersion } from '../data/data-version';
import {
  MoveDirection,
  NewPerson,
  NewProduct,
  PersonUpdate,
  PersonWithBalance,
} from '../model/api';
import { IsoDate } from '../model/date';
import { Product } from '../model/domain';
import { Cents } from '../model/money';
import { Result } from '../model/result';
import { SessionService } from '../session/session.service';
import { Query, createQuery, runCommand } from './query';

/**
 * Stammdaten der Verwaltung: Personen und Artikel und ihre Pflege (F-09,
 * F-10, F-35). Die Abfragen laden nur mit Rolle Verwaltung.
 */
@Injectable({ providedIn: 'root' })
export class MasterDataFacade {
  private readonly repository = inject(CoffeeFundRepository);
  private readonly session = inject(SessionService);
  private readonly dataVersion = inject(DataVersion);
  private readonly adminKey = () =>
    this.session.isAdmin() ? this.session.currentPerson()?.id : undefined;

  /** Alle Personen mit Kontostand, inklusive inaktiver (F-09). */
  readonly people: Query<readonly PersonWithBalance[]> = createQuery({
    key: this.adminKey,
    load: () => this.repository.people(),
  });

  /** Alle Artikel mit Preisverlauf, inklusive inaktiver (F-10). */
  readonly products: Query<readonly Product[]> = createQuery({
    key: this.adminKey,
    load: () => this.repository.products(),
  });

  /** Legt eine Person an (F-09). */
  createPerson(input: NewPerson): Promise<Result<PersonWithBalance>> {
    return runCommand(this.dataVersion, () => this.repository.createPerson(input));
  }

  /** Ändert Anzeigename und E-Mail (F-09). */
  updatePerson(personId: string, input: PersonUpdate): Promise<Result<PersonWithBalance>> {
    return runCommand(this.dataVersion, () => this.repository.updatePerson(personId, input));
  }

  /** Deaktiviert eine Person (F-09). */
  deactivatePerson(personId: string): Promise<Result<PersonWithBalance>> {
    return runCommand(this.dataVersion, () => this.repository.deactivatePerson(personId));
  }

  /** Reaktiviert eine Person (F-09). */
  reactivatePerson(personId: string): Promise<Result<PersonWithBalance>> {
    return runCommand(this.dataVersion, () => this.repository.reactivatePerson(personId));
  }

  /** Vergibt oder entzieht die Rolle Verwaltung (F-09, F-35). */
  setAdminRole(personId: string, granted: boolean): Promise<Result<PersonWithBalance>> {
    return runCommand(this.dataVersion, () => this.repository.setAdminRole(personId, granted));
  }

  /** Legt einen Artikel an (F-10). */
  createProduct(input: NewProduct): Promise<Result<Product>> {
    return runCommand(this.dataVersion, () => this.repository.createProduct(input));
  }

  /** Setzt einen neuen Preis ab einem Datum (F-10). */
  changePrice(productId: string, amount: Cents, validFrom: IsoDate): Promise<Result<Product>> {
    return runCommand(this.dataVersion, () =>
      this.repository.changePrice(productId, amount, validFrom),
    );
  }

  /** Verschiebt einen Artikel in der Sortierung (F-10). */
  moveProduct(productId: string, direction: MoveDirection): Promise<Result<void>> {
    return runCommand(this.dataVersion, () => this.repository.moveProduct(productId, direction));
  }

  /** Aktiviert oder deaktiviert einen Artikel (F-10). */
  setProductActive(productId: string, active: boolean): Promise<Result<Product>> {
    return runCommand(this.dataVersion, () => this.repository.setProductActive(productId, active));
  }
}
