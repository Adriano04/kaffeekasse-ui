import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RsToastService } from 'custom-components';

import { BEN } from '../../testing/test-data';
import { provideTestEnvironment, settle, testSession } from '../../testing/test-environment';
import { BookPage } from './book-page';

describe('BookPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestEnvironment()] });
  });

  let fixture: ComponentFixture<BookPage>;

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BookPage);
    await stable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Wartet auf Abfragen und Befehle und rendert danach neu. */
  async function stable(): Promise<void> {
    await settle();
    await fixture.whenStable();
  }

  it('F-08 zeigt den Kontostand mit Farbe, Vorzeichen und Text', async () => {
    const root = await render();
    const stat = root.querySelector('.rs-stat')!;
    expect(stat.classList).toContain('rs-stat--crit');
    expect(stat.classList).toContain('rs-stat--inline');
    expect(stat.querySelector('.rs-stat__label')?.textContent).toBe('Kontostand von Anna');
    expect(stat.querySelector('.rs-stat__value')?.textContent?.replace(/\s/g, ' ')).toBe('−0,50 €');
    expect(stat.querySelector('.rs-stat__hint')?.textContent).toBe('offen');
  });

  it('F-08 zeigt Guthaben grün', async () => {
    testSession().switchTo(BEN);
    const root = await render();
    expect(root.querySelector('.rs-stat')?.classList).toContain('rs-stat--ok');
    expect(root.querySelector('.rs-stat__hint')?.textContent).toBe('Guthaben');
  });

  it('F-01 Antippen einer Kachel bucht und bestätigt mit einem Toast', async () => {
    const root = await render();
    const tiles = [...root.querySelectorAll<HTMLButtonElement>('app-product-tile button')];
    expect(tiles.map((tile) => tile.querySelector('.rs-card__title')?.textContent)).toEqual([
      'Kaffee',
      'Tee',
    ]);

    tiles[0].click();
    await stable();
    await stable();

    const toast = TestBed.inject(RsToastService).toasts().at(-1);
    expect(toast?.message).toContain('Kaffee gebucht');
    expect(root.querySelector('.rs-stat__value')?.textContent?.replace(/\s/g, ' ')).toBe('−1,00 €');
  });
});
