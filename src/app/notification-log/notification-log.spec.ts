import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { Notification, NotificationService } from '../services/notification.service';
import { NotificationLog } from './notification-log';

describe('NotificationLog', () => {
  let logs: Subject<Notification<'log'>>;
  let connectionLost: Subject<void>;

  async function render() {
    const fixture = TestBed.createComponent(NotificationLog);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function entries(fixture: { nativeElement: HTMLElement }): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.rs-log__entry'));
  }

  beforeEach(async () => {
    logs = new Subject();
    connectionLost = new Subject();
    await TestBed.configureTestingModule({
      imports: [NotificationLog],
      providers: [
        {
          provide: NotificationService,
          useValue: { on: () => logs.asObservable(), connectionLost$: connectionLost },
        },
      ],
    }).compileComponents();
  });

  it('zeigt Log-Nachrichten mit Zeit, Text und Schweregrad an', async () => {
    const fixture = await render();

    logs.next({
      type: 'log',
      time: '2026-10-08T10:15:30Z',
      payload: { message: 'Bestand niedrig', severity: 'warn' },
    });
    await fixture.whenStable();

    const [entry] = entries(fixture);
    expect(entry.querySelector('.rs-log__msg')?.textContent).toBe('Bestand niedrig');
    expect(entry.querySelector('.rs-log__time')?.textContent).toBe(
      new Date('2026-10-08T10:15:30Z').toLocaleTimeString('de-DE'),
    );
    expect(entry.classList.contains('rs-log__entry--warn')).toBe(true);
  });

  it('nimmt "info" für fehlenden/unbekannten Schweregrad und verwirft Einträge ohne Text', async () => {
    const fixture = await render();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const time = '2026-10-08T10:15:30Z';
    logs.next({ type: 'log', time, payload: { message: 'ohne Schweregrad' } });
    logs.next({ type: 'log', time, payload: { message: 'falsch', severity: 'boom' as never } });
    logs.next({ type: 'log', time, payload: {} as never });
    await fixture.whenStable();

    expect(entries(fixture)).toHaveLength(2);
    for (const entry of entries(fixture)) {
      expect(entry.classList.contains('rs-log__entry--warn')).toBe(false);
      expect(entry.classList.contains('rs-log__entry--crit')).toBe(false);
    }
  });

  it('meldet Verbindungsabbrüche als Warnung', async () => {
    const fixture = await render();

    connectionLost.next();
    await fixture.whenStable();

    const [entry] = entries(fixture);
    expect(entry.classList.contains('rs-log__entry--warn')).toBe(true);
  });
});
