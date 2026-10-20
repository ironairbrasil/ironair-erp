self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Nova notificação', {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/iron-air-seller-app-icon-v2.png',
    badge: '/iron-air-seller-app-icon-v2.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL(event.notification.data?.url || '/', self.location.origin).href));
});
