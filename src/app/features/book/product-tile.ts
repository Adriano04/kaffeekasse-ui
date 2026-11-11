import { Component, input, output } from '@angular/core';

import { ProductTileView } from './book.view-model';

/** Große, antippbare Artikelkachel mit Name und Preis (F-04, NF-01). */
@Component({
  selector: 'app-product-tile',
  template: `
    <button
      type="button"
      class="rs-card rs-card--interactive product-tile"
      [attr.aria-label]="tile().ariaLabel"
      [attr.aria-busy]="tile().busy || null"
      (click)="selected.emit()"
    >
      <span class="rs-card__title">{{ tile().name }}</span>
      <span class="product-tile__price">{{ tile().price }}</span>
      @if (tile().announcement) {
        <span class="rs-card__subtitle">{{ tile().announcement }}</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: block;
    }

    .product-tile {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      min-height: 6rem;
      justify-content: center;
      gap: var(--rs-space-1);
      text-align: start;
    }

    .product-tile[aria-busy='true'] {
      opacity: 0.7;
    }

    .product-tile__price {
      font-family: var(--rs-font-display);
      font-size: 1.2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--rs-text);
    }
  `,
})
export class ProductTile {
  /** Anzeigefertige Kachel aus dem ViewModel. */
  readonly tile = input.required<ProductTileView>();

  /** Die Kachel wurde angetippt. */
  readonly selected = output<void>();
}
