// Notificaciones push en este dispositivo (como InnovaGestión): se piden al entrar con una franja fija hasta
// activarlas; botón con campana para ver el estado, probar o desactivar. Al cerrar sesión el dispositivo deja de
// recibir. Las envía la Edge Function "push" (db/nucleo/014_push.sql).
import { db } from './api.js?v=66a811d';
import { el } from './ui/dom.js?v=66a811d';
import { icono } from './ui/iconos.js?v=66a811d';
import { avisar } from './ui/aviso.js?v=66a811d';
import { abrirFormulario } from './ui/modal.js?v=66a811d';

export const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iphoneSinInstalar = () => /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;

async function registro() {
  return (await navigator.serviceWorker.getRegistration('./')) ?? navigator.serviceWorker.register('sw.js', { scope: './' });
}
export async function suscripcion() {
  if (!soportado()) return null;
  const r = await navigator.serviceWorker.getRegistration('./');
  return r ? r.pushManager.getSubscription() : null;
}
const aBytes = (b64) => { const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

export async function activar() {
  if (!soportado()) throw new Error(iphoneSinInstalar() ? 'En iPhone, primero instala la app: Compartir → Agregar a inicio, y ábrela desde ahí.' : 'Este navegador no admite notificaciones.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Las notificaciones quedaron bloqueadas. Actívalas en los ajustes del navegador para este sitio.');
  const reg = await registro();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { data, error } = await db().functions.invoke('push', { method: 'GET' });
    if (error || !data?.clave) throw new Error('No se pudo obtener la clave de notificaciones. Intenta de nuevo.');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(data.clave) });
  }
  const j = sub.toJSON();
  // El dispositivo queda para esta cuenta (si estaba con otra, se reemplaza)
  await db().from('push_suscripciones').delete().eq('endpoint', j.endpoint);
  const { error } = await db().from('push_suscripciones').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, agente: navigator.userAgent.slice(0, 200) });
  if (error && error.code !== '23505') throw new Error(error.message);
  if (error) {   // el endpoint es de otra cuenta en este navegador: se crea uno nuevo
    await sub.unsubscribe();
    return activar();
  }
  return true;
}

export async function desactivar() {
  try {
    const sub = await suscripcion();
    if (!sub) return;
    await db().from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch { /* al salir no se frena por esto */ }
}

export async function probar(usuarioId, empresaId) {
  const { error } = await db().from('push_salida').insert({ user_id: usuarioId, empresa_id: empresaId, titulo: 'Notificación de prueba', cuerpo: 'Si ves esto, las notificaciones funcionan en este dispositivo.', url: './', etiqueta: 'prueba' });
  if (error) throw new Error(error.message);
}

// ¿Este dispositivo recibe? (permiso dado y suscripción guardada para esta cuenta)
export async function activas() {
  if (!soportado() || Notification.permission !== 'granted') return false;
  const sub = await suscripcion();
  if (!sub) return false;
  const { data } = await db().from('push_suscripciones').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  return !!data;
}

// Franja fija hasta activarlas (si el navegador las admite y no están bloqueadas)
export function franja() {
  const nodo = el('div', { class: 'franja-push', hidden: true });
  (async () => {
    if (await activas()) return;
    if (soportado() && Notification.permission === 'denied') return;
    if (!soportado() && !iphoneSinInstalar()) return;
    const b = el('button', { type: 'button', class: 'boton boton-primario boton-chico' }, 'Activar');
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await activar(); nodo.hidden = true; avisar('Notificaciones activadas en este dispositivo.'); } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
    });
    // Se puede cerrar (vuelve en la próxima sesión del navegador)
    try { if (sessionStorage.getItem('isg.push.cerrada')) return; } catch { /* sin almacenamiento */ }
    const cerrar = el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', title: 'Ahora no' }, icono('cerrar', { tam: 16 }));
    cerrar.addEventListener('click', () => { nodo.hidden = true; try { sessionStorage.setItem('isg.push.cerrada', '1'); } catch { /* sin almacenamiento */ } });
    nodo.replaceChildren(...[icono('campana', { tam: 16 }),
      el('span', {}, iphoneSinInstalar() ? 'Para recibir avisos en el iPhone, instala la app: Compartir → Agregar a inicio.' : 'Activa las notificaciones para recibir tus tareas y avisos en este dispositivo.'),
      iphoneSinInstalar() ? null : b, cerrar].filter(Boolean));
    nodo.hidden = false;
  })().catch(() => {});
  return nodo;
}

// Botón de la barra: estado, activar, probar y desactivar
export function botonNotificaciones(usuarioId, empresaId) {
  const b = el('button', { type: 'button', class: 'boton-icono', title: 'Notificaciones', 'aria-label': 'Notificaciones' }, icono('campana'));
  b.addEventListener('click', async () => {
    const on = await activas();
    abrirFormulario({
      titulo: 'Notificaciones',
      mensaje: on ? 'Este dispositivo recibe avisos: tareas asignadas, menciones y recordatorios, y a las 08:00 lo vencido o por vencer.\nPuedes enviarte una prueba.'
        : !soportado() ? (iphoneSinInstalar() ? 'En iPhone primero instala la app: Compartir → Agregar a inicio, y ábrela desde ahí.' : 'Este navegador no admite notificaciones.')
          : Notification.permission === 'denied' ? 'Están bloqueadas para este sitio. Actívalas en los ajustes del navegador (candado junto a la dirección).'
            : 'Este dispositivo aún no recibe avisos.',
      campos: on ? [{ id: 'accion', etiqueta: '¿Qué quieres hacer?', opciones: [['probar', 'Enviarme una prueba'], ['desactivar', 'Dejar de recibir en este dispositivo']] }] : [],
      textoGuardar: on ? 'Listo' : 'Activar',
      alGuardar: async (x) => {
        if (!on) { await activar(); avisar('Notificaciones activadas.'); document.querySelector('.franja-push')?.setAttribute('hidden', ''); return; }
        if (x.accion === 'probar') { await probar(usuarioId, empresaId()); avisar('Prueba enviada: debería llegar en unos segundos.'); }
        else { await desactivar(); avisar('Este dispositivo ya no recibe notificaciones.'); }
      },
    });
  });
  return b;
}
