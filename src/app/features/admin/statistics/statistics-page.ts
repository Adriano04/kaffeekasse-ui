import { Component, inject } from '@angular/core';

import { StatisticsViewModel } from './statistics.view-model';

/** Verwaltung › Statistik (F-17 bis F-19): Stichtagswerte, keine Zeitraumauswahl. */
@Component({
  selector: 'app-statistics-page',
  templateUrl: './statistics-page.html',
  styleUrl: '../admin-page.scss',
  providers: [StatisticsViewModel],
})
export class StatisticsPage {
  protected readonly vm = inject(StatisticsViewModel);
}
