// Ersetzt environment.ts bei "ng serve --configuration docker-dev" (siehe fileReplacements in
// angular.json). Wird vom Dev-Deployment (deployment/docker-dev) genutzt: Wie in Production liefert
// nginx das Frontend aus und reicht /api/* an apisix weiter, daher die relativen Pfade.
export const environment = {
  // Prototyp mit Fake-Backend und Dummy-Daten; zeigt die Personenauswahl in der Kopfzeile.
  prototype: true,
  production: false,
  apiBasePath: '/api/beverage-management',
  notificationWsUrl: '/api/notification-service/notifications',
};
