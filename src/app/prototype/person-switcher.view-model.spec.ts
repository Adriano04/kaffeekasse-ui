import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RsToastService } from 'custom-components';

import { DataVersion } from '../core/data/data-version';
import { ANNA, BEN } from '../testing/test-data';
import { provideTestEnvironment, settle, testSession } from '../testing/test-environment';
import { PersonSwitcherViewModel } from './person-switcher.view-model';

@Component({ template: '' })
class EmptyPage {}

describe('Prototyp: PersonSwitcherViewModel', () => {
  let vm: PersonSwitcherViewModel;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestEnvironment(),
        provideRouter([
          { path: 'book', component: EmptyPage },
          { path: 'admin', component: EmptyPage },
        ]),
        PersonSwitcherViewModel,
      ],
    });
    vm = TestBed.inject(PersonSwitcherViewModel);
    router = TestBed.inject(Router);
    await settle();
  });

  it('bietet alle aktiven Personen an und markiert die angemeldete', () => {
    expect(vm.options()).toEqual([
      { id: ANNA, label: 'Anna (Verwaltung)', selected: true },
      { id: BEN, label: 'Ben', selected: false },
    ]);
    expect(vm.nobodySelected()).toBe(false);
  });

  it('behält die Liste beim Neuladen nach einer Änderung', async () => {
    TestBed.inject(DataVersion).increment();
    expect(vm.options().length).toBe(2);
    await settle();
    expect(vm.options().length).toBe(2);
  });

  it('führt aus der Verwaltung zur Buchungsseite, wenn die neue Person die Rolle nicht hat', async () => {
    await router.navigateByUrl('/admin');
    await vm.switchTo(BEN);
    expect(testSession().currentPerson()?.id).toBe(BEN);
    expect(router.url).toBe('/book');
  });

  it('bleibt in der Verwaltung, wenn die neue Person die Rolle hat', async () => {
    testSession().switchTo(BEN);
    await router.navigateByUrl('/admin');
    await vm.switchTo(ANNA);
    expect(router.url).toBe('/admin');
  });

  it('schließt offene Meldungen der vorherigen Person', async () => {
    const toasts = TestBed.inject(RsToastService);
    toasts.show({ message: 'Kaffee gebucht' });
    await vm.switchTo(BEN);
    expect(toasts.toasts()).toEqual([]);
  });
});
