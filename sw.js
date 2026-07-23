/* ============================================================================
   sw.js — offline shell for Kazu Hub (PWA-lite).
   ----------------------------------------------------------------------------
   Strategy: nothing here ever serves stale content while online.
     - Page navigations: network-first. Fresh HTML wins; the cache is only
       the offline fallback (last good copy).
     - Same-origin assets (CSS/JS with ?v= cache-busting, images, manifest):
       cache-first. Versioned query strings make each deploy a new URL, so a
       hit can never be outdated.
     - Cross-origin (weather/Discord/Steam/Jikan/proxy/fonts): untouched.
       Live data must never come from a cache.
   Bump CACHE when the precache list or this logic changes.
   ========================================================================== */
'use strict';

const CACHE = 'kazu-shell-v20';
const PRECACHE = [
  './',
  './index.html',
  './style.css?v=30',
  './script.js?v=31',
  './lib.js?v=16',
  './assets/favicon.png',
  './assets/profile.webp',
  './assets/Sisu.jpg',
  './assets/youtube-music.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // Navigation preload lets a navigation's network request start in
      // parallel with this worker's boot instead of queuing behind it
      // (worst on Android, where SW startup can cost 100ms+).
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable())
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // APIs, CDNs, fonts: always live

  if (req.mode === 'navigate') {
    event.respondWith(
      // Still strictly network-first: the preloaded response IS the network
      // response; fetch(req) is the fallback where preload is unsupported.
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(req))
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put('./index.html', copy)));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
