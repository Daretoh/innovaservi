// ISgestión en el teléfono (dirección "B · Patente al centro", aprobada por Enzo el 2026-10-27; maqueta en
// https://claude.ai/artifact/Gxk4BGMTc4cgkKwqs7J7Zr): barra de navegación abajo, botón "+" al centro y bienvenida con el
// logo de la empresa. En pantallas de más de 760 px nada de esto se ve (CSS): sigue el menú lateral de siempre.
//
// Cada módulo puede declarar en su manifiesto `movil`:
//   accesos: [{ id: 'taller.tablero', label: 'Taller', icono: 'auto' }, …]   pestañas de la barra (si la ruta existe)
//   accion:  { label, icono, requiere: 'crear', abrir: (ctx) => … }           el botón "+" del centro
// Sin accesos declarados, la barra usa los primeros apartados del menú. Siempre: Inicio al principio y Más al final.
import { el } from './ui/dom.js?v=cb36eb2';
import { icono } from './ui/iconos.js?v=cb36eb2';
import { urlFirmada } from './adjuntos.js?v=cb36eb2';
import { nombreEmpresa } from './empresas.js?v=cb36eb2';

const MAX_ACCESOS = 2;

// ¿Pantalla de teléfono? (mismo corte que el CSS). Las vistas con versión de teléfono (Inicio, Tablero, Orden, Agenda)
// la eligen al pintarse; core/app.js vuelve a pintar la vista si se cruza el corte (girar la tablet, achicar la ventana).
export const CORTE_TELEFONO = '(max-width: 760px)';
export const esTelefono = () => matchMedia(CORTE_TELEFONO).matches;

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

// Bienvenida al abrir la app (en vez de la pantalla de carga): el logo de la última empresa usada, guardado en este
// navegador para mostrarlo desde el primer instante. Se queda mientras la app carga (mínimo MIN_BIENVENIDA, para que
// se vea la animación) y se desvanece. Sin empresa guardada (primera vez en el equipo), sale ISgestión.
// Respeta "reducir movimiento" (CSS).
const CLAVE_MARCA = 'isg.marca';
const MIN_BIENVENIDA = 1600;
export function bienvenidaInicial() {
  let marca = null;
  try { marca = JSON.parse(localStorage.getItem(CLAVE_MARCA) || 'null'); } catch { /* sin almacenamiento */ }
  const nombre = marca?.nombre ?? 'ISgestión';
  if (marca?.color) document.documentElement.style.setProperty('--empresa', marca.color);
  const capa = el('div', { class: 'bienvenida', role: 'status', 'aria-label': `Abriendo ${nombre}` },
    marca?.logo ? el('img', { class: 'bienvenida-logo', src: marca.logo, alt: nombre }) : el('span', { class: 'bienvenida-nombre' }, nombre),
    el('span', { class: 'bienvenida-pista', 'aria-hidden': 'true' }, el('span', { class: 'bienvenida-barra' })),
    marca ? el('span', { class: 'bienvenida-pie' }, 'con ISgestión') : null);
  document.body.append(capa);
  const desde = Date.now();
  let cerrada = false;
  const cerrar = () => {
    if (cerrada) return; cerrada = true;
    setTimeout(() => {
      capa.classList.add('sale');
      capa.addEventListener('animationend', () => capa.remove(), { once: true });
      setTimeout(() => capa.remove(), 800);   // por si la animación no corre
    }, Math.max(0, MIN_BIENVENIDA - (Date.now() - desde)));
  };
  setTimeout(cerrar, 15000);   // nunca se queda pegada
  return { cerrar };
}

// Marca guardada de la empresa (nombre, color y logo incrustado) si es la indicada; null si no hay
export function marcaGuardada(empresaId) {
  try { const m = JSON.parse(localStorage.getItem(CLAVE_MARCA) || 'null'); return m && (!empresaId || m.id === empresaId) ? m : null; } catch { return null; }
}

// Guarda en este navegador el nombre, color y logo (como imagen incrustada, si es liviano) de la empresa activa,
// para la próxima bienvenida. Solo datos de la marca, nada privado.
export async function recordarMarca(api, empresa) {
  let logo = null;
  try {
    if (empresa.logo_url) {
      const url = await urlFirmada(api, empresa.logo_url, 120);
      const blob = await (await fetch(url)).blob();
      if (blob.size <= 150 * 1024) logo = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(blob); });
    }
  } catch { /* sin logo: se muestra el nombre */ }
  try { localStorage.setItem(CLAVE_MARCA, JSON.stringify({ id: empresa.id, nombre: nombreEmpresa(empresa), color: empresa.color || null, logo })); } catch { /* sin almacenamiento */ }
}
