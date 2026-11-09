// ISgestión en el teléfono (dirección "B · Patente al centro", aprobada por Enzo el 2026-10-27; maqueta en
// https://claude.ai/artifact/Gxk4BGMTc4cgkKwqs7J7Zr): barra de navegación abajo, botón "+" al centro y bienvenida con el
// logo de la empresa. En pantallas de más de 760 px nada de esto se ve (CSS): sigue el menú lateral de siempre.
//
// Cada módulo puede declarar en su manifiesto `movil`:
//   accesos: [{ id: 'taller.tablero', label: 'Taller', icono: 'auto' }, …]   pestañas de la barra (si la ruta existe)
//   accion:  { label, icono, requiere: 'crear', abrir: (ctx) => … }           el botón "+" del centro
//   o con abanico: { label, opciones: [{ label, icono, requiere: [modulo, accion], ruta, abrir }, …] }: tocar o mantener el "+"
//   abre en abanico las opciones que el usuario puede usar (mantener y arrastrar hacia una la elige; un toque abre y otro
//   elige); si queda una sola, la abre directo. Con 3 son tres direcciones; con más, el arco se abre y luego suma otra vuelta.
// Sin accesos declarados, la barra usa los primeros apartados del menú. Siempre: Inicio al principio y Más al final.
import { el } from './ui/dom.js?v=1f30021';
import { icono } from './ui/iconos.js?v=1f30021';
import { urlFirmada } from './adjuntos.js?v=1f30021';
import { nombreEmpresa } from './empresas.js?v=1f30021';
import { avisar } from './ui/aviso.js?v=1f30021';

const MAX_ACCESOS = 2;

// ¿Pantalla de teléfono? (mismo corte que el CSS). Las vistas con versión de teléfono (Inicio, Tablero, Orden, Agenda)
// la eligen al pintarse; core/app.js vuelve a pintar la vista si se cruza el corte (girar la tablet, achicar la ventana).
export const CORTE_TELEFONO = '(max-width: 760px)';
export const esTelefono = () => matchMedia(CORTE_TELEFONO).matches;

// Barra de abajo. `ctx()` entrega el contexto actual (para abrir la acción del "+").
export function barraMovil({ visibles, apartados, rutas, puede, ctx }) {
  let menuAccion = null;   // menú abierto del "+"
  let accesos = visibles.flatMap((m) => (m.movil?.accesos ?? []).filter((a) => rutas.has(a.id)));
  if (!accesos.length) {
    accesos = [...apartados.grupos.values()].flat().map((ap) => ({ id: ap.items[0].id, label: ap.items.length > 1 ? ap.label : ap.items[0].label, icono: ap.icono ?? ap.items[0].modulo?.icono ?? 'lista' }));
  }
  accesos = accesos.slice(0, MAX_ACCESOS);
  const accion = visibles.map((m) => accionDe(m, { puede, rutas })).find(Boolean);

  const pestana = (href, ic, texto, vista) => {
    const a = el('a', { class: 'bm-item', href }, icono(ic, { tam: 24 }), el('span', {}, texto));
    a.dataset.vista = vista;
    return a;
  };
  const items = [pestana('#/', 'inicio', 'Inicio', ''), ...accesos.map((x) => pestana(`#/${x.id}`, x.icono, x.label, x.id)), pestana('#/mas', 'menu', 'Más', 'mas')];
  // El "+" va al centro de la barra
  if (accion) {
    // Al tocarlo: se hunde, el "+" gira a "×" y sale una onda; vuelve cuando se cierra lo que abrió (si devuelve una promesa)
    const boton = el('button', { type: 'button', class: 'bm-accion', 'aria-label': accion.label, title: accion.label, 'aria-expanded': 'false',
      onclick: () => {
        if (menuAccion) { if (menuAccion.mantenido) menuAccion.mantenido = false; else menuAccion.cerrar?.(); return; }
        if (boton.classList.contains('abierta')) return;
        boton.classList.add('abierta'); boton.setAttribute('aria-expanded', 'true');
        try { navigator.vibrate?.(10); } catch { /* sin vibración */ }
        Promise.resolve(accion.opciones ? mostrarAbanico(boton, accion.opciones, ctx, (m) => { menuAccion = m; }) : accion.abrir(ctx())).catch((err) => avisar(err?.message ?? 'No se pudo abrir.', 'error')).finally(() => { boton.classList.remove('abierta'); boton.setAttribute('aria-expanded', 'false'); });
      } }, el('span', { class: 'bm-onda', 'aria-hidden': 'true' }), icono(accion.icono ?? 'mas', { tam: 28 }));
    items.splice(Math.ceil(items.length / 2), 0, boton);
    sinSeleccion(boton);
    if (accion.opciones) mantenerParaMenu(boton, () => menuAccion);
  }
  const indicador = el('span', { class: 'bm-indicador', 'aria-hidden': 'true' });
  const nav = el('nav', { class: 'barra-movil', 'aria-label': 'Navegación principal' }, indicador, items);
  nav.style.setProperty('--bm-columnas', String(items.length));
  arrastrable(nav);
  // Si cambia el ancho (girar el teléfono), el indicador vuelve a su pestaña
  new ResizeObserver(() => moverIndicador(nav, nav.querySelector('.bm-item[aria-current]'), false)).observe(nav);
  return nav;
}

