// Otonari Service Worker: caches built app assets for offline fallback AND handles Web Push notifications.

const CACHE_NAME = 'otonari-shell-v3';
const PRECACHE_URLS = (self.__WB_MANIFEST || []).map((entry) =>
  typeof entry === 'string' ? entry : entry.url
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Always load /api and /uploads from network; network-first for SPA navigations with cached index.html fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Layer 3: Display localized OS notification when server fires a Web Push message.
self.addEventListener('push', (event) => {
  let payload = { title: 'Otonari', body: 'New neighborhood update', url: '/loans', tag: 'otonari' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Use defaults if payload isn't JSON
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'otonari',
      data: { url: payload.url || '/loans' },
    })
  );
});

// Tapping an OS notification opens or focuses the exact loan screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url;
  const targetUrl = typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/loans';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate?.(targetUrl));
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
