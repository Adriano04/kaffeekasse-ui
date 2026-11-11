import { TestBed } from '@angular/core/testing';

import { BEN } from '../testing/test-data';
import { provideTestEnvironment, settle, testSession } from '../testing/test-environment';
import { HeaderViewModel } from './header.view-model';

describe('HeaderViewModel', () => {
  let vm: HeaderViewModel;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment(), HeaderViewModel] });
    vm = TestBed.inject(HeaderViewModel);
  });

  afterEach(() => {
    document.body.classList.remove('rs-root--light');
  });

  it('zeigt Name und Untertitel aus den Einstellungen', async () => {
    expect(vm.title()).toBe('Kaffeekasse');
    await settle();
    expect(vm.subtitle()).toBe('Testbüro');
  });

  it('F-35 zeigt „Verwaltung“ nur mit Rolle Verwaltung', () => {
    expect(vm.links().map((link) => link.path)).toEqual(['/book', '/account', '/admin']);
    testSession().switchTo(BEN);
    expect(vm.links().map((link) => link.label)).toEqual(['Buchen', 'Mein Konto']);
  });

  it('schaltet zwischen dunkler und heller Darstellung um', () => {
    expect(vm.themeToggle().label).toBe('Hell');
    vm.toggleTheme();
    expect(vm.lightMode()).toBe(true);
    expect(document.body.classList).toContain('rs-root--light');
    expect(vm.themeToggle()).toEqual({
      icon: '☾',
      label: 'Dunkel',
      ariaLabel: 'Zur dunklen Darstellung wechseln',
    });
  });

  it('zeigt im Prototyp die Personenauswahl', () => {
    expect(vm.showPersonSwitcher).toBe(true);
  });
});
