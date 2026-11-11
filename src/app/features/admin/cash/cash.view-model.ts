import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { FieldTree, TreeValidationResult, form, required, submit } from '@angular/forms/signals';
import { RsTableRequest, RsTableResult, RsToastService } from 'custom-components';

import { Clock } from '../../../core/clock/clock';
import { JournalFacade } from '../../../core/facades/journal.facade';
import { MasterDataFacade } from '../../../core/facades/master-data.facade';
import { SettingsFacade } from '../../../core/facades/settings.facade';
import { BookingSortField, PaidFrom } from '../../../core/model/api';
import {
  IsoDate,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  toBerlinDate,
} from '../../../core/model/date';
import {
  BookingType,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  PAYMENT_METHODS,
  PaymentInfo,
  PaymentMethod,
} from '../../../core/model/domain';
import { errorMessage } from '../../../core/model/error-messages';
import { newIdempotencyKey } from '../../../core/model/ids';
import {
  BOOKING_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../../core/model/labels';
import { formatAmount } from '../../../core/model/money';
import { BookingRowView, cashBookAmount, toBookingQuery, toBookingRowView } from '../booking-rows';
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

/** „Bezahlt aus“: ein Zahlungsweg der Kasse oder eine Auslage durch eine Person (I-04). */
export type PaidFromChoice = PaymentMethod | 'OUT_OF_POCKET';

interface ExpenseModel {
  bookingDate: Date | null;
  amount: string;
  note: string;
  category: ExpenseCategory;
  paidFrom: PaidFromChoice;
  outOfPocketBy: string;
}

interface BottleRefundModel {
  bookingDate: Date | null;
  amount: string;
  note: string;
  paymentMethod: PaymentMethod;
}

type PaymentInfoModel = { -readonly [K in keyof PaymentInfo]: string };

const EMPTY_PAYMENT_INFO: PaymentInfoModel = {
  accountHolder: '',
  iban: '',
  paypalLink: '',
  cashNote: '',
};

/** Buchungsarten im Kassenbuch, für den Filter. */
const CASH_BOOK_TYPES: readonly BookingType[] = [
  'EXPENSE',
  'OUT_OF_POCKET',
  'BOTTLE_REFUND',
  'PAYMENT',
  'PAYOUT',
  'OPENING_CASH',
  'REVERSAL',
];

/** Sortierbare Spalten des Kassenbuchs. */
const SORT_FIELDS: Readonly<Record<string, BookingSortField>> = {
  date: 'bookingDate',
  type: 'type',
  amount: 'cashAmount',
};

/**
 * ViewModel von Verwaltung › Kasse (F-14, F-15, F-27, F-37, I-04): Ausgaben
 * und Auslagen erfassen, Pfandrückgaben erfassen, Kassenbuch mit Storno,
 * Zahlungsinformationen pflegen.
 */
@Injectable()
export class CashViewModel {
  private readonly journal = inject(JournalFacade);
  private readonly masterData = inject(MasterDataFacade);
  private readonly settings = inject(SettingsFacade);
  private readonly toasts = inject(RsToastService);
  private readonly clock = inject(Clock);
  private readonly today = (): IsoDate => toBerlinDate(this.clock.now());
  private readonly todayIso = computed(() => toBerlinDate(this.clock.current()));

  /**
   * Spätestes Beleg- bzw. Rückgabedatum für die Datumsauswahl (`maxDate`): heute, wechselt um
   * Mitternacht.
   */
  readonly latestBookingDate = computed(() => localDateFromIsoDate(this.todayIso()));

  private readonly expenseModel = signal<ExpenseModel>(this.emptyExpense());
  private readonly refundModel = signal<BottleRefundModel>(this.emptyRefund());

  /** Zahlungsinformationen aus den Einstellungen; ändert sich nur bei neuem Inhalt. */
  private readonly savedPaymentInfo = computed(() => this.settings.settings.value()?.paymentInfo, {
    equal: samePaymentInfo,
  });

  /** Formularmodell der Zahlungsinformationen, folgt den gespeicherten Werten. */
  private readonly paymentInfoModel = linkedSignal<PaymentInfoModel>(() => ({
    ...(this.savedPaymentInfo() ?? EMPTY_PAYMENT_INFO),
  }));

  /** Ausgabe (F-14) bzw. Auslage durch eine Person (I-04). */
  readonly expenseForm = form(
    this.expenseModel,
    (expense) => {
      pastDateField(expense.bookingDate, this.today);
      amountField(expense.amount, 'positive');
      requiredText(expense.note, 'Bitte gib eine Beschreibung ein.');
      required(expense.outOfPocketBy, {
        message: 'Bitte wähle die Person, die ausgelegt hat.',
        when: ({ valueOf }) => valueOf(expense.paidFrom) === 'OUT_OF_POCKET',
      });
    },
    { submission: { action: (fields) => this.recordExpense(fields) } },
  );

  /** Pfandrückgabe (F-15). */
  readonly refundForm = form(
    this.refundModel,
    (refund) => {
      pastDateField(refund.bookingDate, this.today);
      amountField(refund.amount, 'positive');
      requiredText(refund.note, 'Bitte gib eine Beschreibung ein.');
    },
    { submission: { action: (fields) => this.recordBottleRefund(fields) } },
  );

  /** Zahlungsinformationen für „Mein Konto“ (F-37). */
  readonly paymentInfoForm = form(this.paymentInfoModel, {
    submission: { action: (fields) => this.savePaymentInfo(fields) },
  });

  /** Ausgabenkategorien (F-14). */
  readonly categoryOptions: readonly SelectOption[] = EXPENSE_CATEGORIES.map((category) => ({
    value: category,
    label: EXPENSE_CATEGORY_LABELS[category],
  }));

  /** „Bezahlt aus“ (F-14, I-04). */
  readonly paidFromOptions: readonly SelectOption[] = [
    ...PAYMENT_METHODS.map((method) => ({
      value: method,
      label: `${PAYMENT_METHOD_LABELS[method]} (Kasse)`,
    })),
    { value: 'OUT_OF_POCKET', label: 'Auslage durch eine Person' },
  ];

  /** Zahlungswege der Pfandrückgabe. */
  readonly paymentMethodOptions: readonly SelectOption[] = PAYMENT_METHODS.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABELS[method],
  }));

  /** Aktive Personen für die Auslage. */
  readonly personOptions = computed<readonly SelectOption[]>(() =>
    toPersonOptions(this.masterData.people.value() ?? [], false),
  );

  /** Die Ausgabe ist eine Auslage: Person wählen, keine Kassenwirkung. */
  readonly isOutOfPocket = computed(() => this.expenseModel().paidFrom === 'OUT_OF_POCKET');

  // --- Kassenbuch ----------------------------------------------------------

  /** Datenstand; bei jeder neuen Version lädt die Tabelle neu. */
  readonly version = this.journal.version;

  /** Filter „Art“ des Kassenbuchs. */
  readonly typeFilterOptions: readonly SelectOption[] = CASH_BOOK_TYPES.map((type) => ({
    value: type,
    label: BOOKING_TYPE_LABELS[type],
  }));

  /** Lädt eine Seite des Kassenbuchs für RsTable: Buchungen mit Kassenwirkung plus Auslagen. */
  readonly loadCashBook = async (
    request: RsTableRequest,
  ): Promise<RsTableResult<BookingRowView>> => {
    const result = await this.journal.cashBook(toBookingQuery(request, SORT_FIELDS));
    if (!result.ok) {
      throw new Error(errorMessage(result.failure));
    }
    return {
      rows: result.value.rows.map((row) => toBookingRowView(row, cashBookAmount)),
      total: result.value.total,
    };
  };

  /** Storno-Dialog (F-27). */
  readonly reversal = new ReversalDialogModel();

  /** Erfasst die Ausgabe aus dem Formular. */
  submitExpense(): Promise<boolean> {
    return submit(this.expenseForm);
  }

  /** Erfasst die Pfandrückgabe aus dem Formular. */
  submitBottleRefund(): Promise<boolean> {
    return submit(this.refundForm);
  }

  /** Speichert die Zahlungsinformationen. */
  submitPaymentInfo(): Promise<boolean> {
    return submit(this.paymentInfoForm);
  }

  /** Öffnet den Storno-Dialog für eine Zeile des Kassenbuchs. */
  askReversal(row: BookingRowView): void {
    this.reversal.ask({ bookingId: row.id, summary: row.summary });
  }

  private async recordExpense(fields: FieldTree<ExpenseModel>): Promise<TreeValidationResult> {
    const value = fields().value();
    const paidFrom: PaidFrom =
      value.paidFrom === 'OUT_OF_POCKET' ? { outOfPocketBy: value.outOfPocketBy } : value.paidFrom;
    const result = await this.journal.recordExpense(
      {
        bookingDate: this.dateOf(value.bookingDate),
        amount: amountOf(value.amount),
        note: value.note,
        category: value.category,
        paidFrom,
      },
      newIdempotencyKey(),
    );
    if (!result.ok) {
      return failureToFormErrors(
        result.failure,
        {
          bookingDate: fields.bookingDate,
          amount: fields.amount,
          note: fields.note,
          category: fields.category,
          paidFrom: value.paidFrom === 'OUT_OF_POCKET' ? fields.outOfPocketBy : fields.paidFrom,
        },
        this.toasts,
      );
    }
    const amount = formatAmount(amountOf(value.amount));
    this.toasts.show({
      message:
        result.value.type === 'OUT_OF_POCKET'
          ? `Auslage erfasst: ${result.value.personName} bekommt ${amount} Guthaben`
          : `Ausgabe erfasst: ${value.note} · ${amount}`,
      variant: 'ok',
    });
    fields().reset(this.emptyExpense());
    return undefined;
  }

  private async recordBottleRefund(
    fields: FieldTree<BottleRefundModel>,
  ): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.journal.recordBottleRefund(
      {
        bookingDate: this.dateOf(value.bookingDate),
        amount: amountOf(value.amount),
        note: value.note,
        paymentMethod: value.paymentMethod,
      },
      newIdempotencyKey(),
    );
    if (!result.ok) {
      return failureToFormErrors(
        result.failure,
        {
          bookingDate: fields.bookingDate,
          amount: fields.amount,
          note: fields.note,
          paymentMethod: fields.paymentMethod,
        },
        this.toasts,
      );
    }
    this.toasts.show({
      message: `Pfandrückgabe erfasst: ${formatAmount(amountOf(value.amount))}`,
      variant: 'ok',
    });
    fields().reset(this.emptyRefund());
    return undefined;
  }

  private async savePaymentInfo(
    fields: FieldTree<PaymentInfoModel>,
  ): Promise<TreeValidationResult> {
    const result = await this.settings.updatePaymentInfo(fields().value());
    if (!result.ok) {
      return failureToFormErrors(result.failure, {}, this.toasts);
    }
    this.toasts.show({ message: 'Zahlungsinformationen gespeichert', variant: 'ok' });
    return undefined;
  }

  private dateOf(date: Date | null): IsoDate {
    return date ? isoDateFromLocalDate(date) : this.today();
  }

  private emptyExpense(): ExpenseModel {
    return {
      bookingDate: localDateFromIsoDate(this.today()),
      amount: '',
      note: '',
      category: 'COFFEE_BEANS',
      paidFrom: 'CASH',
      outOfPocketBy: '',
    };
  }

  private emptyRefund(): BottleRefundModel {
    return {
      bookingDate: localDateFromIsoDate(this.today()),
      amount: '',
      note: '',
      paymentMethod: 'CASH',
    };
  }
}

function samePaymentInfo(a: PaymentInfo | undefined, b: PaymentInfo | undefined): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.accountHolder === b.accountHolder &&
      a.iban === b.iban &&
      a.paypalLink === b.paypalLink &&
      a.cashNote === b.cashNote)
  );
}
