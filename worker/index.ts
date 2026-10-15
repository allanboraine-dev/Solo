/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Push Notification Event Listener
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'SOLO E-Hailing Alert';
    const role = data.role || 'rider';
    const defaultIcon = role === 'driver' ? '/driver-icon-192.png' : '/rider-icon-192.png';

    const options: NotificationOptions = {
      body: data.body || 'You have an active ride update.',
      icon: data.icon || defaultIcon,
      badge: '/icon-192.png',
      // @ts-expect-error vibrate is standard in Push API
      vibrate: [200, 100, 200, 100, 300],
      tag: data.tag || 'solo-notification',
      renotify: true,
      requireInteraction: role === 'driver', // Driver ride alerts stay visible until acted upon
      data: {
        url: data.url || (role === 'driver' ? '/driver' : '/rider'),
        tripId: data.tripId,
        timestamp: Date.now(),
      },
      actions: [
        {
          action: 'open',
          title: 'Open App',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[ServiceWorker] Push error:', err);
    // Fallback for plain text push data
    const plainText = event.data.text();
    event.waitUntil(
      self.registration.showNotification('SOLO Notification', {
        body: plainText,
        icon: '/icon-192.png',
      })
    );
  }
});

// Notification Click Event Listener
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open at the target domain, focus it and navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client && client.url !== targetUrl) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

export {};
