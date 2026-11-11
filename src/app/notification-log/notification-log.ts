import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RsLogEntry, RsLogPanel, RsLogSeverity } from 'custom-components';

import { Notification, NotificationService } from '../services/notification.service';

/** Ältere Einträge fallen raus, damit die Liste bei langer Laufzeit nicht unbegrenzt wächst. */
const MAX_ENTRIES = 200;
const SEVERITIES: readonly RsLogSeverity[] = ['info', 'warn', 'crit'];

// Zeigt die Nachrichten vom Typ "log" des notification-service an, außerdem Verbindungsabbrüche.
// Payload-Format (Kafka-Topic "notification"):
//   {"type": "log", "payload": {"message": "...", "severity": "info" | "warn" | "crit"}}
@Component({
  selector: 'app-notification-log',
  template: `<rs-log-panel [entries]="entries()" />`,
  imports: [RsLogPanel],
})
export class NotificationLog {
  protected readonly entries = signal<readonly RsLogEntry[]>([]);

  constructor() {
    const notificationService = inject(NotificationService);

    notificationService
      .on('log')
      .pipe(takeUntilDestroyed())
      .subscribe((notification) => this.appendNotification(notification));

    notificationService.connectionLost$.pipe(takeUntilDestroyed()).subscribe(() =>
      this.append({
        time: formatTime(new Date()),
        message: 'Verbindung zum Benachrichtigungsdienst getrennt, neuer Versuch in 5 s',
        severity: 'warn',
      }),
    );
  }

  // Payload kommt ungeprüft von beliebigen Kafka-Producern.
  private appendNotification({ time, payload }: Notification<'log'>): void {
    if (typeof payload?.message !== 'string') {
      console.warn('Log-Nachricht ohne "message" verworfen', payload);
      return;
    }
    this.append({
      time: formatTime(new Date(time)),
      message: payload.message,
      severity: SEVERITIES.includes(payload.severity!) ? payload.severity : 'info',
    });
  }

  private append(entry: RsLogEntry): void {
    this.entries.update((entries) => [...entries, entry].slice(-MAX_ENTRIES));
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE');
}
