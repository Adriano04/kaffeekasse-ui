import { Routes } from '@angular/router';

import { adminGuard } from './core/session/admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'book' },
  {
    path: 'book',
    title: 'Buchen · Kaffeekasse',
    loadComponent: () => import('./features/book/book-page').then((m) => m.BookPage),
  },
  {
    path: 'account',
    title: 'Mein Konto · Kaffeekasse',
    loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'admin',
    canMatch: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  { path: '**', redirectTo: 'book' },
];
