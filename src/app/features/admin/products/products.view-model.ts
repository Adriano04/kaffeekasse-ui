import { Injectable, computed, inject, signal } from '@angular/core';
import { FieldTree, TreeValidationResult, form, submit } from '@angular/forms/signals';
import { RsToastService } from 'custom-components';

import { Clock } from '../../../core/clock/clock';
import { MasterDataFacade } from '../../../core/facades/master-data.facade';
import { MoveDirection } from '../../../core/model/api';
import {
  IsoDate,
  formatDate,
  formatDateLong,
  isoDateFromLocalDate,
  localDateFromIsoDate,
  toBerlinDate,
} from '../../../core/model/date';
import { Product } from '../../../core/model/domain';
import { errorMessage } from '../../../core/model/error-messages';
import { formatAmount, formatAmountForInput } from '../../../core/model/money';
import { Result } from '../../../core/model/result';
import { announcedPrice, currentPrice } from '../../../core/model/rules';
import {
  amountField,
  amountOf,
  failureToFormErrors,
  futureDateField,
  requiredText,
} from '../form-rules';

/** Zeile der Artikelliste (F-10). */
export interface ProductRow {
  readonly id: string;
  readonly name: string;
  /** Aktueller Preis, z. B. „0,50 €“. */
  readonly currentPrice: string;
  /** Angekündigter Preis, z. B. „0,60 € ab 01.11.26“, sonst `null`. */
  readonly announcedPrice: string | null;
  readonly active: boolean;
  readonly statusLabel: string;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

/** Eintrag im Preisverlauf (F-10). */
export interface PriceHistoryEntry {
  readonly price: string;
  readonly validFrom: string;
  /** „aktuell“, „angekündigt“ oder „früher“. */
  readonly status: string;
}

interface CreateProductModel {
  name: string;
  price: string;
}

interface PriceChangeModel {
  amount: string;
  validFrom: Date | null;
}

const EMPTY_PRODUCT: CreateProductModel = { name: '', price: '' };

/**
 * ViewModel der Artikelverwaltung (F-10): anlegen, Preis mit Gültig-ab-Datum
 * und ausdrücklicher Bestätigung ändern, Preisverlauf, Sortierung,
 * aktivieren und deaktivieren. Artikel werden nie gelöscht.
 */
@Injectable()
export class ProductsViewModel {
  private readonly masterData = inject(MasterDataFacade);
  private readonly toasts = inject(RsToastService);
  private readonly clock = inject(Clock);

  private readonly createModel = signal<CreateProductModel>({ ...EMPTY_PRODUCT });
  private readonly priceModel = signal<PriceChangeModel>({ amount: '', validFrom: null });
  private readonly priceChangeId = signal<string | null>(null);
  private readonly confirming = signal(false);
  private readonly historyId = signal<string | null>(null);
  private readonly busy = signal(false);
  private readonly today = (): IsoDate => toBerlinDate(this.clock.now());
  private readonly todayIso = computed(() => toBerlinDate(this.clock.current()));

  /** Frühestes „gültig ab“ für die Datumsauswahl (`minDate`): heute, wechselt um Mitternacht. */
  readonly earliestValidFrom = computed(() => localDateFromIsoDate(this.todayIso()));

  /** Formular „Artikel hinzufügen“: Name und Preis. */
  readonly createForm = form(
    this.createModel,
    (product) => {
      requiredText(product.name, 'Bitte gib einen Namen ein.');
      amountField(product.price, 'positive');
    },
    { submission: { action: (fields) => this.create(fields) } },
  );

  /** Formular „Preis ändern“: neuer Preis und gültig ab (Standard: sofort). */
  readonly priceForm = form(
    this.priceModel,
    (change) => {
      amountField(change.amount, 'positive');
      futureDateField(change.validFrom, this.today);
    },
    { submission: { action: (fields) => this.changePrice(fields) } },
  );

  /** Alle Artikel in der Reihenfolge der Buchungsseite, inklusive inaktiver. */
  readonly rows = computed<readonly ProductRow[]>(() => {
    const products = this.masterData.products.value() ?? [];
    const today = toBerlinDate(this.clock.current());
    return products.map((product, index) => this.toRow(product, index, products.length, today));
  });

  /** Die Liste wird zum ersten Mal geladen. */
  readonly loading = computed(
    () => this.masterData.products.loading() && this.masterData.products.value() === undefined,
  );

  /** Überschrift der Liste, mit Anzahl, sobald geladen. */
  readonly listTitle = computed(() =>
    this.loading() ? 'Alle Artikel' : `Alle Artikel (${this.rows().length})`,
  );

  /** Meldung, wenn die Artikel nicht geladen werden konnten. */
  readonly loadError = computed(() => {
    const failure = this.masterData.products.error();
    return failure ? errorMessage(failure) : null;
  });

  /** Artikel im Dialog „Preis ändern“; `null` = Dialog geschlossen. */
  readonly priceChange = computed(() => {
    const product = this.product(this.priceChangeId());
    return product ? { name: product.name, currentPrice: this.currentPriceText(product) } : null;
  });

  /**
   * Bestätigungsfrage im zweiten Schritt, z. B. „Preis Kaffee 0,50 € → 0,60 € ab
   * 01.11.2026?“; `null` im ersten Schritt (F-10: ausdrücklich bestätigen).
   */
  readonly confirmation = computed(() => {
    const product = this.product(this.priceChangeId());
    const { amount, validFrom } = this.priceModel();
    if (!this.confirming() || !product || !validFrom) {
      return null;
    }
    const date = isoDateFromLocalDate(validFrom);
    const when =
      date === this.today() ? `ab sofort (${formatDateLong(date)})` : `ab ${formatDateLong(date)}`;
    return `Preis ${product.name} ${this.currentPriceText(product)} → ${formatAmount(amountOf(amount))} ${when}?`;
  });

