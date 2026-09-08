// Service worker: makes Reporder installable and lets the shell load without
// network. Only the app's own files are cached — there is nothing else to fetch.
const CACHE = 'reporder-v3';
const SHELL = [
  './', './index.html', './record.html', './report.html',
  './styles.css', './record.css', './report.css',
  './index.js', './record.js', './report.js',
  './session.js', './templates.js', './storage.js', './time.js',
  './manifest.webmanifest',
  './fonts/Rubik-Variable.ttf', './fonts/Rubik-Italic-Variable.ttf', './fonts/RubikMonoOne-Regular.ttf',
  './icons/icon.svg', './icons/mark.svg', './icons/logo.svg', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for the shell (so an update lands on the next load), cache as
// the fallback when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
