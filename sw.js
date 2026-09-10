const CACHE = 'ch-v9-7';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './supabase-client.js', './supabase-auth.js', './supabase-db.js', './icon-192.png', './icon-512.png', './icon-maskable.png', './logo-trans.png', './logo-blanco.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// El CÓDIGO de la app (la página y sus módulos) va a la RED PRIMERO, con el
// caché como red de seguridad si no hay cobertura.
//
// Antes iba al revés y por eso el móvil se quedaba con una versión vieja: al
// abrir la app se pintaba lo cacheado y la versión nueva se guardaba por
// detrás, así que solo se veía en la apertura SIGUIENTE. Si la app se queda
// abierta en segundo plano y nunca recarga de verdad, esa apertura siguiente
// puede no llegar en días, y se acumulan versiones de retraso.
//
// Las imágenes sí siguen saliendo del caché al instante: no cambian y así la
// app abre rápido.
const esCodigo = (req, url) =>
  req.mode === 'navigate'
  || url.pathname.endsWith('/')
  || /\.(html|js|webmanifest)$/i.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Nunca cachear ni interceptar llamadas a Supabase (datos/auth/realtime):
  // deben ir siempre a la red para que la app online muestre datos reales.
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.hostname.endsWith('.supabase.co')) return;

  if (esCodigo(req, url)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
