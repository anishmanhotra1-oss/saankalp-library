const CACHE_NAME = 'libnexa-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/logo.svg',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
  '/upsc-analyzer/css/upsc-analyzer.css',
  '/upsc-analyzer/public/upsc-analyzer.js',
  '/upsc-analyzer/data/syllabus.json'
];

// 1. Install Event: Cache Core Static Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[LibNexa PWA SW] Pre-caching static app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. Activate Event: Clean Old Caches & Claim Clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[LibNexa PWA SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network First for API/Sockets, Stale-While-Revalidate for Static Files
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore WebSockets & non-GET requests
  if (req.method !== 'GET' || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Network-first for API requests (/api/*)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(req);
      })
    );
    return;
  }

  // Stale-While-Revalidate for Static Assets
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
