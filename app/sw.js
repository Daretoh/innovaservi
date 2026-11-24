// InnovaGestión ya no existe (2026-11-24): este service worker borra sus cachés, se desinstala y lleva a ISgestión.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('/isgestion/');
})()));
