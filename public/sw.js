self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Iron Seller', {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/iron-seller-icon.png',
    badge: '/iron-seller-icon.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(new URL(event.notification.data?.url || '/', self.location.origin).href));
});
