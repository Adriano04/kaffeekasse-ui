import { Component, inject } from '@angular/core';

import { AmountDisplay } from '../../shared/amount-display';
import { StatusClassPipe } from '../../shared/status-class.pipe';
import { AccountViewModel } from './account.view-model';

/** „Mein Konto“: Kontostand, Zahlungshinweis, Verlauf und Zahlungsinformationen (F-06 bis F-08, F-37). */
@Component({
  selector: 'app-account-page',
  imports: [AmountDisplay, StatusClassPipe],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
  providers: [AccountViewModel],
})
export class AccountPage {
  protected readonly vm = inject(AccountViewModel);
}
