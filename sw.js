// Minimal service worker: just enough app-shell caching to satisfy iOS/PWA
// installability and let the shell load offline. Deliberately does NOT
// cache Dropbox API responses, temporary links, or audio streams — those
// are short-lived/auth-scoped and must always hit the network.
//
// Shell files are served network-first (falling back to cache only when
// offline), not cache-first: this app iterates often, and cache-first risks
// serving an inconsistent mix of old/new shell files (e.g. new HTML paired
// with stale JS) until every file happens to get re-cached.

const CACHE_NAME = 'dbxplaylist-shell-v4';
const SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'auth.js',
  'dropbox.js',
  'player.js',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/artwork-96.jpg',
  'icons/artwork-128.jpg',
  'icons/artwork-192.jpg',
  'icons/artwork-256.jpg',
  'icons/artwork-384.jpg',
  'icons/artwork-512.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for shell assets; everything else
  // (Dropbox API, audio streaming links) passes straight through to the
  // network untouched.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
