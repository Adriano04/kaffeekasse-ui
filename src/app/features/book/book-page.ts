import { Component, inject } from '@angular/core';

import { StatusClassPipe } from '../../shared/status-class.pipe';
import { BookViewModel } from './book.view-model';
import { ProductTile } from './product-tile';

/** Buchungsseite: Kontostand und Artikelkacheln; ein Tap bucht (F-01 bis F-04, F-26). */
@Component({
  selector: 'app-book-page',
  imports: [ProductTile, StatusClassPipe],
  templateUrl: './book-page.html',
  styleUrl: './book-page.scss',
  providers: [BookViewModel],
})
export class BookPage {
  protected readonly vm = inject(BookViewModel);
}