  /** Preisverlauf im Dialog, neuester Preis zuerst; `null` = Dialog geschlossen. */
  readonly priceHistory = computed(() => {
    const product = this.product(this.historyId());
    if (!product) {
      return null;
    }
    const today = toBerlinDate(this.clock.current());
    const current = currentPrice(product, today);
    const entries: PriceHistoryEntry[] = [...product.prices].reverse().map((price) => ({
      price: formatAmount(price.amount),
      validFrom: formatDate(price.validFrom),
      status: price.validFrom > today ? 'angekündigt' : price === current ? 'aktuell' : 'früher',
    }));
    return { name: product.name, entries };
  });

  /** Ein Befehl aus der Liste läuft gerade. */
  readonly pending = this.busy.asReadonly();

  /** Legt den Artikel aus dem Formular an. */
  submitCreate(): Promise<boolean> {
    return submit(this.createForm);
  }

  /** Öffnet den Dialog „Preis ändern“ mit dem aktuellen Preis und „sofort“. */
  startPriceChange(productId: string): void {
    const product = this.product(productId);
    if (!product) {
      return;
    }
    const price = currentPrice(product, this.today());
    this.priceForm().reset({
      amount: price ? formatAmountForInput(price.amount) : '',
      validFrom: localDateFromIsoDate(this.today()),
    });
    this.confirming.set(false);
    this.priceChangeId.set(productId);
  }

  /**
   * Erster Aufruf: prüft die Eingabe und zeigt die Bestätigungsfrage. Zweiter
   * Aufruf: speichert den Preis.
   */
  submitPriceChange(): Promise<boolean> {
    return submit(this.priceForm);
  }

  /** Zurück von der Bestätigung zur Eingabe. */
  editPriceAgain(): void {
    this.confirming.set(false);
  }

  /** Schließt den Dialog „Preis ändern“ ohne zu speichern. */
  cancelPriceChange(): void {
    this.priceChangeId.set(null);
    this.confirming.set(false);
  }

  /** Öffnet den Preisverlauf eines Artikels. */
  showPriceHistory(productId: string): void {
    this.historyId.set(productId);
  }

  /** Schließt den Preisverlauf. */
  closePriceHistory(): void {
    this.historyId.set(null);
  }

  /** Verschiebt einen Artikel in der Reihenfolge der Buchungsseite. */
  move(productId: string, direction: MoveDirection): Promise<void> {
    return this.run(this.masterData.moveProduct(productId, direction), null);
  }

  /** Aktiviert oder deaktiviert einen Artikel; deaktivierte verschwinden von der Buchungsseite. */
  setActive(productId: string, active: boolean): Promise<void> {
    const name = this.product(productId)?.name ?? 'Artikel';
    return this.run(
      this.masterData.setProductActive(productId, active),
      active ? `${name} aktiviert` : `${name} deaktiviert`,
    );
  }

  private async create(fields: FieldTree<CreateProductModel>): Promise<TreeValidationResult> {
    const value = fields().value();
    const result = await this.masterData.createProduct({
      name: value.name,
      price: amountOf(value.price),
    });
    if (!result.ok) {
      return failureToFormErrors(
        result.failure,
        { name: fields.name, price: fields.price },
        this.toasts,
      );
    }
    this.toasts.show({ message: `${result.value.name} angelegt`, variant: 'ok' });
    fields().reset({ ...EMPTY_PRODUCT });
    return undefined;
  }

  private async changePrice(fields: FieldTree<PriceChangeModel>): Promise<TreeValidationResult> {
    if (!this.confirming()) {
      this.confirming.set(true);
      return undefined;
    }
    const id = this.priceChangeId();
    const { amount, validFrom } = fields().value();
    if (id === null || validFrom === null) {
      return undefined;
    }
    const result = await this.masterData.changePrice(
      id,
      amountOf(amount),
      isoDateFromLocalDate(validFrom),
    );
    if (!result.ok) {
      this.confirming.set(false);
      return failureToFormErrors(
        result.failure,
        { amount: fields.amount, validFrom: fields.validFrom },
        this.toasts,
      );
    }
    this.cancelPriceChange();
    this.toasts.show({ message: `Preis für ${result.value.name} gespeichert`, variant: 'ok' });
    return undefined;
  }

  private async run(command: Promise<Result<unknown>>, success: string | null): Promise<void> {
    this.busy.set(true);
    const result = await command;
    this.busy.set(false);
    if (!result.ok) {
      this.toasts.show({ message: errorMessage(result.failure), variant: 'crit' });
    } else if (success) {
      this.toasts.show({ message: success, variant: 'ok' });
    }
  }

  private product(id: string | null): Product | undefined {
    return id === null ? undefined : this.masterData.products.value()?.find((p) => p.id === id);
  }

  private currentPriceText(product: Product): string {
    const price = currentPrice(product, this.today());
    return price ? formatAmount(price.amount) : '–';
  }

  private toRow(product: Product, index: number, count: number, today: IsoDate): ProductRow {
    const current = currentPrice(product, today);
    const announced = announcedPrice(product, today);
    return {
      id: product.id,
      name: product.name,
      currentPrice: current ? formatAmount(current.amount) : '–',
      announcedPrice: announced
        ? `${formatAmount(announced.amount)} ab ${formatDate(announced.validFrom)}`
        : null,
      active: product.active,
      statusLabel: product.active ? 'aktiv' : 'inaktiv',
      canMoveUp: index > 0,
      canMoveDown: index < count - 1,
    };
  }
}
