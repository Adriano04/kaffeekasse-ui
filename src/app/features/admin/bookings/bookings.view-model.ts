import { Injectable, computed, inject, signal } from '@angular/core';
import { FieldTree, TreeValidationResult, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { RsTableRequest, RsTableResult, RsToastService } from 'custom-components';

import { Clock } from '../../../core/clock/clock';
import { JournalFacade } from '../../../core/facades/journal.facade';
import { MasterDataFacade } from '../../../core/facades/master-data.facade';
import { BookingRow, BookingSortField } from '../../../core/model/api';
import {
  IsoDate,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  toBerlinDate,
} from '../../../core/model/date';
import { BOOKING_TYPES, PAYMENT_METHODS, PaymentMethod } from '../../../core/model/domain';
import { errorMessage } from '../../../core/model/error-messages';
import { newIdempotencyKey } from '../../../core/model/ids';
import { BOOKING_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../../../core/model/labels';
import { formatAmount, parseAmount } from '../../../core/model/money';
import { Result } from '../../../core/model/result';
import { BookingRowView, historyAmount, toBookingQuery, toBookingRowView } from '../booking-rows';
import {
  SelectOption,
  amountField,
  amountOf,
  failureToFormErrors,
  pastDateField,
  requiredText,
  toPersonOptions,
} from '../form-rules';
import { ReversalDialogModel } from '../reversal-dialog.view-model';

/** Art der Buchung im Formular „Buchung erfassen“. */
export type BookingVariant = 'PAYMENT' | 'ADJUSTMENT' | 'PAYOUT';

/** Varianten in der Reihenfolge der Tabs. */
export const BOOKING_VARIANTS: readonly BookingVariant[] = ['PAYMENT', 'ADJUSTMENT', 'PAYOUT'];

interface PaymentModel {
  personId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  bookingDate: Date | null;
  note: string;
}

interface AdjustmentModel {
  personId: string;
  amount: string;
  reason: string;
}

interface PayoutModel {
  personId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  note: string;
}

/** Sortierbare Spalten der Gesamthistorie. */
const SORT_FIELDS: Readonly<Record<string, BookingSortField>> = {
  date: 'bookingDate',
  person: 'personName',
  type: 'type',
  amount: 'amount',
};

/**
 * ViewModel von Verwaltung › Buchungen (F-11 bis F-13, F-27, F-28): Einzahlung,
 * Korrektur und Auszahlung erfassen, Gesamthistorie mit Filter und Paging,
 * Storno mit Pflicht-Begründung.
 */
@Injectable()
export class BookingsViewModel {
  private readonly journal = inject(JournalFacade);
  private readonly masterData = inject(MasterDataFacade);
  private readonly toasts = inject(RsToastService);
  private readonly clock = inject(Clock);
  private readonly route = inject(ActivatedRoute);

  private readonly today = (): IsoDate => toBerlinDate(this.clock.now());
  private readonly todayIso = computed(() => toBerlinDate(this.clock.current()));

  /** Spätestes Zahlungsdatum für die Datumsauswahl (`maxDate`): heute, wechselt um Mitternacht. */
  readonly latestBookingDate = computed(() => localDateFromIsoDate(this.todayIso()));
  private readonly payoutPersonId = this.route.snapshot.queryParamMap.get('payout') ?? '';
  private readonly variant = signal<BookingVariant>(this.payoutPersonId ? 'PAYOUT' : 'PAYMENT');

  private readonly paymentModel = signal<PaymentModel>(this.emptyPayment());
  private readonly adjustmentModel = signal<AdjustmentModel>({
    personId: '',
    amount: '',
    reason: '',
  });
  private readonly payoutModel = signal<PayoutModel>({
    personId: this.payoutPersonId,
    amount: '',
    paymentMethod: 'CASH',
    note: '',
  });

  /** Beschriftungen der Varianten-Tabs. */
  readonly variantLabels = BOOKING_VARIANTS.map((variant) => BOOKING_TYPE_LABELS[variant]);

  /** Index der aktiven Variante. */
  readonly variantIndex = computed(() => BOOKING_VARIANTS.indexOf(this.variant()));

  /** Aktive Variante. */
  readonly activeVariant = this.variant.asReadonly();

  /** Einzahlung (F-11): Betrag nur positiv, Zahlungsdatum rückdatierbar. */
  readonly paymentForm = form(
    this.paymentModel,
    (payment) => {
      required(payment.personId, { message: 'Bitte wähle eine Person.' });
      amountField(payment.amount, 'positive');
      pastDateField(payment.bookingDate, this.today);
    },
    { submission: { action: (fields) => this.recordPayment(fields) } },
  );

  /** Korrektur (F-12): Betrag ±, Pflicht-Begründung, keine Kassenwirkung. */
  readonly adjustmentForm = form(
    this.adjustmentModel,
    (adjustment) => {
      required(adjustment.personId, { message: 'Bitte wähle eine Person.' });
      amountField(adjustment.amount, 'nonzero');
      requiredText(adjustment.reason, 'Bitte gib eine Begründung an.');
    },
    { submission: { action: (fields) => this.recordAdjustment(fields) } },
  );

  /** Auszahlung (F-28): Betrag nur positiv; über dem Guthaben nur eine Warnung. */
  readonly payoutForm = form(
    this.payoutModel,
    (payout) => {
      required(payout.personId, { message: 'Bitte wähle eine Person.' });
      amountField(payout.amount, 'positive');
    },
    { submission: { action: (fields) => this.recordPayout(fields) } },
  );

  /**
   * Personen für die Auswahl, aktive zuerst, mit Kontostand. Inaktive bleiben
   * wählbar, z. B. für die Schlussabrechnung (F-09).
   */
  readonly personOptions = computed<readonly SelectOption[]>(() =>
    toPersonOptions(this.masterData.people.value() ?? [], true),
  );

  /** Zahlungswege (K-04). */
  readonly paymentMethodOptions: readonly SelectOption[] = PAYMENT_METHODS.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABELS[method],
  }));

  /** Warnung, wenn die Auszahlung das Guthaben übersteigt; blockiert nicht (F-28). */
  readonly payoutWarning = computed(() => {
    const { personId, amount } = this.payoutModel();
    const person = this.masterData.people.value()?.find((p) => p.id === personId);
    const cents = parseAmount(amount);
    if (!person || cents === null || cents <= 0 || cents <= person.balance) {
      return null;
    }
    const credit = Math.max(person.balance, 0);
    return `Der Betrag ist höher als das Guthaben von ${person.displayName} (${formatAmount(credit)}).`;
  });

  // --- Gesamthistorie --------------------------------------------------------

  /** Datenstand; bei jeder neuen Version lädt die Tabelle neu. */
  readonly version = this.journal.version;

  /** Filter „Person“ der Gesamthistorie. */
  readonly personFilterOptions = computed<readonly SelectOption[]>(() =>
    (this.masterData.people.value() ?? []).map((person) => ({
      value: person.id,
      label: person.displayName,
    })),
  );

  /** Filter „Art“ der Gesamthistorie. */
  readonly typeFilterOptions: readonly SelectOption[] = BOOKING_TYPES.map((type) => ({
    value: type,
    label: BOOKING_TYPE_LABELS[type],
  }));

  /** Filter „Artikel“ der Gesamthistorie. */
  readonly productFilterOptions = computed<readonly SelectOption[]>(() =>
    (this.masterData.products.value() ?? []).map((product) => ({
      value: product.id,
      label: product.name,
    })),
  );

  /**
   * Lädt eine Seite der Gesamthistorie für RsTable. Filtern, Sortieren und
   * Paginieren übernimmt das Backend (F-13).
   */
  readonly loadHistory = async (
    request: RsTableRequest,
  ): Promise<RsTableResult<BookingRowView>> => {
    const result = await this.journal.searchBookings(toBookingQuery(request, SORT_FIELDS));
    if (!result.ok) {
      throw new Error(errorMessage(result.failure));
    }
    return {
      rows: result.value.rows.map((row: BookingRow) => toBookingRowView(row, historyAmount)),
      total: result.value.total,
    };
  };

  /** Storno-Dialog (F-27). */
  readonly reversal = new ReversalDialogModel();

  /** Wechselt die Variante im Formular „Buchung erfassen“. */
  selectVariant(index: number): void {
    const variant = BOOKING_VARIANTS[index];
    if (variant) {
      this.variant.set(variant);
    }
  }

  /** Verbucht die Einzahlung aus dem Formular. */
  submitPayment(): Promise<boolean> {
    return submit(this.paymentForm);
  }

  /** Verbucht die Korrektur aus dem Formular. */
  submitAdjustment(): Promise<boolean> {
    return submit(this.adjustmentForm);
  }

  /** Verbucht die Auszahlung aus dem Formular. */
  submitPayout(): Promise<boolean> {
    return submit(this.payoutForm);
  }

  /** Öffnet den Storno-Dialog für eine Zeile der Gesamthistorie. */
  askReversal(row: BookingRowView): void {
    this.reversal.ask({ bookingId: row.id, summary: row.summary });
  }

  private async recordPayment(fields: FieldTree<PaymentModel>): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.journal.recordPayment(
      {
        personId: value.personId,
        amount: amountOf(value.amount),
        paymentMethod: value.paymentMethod,
        bookingDate: value.bookingDate ? isoDateFromLocalDate(value.bookingDate) : this.today(),
        note: value.note,
      },
      newIdempotencyKey(),
    );
    return this.finish(result, () => fields().reset(this.emptyPayment()), {
      personId: fields.personId,
      amount: fields.amount,
      bookingDate: fields.bookingDate,
      paymentMethod: fields.paymentMethod,
    });
  }

  private async recordAdjustment(
    fields: FieldTree<AdjustmentModel>,
  ): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.journal.recordAdjustment(
      { personId: value.personId, amount: amountOf(value.amount), reason: value.reason },
      newIdempotencyKey(),
    );
    return this.finish(result, () => fields().reset({ personId: '', amount: '', reason: '' }), {
      personId: fields.personId,
      amount: fields.amount,
      reason: fields.reason,
    });
  }

  private async recordPayout(fields: FieldTree<PayoutModel>): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.journal.recordPayout(
      {
        personId: value.personId,
        amount: amountOf(value.amount),
        paymentMethod: value.paymentMethod,
        note: value.note,
      },
      newIdempotencyKey(),
    );
    return this.finish(
      result,
      () => fields().reset({ personId: '', amount: '', paymentMethod: 'CASH', note: '' }),
      { personId: fields.personId, amount: fields.amount, paymentMethod: fields.paymentMethod },
    );
  }

  /** Meldet das Ergebnis eines Buchungsbefehls und leert bei Erfolg das Formular. */
  private finish(
    result: Result<BookingRow>,
    reset: () => void,
    fieldMap: Parameters<typeof failureToFormErrors>[1],
  ): TreeValidationResult {
    if (!result.ok) {
      return failureToFormErrors(result.failure, fieldMap, this.toasts);
    }
    const row = toBookingRowView(result.value, historyAmount);
    this.toasts.show({
      message: `${row.type} verbucht: ${row.person} · ${row.amount.text}`,
      variant: 'ok',
    });
    reset();
    return undefined;
  }

  private emptyPayment(): PaymentModel {
    return {
      personId: '',
      amount: '',
      paymentMethod: 'CASH',
      bookingDate: localDateFromIsoDate(this.today()),
      note: '',
    };
  }
}
