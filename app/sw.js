/* InnovaServi Reportes — Service Worker (PWA) */
var CACHE = 'iserv-registros-v296';
var SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  '../assets/images/InnovaLOGO.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // No cachear Supabase, R2 ni fuentes remotas: siempre a la red.
  if (url.origin !== self.location.origin) return;
  // App shell: network-first para HTML, cache-first para estáticos.
  if (req.mode === 'navigate') {
    // no-cache: revalida con el servidor para no quedar con una versión vieja en la caché HTTP
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return hit; });
  }));
});

// Notificaciones push (las envía la Edge Function "push"; ver supabase/migrations/20261026000000_push.sql)
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'InnovaGestión', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'InnovaGestión', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' }
  }));
});

// Al tocar la notificación: abre la app (o la que ya está abierta) en la tarea o vista que corresponde
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        return c.focus().then(function (w) { w = w || c; return w.navigate ? w.navigate(url) : null; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
