import {
  Signal,
  assertInInjectionContext,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';

import { DataVersion } from '../data/data-version';
import { Failure, Result, fail } from '../model/result';

/** Abfrage als lesbare Signals für Wert, Ladezustand und Fehler. */
export interface Query<T> {
  /**
   * Zuletzt geladener Wert oder `undefined`, solange noch nichts geladen ist.
   * Beim Neuladen nach einer Änderung bleibt der bisherige Wert stehen, bis
   * der neue da ist; nach einem Personenwechsel wird er sofort verworfen.
   */
  readonly value: Signal<T | undefined>;
  /** Die Abfrage läuft gerade (erstes Laden oder Neuladen). */
  readonly loading: Signal<boolean>;
  /** Fehler der letzten Abfrage oder `null`. */
  readonly error: Signal<Failure | null>;
  /** Lädt erneut, z. B. nach einem Fehler („Erneut versuchen“). */
  reload(): void;
}

/** Einstellungen von {@link createQuery}. */
export interface QueryOptions<T, P> {
  /**
   * Schlüssel der Daten, in der Regel die ID der angemeldeten Person.
   * `undefined` = nicht laden (z. B. ohne Anmeldung oder ohne Rolle Verwaltung).
   */
  readonly key: () => string | undefined;
  /** Weitere Parameter der Abfrage, z. B. ein Zeitraum. */
  readonly params?: () => P;
  /** Lädt die Daten über das Repository. */
  readonly load: (params: P) => Promise<Result<T>>;
}

/** Fehler einer Abfrage, damit `resource()` ihn als Fehlerzustand führt. */
class QueryFailure extends Error {
  constructor(readonly failure: Failure) {
    super(failure.code);
  }
}

interface Loaded<T> {
  readonly key: string;
  readonly value: T;
}

/**
 * Bindet eine Abfrage des Repositorys per `resource()` an Signals. Die Abfrage
 * lädt neu, wenn sich Schlüssel, Parameter oder der Datenstand
 * ({@link DataVersion}) ändern. Muss im Injection Context aufgerufen werden;
 * die Abfrage lebt so lange wie dessen Injector.
 */
export function createQuery<T, P = void>(options: QueryOptions<T, P>): Query<T> {
  assertInInjectionContext(createQuery);
  const dataVersion = inject(DataVersion);

  // Zuletzt geladener Wert. resource() setzt seinen Wert bei neuen Parametern
  // sofort zurück; damit die Anzeige beim Neuladen nicht flackert, bleibt
  // dieser Wert stehen, solange der Schlüssel gleich ist.
  const lastLoaded = signal<Loaded<T> | undefined>(undefined);

  const source = resource({
    params: () => {
      const key = options.key();
      if (key === undefined) {
        return undefined;
      }
      return { key, version: dataVersion.version(), params: options.params?.() as P };
    },
    loader: async ({ params, abortSignal }): Promise<Loaded<T>> => {
      const result = await options.load(params.params);
      if (!result.ok) {
        throw new QueryFailure(result.failure);
      }
      const loaded = { key: params.key, value: result.value };
      // Eine überholte Anfrage (Parameter inzwischen geändert) darf den Wert nicht überschreiben.
      if (!abortSignal.aborted) {
        lastLoaded.set(loaded);
      }
      return loaded;
    },
  });

  return {
    value: computed(() => {
      const loaded = lastLoaded();
      return loaded !== undefined && loaded.key === options.key() ? loaded.value : undefined;
    }),
    loading: computed(() => source.isLoading()),
    error: computed(() => (source.status() === 'error' ? toFailure(source.error()) : null)),
    reload: () => {
      source.reload();
    },
  };
}

/**
 * Führt einen Befehl aus und erhöht bei Erfolg den Datenstand, damit alle
 * Abfragen neu laden. Unerwartete Ausnahmen werden zu `TECHNICAL_ERROR`.
 */
export async function runCommand<T>(
  dataVersion: DataVersion,
  command: () => Promise<Result<T>>,
): Promise<Result<T>> {
  const result = await runRequest(command);
  if (result.ok) {
    dataVersion.increment();
  }
  return result;
}

/** Führt eine einzelne Anfrage aus; unerwartete Ausnahmen werden zu `TECHNICAL_ERROR`. */
export async function runRequest<T>(request: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await request();
  } catch (error) {
    console.error('Anfrage fehlgeschlagen', error);
    return fail('TECHNICAL_ERROR');
  }
}

function toFailure(error: Error | undefined): Failure {
  return error instanceof QueryFailure ? error.failure : { code: 'TECHNICAL_ERROR' };
}
