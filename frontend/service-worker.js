const CACHE_VERSION = '20260502v3';
const STATIC_CACHE = `zelo-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `zelo-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.svg',
  '/hub.css',
  '/hub.js',
  '/hub-dashboard.js',
  '/hub-cafe-pastor.js',
  '/hub-login.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('zelo-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(name))
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        return (await caches.match('/login.html')) ||
          (await caches.match('/index.html')) ||
          Response.error();
      })
    );
    return;
  }

  if (['script', 'style', 'worker', 'manifest'].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
