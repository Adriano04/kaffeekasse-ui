import { Injectable, computed, inject } from '@angular/core';

import { MetricsFacade } from '../../../core/facades/metrics.facade';
import { MetricsPerson } from '../../../core/model/api';
import { PAYMENT_METHODS } from '../../../core/model/domain';
import { errorMessage } from '../../../core/model/error-messages';
import { PAYMENT_METHOD_LABELS } from '../../../core/model/labels';
import { formatAmount } from '../../../core/model/money';

/** Person in der aufklappbaren Liste einer Kennzahl. */
export interface MetricsPersonView {
  readonly id: string;
  readonly name: string;
  readonly amount: string;
  /** Inaktive Personen werden gedimmt und mit „inaktiv“ beschriftet. */
  readonly inactive: boolean;
}

/** Kennzahl mit Summe und Personenliste (F-17, F-18). */
export interface PeopleMetricView {
  readonly total: string;
  readonly people: readonly MetricsPersonView[];
  /** Beschriftung zum Aufklappen, z. B. „3 Personen anzeigen“. */
  readonly toggleLabel: string;
}

/** Kassenbestand gesamt und je Zahlungsweg (F-19). */
export interface CashBalanceView {
  readonly total: string;
  readonly byMethod: readonly { readonly label: string; readonly amount: string }[];
}

/** Hinweistext zum Guthaben der Belegschaft (F-18). */
export const CREDIT_NOTE =
  'Dieses Geld gehört den Kolleg:innen. Es steckt zwar im Kassenbestand, ist aber nicht frei verfügbar.';

/**
 * ViewModel von Verwaltung › Statistik (F-17 bis F-19): offene Forderungen,
 * Guthaben der Belegschaft und Kassenbestand als Stichtagswerte.
 */
@Injectable()
export class StatisticsViewModel {
  private readonly metrics = inject(MetricsFacade);

  /** Offene Forderungen inklusive inaktiver Personen, absteigend (F-17). */
  readonly receivables = computed<PeopleMetricView | null>(() => {
    const metrics = this.metrics.metrics.value();
    return metrics ? toPeopleMetric(metrics.receivables.total, metrics.receivables.people) : null;
  });

  /** Guthaben der Belegschaft inklusive inaktiver Personen, absteigend (F-18). */
  readonly credit = computed<PeopleMetricView | null>(() => {
    const metrics = this.metrics.metrics.value();
    return metrics ? toPeopleMetric(metrics.credit.total, metrics.credit.people) : null;
  });

  /** Geschätzter Kassenbestand gesamt und je Zahlungsweg (F-19). */
  readonly cashBalance = computed<CashBalanceView | null>(() => {
    const cash = this.metrics.metrics.value()?.cashBalance;
    if (!cash) {
      return null;
    }
    return {
      total: formatAmount(cash.total),
      byMethod: PAYMENT_METHODS.map((method) => ({
        label: PAYMENT_METHOD_LABELS[method],
        amount: formatAmount(cash.byMethod[method]),
      })),
    };
  });

  /** Hinweistext zum Guthaben (F-18). */
  readonly creditNote = CREDIT_NOTE;

  /** Die Kennzahlen werden zum ersten Mal geladen. */
  readonly loading = computed(
    () => this.metrics.metrics.loading() && this.metrics.metrics.value() === undefined,
  );

  /** Meldung, wenn die Kennzahlen nicht geladen werden konnten. */
  readonly loadError = computed(() => {
    const failure = this.metrics.metrics.error();
    return failure ? errorMessage(failure) : null;
  });

  /** Lädt die Kennzahlen erneut. */
  retry(): void {
    this.metrics.metrics.reload();
  }
}

function toPeopleMetric(total: number, people: readonly MetricsPerson[]): PeopleMetricView {
  return {
    total: formatAmount(total),
    people: people.map((person) => ({
      id: person.personId,
      name: person.displayName,
      amount: formatAmount(person.amount),
      inactive: !person.active,
    })),
    toggleLabel: people.length === 1 ? '1 Person anzeigen' : `${people.length} Personen anzeigen`,
  };
}
