/**
 * SW.JS — Service Worker TKL OEE (Modular Version)
 * Cache semua aset aplikasi untuk mode offline.
 * Versi ditingkatkan untuk mencantumkan semua file JS modular.
 */
const CACHE_NAME = 'tkl-oee-v4';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/state.js',
  './js/auth.js',
  './js/ui.js',
  './js/rows.js',
  './js/navigation.js',
  './js/calculation.js',
  './js/storage.js',
  './js/scene.js',
  './js/fx.js',
  './js/weather.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // JANGAN cache request ke Google (Apps Script / Sheets / Fonts)
  if (url.hostname.includes('google.com') || url.hostname.includes('gstatic.com') || url.href.includes('script.google.com')) {
    return;
  }

  // Navigation requests (HTML) — network first, fallback ke cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets — cache first, lalu network, lalu update cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            // Stale-while-revalidate: return cache dulu, update di background
            fetch(request).then((netRes) => {
              if (netRes && netRes.status === 200) {
                caches.open(CACHE_NAME).then((c) => c.put(request, netRes));
              }
            }).catch(() => {});
            return cached;
          }
          return fetch(request).then((netRes) => {
            if (netRes && netRes.status === 200) {
              const copy = netRes.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return netRes;
          });
        })
    );
    return;
  }
});
