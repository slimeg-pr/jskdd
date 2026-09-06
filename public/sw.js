/* Monéta — service worker.
   Makes the self-hosted build installable and quick to open. The app shell
   is cached; anything under /api never is, because prices and balances must
   come from the server and a stale portfolio would be a lie. */

const VERSION = 'moneta-v1';
const SHELL = [
  '/',
  '/portal.html',
  '/manifest.webmanifest',
  '/assets/css/theme.css',
  '/assets/css/auth.css',
  '/assets/css/portal.css',
  '/assets/js/fonts.js',
  '/assets/js/icons.js',
  '/assets/js/mark.js',
  '/assets/js/wordmark.js',
  '/assets/js/coins.js',
  '/assets/js/util.js',
  '/assets/js/market.js',
  '/assets/js/badges.js',
  '/assets/js/prefs.js',
  '/assets/js/api.js',
  '/assets/js/feed-sse.js',
  '/assets/js/chart.js',
  '/assets/js/portal.js',
  '/assets/js/auth.js',
  '/assets/img/favicon.svg',
  '/assets/img/icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // One bad URL must not fail the whole install.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API: session state, prices and balances are live, and
  // the SSE stream must not be intercepted at all.
  if (url.pathname.startsWith('/api/')) return;

  // HTML: network first, so a deploy is picked up immediately; cache is the
  // offline fallback.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/portal.html')))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
