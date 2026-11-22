// Proyectos → Resumen: documento formal (cabecera, indicadores, resumen por área, lista de compra consolidada, detalle
// por área y pendientes), filtrable por zona, y su PDF con el membrete de la empresa.
// Ruta: #/proyectos.resumen?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=fce4a19';
import { icono } from '../../../core/ui/iconos.js?v=fce4a19';
import { boton } from '../../../core/ui/tabla.js?v=fce4a19';
import { avisar } from '../../../core/ui/aviso.js?v=fce4a19';
import { NOMBRE_ESTADO, clp, subtotal, tienePrecio, neto, fmtNum, hoyLargo, zonasDe, cargarTodo, cargarEstilos, selectorProyecto, sinProyectos, esArchivo } from '../datos.js?v=fce4a19';
import { calcularResumen, pdfResumen } from '../exportar.js?v=fce4a19';

const filtro = { zona: '', alt: false };
const n = (v) => fmtNum(v, 'cantidad');

export default async function vista(ctx) {
  cargarEstilos();
  const d = await cargarTodo(ctx);
  if (!d.proyecto) return sinProyectos(ctx, d, 'Resumen para imprimir');
  if (!zonasDe(d.proyecto, d.partidas).includes(filtro.zona)) filtro.zona = '';
  const documento = el('article', { class: 'pro-doc' });

  const tabla = (cab, filas, { der = [] } = {}) => el('div', { class: 'tabla-contenedor' }, el('table', { class: 'pro-doc-tab' },
    el('thead', {}, el('tr', {}, cab.map((t, i) => el('th', { class: der.includes(i) ? 'num' : null }, t)))), el('tbody', {}, filas)));
  const td = (v, clase = null) => el('td', { class: clase }, v);
  const prov = (x) => (x.url && !esArchivo(x.url) ? el('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.tienda || 'Ver') : x.tienda || '');
  const precioTd = (x) => (tienePrecio(x) ? td(clp(x.precio), 'num') : td('Por cotizar', 'num pend'));

  function dibujar() {
    const r = calcularResumen(d, filtro);
    const p = d.proyecto;
    const kpi = (t, v, pend = false) => el('div', { class: 'pro-kpi' }, el('span', {}, t), el('b', { class: pend ? 'pend' : null }, v));
    documento.replaceChildren(
      el('div', { class: 'pro-doc-cab' },
        el('div', {}, el('h2', { class: 'pro-doc-h1' }, 'Resumen de materiales y mobiliario'), el('div', {}, `${p.nombre}${filtro.zona ? ` · ${filtro.zona}` : ''}`)),
        el('div', { class: 'pro-doc-meta' }, el('div', {}, `Cliente: ${p.cliente || '-'}`), el('div', {}, `Fecha: ${hoyLargo()}`), el('div', {}, 'Precios con IVA incluido'))),
      el('div', { class: 'pro-kpis' }, kpi('Total con precio', clp(r.total)), kpi('Neto (sin IVA)', clp(neto(r.total))), kpi('IVA 19 %', clp(r.total - neto(r.total))),
        kpi('Partidas sin precio', `${r.sinPrecio.length} de ${r.ps.length}`, r.sinPrecio.length > 0)),
      el('h3', { class: 'pro-doc-h2' }, '1. Resumen general'),
      tabla(['Área', 'Partidas', 'Con precio', 'Sin precio', 'Total'], [
        ...r.porArea.map((a) => el('tr', {}, td(a.nombre), td(a.partidas, 'num'), td(a.con, 'num'), td(a.sin, `num${a.sin ? ' pend' : ''}`), td(clp(a.total), 'num'))),
        el('tr', { class: 'total' }, td('Total'), td(r.ps.length, 'num'), td(r.ps.length - r.sinPrecio.length, 'num'), td(r.sinPrecio.length, 'num'), td(clp(r.total), 'num'))], { der: [1, 2, 3, 4] }),
      el('h3', { class: 'pro-doc-h2' }, '2. Lista de compra consolidada'),
      el('p', { class: 'pro-doc-nota' }, 'Junta el mismo material o producto de todas las áreas en una sola línea, para comprar todo junto.'),
      r.consolidada.length ? tabla(['Material o producto', 'Cant. total', 'Unidad', 'Desglose por área', 'P. unitario', 'Total', 'Proveedor'], [
        ...r.consolidada.map((g) => el('tr', {}, el('td', {}, g.nombre, g.detalle ? el('div', { class: 'det' }, g.detalle) : null), el('td', { class: 'num' }, el('b', {}, n(g.cant))), td(g.unidad),
          td(g.partes.join(' · '), 'det'), g.precio ? td(clp(g.precio), 'num') : td('Por cotizar', 'num pend'), td(g.precio ? clp(g.precio * g.cant) : '-', 'num'), td(prov(g.prov)))),
        el('tr', { class: 'total' }, el('td', { colspan: 5 }, 'Total con precio'), td(clp(r.totalC), 'num'), td(''))], { der: [1, 4, 5] }) : el('p', {}, 'No hay partidas.'),
      el('h3', { class: 'pro-doc-h2' }, '3. Detalle por área'),
      r.detalle.length ? r.detalle.flatMap((dz) => [
        r.varias ? el('h3', { class: 'pro-doc-h2 zona' }, dz.zona) : null,
        ...dz.areas.flatMap((a, i) => [
          el('h4', { class: 'pro-doc-h3' }, el('span', {}, `${r.varias ? '' : `${i + 1}. `}${a.g}`), el('span', {}, clp(a.total))),
          tabla(['Ítem', 'Detalle', 'Cant.', 'Unidad', 'P. unitario', 'Subtotal', 'Proveedor', 'Estado'], [
            ...a.filas.map((x) => el('tr', {}, el('td', {}, x.item, x.sku ? el('div', { class: 'det' }, x.sku) : null), td(x.detalle || '', 'det'), td(n(x.cantidad), 'num'), td(x.unidad || ''),
              precioTd(x), td(tienePrecio(x) ? clp(subtotal(x)) : '-', 'num'), td(prov(x)), td(NOMBRE_ESTADO[x.estado]))),
            el('tr', { class: 'sub' }, el('td', { colspan: 5 }, `Subtotal ${a.g}`), td(clp(a.total), 'num'), el('td', { colspan: 2 }))], { der: [2, 4, 5] }),
        ]),
      ]) : el('p', {}, 'No hay partidas.'),
      el('h3', { class: 'pro-doc-h2' }, '4. Pendientes'),
      r.pendientes.length ? tabla(['Ítem', 'Área', 'Qué falta'], r.pendientes.map((x) => el('tr', {}, td(x.item), td(x.area), td(x.falta, 'det')))) : el('p', {}, 'Sin pendientes.'),
      el('p', { class: 'pro-doc-nota' }, 'El total considera solo las partidas con precio; las partidas por cotizar se suman cuando tengan precio. Precios referenciales a la fecha de cada partida; pueden variar según disponibilidad y despacho.'));
  }

  const zona = el('select', { class: 'campo campo-filtro', 'aria-label': 'Zona del resumen' }, el('option', { value: '' }, 'Todas las zonas'),
    zonasDe(d.proyecto, d.partidas).map((z) => el('option', { value: z, selected: z === filtro.zona }, z)));
  zona.addEventListener('change', () => { filtro.zona = zona.value; dibujar(); });
  const alt = el('input', { type: 'checkbox', checked: filtro.alt });
  alt.addEventListener('change', () => { filtro.alt = alt.checked; dibujar(); });
  dibujar();
  return el('section', { class: 'listado pro' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Resumen para imprimir'),
      el('div', { class: 'listado-acciones' }, ctx.puede('proyectos', 'exportar') ? boton('Descargar PDF', { icono: 'documento', tipo: 'primario', onclick: async (ev) => {
        const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
        try { await pdfResumen(ctx, d, filtro); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
      } }) : null)),
    selectorProyecto(ctx, d, 'proyectos.resumen'),
    el('div', { class: 'listado-acciones pro-herr' }, zona, el('label', { class: 'casilla' }, alt, 'Incluir alternativas y descartados'),
      d.partidas.length ? null : el('span', { class: 'texto-suave' }, icono('alerta', { tam: 14 }), ' El proyecto aún no tiene partidas.')),
    documento);
}
