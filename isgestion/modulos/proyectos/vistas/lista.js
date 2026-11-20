// Proyectos → Lista detallada: tabla clásica por zona y área con miniatura, filtros (zona, categoría, estado, solo
// cambios del modelo), ficha completa, duplicar, eliminar y Excel.
// Ruta: #/proyectos.lista?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=2c59c76';
import { icono } from '../../../core/ui/iconos.js?v=2c59c76';
import { boton } from '../../../core/ui/tabla.js?v=2c59c76';
import { avisar } from '../../../core/ui/aviso.js?v=2c59c76';
import {
  ESTADOS, FUENTES, NO_SUMA, clp, subtotal, suma, sinPrecioN, tienePrecio, gDe, alerta, esArchivo, ordenGrupos, zonasDe, fmtNum, leerNum, hoyISO, fechaCL,
  plegado, cargarTodo, cargarEstilos, selectorProyecto, sinProyectos, guardarPartida, insertarPartidas, mapasInv, estadoModelo, m3dDe, chipModelo,
  abrirLink, urlsImagenes, fichaPartida, ordenEntre,
} from '../datos.js?v=2c59c76';
import { ventana3d } from '../visor3d.js?v=2c59c76';
import { excelProyecto } from '../exportar.js?v=2c59c76';

const filtro = { texto: '', zona: '', cat: '', estado: '', cambios: false };

