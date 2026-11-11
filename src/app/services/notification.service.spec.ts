import { TestBed } from '@angular/core/testing';

import { Notification, NotificationService, toWebSocketUrl } from './notification.service';

/** Ersetzt den globalen WebSocket; merkt sich alle erzeugten Instanzen. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  readonly close = vi.fn();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  receive(message: unknown): void {
    this.onmessage!({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
}

describe('NotificationService', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('baut genau eine WebSocket-Verbindung auf, egal wie viele Abonnenten', () => {
    const service = TestBed.inject(NotificationService);
    service.on('log').subscribe();
    service.on('log').subscribe();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toMatch(/^wss?:\/\/.+\/notifications$/);
  });

  it('verteilt Nachrichten nach Typ an alle Abonnenten (nicht exklusiv)', () => {
    const service = TestBed.inject(NotificationService);
    const first: Notification[] = [];
    const second: unknown[] = [];
    service.on('log').subscribe((n) => first.push(n));
    service.payloads('log').subscribe((p) => second.push(p));

    const log = { type: 'log', time: '2026-10-08T10:15:30Z', payload: { message: 'Hallo' } };
    FakeWebSocket.instances[0].receive({ type: 'anderer-typ', time: log.time, payload: {} });
    FakeWebSocket.instances[0].receive(log);

    expect(first).toEqual([log]);
    expect(second).toEqual([{ message: 'Hallo' }]);
  });

  it('verwirft ungültiges JSON, ohne den Strom zu beenden', () => {
    const service = TestBed.inject(NotificationService);
    const received: Notification[] = [];
    service.on('log').subscribe((n) => received.push(n));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    FakeWebSocket.instances[0].receive('kein JSON');
    FakeWebSocket.instances[0].receive({ type: 'log', time: '2026-10-08T10:15:30Z', payload: {} });

    expect(received).toHaveLength(1);
  });

  it('meldet einen Verbindungsabbruch und verbindet sich danach neu', () => {
    const service = TestBed.inject(NotificationService);
    const lost = vi.fn();
    service.connectionLost$.subscribe(lost);

    FakeWebSocket.instances[0].onclose!();

    expect(lost).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('schließt die Verbindung beim Zerstören und verbindet sich nicht neu', () => {
    TestBed.inject(NotificationService);
    const socket = FakeWebSocket.instances[0];

    TestBed.resetTestingModule();
    socket.onclose!();
    vi.advanceTimersByTime(5000);

    expect(socket.close).toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('toWebSocketUrl', () => {
  it('löst relative Pfade gegen die Seite auf und wechselt auf ws/wss', () => {
    const path = '/api/notification-service/notifications';
    expect(toWebSocketUrl(path, 'http://localhost:8000/')).toBe(
      'ws://localhost:8000/api/notification-service/notifications',
    );
    expect(toWebSocketUrl(path, 'https://example.org/x')).toBe(
      'wss://example.org/api/notification-service/notifications',
    );
  });

  it('übernimmt absolute ws-URLs unverändert', () => {
    expect(toWebSocketUrl('ws://localhost:8081/notifications', 'http://localhost:4200/')).toBe(
      'ws://localhost:8081/notifications',
    );
  });
});
