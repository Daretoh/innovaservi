// ISgestión en el teléfono (dirección "B · Patente al centro", aprobada por Enzo el 2026-10-27; maqueta en
// https://claude.ai/artifact/Gxk4BGMTc4cgkKwqs7J7Zr): barra de navegación abajo, botón "+" al centro y bienvenida con el
// logo de la empresa. En pantallas de más de 760 px nada de esto se ve (CSS): sigue el menú lateral de siempre.
//
// Cada módulo puede declarar en su manifiesto `movil`:
//   accesos: [{ id: 'taller.tablero', label: 'Taller', icono: 'auto' }, …]   pestañas de la barra (si la ruta existe)
//   accion:  { label, icono, requiere: 'crear', abrir: (ctx) => … }           el botón "+" del centro
// Sin accesos declarados, la barra usa los primeros apartados del menú. Siempre: Inicio al principio y Más al final.
import { el } from './ui/dom.js';
import { icono } from './ui/iconos.js';
import { urlFirmada } from './adjuntos.js';
import { nombreEmpresa } from './empresas.js';

const MAX_ACCESOS = 2;

// Barra de abajo. `ctx()` entrega el contexto actual (para abrir la acción del "+").
export function barraMovil({ visibles, apartados, rutas, puede, ctx }) {
  let accesos = visibles.flatMap((m) => (m.movil?.accesos ?? []).filter((a) => rutas.has(a.id)));
  if (!accesos.length) {
    accesos = [...apartados.grupos.values()].flat().map((ap) => ({ id: ap.items[0].id, label: ap.items.length > 1 ? ap.label : ap.items[0].label, icono: ap.icono ?? ap.items[0].modulo?.icono ?? 'lista' }));
  }
  accesos = accesos.slice(0, MAX_ACCESOS);
  const conAccion = visibles.find((m) => m.movil?.accion && puede(m.id, m.movil.accion.requiere ?? 'crear'));
  const accion = conAccion?.movil.accion;

  const pestana = (href, ic, texto, vista) => {
    const a = el('a', { class: 'bm-item', href }, icono(ic, { tam: 24 }), el('span', {}, texto));
    a.dataset.vista = vista;
    return a;
  };
  const items = [pestana('#/', 'inicio', 'Inicio', ''), ...accesos.map((x) => pestana(`#/${x.id}`, x.icono, x.label, x.id)), pestana('#/mas', 'menu', 'Más', 'mas')];
  // El "+" va al centro de la barra
  if (accion) {
    items.splice(Math.ceil(items.length / 2), 0, el('button', { type: 'button', class: 'bm-accion', 'aria-label': accion.label, title: accion.label,
      onclick: () => accion.abrir(ctx()) }, icono(accion.icono ?? 'mas', { tam: 28 })));
  }
  const nav = el('nav', { class: 'barra-movil', 'aria-label': 'Navegación principal' }, items);
  nav.style.setProperty('--bm-columnas', String(items.length));
  return nav;
}

// Marca la pestaña de la vista actual (o Más si la vista no está en la barra)
export function marcarBarraMovil(nav, id, padre) {
  if (!nav) return;
  const enlaces = [...nav.querySelectorAll('.bm-item')];
  const actual = enlaces.find((a) => a.dataset.vista === id) ?? enlaces.find((a) => a.dataset.vista && a.dataset.vista === padre)
    ?? enlaces.find((a) => a.dataset.vista && id.split('.')[0] && a.dataset.vista.split('.')[0] === id.split('.')[0] && a.dataset.vista !== '')
    ?? (id ? enlaces.find((a) => a.dataset.vista === 'mas') : enlaces[0]);
  for (const a of enlaces) a.toggleAttribute('aria-current', a === actual);
  actual?.setAttribute('aria-current', 'page');
}

// Bienvenida al abrir la app: el logo de la empresa con una animación corta (una vez por sesión del navegador).
// Mientras tanto la app carga detrás; se va sola. Respeta "reducir movimiento" (CSS).
export async function bienvenida(api, empresa) {
  try { if (sessionStorage.getItem('isg.bienvenida')) return; sessionStorage.setItem('isg.bienvenida', '1'); } catch { /* sin almacenamiento: se muestra */ }
  const logo = empresa.logo_url ? await urlFirmada(api, empresa.logo_url, 120).catch(() => null) : null;
  const nombre = nombreEmpresa(empresa);
  const capa = el('div', { class: 'bienvenida', role: 'status', 'aria-label': `Abriendo ${nombre}` },
    logo ? el('img', { class: 'bienvenida-logo', src: logo, alt: nombre }) : el('span', { class: 'bienvenida-nombre' }, nombre),
    el('span', { class: 'bienvenida-pista', 'aria-hidden': 'true' }, el('span', { class: 'bienvenida-barra' })),
    el('span', { class: 'bienvenida-pie' }, 'con ISgestión'));
  document.body.append(capa);
  capa.addEventListener('animationend', (ev) => { if (ev.animationName === 'bienvenida-sale') capa.remove(); });
  setTimeout(() => capa.remove(), 4000);   // por si la animación no corre
}
