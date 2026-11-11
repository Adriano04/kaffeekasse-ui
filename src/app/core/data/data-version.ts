import { Injectable, signal } from '@angular/core';

/**
 * Datenstand der Anwendung. Jeder erfolgreiche Befehl erhöht die Version; alle
 * Abfragen der Facades hängen von ihr ab und laden danach neu. Später erhöhen
 * auch Meldungen des notification-service die Version (T-05).
 */
@Injectable({ providedIn: 'root' })
export class DataVersion {
  private readonly _version = signal(0);

  /** Aktuelle Version, beginnt bei 0. */
  readonly version = this._version.asReadonly();

  /** Meldet geänderte Daten; alle abhängigen Abfragen laden neu. */
  increment(): void {
    this._version.update((version) => version + 1);
  }
}
