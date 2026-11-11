// Standard-Environment (verwendet für "ng build" ohne Konfiguration, d.h. Production-Build).
// Relative Pfade: Im Deployment (deployment/docker) liefert nginx das Frontend aus und reicht
// /api/* an apisix weiter, das /api/<service>/* auf den jeweiligen Service routet (WebSocket des
// notification-service eingeschlossen).
export const environment = {
  // Prototyp mit Fake-Backend und Dummy-Daten; zeigt die Personenauswahl in der Kopfzeile.
  prototype: true,
  production: true,
  apiBasePath: '/api/beverage-management',
  notificationWsUrl: '/api/notification-service/notifications',
};
