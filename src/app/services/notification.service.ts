import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';
import { filter, map, Observable, Subject } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * Payload-Format je Nachrichtentyp. Neuer Typ: hier eintragen, dann kann jede Komponente per
 * `notificationService.on('<typ>')` typisiert darauf hören. Die Payloads kommen ungeprüft vom
 * Server (Producer schreiben beliebiges JSON nach Kafka) - Abnehmer müssen sie validieren.
 */
export interface NotificationPayloads {
  log: { message: string; severity?: 'info' | 'warn' | 'crit' };
}

export type NotificationType = keyof NotificationPayloads;

/** Umschlag jeder Nachricht des notification-service (siehe Notification.kt). */
export interface Notification<T extends NotificationType = NotificationType> {
  type: T;
  /** ISO-8601 */
  time: string;
  payload: NotificationPayloads[T];
}

const RECONNECT_DELAY_MS = 5000;

/**
 * Einzige WebSocket-Verbindung der Anwendung zum notification-service (der Nachrichten aus dem
 * Kafka-Topic "notification" weiterreicht). Komponenten hören per [on] auf die Typen, die sie
 * interessieren; jede Nachricht geht an alle Abonnenten ihres Typs (nicht exklusiv).
 *
 * Bewusst Observables statt Signals: Signals liefern nur den letzten Wert, kurz hintereinander
 * eintreffende Nachrichten gingen verloren.
 *
 * Bricht die Verbindung ab (z. B. Neustart des Service), wird sie nach kurzer Pause neu aufgebaut;
 * Nachrichten aus der Zwischenzeit sind verloren.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly document = inject(DOCUMENT);

  private readonly messages = new Subject<Notification>();
  private readonly _connectionLost = new Subject<void>();
  /** Feuert bei jedem Verbindungsabbruch (vor dem automatischen Neuverbinden). */
  readonly connectionLost$: Observable<void> = this._connectionLost.asObservable();

  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.reconnectTimer);
      this.socket?.close();
      this.messages.complete();
      this._connectionLost.complete();
    });
    this.connect();
  }

  /** Alle Nachrichten des angegebenen Typs. */
  on<T extends NotificationType>(type: T): Observable<Notification<T>> {
    return this.messages.pipe(
      filter((notification): notification is Notification<T> => notification.type === type),
    );
  }

  /** Nur die Payloads des angegebenen Typs. */
  payloads<T extends NotificationType>(type: T): Observable<NotificationPayloads[T]> {
    return this.on(type).pipe(map((notification) => notification.payload));
  }

  private connect(): void {
    const socket = new WebSocket(
      toWebSocketUrl(environment.notificationWsUrl, this.document.location.href),
    );
    this.socket = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      let notification: Notification;
      try {
        notification = JSON.parse(event.data);
      } catch {
        console.warn('Ungültige Nachricht vom notification-service verworfen', event.data);
        return;
      }
      this.messages.next(notification);
    };
    // onclose kommt auch nach einem fehlgeschlagenen Verbindungsaufbau, onerror braucht es daher nicht.
    socket.onclose = () => {
      if (this.destroyed) {
        return;
      }
      this._connectionLost.next();
      this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    };
  }
}

/** Relative Pfade (Deployments hinter nginx) auf ws(s)://<Host der Seite>/... abbilden. */
export function toWebSocketUrl(url: string, pageUrl: string): string {
  const resolved = new URL(url, pageUrl);
  resolved.protocol = resolved.protocol.replace(/^http/, 'ws');
  return resolved.href;
}
