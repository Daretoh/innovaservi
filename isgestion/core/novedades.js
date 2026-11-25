// Novedades de la plataforma (Núcleo 025): pantalla #/novedades (opción fija del menú, debajo de Tareas), contador de no
// leídas en el menú y tarjeta en el Inicio. Las escribe el equipo en Consola → Novedades; cada uno ve las de sus empresas
// y módulos (nov_visibles). Al abrir la pantalla quedan leídas. Texto con nodos (sin innerHTML).
import { el } from './ui/dom.js?v=5f7c89a';
import { icono } from './ui/iconos.js?v=5f7c89a';
import { urlsFirmadas } from './adjuntos.js?v=5f7c89a';

const RUTA = /^[a-z]+\.[a-z0-9_]+$/;
const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const avisos = new Set();   // quién quiere saber cuando cambia el contador (menú, barra del teléfono)

export async function contarNoLeidas(db) {
  const { data } = await db.rpc('nov_no_leidas');
  return Number(data) || 0;
}
export function alCambiarContador(fn) { avisos.add(fn); }
const avisarContador = (n) => avisos.forEach((fn) => { try { fn(n); } catch { /* nada */ } });

// Párrafos y listas simples del texto de la novedad
function cuerpo(texto) {
  const out = []; let lista = null;
  for (const l of String(texto).replace(/\r/g, '').split('\n').map((x) => x.trim())) {
    const it = l.match(/^[-*•]\s+(.*)$/);
    if (it) { if (!lista) out.push((lista = el('ul'))); lista.append(el('li', {}, it[1])); continue; }
    lista = null;
    if (l) out.push(el('p', {}, l));
  }
  return out;
}

function tarjeta(n, url, { hayVista }) {
  const destino = n.pantalla && RUTA.test(n.pantalla) && hayVista?.(n.pantalla) ? `#/${n.pantalla}` : null;
  return el('article', { class: `nov-item${n.leida ? '' : ' nueva'}` },
    el('header', { class: 'nov-cabeza' },
      n.leida ? null : el('span', { class: 'chip chip-prox' }, 'Nuevo'),
      el('span', { class: 'texto-suave texto-chico' }, fecha(n.publicada_at)),
      n.pantalla_nombre ? el('span', { class: 'chip chip-na' }, n.pantalla_nombre) : null),
    el('h2', { class: 'nov-titulo' }, n.titulo),
    el('div', { class: 'nov-texto' }, ...cuerpo(n.texto)),
    url ? el('a', { class: 'nov-imagen', href: url, target: '_blank', rel: 'noopener' }, el('img', { src: url, alt: n.titulo, loading: 'lazy' })) : null,
    (n.menciones ?? []).length ? el('p', { class: 'nov-mencion' }, icono('chat', { tam: 14 }),
      `Viene de ${n.menciones.length === 1 ? 'la sugerencia' : 'las sugerencias'} ${n.menciones.map((m) => `N° ${m.numero}${m.autor ? ` de ${m.autor.split(' ')[0]}` : ''}`).join(', ')}. ¡Gracias!`) : null,
    destino ? el('a', { class: 'boton boton-secundario boton-chico nov-ir', href: destino }, 'Ir a la pantalla', icono('derecha', { tam: 14 })) : null);
}

// Pantalla Novedades
export default async function vista(ctx) {
  const { data, error } = await ctx.api.rpc('nov_visibles', { p_limite: 60 });
  if (error) throw new Error(error.message);
  const urls = await urlsFirmadas(ctx.api, data.map((n) => n.imagen_ruta).filter(Boolean)).catch(() => new Map());
  const nuevas = data.filter((n) => !n.leida).map((n) => n.id);
  if (nuevas.length) Promise.resolve(ctx.api.rpc('nov_marcar_leidas', { p_ids: nuevas })).then(() => avisarContador(0)).catch(() => {});
  return el('section', { class: 'listado nov' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, icono('brillo'), 'Novedades')),
    el('p', { class: 'texto-suave' }, 'Lo nuevo y lo mejorado en ISgestión. Muchas cosas vienen de lo que ustedes sugieren en el chat de Ayuda.'),
    data.length ? el('div', { class: 'nov-lista' }, ...data.map((n) => tarjeta(n, urls.get(n.imagen_ruta), ctx)))
      : el('div', { class: 'estado-vacio' }, icono('brillo', { tam: 26 }), el('p', {}, 'Todavía no hay novedades.')));
}

// Tarjeta del Inicio: las no leídas (hasta 3); no aparece si no hay
export function tarjetaInicio(ctx) {
  const nodo = el('div', { class: 'ficha doc-grupo nov-inicio', hidden: true });
  Promise.resolve(ctx.api.rpc('nov_visibles', { p_limite: 10 })).then(({ data }) => {
    const nuevas = (data ?? []).filter((n) => !n.leida);
    if (!nuevas.length) return;
    nodo.replaceChildren(
      el('h2', {}, icono('brillo', { tam: 18 }), nuevas.length === 1 ? 'Novedad' : `Novedades (${nuevas.length})`),
      ...nuevas.slice(0, 3).map((n) => el('a', { class: 'doc-fila', href: '#/novedades' },
        el('span', { class: 'chip chip-prox' }, 'Nuevo'),
        el('div', { class: 'doc-nombre' }, el('strong', {}, n.titulo), el('span', { class: 'texto-suave' }, n.pantalla_nombre || fecha(n.publicada_at))),
        icono('derecha', { tam: 16 }))),
      el('a', { class: 'texto-chico nov-ver-todas', href: '#/novedades' }, 'Ver todas las novedades'));
    nodo.hidden = false;
  }).catch(() => {});
  return nodo;
}
