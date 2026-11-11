import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClock } from './core/clock/clock';
import { providePrototype } from './prototype/provide-prototype';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideClock(),
    // Fake-Backend und simulierte Anmeldung. Für die Anbindung an Backend und Keycloak wird nur
    // dieser Aufruf ersetzt.
    providePrototype(),
  ],
};
