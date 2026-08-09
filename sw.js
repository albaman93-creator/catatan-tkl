const CACHE_NAME = 'fima-oee-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

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

function isSyncRequest(url) {
  return url.includes('script.google.com') || 
         url.includes('macros/s/') ||
         url.includes('/exec');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.destination === 'document' && request.method === 'GET');
}

function isStaticAsset(url) {
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return false;
  const path = url.pathname;
  if (path.match(/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf|json)$/i)) return true;
  return false;
}

self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (isSyncRequest(url.href)) {
    return;
  }

  if (isNavigationRequest(request)) {
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
          return caches.match('./index.html');
        })
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request)
        .then(function(cachedResponse) {
          if (cachedResponse) {
            fetch(request).then(function(networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(function(cache) {
                  cache.put(request, networkResponse);
                });
              }
            }).catch(function() {});
            return cachedResponse;
          }
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

  event.respondWith(
    fetch(request).catch(function() {
      return caches.match(request).then(function(cached) {
        if (cached && cached.type !== 'opaque') {
          return cached;
        }
        return new Response('', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});