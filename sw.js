const CACHE_NAME = 'gide-pwa-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    // Grounded Doc Q&A (offline)
    '/doc-qa.html',
    '/doc-qa.css',
    '/doc-qa.js',
    '/vendor/pdf.min.js',
    '/vendor/pdf.worker.min.js'
];

// 1. Install: pre-cache all local assets so the app works with the network off.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // cache each asset independently so one bad path can't abort the whole install
            .then((cache) => Promise.allSettled(ASSETS.map((a) => cache.add(a))))
            .then(() => self.skipWaiting())
    );
});

// 2. Activate: drop stale caches.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// 3. Fetch: cache-first for our own GET assets ONLY.
//    Cross-origin / non-GET requests (e.g. the Ollama POST to :11434) are left
//    entirely to the network so the service worker never interferes with inference.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin) return; // let the network handle it
    event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req))
    );
});
