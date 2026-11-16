/* NoliktavaPRIM — bezsaistes kešs (L10). Dati glabājas IndexedDB un šeit netiek skarti. */
const VERSION = '1.0.0';
const CACHE = 'noliktavaprim-v' + VERSION;
const ASSETS = ['./', 'index.html', 'core.js', 'app.js', 'zxing.min.js', 'manifest.webmanifest',
                'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('noliktavaprim-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
    req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
