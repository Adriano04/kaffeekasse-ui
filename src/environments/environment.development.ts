// Ersetzt environment.ts bei "ng serve" / "ng build --configuration development"
// (siehe fileReplacements in angular.json). Backend läuft lokal per "quarkus:dev" auf Port 8080,
// notification-service auf Port 8081.
export const environment = {
  // Prototyp mit Fake-Backend und Dummy-Daten; zeigt die Personenauswahl in der Kopfzeile.
  prototype: true,
  production: false,
  apiBasePath: 'http://localhost:8080',
  notificationWsUrl: 'ws://localhost:8081/notifications',
};