export default async function vista(ctx) {
  cargarEstilos();
  const d = await cargarTodo(ctx);
  if (!d.proyecto) return sinProyectos(ctx, d, 'Lista detallada');
  const mp = mapasInv(d.inventario);
  let imagen = await urlsImagenes(ctx, d.partidas);
  const pl = plegado(ctx);
  const puedeEditar = ctx.puede('proyectos', 'editar');
  const fuente = Object.fromEntries(FUENTES.map(([v, t]) => [v, v === 'modelo' ? 'Modelo' : t]));
  const cuerpo = el('div', { class: 'pro-lista' });
  const cambio = (x) => ((e) => e && (e.falta || e.dif))(estadoModelo(x, mp));

  async function guardar(x, c) { try { await guardarPartida(ctx, x, c); dibujar(); } catch (e) { avisar(e.message, 'error'); } }

  function fila(x) {
    const em = estadoModelo(x, mp);
    const img = imagen(x.img);
    const num = (f) => {
      const i = el('input', { class: 'pro-inline', value: fmtNum(x[f], f), inputmode: 'decimal', readonly: !puedeEditar, placeholder: f === 'precio' ? 'Por cotizar' : null, 'aria-label': f === 'precio' ? 'Precio unitario' : 'Cantidad' });
      if (f === 'precio' && !tienePrecio(x)) i.classList.add('sin');
      i.addEventListener('change', () => {
        const v = leerNum(i.value, f);
        if (v === undefined) { avisar('Ingresa un número mayor o igual a 0.', 'error'); i.value = fmtNum(x[f], f); return; }
        guardar(x, f === 'precio' ? { precio: v == null ? null : Math.round(v), ...(v ? { fecha_precio: hoyISO() } : {}) } : { cantidad: v });
      });
      return i;
    };
    const est = el('select', { class: `pro-estado e-${x.estado}`, 'aria-label': 'Estado', disabled: !puedeEditar }, ESTADOS.map(([v, t]) => el('option', { value: v, selected: v === x.estado }, t)));
    est.addEventListener('change', () => guardar(x, { estado: est.value }));
    const m3 = m3dDe(x, mp);
    return el('tr', { class: NO_SUMA.has(x.estado) ? 'off' : null },
      el('td', {}, img ? el('img', { class: 'pro-thumb', src: img, alt: '', loading: 'lazy', onerror: (ev) => ev.target.replaceWith(el('span', { class: 'pro-thumb vacio' })) }) : el('span', { class: 'pro-thumb vacio' })),
      el('td', {}, el('div', { class: 'pro-item' }, x.item || 'Sin nombre'), el('div', { class: 'det' }, x.detalle || ''), x.sku ? el('div', { class: 'texto-suave texto-chico' }, x.sku) : null),
      el('td', { class: 'num' }, num('cantidad'), ' ', el('span', { class: 'det' }, x.unidad || ''),
        fuente[x.fuente] ? el('div', {}, el('span', { class: `chip pro-fuente-${x.fuente}` }, fuente[x.fuente])) : null,
        chipModelo(em, puedeEditar ? (c) => guardar(x, { cantidad: c }) : null) ?? (em && !em.presente ? el('div', { class: 'pro-modelo' }, 'Igual al modelo') : null)),
      el('td', { class: 'num' }, num('precio'), x.fecha_precio ? el('div', { class: 'texto-suave texto-chico' }, fechaCL(x.fecha_precio)) : null),
      el('td', { class: 'num' }, tienePrecio(x) ? clp(subtotal(x)) : el('span', { class: 'det' }, '-')),
      el('td', {}, x.url ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); abrirLink(ctx, x.url).catch((e) => avisar(e.message, 'error')); } },
        icono(esArchivo(x.url) ? 'documento' : 'enlace', { tam: 13 }), ' ', x.tienda || (esArchivo(x.url) ? 'Archivo' : 'Ver')) : x.tienda || ''),
      el('td', {}, est),
      el('td', { class: `pro-nota-c${alerta(x) ? ' alerta' : ''}` }, x.nota || ''),
      el('td', { class: 'pro-acc-l' },
        m3 ? boton('3D', { icono: 'caja', class: 'boton boton-secundario boton-chico', onclick: () => ventana3d(ctx, x.item, { modeloId: d.modelo.id, m3d: m3 }) }) : null,
        el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': 'Editar', onclick: () => ficha(x) }, icono('editar', { tam: 16 })),
        ctx.puede('proyectos', 'crear') ? el('button', { type: 'button', class: 'boton-icono', title: 'Duplicar', 'aria-label': 'Duplicar', onclick: () => duplicar(x) }, icono('copiar', { tam: 16 })) : null,
        ctx.puede('proyectos', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar', onclick: () => borrar(x) }, icono('basura', { tam: 16 })) : null));
  }
  const ficha = (x) => fichaPartida(ctx, d, x, { alGuardar: async (f) => { if (!x) d.partidas.push(f); imagen = await urlsImagenes(ctx, d.partidas); dibujar(); } });
  async function duplicar(x) {
    const { id, created_at, created_by, updated_at, deleted_at, empresa_id, orden, ...resto } = x;
    const l = [...d.partidas].sort((a, b) => a.orden - b.orden);
    try {
      const [c] = await insertarPartidas(ctx, [{ ...resto, item: `${x.item} (copia)`, orden: ordenEntre(x.orden, l[l.indexOf(x) + 1]?.orden ?? null) }]);
      d.partidas.push(c); dibujar(); avisar('Partida duplicada');
    } catch (e) { avisar(e.message, 'error'); }
  }
  async function borrar(x) {
    if (!window.confirm(`¿Eliminar "${x.item}"?`)) return;
    try { await guardarPartida(ctx, x, { deleted_at: new Date().toISOString() }); d.partidas = d.partidas.filter((y) => y !== x); dibujar(); avisar('Partida eliminada'); } catch (e) { avisar(e.message, 'error'); }
  }

  const cab = () => el('thead', {}, el('tr', {}, ['', 'Ítem', 'Cantidad', 'Precio unit.', 'Subtotal', 'Tienda', 'Estado', 'Nota', ''].map((t, i) => el('th', { class: [2, 3, 4].includes(i) ? 'num' : null }, t))));
  function dibujar() {
    const q = filtro.texto.trim().toLowerCase();
    const ps = [...d.partidas].sort((a, b) => a.orden - b.orden).filter((x) => (!filtro.zona || x.zona === filtro.zona) && (!filtro.cat || x.categoria === filtro.cat)
      && (!filtro.estado || x.estado === filtro.estado) && (!filtro.cambios || cambio(x))
      && (!q || [x.item, x.detalle, x.tienda, x.sku, x.nota, x.grupo].join(' ').toLowerCase().includes(q)));
    const secciones = zonasDe(d.proyecto, ps).map((z) => {
      const filas = ps.filter((x) => x.zona === z);
      if (!filas.length) return null;
      const kz = `lz:${d.proyecto.id}:${z}`; const ab = pl.abierto(kz);
      const grupos = ordenGrupos([...new Set(filas.map(gDe))]);
      const filasHtml = () => grupos.flatMap((g) => {
        const fg = filas.filter((x) => gDe(x) === g);
        if (grupos.length === 1 && g === 'General') return fg.map(fila);
        const kg = `lg:${d.proyecto.id}:${z}:${g}`; const abg = pl.abierto(kg);
        return [el('tr', { class: 'pro-grupo-row', tabindex: 0, 'aria-expanded': String(abg), onclick: () => { pl.alternar(kg); dibujar(); }, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pl.alternar(kg); dibujar(); } } },
          el('td', { colspan: 9 }, icono('derecha', { tam: 12, clase: `icono pro-chev${abg ? ' abierto' : ''}` }), ` ${g} `, el('span', { class: 'texto-suave' }, `(${fg.length})`), el('span', { class: 'pro-gtot' }, clp(suma(fg))))),
        ...(abg ? fg.map(fila) : [])];
      });
      const sp = sinPrecioN(filas);
      return el('section', { class: `pro-zona${ab ? ' abierta' : ''}` },
        el('div', { class: 'pro-zona-h', role: 'button', tabindex: 0, 'aria-expanded': String(ab), onclick: () => { pl.alternar(kz); dibujar(); }, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pl.alternar(kz); dibujar(); } } },
          el('h2', {}, icono('derecha', { tam: 14, clase: 'icono pro-chev' }), z, el('span', { class: 'texto-suave texto-chico' }, `${filas.length} partidas${sp ? ` · ${sp} sin precio` : ''}`)),
          el('span', { class: 'pro-tot' }, clp(suma(filas)))),
        ab ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla pro-tabla-l' }, cab(), el('tbody', {}, filasHtml()))) : null);
    }).filter(Boolean);
    cuerpo.replaceChildren(...(secciones.length ? secciones : [el('div', { class: 'pro-vacio' }, icono('carpeta', { tam: 28 }),
      d.partidas.length ? 'Ninguna partida coincide con el filtro.' : 'Este proyecto aún no tiene partidas. Usa "Nueva partida" o agrégalas desde la vista Modelo SketchUp.')]));
  }

  const selectF = (clave, todos, opciones) => {
    const s = el('select', { class: 'campo campo-filtro', 'aria-label': todos }, el('option', { value: '' }, todos), opciones.map(([v, t]) => el('option', { value: v, selected: v === filtro[clave] }, t)));
    s.addEventListener('change', () => { filtro[clave] = s.value; dibujar(); });
    return s;
  };
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar ítem, tienda, código o nota', 'aria-label': 'Buscar', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; dibujar(); });
  const cambios = el('input', { type: 'checkbox', checked: filtro.cambios });
  cambios.addEventListener('change', () => { filtro.cambios = cambios.checked; dibujar(); });
  const todo = (abrir) => () => {
    for (const z of zonasDe(d.proyecto, d.partidas)) {
      pl.poner(`lz:${d.proyecto.id}:${z}`, abrir);
      for (const g of new Set(d.partidas.filter((x) => x.zona === z).map(gDe))) pl.poner(`lg:${d.proyecto.id}:${z}:${g}`, abrir);
    }
    dibujar();
  };
  dibujar();
  return el('section', { class: 'listado pro' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Lista detallada'),
      el('div', { class: 'listado-acciones' },
        ctx.puede('proyectos', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: async (ev) => {
          const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
          try { await excelProyecto(ctx, d); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
        } }) : null,
        ctx.puede('proyectos', 'crear') ? boton('Nueva partida', { icono: 'mas', tipo: 'primario', onclick: () => ficha(null) }) : null)),
    selectorProyecto(ctx, d, 'proyectos.lista'),
    el('div', { class: 'listado-acciones pro-herr' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador),
      selectF('zona', 'Todas las zonas', zonasDe(d.proyecto, d.partidas).map((z) => [z, z])),
      selectF('cat', 'Todas las categorías', [...new Set(d.partidas.map((x) => x.categoria).filter(Boolean))].sort().map((c) => [c, c])),
      selectF('estado', 'Todos los estados', ESTADOS),
      d.inventario ? el('label', { class: 'casilla' }, cambios, 'Solo cambios del modelo') : null,
      boton('Desplegar todo', { onclick: todo(true) }), boton('Plegar todo', { onclick: todo(false) })),
    cuerpo);
}
