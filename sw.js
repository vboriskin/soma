// SOMA · service worker.
// App-shell: cache-first для html/css/svg/иконок чтобы стопка открывалась
// офлайн. Картинки источников (api/cdn) — кешируются по факту просмотра
// (stale-while-revalidate с graceful fallback на cache при сетевой ошибке).
// Регистрируется только когда документ на http(s)://; на file:// браузер не
// разрешает SW.

const SHELL_CACHE = 'soma-shell-v1';
const IMG_CACHE   = 'soma-img-v1';
const SHELL = [
  './',
  './soma.html',
  './favicon.svg',
  './app-icon-512.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      // addAll бросит при первом 404 — добавляем по одному, тихо игнорируя ошибки
      Promise.all(SHELL.map((url) =>
        fetch(url, { cache: 'reload' }).then((r) => r.ok && c.put(url, r)).catch(() => null)
      ))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Same-origin app shell — cache first, network fallback, html-fallback offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp.ok && (req.destination === 'document' || req.destination === 'style' ||
                          req.destination === 'script'   || req.destination === 'image' ||
                          req.url.endsWith('.svg') || req.url.endsWith('.webmanifest'))) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        }).catch(() => caches.match('./soma.html'));
      })
    );
    return;
  }

  // 2. CDN images — stale-while-revalidate (limit to image destination)
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((resp) => {
            if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
            return resp;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // 3. Anything else (API to backend, RSS, OG-fetch) — pass through, no caching
});
