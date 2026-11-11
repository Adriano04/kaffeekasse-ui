import { TestBed } from '@angular/core/testing';
import { PartialMatchRouteSnapshot, Route, UrlTree, provideRouter } from '@angular/router';

import { BEN } from '../../testing/test-data';
import { provideTestEnvironment, testSession } from '../../testing/test-environment';
import { adminGuard } from './admin.guard';

describe('F-35 adminGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestEnvironment()] });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      adminGuard({} as Route, [], {} as PartialMatchRouteSnapshot),
    );

  it('lässt Personen mit Rolle Verwaltung durch', () => {
    expect(run()).toBe(true);
  });

  it('leitet alle anderen zur Buchungsseite', () => {
    testSession().switchTo(BEN);
    const result = run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/book');
  });
});
