// sw.js
const CACHE_NAME = 'fima-oee-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Install event: precache assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

// Activate event: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

// Helper: check if URL is a sync/API request to Google Apps Script
function isSyncRequest(url) {
  return url.includes('script.google.com') || 
         url.includes('macros/s/') ||
         url.includes('/exec');
}

// Helper: check if request is navigation (HTML document)
function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.destination === 'document' && request.method === 'GET');
}

// Helper: check if request is same-origin static asset
function isStaticAsset(url) {
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return false;
  
  const path = url.pathname;
  // Static assets: css, js, images, fonts, manifest
  if (path.match(/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf|json)$/i)) return true;
  // Fonts from Google (cross-origin) will be handled by network-first
  return false;
}

// Fetch event: handle requests
self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip sync/API requests to Google Apps Script
  if (isSyncRequest(url.href)) {
    return;
  }

  // Navigation requests: network-first with fallback to index.html
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          // Cache the fresh document for offline use
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Static assets: cache-first (stale-while-revalidate)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request)
        .then(function(cachedResponse) {
          // Return cached response if available
          if (cachedResponse) {
            // Revalidate in background
            fetch(request).then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(function(cache) {
                  cache.put(request, networkResponse);
                });
              }
            }).catch(function() {});
            return cachedResponse;
          }
          // Fallback to network if not in cache
          return fetch(request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(request, networkResponse.clone());
              });
            }
            return networkResponse;
          });
        })
    );
    return;
  }

  // For all other same-origin requests: network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(function(response) {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(request);
        })
    );
    return;
  }

  // For cross-origin requests: network-first (no caching of opaque responses)
  event.respondWith(
    fetch(request).catch(function() {
      // Only return cached response if it's not opaque
      return caches.match(request).then(function(cached) {
        if (cached && cached.type !== 'opaque') {
          return cached;
        }
        // Return a fallback or just let it fail
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});