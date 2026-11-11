import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { NotificationService } from './services/notification.service';
import { BEN } from './testing/test-data';
import { provideTestEnvironment, settle, testSession } from './testing/test-environment';

describe('App-Shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestEnvironment(),
        // Der Prototyp darf keine WebSocket-Verbindung öffnen: Jede Verwendung schlägt fehl.
        {
          provide: NotificationService,
          useFactory: () => {
            throw new Error('NotificationService darf im Prototyp nicht verwendet werden');
          },
        },
      ],
    });
  });

  afterEach(() => {
    // Keine Anfrage an das Backend, auch nicht an /hello.
    TestBed.inject(HttpTestingController).verify();
  });

  async function render(url: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    await settle();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const navLabels = (root: HTMLElement) =>
    [...root.querySelectorAll('nav[aria-label="Hauptnavigation"] a')].map((a) =>
      a.textContent?.trim(),
    );

  it('startet auf der Buchungsseite mit Titel, Untertitel und Navigation', async () => {
    const root = await render('/');

    expect(TestBed.inject(Router).url).toBe('/book');
    expect(document.title).toBe('Buchen · Kaffeekasse');
    expect(root.querySelector('.rs-app-bar__title')?.textContent).toContain('Kaffeekasse');
    expect(root.querySelector('.rs-app-bar__subtitle')?.textContent).toBe('Testbüro');
    expect(navLabels(root)).toEqual(['Buchen', 'Mein Konto', 'Verwaltung']);
    expect(root.querySelector('a[aria-current="page"]')?.textContent?.trim()).toBe('Buchen');
    expect(root.querySelector('h1')?.textContent).toBe('Getränk wählen');
  });

  it('F-35 zeigt „Verwaltung“ nur mit Rolle Verwaltung', async () => {
    testSession().switchTo(BEN);
    const root = await render('/account');
    expect(navLabels(root)).toEqual(['Buchen', 'Mein Konto']);
    expect(root.querySelector('a[aria-current="page"]')?.textContent?.trim()).toBe('Mein Konto');
  });

  it('F-35 leitet ohne Rolle Verwaltung von /admin zur Buchungsseite um', async () => {
    testSession().switchTo(BEN);
    await render('/admin');
    expect(TestBed.inject(Router).url).toBe('/book');
  });

  it('enthält genau einen Toast-Host und den Hinweis auf die Dummy-Daten', async () => {
    const root = await render('/book');
    expect(root.querySelectorAll('rs-toast-host').length).toBe(1);
    expect(root.querySelector('footer')?.textContent).toContain('Prototyp mit Dummy-Daten');
  });

  it('wechselt über die Personenauswahl die Person und verlässt dabei die Verwaltung', async () => {
    const root = await render('/admin');
    expect(root.querySelector('h1')?.textContent).toBe('Verwaltung');

    const select = root.querySelector<HTMLSelectElement>('#person-switcher')!;
    expect(select.value).toBe('person-anna');
    select.value = BEN;
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/book');
    expect(testSession().currentPerson()?.displayName).toBe('Ben');
    expect(navLabels(root)).toEqual(['Buchen', 'Mein Konto']);
  });

  it('setzt mit dem Sprunglink den Fokus auf den Inhalt', async () => {
    const root = await render('/book');
    root.querySelector<HTMLAnchorElement>('.rs-app-bar__skip-link')!.click();
    expect(document.activeElement?.id).toBe('content');
    expect(TestBed.inject(Router).url).toBe('/book');
  });
});
