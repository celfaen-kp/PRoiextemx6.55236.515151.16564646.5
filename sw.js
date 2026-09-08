const CACHE = 'ch-v7-8';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './supabase-client.js', './supabase-auth.js', './supabase-db.js', './icon-192.png', './icon-512.png', './icon-maskable.png', './logo-trans.png', './logo-blanco.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Nunca cachear ni interceptar llamadas a Supabase (datos/auth/realtime):
  // deben ir siempre a la red para que la app online muestre datos reales.
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.hostname.endsWith('.supabase.co')) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && new URL(req.url).origin === location.origin) {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
