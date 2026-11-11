import { Injectable, computed, inject, signal } from '@angular/core';
import { RsToastService } from 'custom-components';

import { Clock } from '../../core/clock/clock';
import { AccountFacade } from '../../core/facades/account.facade';
import { SettingsFacade } from '../../core/facades/settings.facade';
import { ConsumptionBooked } from '../../core/model/api';
import { formatDayMonth } from '../../core/model/date';
import { BalanceDisplay, balanceDisplay } from '../../core/model/display';
import { errorMessage } from '../../core/model/error-messages';
import { newIdempotencyKey } from '../../core/model/ids';
import { formatAmount } from '../../core/model/money';
import { Failure } from '../../core/model/result';
import { isWarningDue } from '../../core/model/rules';

/** Zweiter Tap auf dieselbe Kachel innerhalb dieser Zeit gilt als versehentlich (F-01). */
export const DOUBLE_TAP_MS = 1000;

/** Geschütztes Leerzeichen: hält „vorher“ und „jetzt“ in der Bestätigung beim Betrag. */
const NBSP = '\u00a0';

/** Anzeigedauer der Buchungsbestätigung (F-03: 5 bis 10 Sekunden). */
export const CONFIRMATION_DURATION_MS = 8000;

/** Anzeigefertige Artikelkachel (F-04). */
export interface ProductTileView {
  readonly id: string;
  readonly name: string;
  /** Aktueller Preis, z. B. „0,50 €“. */
  readonly price: string;
  /** Angekündigter Preis, z. B. „ab 01.11.: 0,60 €“, sonst `null` (F-10). */
  readonly announcement: string | null;
  /** Beschriftung für Screenreader, z. B. „Kaffee für 0,50 € buchen“. */
  readonly ariaLabel: string;
  /** Die Buchung dieses Artikels läuft gerade. */
  readonly busy: boolean;
}

/**
 * ViewModel der Buchungsseite (F-01 bis F-04, F-26): Kontostand, Artikel-
 * kacheln, Buchen mit einem Tap, Bestätigung mit „Rückgängig“ als Toast.
 */
@Injectable()
export class BookViewModel {
  private readonly account = inject(AccountFacade);
  private readonly settings = inject(SettingsFacade);
  private readonly toasts = inject(RsToastService);
  private readonly clock = inject(Clock);

  private readonly lastTaps = new Map<string, number>();
  private readonly pending = signal<ReadonlySet<string>>(new Set());

  /** Es ist niemand angemeldet. */
  readonly signedOut = computed(() => this.account.currentPerson() === null);

  /** Anzeigename der angemeldeten Person. */
  readonly personName = computed(() => this.account.currentPerson()?.displayName ?? '');

  /** Kontostand der angemeldeten Person (F-02, F-08); `null`, solange er lädt. */
  readonly balance = computed<BalanceDisplay | null>(() => {
    const account = this.account.account.value();
    return account ? balanceDisplay(account.balance) : null;
  });

  /** Kacheln aller aktiven Artikel in der Reihenfolge der Verwaltung (F-04). */
  readonly tiles = computed<readonly ProductTileView[]>(() => {
    const pending = this.pending();
    return (this.account.bookableProducts.value() ?? []).map((product) => {
      const price = formatAmount(product.currentPrice);
      const announcement = product.announcedPrice
        ? `ab ${formatDayMonth(product.announcedPrice.validFrom)}: ${formatAmount(product.announcedPrice.amount)}`
        : null;
      return {
        id: product.id,
        name: product.name,
        price,
        announcement,
        ariaLabel: `${product.name} für ${price} buchen${announcement ? ` (${announcement})` : ''}`,
        busy: pending.has(product.id),
      };
    });
  });

  /** Die Artikel werden zum ersten Mal geladen. */
  readonly loading = computed(
    () =>
      this.account.bookableProducts.loading() &&
      this.account.bookableProducts.value() === undefined,
  );

  /** Es gibt keine Artikel zum Buchen. */
  readonly empty = computed(() => this.account.bookableProducts.value()?.length === 0);

  /** Meldung, wenn Kontostand oder Artikel nicht geladen werden konnten. */
  readonly loadError = computed(() => {
    const failure: Failure | null =
      this.account.bookableProducts.error() ?? this.account.account.error();
    return failure ? errorMessage(failure) : null;
  });

  /** Lädt Kontostand und Artikel erneut, z. B. nach einem Fehler. */
  retry(): void {
    this.account.account.reload();
    this.account.bookableProducts.reload();
  }

  /**
   * Bucht einen Artikel sofort, ohne Bestätigungsdialog (F-01). Ein zweiter
   * Tap auf dieselbe Kachel innerhalb von {@link DOUBLE_TAP_MS} wird
   * ignoriert; ein bewusster weiterer Tap danach bucht erneut. Jeder Tap hat
   * einen eigenen Idempotenz-Schlüssel (NF-04).
   */
  async bookProduct(productId: string): Promise<void> {
    const now = this.clock.now().getTime();
    const lastTap = this.lastTaps.get(productId);
    if (lastTap !== undefined && now - lastTap < DOUBLE_TAP_MS) {
      return;
    }
    this.lastTaps.set(productId, now);

    this.pending.update((ids) => new Set(ids).add(productId));
    const result = await this.account.bookConsumption(productId, newIdempotencyKey());
    this.pending.update((ids) => {
      const next = new Set(ids);
      next.delete(productId);
      return next;
    });

    if (result.ok) {
      this.confirm(result.value);
    } else {
      this.toasts.show({ message: errorMessage(result.failure), variant: 'crit' });
    }
  }

  /**
   * Bestätigung als Toast mit „Rückgängig“ (F-02, F-03, F-26). Ab der
   * Warnschwelle enthält sie „Bitte bald ausgleichen“, ohne zu blockieren.
   */
  private confirm(booked: ConsumptionBooked): void {
    const name = booked.booking.productName ?? 'Artikel';
    const settings = this.settings.settings.value();
    const warning = settings !== undefined && isWarningDue(booked.balanceAfter, settings);
    this.toasts.show({
      title: warning ? 'Bitte bald ausgleichen' : undefined,
      message:
        `${name} gebucht · ${formatAmount(-booked.booking.amount)} · ` +
        `vorher${NBSP}${formatAmount(booked.balanceBefore)} → jetzt${NBSP}${formatAmount(booked.balanceAfter)}`,
      variant: warning ? 'warn' : 'ok',
      duration: CONFIRMATION_DURATION_MS,
      action: { label: 'Rückgängig', handler: () => void this.undo(booked) },
    });
  }

  /** Macht die Buchung rückgängig und meldet das Ergebnis (F-26). */
  private async undo(booked: ConsumptionBooked): Promise<void> {
    const result = await this.account.reverseOwnBooking(booked.booking.id);
    if (result.ok) {
      this.toasts.show({
        message: `${result.value.productName ?? 'Buchung'} storniert · jetzt ${formatAmount(result.value.balanceAfter)}`,
        variant: 'ok',
      });
    } else {
      this.toasts.show({ message: errorMessage(result.failure), variant: 'crit' });
    }
  }
}