// La acción del "+" de un módulo para este usuario: null si no puede usarla. Las opciones sin permiso o sin pantalla no se
// muestran; con una sola no hay menú.
function accionDe(m, { puede, rutas }) {
  const accion = m.movil?.accion;
  if (!accion) return null;
  if (!accion.opciones) return puede(m.id, accion.requiere ?? 'crear') ? accion : null;
  const opciones = accion.opciones.filter((o) => puede(...o.requiere) && (!o.ruta || rutas.has(o.ruta)));
  if (!opciones.length) return null;
  return opciones.length === 1 ? { ...accion, ...opciones[0], opciones: undefined } : { ...accion, opciones };
}

// Dónde va cada opción, en px desde el centro del "+" (de izquierda a derecha; x<0 izquierda, y<0 arriba). Hasta 5 por vuelta:
// 2 y 3 quedan en arco cerrado (3 = arriba-izquierda, arriba, arriba-derecha), 4 y 5 abren el arco, y desde la sexta se suma
// otra vuelta más arriba. Nunca se salen de la pantalla.
const POR_VUELTA = 5;
const SEPARACION = 92;   // distancia mínima entre centros
function posicionesAbanico(n, limiteX) {
  const posiciones = [];
  for (let vuelta = 0, resto = n; resto > 0; vuelta += 1, resto -= POR_VUELTA) {
    const cuantas = Math.min(resto, POR_VUELTA);
    const arco = cuantas === 1 ? 0 : Math.min(160, 45 * (cuantas - 1));
    const paso = cuantas > 1 ? arco / (cuantas - 1) : 0;
    const radio = Math.max(118, paso ? SEPARACION / (2 * Math.sin((paso * Math.PI) / 360)) : 0) + vuelta * SEPARACION;
    for (let i = 0; i < cuantas; i += 1) {
      const a = ((90 + arco / 2 - paso * i) * Math.PI) / 180;
      posiciones.push({ x: Math.max(-limiteX, Math.min(limiteX, Math.cos(a) * radio)), y: -Math.sin(a) * radio });
    }
  }
  return posiciones;
}

