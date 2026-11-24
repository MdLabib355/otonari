// Otonari Service Worker: deduplicated build-versioned precaching, network-first HTML, and Web Push.

const MANIFEST = self.__WB_MANIFEST || [];
// Deduplicate and root-anchor URLs so cache.addAll() never rejects with Duplicate requests.
const PRECACHE_URLS = [
  ...new Set(
    MANIFEST.map((entry) => {
      const u = typeof entry === 'string' ? entry : entry.url;
      return u.startsWith('/') ? u : `/${u}`;
    })
  ),
];

const BUILD_TAG = MANIFEST.map((e) => (typeof e === 'string' ? e : `${e.url}:${e.revision || ''}`)).join('|');
let hash = 0;
for (let i = 0; i < BUILD_TAG.length; i += 1) {
  hash = (Math.imul(31, hash) + BUILD_TAG.charCodeAt(i)) | 0;
}
const CACHE_NAME = `otonari-shell-${(hash >>> 0).toString(36)}`;

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

// Always load /api and /uploads from network; network-first for HTML navigations & /index.html.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(fetch(request.url, { cache: 'no-cache' }).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
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
