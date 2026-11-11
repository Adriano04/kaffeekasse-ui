import { Injectable, computed, inject, signal } from '@angular/core';
import { RsToastService } from 'custom-components';

import { Clock } from '../../core/clock/clock';
import { AccountFacade } from '../../core/facades/account.facade';
import { SettingsFacade } from '../../core/facades/settings.facade';
import { AccountEntry } from '../../core/model/api';
import {
  IsoDate,
  addMonths,
  formatDate,
  formatDateTime,
  toBerlinDate,
} from '../../core/model/date';
import {
  BalanceDisplay,
  DisplayAmount,
  Tone,
  balanceDisplay,
  displayAmount,
} from '../../core/model/display';
import { errorMessage } from '../../core/model/error-messages';
import { BOOKING_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../../core/model/labels';
import { formatAmount } from '../../core/model/money';
import { isReminderDue, reversalWindowEnd, suggestPayment } from '../../core/model/rules';

/** Standardzeitraum des Verlaufs und Schrittweite von „Ältere laden“ (F-07). */
export const HISTORY_MONTHS = 3;

/** Zahlungshinweis bei offenem Saldo (F-06, F-37). */
export interface PaymentHint {
  /** Aktueller Kontostand, z. B. „−7,30 €“. */
  readonly balance: string;
  /** Vorgeschlagener Zahlbetrag, z. B. „10,00 €“. */
  readonly suggestedPayment: string;
  /** Was nach der Zahlung bleibt, z. B. „dann hast du 2,70 € Guthaben“. */
  readonly outcome: string;
}

/** Eintrag im Verlauf (F-07). */
export interface HistoryEntryView {
  readonly id: string;
  /** Art der Buchung bzw. Artikelname, als Badge angezeigt. */
  readonly label: string;
  readonly labelTone: Tone;
  /** Datum mit Uhrzeit; bei rückdatierten Buchungen nur das Buchungsdatum. */
  readonly date: string;
  /** Zusatzangaben wie Zahlungsweg und Notiz, bereits verbunden. */
  readonly details: string | null;
  readonly amount: DisplayAmount;
  /** „Stand danach“, z. B. „Stand −7,80 €“; `null` bei stornierten Buchungen. */
  readonly balanceAfter: string | null;
  /** Die Buchung wurde storniert (gedimmt, durchgestrichen, beschriftet). */
  readonly reversed: boolean;
  /** „Rückgängig“ wird angeboten (F-26). */
  readonly canUndo: boolean;
  /** Beschriftung der Schaltfläche „Rückgängig“ für Screenreader. */
  readonly undoLabel: string;
}

/** Zahlungsinformationen (F-37). */
export interface PaymentInfoView {
  readonly cashNote: string;
  readonly accountHolder: string;
  readonly iban: string;
  /** Verwendungszweck mit Personenkennung. */
  readonly paymentReference: string;
  readonly paypalLink: string;
}

/**
 * ViewModel von „Mein Konto“ (F-06 bis F-08, F-26, F-37): Kontostand,
 * Zahlungshinweis, Verlauf mit „Stand danach“ und Zahlungsinformationen.
 */
@Injectable()
export class AccountViewModel {
  private readonly account = inject(AccountFacade);
  private readonly settings = inject(SettingsFacade);
  private readonly toasts = inject(RsToastService);
  private readonly clock = inject(Clock);

  /** Beginn des Verlaufs; anfangs die letzten 3 Monate. */
  private readonly from = signal<IsoDate>(
    addMonths(toBerlinDate(this.clock.now()), -HISTORY_MONTHS),
  );
  private readonly history = this.account.history(this.from);
  private readonly undoing = signal(false);

  /** Es ist niemand angemeldet. */
  readonly signedOut = computed(() => this.account.currentPerson() === null);

  /** Kontostand (F-06, F-08); `null`, solange er lädt. */
  readonly balance = computed<BalanceDisplay | null>(() => {
    const account = this.account.account.value();
    return account ? balanceDisplay(account.balance) : null;
  });

  /** Hinweis mit Zahlbetrag ab der Erinnerungsschwelle (F-06, F-31, K-22), sonst `null`. */
  readonly paymentHint = computed<PaymentHint | null>(() => {
    const account = this.account.account.value();
    const settings = this.settings.settings.value();
    if (!account || !settings || !isReminderDue(account.balance, settings)) {
      return null;
    }
    const payment = suggestPayment(account.balance) ?? 0;
    const remaining = account.balance + payment;
    return {
      balance: formatAmount(account.balance),
      suggestedPayment: formatAmount(payment),
      outcome:
        remaining > 0
          ? `dann hast du ${formatAmount(remaining)} Guthaben`
          : 'dann ist dein Konto ausgeglichen',
    };
  });

  /** Verlauf, neueste Buchung zuerst (F-07). */
  readonly entries = computed<readonly HistoryEntryView[]>(() => {
    const entries = this.history.value()?.entries ?? [];
    const undoable = this.undoableId(entries);
    return entries.map((entry) => this.toView(entry, entry.id === undoable));
  });

  /** Beginn des angezeigten Zeitraums, z. B. „seit 13.07.26“. */
  readonly period = computed(() => `seit ${formatDate(this.from())}`);

  /** Es gibt ältere Buchungen („Ältere laden“). */
  readonly hasOlder = computed(() => this.history.value()?.hasOlder ?? false);

  /** Der Verlauf wird zum ersten Mal geladen. */
  readonly historyLoading = computed(
    () => this.history.loading() && this.history.value() === undefined,
  );

  /** Ältere Buchungen werden gerade nachgeladen. */
  readonly loadingOlder = computed(
    () => this.history.loading() && this.history.value() !== undefined,
  );

  /** Text der leeren Liste: lädt noch oder keine Buchungen im Zeitraum. */
  readonly emptyMessage = computed(() =>
    this.historyLoading() ? 'Verlauf wird geladen …' : 'Keine Buchungen in diesem Zeitraum.',
  );

  /** Beschriftung von „Ältere laden“, während des Nachladens „Wird geladen …“. */
  readonly loadOlderLabel = computed(() =>
    this.loadingOlder() ? 'Wird geladen …' : 'Ältere laden',
  );

  /** Meldung, wenn Kontostand oder Verlauf nicht geladen werden konnten. */
  readonly loadError = computed(() => {
    const failure = this.account.account.error() ?? this.history.error();
    return failure ? errorMessage(failure) : null;
  });

  /** Ein „Rückgängig“ läuft gerade. */
  readonly undoPending = this.undoing.asReadonly();

  /** Zahlungsinformationen aus den Einstellungen (F-37); `null`, solange sie laden. */
  readonly paymentInfo = computed<PaymentInfoView | null>(() => {
    const account = this.account.account.value();
    const settings = this.settings.settings.value();
    if (!account || !settings) {
      return null;
    }
    return {
      ...settings.paymentInfo,
      paymentReference: `${settings.name} ${account.person.referenceCode} ${account.person.displayName}`,
    };
  });

  /** Lädt Kontostand und Verlauf erneut, z. B. nach einem Fehler. */
  retry(): void {
    this.account.account.reload();
    this.history.reload();
  }

  /** Erweitert den Verlauf um weitere 3 Monate in die Vergangenheit (F-07). */
  loadOlder(): void {
    this.from.update((from) => addMonths(from, -HISTORY_MONTHS));
  }

  /** Macht die letzte eigene Konsumbuchung innerhalb der Storno-Frist rückgängig (F-26). */
  async undo(bookingId: string): Promise<void> {
    if (this.undoing()) {
      return;
    }
    this.undoing.set(true);
    const result = await this.account.reverseOwnBooking(bookingId);
    this.undoing.set(false);
    if (result.ok) {
      this.toasts.show({
        message: `${result.value.productName ?? 'Buchung'} storniert · jetzt ${formatAmount(result.value.balanceAfter)}`,
        variant: 'ok',
      });
    } else {
      this.toasts.show({ message: errorMessage(result.failure), variant: 'crit' });
    }
  }

  /**
   * ID der Buchung, an der „Rückgängig“ steht: die jüngste nicht stornierte
   * Konsumbuchung, solange ihre Storno-Frist läuft. Hängt an `Clock.current`,
   * damit die Schaltfläche nach Ablauf der Frist von selbst verschwindet.
   */
  private undoableId(entries: readonly AccountEntry[]): string | null {
    const latest = entries.find((entry) => entry.type === 'CONSUMPTION' && !entry.reversed);
    const windowMinutes = this.settings.settings.value()?.reversalWindowMinutes;
    if (!latest || windowMinutes === undefined) {
      return null;
    }
    const now = this.clock.current();
    return now < reversalWindowEnd(latest, windowMinutes) ? latest.id : null;
  }

  private toView(entry: AccountEntry, canUndo: boolean): HistoryEntryView {
    const label =
      entry.type === 'CONSUMPTION' && entry.productName
        ? entry.quantity && entry.quantity > 1
          ? `${entry.quantity} × ${entry.productName}`
          : entry.productName
        : BOOKING_TYPE_LABELS[entry.type];
    const amount = displayAmount(entry.amount);
    // Rückdatierte Buchungen (z. B. Überweisung vom Kontoauszug) zeigen ihr Buchungsdatum.
    const date =
      toBerlinDate(new Date(entry.recordedAt)) === entry.bookingDate
        ? formatDateTime(entry.recordedAt)
        : formatDate(entry.bookingDate);
    const details = [
      entry.paymentMethod ? PAYMENT_METHOD_LABELS[entry.paymentMethod] : null,
      entry.note || null,
    ]
      .filter((part) => part !== null)
      .join(' · ');
    return {
      id: entry.id,
      label,
      // Stornierte Einträge sind gedimmt; ein farbiges Badge würde das überdecken.
      labelTone: entry.reversed ? 'neutral' : amount.tone,
      date,
      details: details || null,
      amount,
      balanceAfter:
        entry.balanceAfter === null ? null : `Stand ${formatAmount(entry.balanceAfter)}`,
      reversed: entry.reversed,
      canUndo,
      undoLabel: `${label} vom ${date} rückgängig machen`,
    };
  }
}