// Abanico sobre el "+": se cierra al elegir, al tocar fuera, con Esc, al girar o al cambiar de pantalla. La promesa termina al
// cerrarse (el "+" vuelve de "×" a "+"). Va en <body>: dentro de la barra (backdrop-filter) la posición fija quedaría relativa a
// ella. El velo tapa la barra, así que un "×" igual al botón queda encima para cerrar.
function mostrarAbanico(boton, opciones, ctx, avisarMenu) {
  return new Promise((listo, fallo) => {
    const r = boton.getBoundingClientRect();
    const centro = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const posiciones = posicionesAbanico(opciones.length, Math.min(centro.x, innerWidth - centro.x) - 46);
    const elegir = (o) => { cerrar(); Promise.resolve(o.abrir(ctx())).catch(fallo).finally(listo); };
    const salir = () => { cerrar(); listo(); };
    const botones = opciones.map((o, i) => el('button', { type: 'button', class: 'bm-rayo', role: 'menuitem', style: `--x:${Math.round(posiciones[i].x)}px;--y:${Math.round(posiciones[i].y)}px;--orden:${i};left:${centro.x}px;top:${centro.y}px`, onclick: () => elegir(o) },
      el('span', { class: 'bm-rayo-circulo' }, icono(o.icono, { tam: 24 })), el('span', { class: 'bm-rayo-texto' }, o.label)));
    const abanico = el('div', { class: 'bm-abanico', role: 'menu', 'aria-label': 'Agregar' }, botones);
    const velo = el('div', { class: 'bm-velo', onclick: salir });
    const equis = el('button', { type: 'button', class: 'bm-abanico-cerrar', 'aria-label': 'Cerrar', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`, onclick: salir }, icono('cerrar', { tam: 26 }));
    const tecla = (ev) => { if (ev.key === 'Escape') salir(); };
    const menu = { mantenido: false, botones, posiciones, elegirBoton: (b) => elegir(opciones[botones.indexOf(b)]), cerrar: salir };
    function cerrar() {
      velo.remove(); abanico.remove(); equis.remove(); avisarMenu(null);
      document.removeEventListener('keydown', tecla); removeEventListener('hashchange', salir); removeEventListener('resize', salir);
    }
    document.addEventListener('keydown', tecla); addEventListener('hashchange', salir); addEventListener('resize', salir);
    document.body.append(velo, abanico, equis);
    avisarMenu(menu);
  });
}

// Mantener presionado el "+" en el teléfono no debe seleccionar la página (el navegador elige el texto más cercano)
function sinSeleccion(boton) {
  const raiz = document.documentElement;
  const evitar = (ev) => ev.preventDefault();
  const fin = () => {
    raiz.classList.remove('bm-sin-seleccion');
    document.removeEventListener('selectstart', evitar, true); document.removeEventListener('contextmenu', evitar, true);
    removeEventListener('pointerup', fin, true); removeEventListener('pointercancel', fin, true);
    getSelection()?.removeAllRanges();
  };
  boton.addEventListener('pointerdown', () => {
    raiz.classList.add('bm-sin-seleccion');
    document.addEventListener('selectstart', evitar, true); document.addEventListener('contextmenu', evitar, true);
    addEventListener('pointerup', fin, true); addEventListener('pointercancel', fin, true);
  });
}

// Mantener presionado el "+" abre el abanico (o antes, si el dedo ya partió hacia un lado). Lo que cuenta es la dirección del
// arrastre desde donde se apoyó el dedo: la opción más cercana a ese recorrido se marca y al soltar se elige. Soltar sin haber
// salido del centro deja el abanico abierto para elegir con un toque.
const UMBRAL_ARRASTRE = 30;
function mantenerParaMenu(boton, menuActual) {
  let tiempo = 0;
  let inicio = null;
  let sobre = null;
  const marcar = (m, b) => {
    if (b === sobre) return;
    sobre = b;
    for (const x of m.botones) x.classList.toggle('bm-sobre', x === b);
    if (b) try { navigator.vibrate?.(8); } catch { /* sin vibración */ }
  };
  const elegida = (m, ev) => {
    const dx = ev.clientX - inicio.x; const dy = ev.clientY - inicio.y;
    if (Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return null;
    let mejor = 0; let menor = Infinity;
    m.posiciones.forEach((p, i) => { const d = Math.hypot(p.x - dx, p.y - dy); if (d < menor) { menor = d; mejor = i; } });
    return m.botones[mejor];
  };
  const abrirMantenido = () => { clearTimeout(tiempo); tiempo = 0; boton.click(); const m = menuActual(); if (m) m.mantenido = true; };
  boton.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0 || menuActual()) return;
    inicio = { x: ev.clientX, y: ev.clientY }; sobre = null;
    tiempo = setTimeout(abrirMantenido, 350);
    try { boton.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
  });
  boton.addEventListener('pointermove', (ev) => {
    if (!inicio) return;
    if (tiempo && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) >= UMBRAL_ARRASTRE / 2) abrirMantenido();
    const m = menuActual(); if (m?.mantenido) marcar(m, elegida(m, ev));
  });
  const soltar = (ev) => {
    clearTimeout(tiempo); tiempo = 0;
    const m = menuActual();
    if (!inicio || !m?.mantenido) { inicio = null; return; }
    const b = ev.type === 'pointerup' ? elegida(m, ev) : null;
    inicio = null;
    marcar(m, null);
    if (!b) { setTimeout(() => { m.mantenido = false; }, 350); return; }   // el navegador puede no lanzar el toque que lo apaga
    // El toque que viene después de soltar sobre una opción no debe volver a abrir el abanico
    const bloquear = (e) => e.stopImmediatePropagation();
    boton.addEventListener('click', bloquear, { capture: true, once: true });
    setTimeout(() => boton.removeEventListener('click', bloquear, { capture: true }), 350);
    m.mantenido = false; m.elegirBoton(b);
  };
  boton.addEventListener('pointerup', soltar);
  boton.addEventListener('pointercancel', soltar);
}

// Indicador (pastilla detrás del icono) que se desliza a la pestaña indicada
function moverIndicador(nav, item, animar = true) {
  const ind = nav?.querySelector('.bm-indicador');
  if (!ind) return;
  if (!item || !item.offsetWidth) { ind.style.opacity = '0'; return; }
  ponerIndicador(ind, item.offsetLeft + item.offsetWidth / 2, animar);
}
// Centro del indicador en x (px desde el borde de la barra)
function ponerIndicador(ind, centro, animar) {
  ind.classList.toggle('sin-animar', !animar);
  ind.style.opacity = '1';
  ind.style.transform = `translateX(${centro - ind.offsetWidth / 2}px)`;
}

// Mantener y arrastrar por la barra (como la barra de iOS): el indicador va pegado al dedo en todo momento, la pestaña
// que queda bajo el dedo se marca al instante (con una vibración corta donde el teléfono lo permite) y al soltar el
// indicador se acomoda en ella con un rebote y se abre. Un toque normal funciona como siempre.
function arrastrable(nav) {
  let a = null;   // { sobre, x, movio, cuadro }
  const items = () => [...nav.querySelectorAll('.bm-item')];
  // Pestaña bajo el dedo: la más cercana a x (el "+" del centro no cuenta)
  const itemEn = (x) => items().reduce((mejor, it) => {
    const r = it.getBoundingClientRect(); const d = Math.abs(x - (r.left + r.width / 2));
    return !mejor || d < mejor.d ? { it, d } : mejor;
  }, null)?.it;
  const marcarSobre = (it) => {
    if (!a || it === a.sobre) return;
    a.sobre = it;
    items().forEach((x) => x.classList.toggle('bm-sobre', x === it));
    try { navigator.vibrate?.(6); } catch { /* sin vibración */ }
  };
  nav.addEventListener('pointerdown', (ev) => {
    const it = ev.target.closest('.bm-item');
    if (!it || ev.button > 0) return;
    a = { sobre: null, x: ev.clientX, movio: false, cuadro: 0 };
    try { nav.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
    nav.classList.add('presionando');
    marcarSobre(it);
    moverIndicador(nav, it);
  });
  nav.addEventListener('pointermove', (ev) => {
    if (!a) return;
    if (!a.movio && Math.abs(ev.clientX - a.x) < 4) return;
    if (!a.movio) { a.movio = true; nav.classList.add('arrastrando'); }
    const x = ev.clientX;
    marcarSobre(itemEn(x));   // la pestaña bajo el dedo, al instante
    cancelAnimationFrame(a.cuadro);
    a.cuadro = requestAnimationFrame(() => {   // el indicador, pegado al dedo (una vez por cuadro)
      if (!a) return;
      const ind = nav.querySelector('.bm-indicador');
      const r = nav.getBoundingClientRect();
      const medio = ind.offsetWidth / 2;
      ponerIndicador(ind, Math.min(r.width - medio, Math.max(medio, x - r.left)), false);
    });
  });
  const soltar = (ev) => {
    if (!a) return;
    if (a.movio && ev.type === 'pointerup') marcarSobre(itemEn(ev.clientX));
    const { sobre, cuadro } = a;
    cancelAnimationFrame(cuadro);
    a = null;
    nav.classList.remove('presionando', 'arrastrando');
    items().forEach((x) => x.classList.remove('bm-sobre'));
    if (ev.type === 'pointercancel') { moverIndicador(nav, nav.querySelector('.bm-item[aria-current]')); return; }
    moverIndicador(nav, sobre);   // se acomoda en la pestaña con rebote (CSS)
    if (!sobre) return;
    // Toque o arrastre: se abre aquí mismo la pestaña donde quedó el dedo (con la captura del puntero el toque no llega
    // al enlace) y se bloquea el toque que viene; si el navegador no lo lanza, el bloqueo se quita solo
    const bloquear = (e) => e.preventDefault();
    nav.addEventListener('click', bloquear, { capture: true, once: true });
    setTimeout(() => nav.removeEventListener('click', bloquear, { capture: true }), 350);
    items().forEach((x) => x.toggleAttribute('aria-current', x === sobre));   // la pestaña cambia al instante
    if (location.hash !== sobre.getAttribute('href')) location.hash = sobre.getAttribute('href');
  };
  nav.addEventListener('pointerup', soltar);
  nav.addEventListener('pointercancel', soltar);
  nav.addEventListener('contextmenu', (ev) => ev.preventDefault());   // mantener presionado no abre el menú del enlace
}

// Marca la pestaña de la vista actual (o Más si la vista no está en la barra), desliza el indicador hasta ella y anota
// hacia qué lado se fue (la vista nueva entra desde ese lado)
let ultimaPos = null;
export function marcarBarraMovil(nav, id, padre) {
  if (!nav) return;
  const enlaces = [...nav.querySelectorAll('.bm-item')];
  const actual = enlaces.find((a) => a.dataset.vista === id) ?? enlaces.find((a) => a.dataset.vista && a.dataset.vista === padre)
    ?? enlaces.find((a) => a.dataset.vista && id.split('.')[0] && a.dataset.vista.split('.')[0] === id.split('.')[0] && a.dataset.vista !== '')
    ?? (id ? enlaces.find((a) => a.dataset.vista === 'mas') : enlaces[0]);
  for (const a of enlaces) a.toggleAttribute('aria-current', a === actual);
  actual?.setAttribute('aria-current', 'page');
  const pos = enlaces.indexOf(actual);
  const raiz = document.documentElement;
  if (ultimaPos != null && pos !== ultimaPos && pos >= 0) raiz.dataset.navLado = pos > ultimaPos ? 'der' : 'izq';
  else delete raiz.dataset.navLado;
  ultimaPos = pos;
  requestAnimationFrame(() => moverIndicador(nav, actual, nav.querySelector('.bm-indicador')?.style.opacity === '1'));
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
  // Ya guardada hace menos de 12 horas con el mismo logo: no se vuelve a firmar ni descargar (la firma en R2 tardaba
  // ~1,7 s y ocupaba una conexión en cada carga; 2026-11-02)
  const previa = marcaGuardada(empresa.id);
  if (previa && previa.ruta === (empresa.logo_url ?? null) && Date.now() - (previa.hora ?? 0) < 12 * 3600e3) return previa.logo;
  let logo = null;
  try { if (empresa.logo_url) logo = await logoChico(await urlFirmada(api, empresa.logo_url, 120)); } catch { /* sin logo: se muestra el nombre */ }
  try { localStorage.setItem(CLAVE_MARCA, JSON.stringify({ id: empresa.id, nombre: nombreEmpresa(empresa), color: empresa.color || null, logo, ruta: empresa.logo_url ?? null, hora: Date.now() })); } catch { /* sin almacenamiento */ }
  return logo;
}

// El logo achicado (máx. 360 px de ancho, PNG con transparencia) como imagen incrustada: los logos subidos suelen pesar
// cientos de KB y no cabrían en el almacenamiento del navegador. Se dibuja desde una imagen incrustada (no ensucia el canvas).
async function logoChico(url) {
  const blob = await (await fetch(url)).blob();
  const original = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(blob); });
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = original; });
  const escala = Math.min(1, 360 / (img.naturalWidth || 360));
  const lienzo = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * escala), height: Math.round(img.naturalHeight * escala) });
  lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const chico = lienzo.toDataURL('image/png');
  return chico.length < original.length ? chico : original;
}
