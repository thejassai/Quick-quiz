// ============================================================
//  Service Worker — sw.js
//  Makes the app work offline (PWA requirement).
//  It caches all the app's files on first visit, so if you
//  lose internet the app still loads (prices won't refresh,
//  but your portfolio data is safe in localStorage).
// ============================================================

const CACHE_NAME = "stock-tracker-v1";

// Files to cache on install
const ASSETS = [
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
  // CDN libraries — cached on first fetch
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
];

// ── Install: cache all assets ─────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();  // activate immediately
});

// ── Activate: delete old caches from previous versions ───
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ────────
self.addEventListener("fetch", event => {
  // For Alpha Vantage API calls, always go to the network
  // (we need live data, not cached prices)
  if (event.request.url.includes("alphavantage.co")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For everything else: cache-first strategy
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
