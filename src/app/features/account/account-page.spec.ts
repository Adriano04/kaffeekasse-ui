import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountFacade } from '../../core/facades/account.facade';
import { JournalFacade } from '../../core/facades/journal.facade';
import { ANNA, COFFEE } from '../../testing/test-data';
import { provideTestEnvironment, settle, testClock } from '../../testing/test-environment';
import { AccountPage } from './account-page';

describe('AccountPage', () => {
  let fixture: ComponentFixture<AccountPage>;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment()] });
    fixture = TestBed.createComponent(AccountPage);
    root = fixture.nativeElement as HTMLElement;
    await stable();
  });

  /** Wartet auf Abfragen und Befehle und rendert danach neu. */
  async function stable(): Promise<void> {
    await settle();
    await fixture.whenStable();
  }

  const text = (selector: string) =>
    root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  it('F-08 zeigt den Kontostand groß mit Farbe, Vorzeichen und Text', () => {
    const stat = root.querySelector('.rs-stat')!;
    expect([...stat.classList]).toEqual(expect.arrayContaining(['rs-stat--lg', 'rs-stat--crit']));
    expect(text('.rs-stat__value')).toBe('−0,50 €');
    expect(text('.rs-stat__hint')).toBe('offen');
  });

  it('F-06 zeigt ab −5,00 € den Zahlungshinweis', async () => {
    expect(root.querySelector('.rs-callout--warn')).toBeNull();
    await TestBed.inject(JournalFacade).recordAdjustment(
      { personId: ANNA, amount: -680, reason: 'x' },
      'k1',
    );
    await stable();
    expect(text('.rs-callout--warn .rs-callout__body')).toContain('Zahle am besten 10,00 €');
  });

  it('F-07 zeigt den Verlauf als Eintragsliste mit Badge, Betrag und Stand danach', () => {
    const items = root.querySelectorAll('.rs-item-list__item');
    expect(items.length).toBe(1);
    expect(text('.rs-item-list__title .rs-badge')).toBe('Tee');
    expect(root.querySelector('.rs-item-list__title .rs-badge')?.classList).toContain(
      'rs-badge--crit',
    );
    expect(text('.rs-item-list__value')).toBe('−0,50 €');
    expect(text('.rs-item-list__sub')).toBe('Stand −0,50 €');
  });

  it('F-26 zeigt „Rückgängig“ an der neuen Buchung, bis die Frist abläuft', async () => {
    await TestBed.inject(AccountFacade).bookConsumption(COFFEE, 'k1');
    await stable();
    await stable();
    expect(root.querySelectorAll('.rs-item-list__actions button').length).toBe(1);

    testClock().advance(5 * 60_000);
    await stable();
    expect(root.querySelectorAll('.rs-item-list__actions button').length).toBe(0);
  });

  it('F-37 zeigt die Zahlungsinformationen mit Verwendungszweck', () => {
    expect(text('.account-page__payment')).toContain('Verwendungszweck: Kaffeekasse KK-01 Anna');
    expect(root.querySelector<HTMLAnchorElement>('.account-page__payment a')?.href).toBe(
      'https://paypal.example/test',
    );
  });
});
