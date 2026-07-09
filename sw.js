// Service worker: "red primero" para el HTML (así las actualizaciones se ven
// enseguida) y caché para el resto. Sube ESTE archivo junto con index.html.
const CACHE = 'gastos-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nunca cachees el backend (Apps Script)
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) {
    return; // va directo a la red
  }

  // RED PRIMERO para navegaciones y el propio index.html
  const esShell = e.request.mode === 'navigate' ||
                  url.pathname.endsWith('/') ||
                  url.pathname.endsWith('/index.html');
  if (esShell) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // CACHÉ PRIMERO para el resto (iconos, manifest…)
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
