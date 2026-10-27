// Service worker de ISgestión: solo notificaciones push. No guarda nada en caché (la app siempre se baja fresca).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ISgestión', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'core/ui/icono.svg', badge: 'core/ui/icono.svg',
    data: { url: d.url || './', empresa: d.empresa || null },
  }));
});

// Tocar el aviso abre (o enfoca) la app en la pantalla del aviso
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = abiertas.find((c) => c.url.startsWith(self.registration.scope));
    if (propia) { await propia.focus(); return propia.navigate(destino).catch(() => null); }
    return self.clients.openWindow(destino);
  })());
});
