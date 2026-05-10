// SOMA · service worker.
// Стратегия:
//  - Документы (`./` и `./index.html`, `./soma.html`) — NETWORK-FIRST,
//    чтобы юзер всегда видел свежий деплой. Кеш — только как fallback
//    при оффлайне.
//  - Иконки, svg, манифест, json — cache-first (редко меняются, бьём
//    через bump SHELL_CACHE версии).
//  - Картинки внешних CDN — stale-while-revalidate.
//
// Bump SHELL_CACHE version при изменении этой стратегии — это форсит
// activate handler удалить старый кеш у всех юзеров.

const SHELL_CACHE = 'soma-shell-v2';
const IMG_CACHE   = 'soma-img-v1';
const SHELL = [
  './favicon.svg',
  './app-icon-512.svg',
  './manifest.webmanifest',
];
// Документы, которые на старом кеше могли застрять. Network-first их
// тащит свежими; но если оффлайн — отдаём из любого имеющегося кеша.
const DOC_PATHS = new Set(['/', '/index.html', '/soma.html']);

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      Promise.all(SHELL.map((url) =>
        fetch(url, { cache: 'reload' }).then((r) => r.ok && c.put(url, r)).catch(() => null)
      ))
    )
  );
});

self.addEventListener('activate', (e) => {
  // Снести устаревшие кеши + клейм клиентов чтобы новый SW сразу работал
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

  // 1. Same-origin
  if (url.origin === self.location.origin) {
    const isDoc = req.mode === 'navigate'
               || req.destination === 'document'
               || DOC_PATHS.has(url.pathname);

    if (isDoc) {
      // Network-first для HTML — критично чтобы новые деплои подъезжали
      // без юзерского hard-refresh / unregister SW. Фолбэк на любой
      // имеющийся кеш только при оффлайне.
      event.respondWith(
        fetch(req).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        }).catch(() =>
          caches.match(req).then((c) => c || caches.match('./index.html')).catch(() => null)
        )
      );
      return;
    }

    // Статика (svg/json/manifest) — cache-first, удобно для иконок.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp.ok && (req.destination === 'style' ||
                          req.destination === 'script'   || req.destination === 'image' ||
                          req.url.endsWith('.svg') || req.url.endsWith('.webmanifest') ||
                          req.url.endsWith('.json'))) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        }).catch(() => caches.match('./index.html'));
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
