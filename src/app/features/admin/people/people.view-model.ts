import { Injectable, computed, inject, signal } from '@angular/core';
import { FieldTree, TreeValidationResult, form, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { RsToastService } from 'custom-components';

import { AccountFacade } from '../../../core/facades/account.facade';
import { MasterDataFacade } from '../../../core/facades/master-data.facade';
import { PersonWithBalance } from '../../../core/model/api';
import { DisplayAmount, balanceDisplay } from '../../../core/model/display';
import { errorMessage } from '../../../core/model/error-messages';
import { formatAmount } from '../../../core/model/money';
import { Result } from '../../../core/model/result';
import { failureToFormErrors, optionalEmail, requiredText } from '../form-rules';

/** Zeile der Personenliste (F-09). */
export interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly balance: DisplayAmount;
  readonly active: boolean;
  readonly statusLabel: string;
  readonly isAdmin: boolean;
  /** Grund, warum Deaktivieren gesperrt ist, sonst `null` (F-35). */
  readonly deactivateBlocker: string | null;
  /** Grund, warum die Rolle Verwaltung nicht entzogen werden kann, sonst `null` (F-35). */
  readonly revokeBlocker: string | null;
  /** „Rolle vergeben“ anbieten (aktive Person ohne Rolle). */
  readonly canGrantAdmin: boolean;
}

/** Inhalt des Bestätigungsdialogs zum Deaktivieren (F-09). */
export interface DeactivationView {
  readonly personId: string;
  readonly name: string;
  /** Hinweis auf die Schlussabrechnung bei Saldo ≠ 0, sonst `null`. */
  readonly settlement: { readonly message: string; readonly offerPayout: boolean } | null;
}

interface CreatePersonModel {
  displayName: string;
  username: string;
  email: string;
}

interface EditPersonModel {
  displayName: string;
  email: string;
}

const EMPTY_PERSON: CreatePersonModel = { displayName: '', username: '', email: '' };

/**
 * ViewModel der Personenverwaltung (F-09, F-35): anlegen, bearbeiten,
 * deaktivieren mit Hinweis auf die Schlussabrechnung, reaktivieren, Rolle
 * Verwaltung vergeben und entziehen.
 */
@Injectable()
export class PeopleViewModel {
  private readonly masterData = inject(MasterDataFacade);
  private readonly account = inject(AccountFacade);
  private readonly toasts = inject(RsToastService);
  private readonly router = inject(Router);

  private readonly createModel = signal<CreatePersonModel>({ ...EMPTY_PERSON });
  private readonly editModel = signal<EditPersonModel>({ displayName: '', email: '' });
  private readonly editingId = signal<string | null>(null);
  private readonly deactivatingId = signal<string | null>(null);
  private readonly busy = signal(false);

  /** Formular „Person anlegen“: Anzeigename und Benutzername Pflicht, E-Mail optional. */
  readonly createForm = form(
    this.createModel,
    (person) => {
      requiredText(person.displayName, 'Bitte gib einen Anzeigenamen ein.');
      requiredText(person.username, 'Bitte gib einen Benutzernamen ein.');
      optionalEmail(person.email);
    },
    { submission: { action: (fields) => this.create(fields) } },
  );

  /** Formular „Person bearbeiten“: Anzeigename und E-Mail. */
  readonly editForm = form(
    this.editModel,
    (person) => {
      requiredText(person.displayName, 'Bitte gib einen Anzeigenamen ein.');
      optionalEmail(person.email);
    },
    { submission: { action: (fields) => this.saveEdit(fields) } },
  );

  /** Personen, inklusive inaktiver, mit Kontostand (F-08). */
  readonly rows = computed<readonly PersonRow[]>(() => {
    const people = this.masterData.people.value() ?? [];
    const activeAdmins = people.filter((p) => p.active && p.roles.includes('ADMIN')).length;
    const selfId = this.account.currentPerson()?.id;
    return people.map((person) => this.toRow(person, person.id === selfId, activeAdmins));
  });

  /** Die Liste wird zum ersten Mal geladen. */
  readonly loading = computed(
    () => this.masterData.people.loading() && this.masterData.people.value() === undefined,
  );

  /** Meldung, wenn die Personen nicht geladen werden konnten. */
  readonly loadError = computed(() => {
    const failure = this.masterData.people.error();
    return failure ? errorMessage(failure) : null;
  });

  /** Überschrift der Liste, mit Anzahl, sobald geladen. */
  readonly listTitle = computed(() =>
    this.loading() ? 'Alle Personen' : `Alle Personen (${this.rows().length})`,
  );

  /** Name der Person, die gerade bearbeitet wird; `null` = Dialog geschlossen. */
  readonly editing = computed(() => {
    const id = this.editingId();
    return id === null ? null : (this.rows().find((row) => row.id === id)?.name ?? null);
  });

  /** Inhalt des Dialogs zum Deaktivieren; `null` = Dialog geschlossen. */
  readonly deactivation = computed<DeactivationView | null>(() => {
    const id = this.deactivatingId();
    const person = (this.masterData.people.value() ?? []).find((p) => p.id === id);
    return person ? this.toDeactivation(person) : null;
  });

  /** Ein Befehl aus der Liste läuft gerade. */
  readonly pending = this.busy.asReadonly();

  /** Legt die Person aus dem Formular an. */
  submitCreate(): Promise<boolean> {
    return submit(this.createForm);
  }

