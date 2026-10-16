self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Nova notificação', {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/iron-seller-app-icon-v3.png',
    badge: '/iron-seller-app-icon-v3.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL(event.notification.data?.url || '/', self.location.origin).href));
});
