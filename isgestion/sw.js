// Service worker de ISgestión: solo notificaciones push. No guarda nada en caché (la app siempre se baja fresca).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => self.registration.showNotification(d.title || 'ISgestión', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: (await logoEmpresa(d.empresa)) || 'core/ui/icono.svg', badge: 'core/ui/icono.svg',
    data: { url: d.url || './', empresa: d.empresa || null },
  }))());
});

// Logo de la empresa del aviso (lo deja core/push.js en este dispositivo) como imagen incrustada: el ícono del aviso
// lo baja el navegador sin pasar por este service worker. iPhone ignora el ícono y muestra siempre el de la app.
async function logoEmpresa(empresaId) {
  try {
    if (!empresaId) return null;
    const r = await (await caches.open('isg-logos-aviso')).match(new URL(`logo-aviso/${empresaId}`, self.registration.scope).href);
    if (!r) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${r.headers.get('content-type') || 'image/png'};base64,${btoa(bin)}`;
  } catch { return null; }
}

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
