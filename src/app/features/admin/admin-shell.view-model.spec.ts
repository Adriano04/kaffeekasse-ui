import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AdminShellViewModel } from './admin-shell.view-model';

@Component({ template: '' })
class EmptyPage {}

describe('AdminShellViewModel', () => {
  let vm: AdminShellViewModel;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'admin/:section', component: EmptyPage }]),
        AdminShellViewModel,
      ],
    });
    router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/bookings');
    vm = TestBed.inject(AdminShellViewModel);
  });

  it('bietet die Bereiche der Verwaltung als Tabs an', () => {
    expect(vm.tabs).toEqual(['Buchungen', 'Personen', 'Artikel', 'Kasse', 'Statistik']);
    expect(vm.activeIndex()).toBe(0);
  });

  it('nimmt den aktiven Tab aus der URL, auch mit Query-Parametern', async () => {
    await router.navigateByUrl('/admin/cash');
    expect(vm.activeIndex()).toBe(3);
    await router.navigateByUrl('/admin/bookings?payout=person-ben');
    expect(vm.activeIndex()).toBe(0);
  });

  it('navigiert beim Tab-Wechsel zur Kindroute', async () => {
    vm.selectTab(4);
    await TestBed.inject(Router).navigated;
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.url).toBe('/admin/statistics');
    expect(vm.activeIndex()).toBe(4);
  });
});