  /** Öffnet den Dialog „Bearbeiten“ mit den Daten der Person. */
  startEdit(personId: string): void {
    const person = (this.masterData.people.value() ?? []).find((p) => p.id === personId);
    if (!person) {
      return;
    }
    this.editForm().reset({ displayName: person.displayName, email: person.email ?? '' });
    this.editingId.set(personId);
  }

  /** Speichert die Änderungen aus dem Dialog „Bearbeiten“. */
  submitEdit(): Promise<boolean> {
    return submit(this.editForm);
  }

  /** Schließt den Dialog „Bearbeiten“ ohne zu speichern. */
  cancelEdit(): void {
    this.editingId.set(null);
  }

  /** Öffnet den Bestätigungsdialog zum Deaktivieren. */
  askDeactivate(personId: string): void {
    this.deactivatingId.set(personId);
  }

  /** Schließt den Bestätigungsdialog ohne zu deaktivieren. */
  cancelDeactivate(): void {
    this.deactivatingId.set(null);
  }

  /** Deaktiviert die Person aus dem Bestätigungsdialog (F-09). */
  async confirmDeactivate(): Promise<void> {
    const dialog = this.deactivation();
    if (!dialog) {
      return;
    }
    this.deactivatingId.set(null);
    await this.run(
      this.masterData.deactivatePerson(dialog.personId),
      (p) => `${p.displayName} deaktiviert`,
    );
  }

  /** Schlussabrechnung: zur Auszahlung des Guthabens in „Buchungen“ (F-09, F-28). */
  async goToPayout(): Promise<void> {
    const dialog = this.deactivation();
    this.deactivatingId.set(null);
    if (dialog) {
      await this.router.navigate(['/admin/bookings'], { queryParams: { payout: dialog.personId } });
    }
  }

  /** Reaktiviert eine Person (F-09). */
  reactivate(personId: string): Promise<void> {
    return this.run(
      this.masterData.reactivatePerson(personId),
      (p) => `${p.displayName} reaktiviert`,
    );
  }

  /** Vergibt oder entzieht die Rolle Verwaltung (F-09, F-35). */
  setAdminRole(personId: string, granted: boolean): Promise<void> {
    return this.run(this.masterData.setAdminRole(personId, granted), (p) =>
      granted
        ? `${p.displayName} hat jetzt die Rolle Verwaltung`
        : `${p.displayName} hat die Rolle Verwaltung nicht mehr`,
    );
  }

  private async create(fields: FieldTree<CreatePersonModel>): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.masterData.createPerson({
      displayName: value.displayName,
      username: value.username,
      email: value.email.trim() || null,
    });
    if (!result.ok) {
      return failureToFormErrors(
        result.failure,
        { displayName: fields.displayName, username: fields.username, email: fields.email },
        this.toasts,
      );
    }
    this.toasts.show({ message: `${result.value.displayName} angelegt`, variant: 'ok' });
    fields().reset({ ...EMPTY_PERSON });
    return undefined;
  }

  private async saveEdit(fields: FieldTree<EditPersonModel>): Promise<TreeValidationResult> {
    const id = this.editingId();
    if (id === null) {
      return undefined;
    }
    const value = fields().value();
    const result = await this.masterData.updatePerson(id, {
      displayName: value.displayName,
      email: value.email.trim() || null,
    });
    if (!result.ok) {
      return failureToFormErrors(
        result.failure,
        { displayName: fields.displayName, email: fields.email },
        this.toasts,
      );
    }
    this.editingId.set(null);
    this.toasts.show({ message: `${result.value.displayName} gespeichert`, variant: 'ok' });
    return undefined;
  }

  /** Führt einen Befehl aus der Liste aus und meldet das Ergebnis als Toast. */
  private async run(
    command: Promise<Result<PersonWithBalance>>,
    success: (person: PersonWithBalance) => string,
  ): Promise<void> {
    this.busy.set(true);
    const result = await command;
    this.busy.set(false);
    if (result.ok) {
      this.toasts.show({ message: success(result.value), variant: 'ok' });
    } else {
      this.toasts.show({ message: errorMessage(result.failure), variant: 'crit' });
    }
  }

  private toRow(person: PersonWithBalance, isSelf: boolean, activeAdmins: number): PersonRow {
    const isAdmin = person.roles.includes('ADMIN');
    const lastAdmin = person.active && isAdmin && activeAdmins <= 1;
    const blocker = lastAdmin
      ? 'Letztes aktives Verwaltungskonto'
      : isSelf
        ? 'Eigenes Konto – das macht die Vertretung'
        : null;
    return {
      id: person.id,
      name: person.displayName,
      username: person.username,
      email: person.email ?? '',
      balance: balanceDisplay(person.balance),
      active: person.active,
      statusLabel: person.active ? 'aktiv' : 'inaktiv',
      isAdmin,
      deactivateBlocker: person.active ? blocker : null,
      revokeBlocker: isAdmin ? blocker : null,
      canGrantAdmin: person.active && !isAdmin,
    };
  }

  private toDeactivation(person: PersonWithBalance): DeactivationView {
    const name = person.displayName;
    let settlement: DeactivationView['settlement'] = null;
    if (person.balance > 0) {
      settlement = {
        message: `${name} hat noch ${formatAmount(person.balance)} Guthaben. Zahle es vor dem Deaktivieren aus (Schlussabrechnung).`,
        offerPayout: true,
      };
    } else if (person.balance < 0) {
      settlement = {
        message: `${name} hat noch ${formatAmount(-person.balance)} offen. Lass den Betrag vor dem Deaktivieren begleichen; inaktive Personen zählen weiter zu den offenen Forderungen.`,
        offerPayout: false,
      };
    }
    return { personId: person.id, name, settlement };
  }
}
