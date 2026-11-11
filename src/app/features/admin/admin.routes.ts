import { Routes } from '@angular/router';

import { AdminShell } from './admin-shell';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'bookings' },
      {
        path: 'bookings',
        title: 'Buchungen · Verwaltung · Kaffeekasse',
        loadComponent: () => import('./bookings/bookings-page').then((m) => m.BookingsPage),
      },
      {
        path: 'people',
        title: 'Personen · Verwaltung · Kaffeekasse',
        loadComponent: () => import('./people/people-page').then((m) => m.PeoplePage),
      },
      {
        path: 'products',
        title: 'Artikel · Verwaltung · Kaffeekasse',
        loadComponent: () => import('./products/products-page').then((m) => m.ProductsPage),
      },
      {
        path: 'cash',
        title: 'Kasse · Verwaltung · Kaffeekasse',
        loadComponent: () => import('./cash/cash-page').then((m) => m.CashPage),
      },
      {
        path: 'statistics',
        title: 'Statistik · Verwaltung · Kaffeekasse',
        loadComponent: () => import('./statistics/statistics-page').then((m) => m.StatisticsPage),
      },
    ],
  },
];
