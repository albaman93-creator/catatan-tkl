/**
 * SW.JS — Service Worker TKL OEE (Modular Version)
 * Cache semua aset aplikasi untuk mode offline.
 * Versi ditingkatkan untuk mencantumkan semua file JS modular.
 */
const CACHE_NAME = 'tkl-oee-v8';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/logsheet.css',
  './css/oee.css',
  './css/dashboard.css',
  './css/login.css',
  './css/login-professional.css',
  './css/nature.css',
  './css/print.css',
  './css/apple-style.css',
  './css/sidebar.css',
  './css/modern-sheet.css',
  './css/theme-professional.css',
  './js/config.js',
  './js/utils.js',
  './js/perf.js',
  './js/state.js',
  './js/suggest.js',
  './js/supabase-client.js',
  './js/auth.js',
  './js/ui.js',
  './js/rows.js',
  './js/navigation.js',
  './js/calculation.js',
  './js/sync.js',
  './js/storage.js',
  './js/dashboard.js',
  './js/quickmode.js',
  './js/formmode.js',
  './js/formfull.js',
  './js/bulkfill.js',
  './js/wizard.js',
  './js/printsheet.js',
  './js/scene.js',
  './js/nature.js',
  './js/fx.js',
  './js/weather.js',
  './js/settings.js',
  './js/app.js',
  './js/sheet-op-sync.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/bg-login.jpg'
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
