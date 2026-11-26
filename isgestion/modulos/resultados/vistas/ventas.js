// Finanzas → Estadísticas → Ventas y Comparación (2026-11-24, pedido de Enzo: estadísticas como opción propia de
// Finanzas, con lo que sale de Compras y gastos, lo de Ventas y cobros y una comparación). Usa el mismo cálculo del
// Estado de resultados (cargarEstado: res_resumen + Personal desde Remuneraciones), en neto, para que los números
// calcen con Resultados. Las ve quien ve Resultados (las pestañas son de este módulo).
// - Ventas: por mes y por origen (órdenes del taller, cierres, facturas, abonos, otros ingresos), del año.
// - Comparación: por mes lo que entra (ventas) contra lo que sale (costo de lo vendido, gastos y personal) y lo que queda.
import { el } from '../../../core/ui/dom.js?v=419b261';
import { icono } from '../../../core/ui/iconos.js?v=419b261';
import { dinero, hoyISO, nombreMes } from '../../../core/ui/formato.js?v=419b261';
import { mesesEntre, cargarEstado, sumarTotales, pct } from '../datos.js?v=419b261';

const estado = { anio: Number(hoyISO().slice(0, 4)) };
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

async function datosDelAnio(ctx) {
  const hoy = hoyISO().slice(0, 7);
  const hasta = `${estado.anio}-12` > hoy ? hoy : `${estado.anio}-12`;
  const meses = `${estado.anio}-01` > hoy ? [] : mesesEntre(`${estado.anio}-01`, hasta);
  const est = meses.length ? await cargarEstado(ctx, meses) : null;
  return { meses, est };
}

function cabecera(ctx, titulo, texto) {
  const mover = (n) => { estado.anio += n; ctx.refrescar(); };
  return el('header', { class: 'listado-cabecera' },
    el('div', {}, el('h1', {}, titulo), el('p', { class: 'texto-suave' }, texto)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, String(estado.anio)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año siguiente', onclick: () => mover(1) }, icono('derecha'))));
}

const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
  el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);

// Barras por mes: una o dos series (entra / sale) con el mismo máximo
function barrasMes(meses, series, etiquetaMes = (m) => MES_CORTO[Number(m.slice(5)) - 1]) {
  const max = Math.max(1, ...meses.flatMap((m) => series.map((s) => s.valor(m))));
  return el('div', { class: 'est-barras', role: 'img', 'aria-label': 'Gráfico por mes' }, meses.map((m) => el('div', { class: 'est-col', title: `${nombreMes(m)}: ${series.map((s) => `${s.nombre} ${dinero(s.valor(m))}`).join(' · ')}` },
    el('div', { class: 'est-pila' }, series.map((s) => el('i', { class: `est-barra ${s.clase}`, style: `height:${Math.max(0, (s.valor(m) / max) * 100)}%` }))),
    el('span', { class: 'texto-chico texto-suave' }, etiquetaMes(m)))));
}

export async function vistaVentas(ctx) {
  const { meses, est } = await datosDelAnio(ctx);
  const cab = cabecera(ctx, 'Estadísticas de ventas', 'Lo que se vendió cada mes, en neto (sin IVA), según el Estado de resultados.');
  if (!est) return el('section', { class: 'listado' }, cab, el('p', { class: 'texto-suave' }, 'Año sin meses todavía.'));
  const lineas = [...est.lineas.get('ingreso')].map(([concepto, porMes]) => ({ concepto, porMes, total: meses.reduce((s, m) => s + (porMes.get(m) ?? 0), 0) }))
    .filter((l) => l.total).sort((a, b) => b.total - a.total);
  const total = lineas.reduce((s, l) => s + l.total, 0);
  const conVentas = meses.filter((m) => (est.totales.get(m)?.ingresos ?? 0) > 0);
  const mejor = conVentas.reduce((a, m) => ((est.totales.get(m).ingresos > (est.totales.get(a)?.ingresos ?? -1)) ? m : a), conVentas[0]);
  return el('section', { class: 'listado' }, cab,
    el('div', { class: 'fin-tarjetas' },
      tarjeta(`Ventas de ${estado.anio}`, dinero(total), 'neto, todos los orígenes'),
      tarjeta('Promedio por mes', dinero(conVentas.length ? Math.round(total / conVentas.length) : 0), `${conVentas.length} ${conVentas.length === 1 ? 'mes' : 'meses'} con ventas`),
      mejor ? tarjeta('Mejor mes', nombreMes(mejor), dinero(est.totales.get(mejor).ingresos)) : null),
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Por mes'),
      barrasMes(meses, [{ nombre: 'Ventas', clase: 'est-entra', valor: (m) => est.totales.get(m)?.ingresos ?? 0 }])),
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'De dónde vienen'),
      lineas.length ? lineas.map((l) => el('div', { class: 'est-fila' },
        el('span', {}, l.concepto), el('div', { class: 'est-medidor' }, el('i', { style: `width:${(l.total / total) * 100}%` })),
        el('strong', {}, dinero(l.total)), el('span', { class: 'texto-suave texto-chico' }, pct(l.total, total))))
        : el('p', { class: 'texto-suave' }, 'Sin ventas en el año.')),
    el('p', { class: 'texto-suave texto-chico' }, 'El detalle por cliente y por orden está en Grupo → Utilidad por empresa.'));
}

export async function vistaComparacion(ctx) {
  const { meses, est } = await datosDelAnio(ctx);
  const cab = cabecera(ctx, 'Lo que entra y lo que sale', 'Por mes: ventas contra costos, gastos y sueldos, y lo que queda. En neto, igual que el Estado de resultados.');
  if (!est) return el('section', { class: 'listado' }, cab, el('p', { class: 'texto-suave' }, 'Año sin meses todavía.'));
  const t = sumarTotales(est);
  const sale = (x) => (x?.costo ?? 0) + (x?.gastos ?? 0) + (x?.personal ?? 0);
  return el('section', { class: 'listado' }, cab,
    est.avisoPersonal ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), ` ${est.avisoPersonal}`) : null,
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Entró', dinero(t.ingresos), 'ventas del año'),
      tarjeta('Salió', dinero(sale(t)), 'costos, gastos y sueldos'),
      tarjeta(t.resultado >= 0 ? 'Quedó' : 'Faltó', dinero(Math.abs(t.resultado)), `${pct(t.resultado, t.ingresos)} de las ventas`, t.resultado >= 0 ? 'fin-bien' : 'fin-alerta')),
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Por mes'),
      el('div', { class: 'est-leyenda texto-chico' }, el('span', {}, el('i', { class: 'est-barra est-entra' }), 'Entra'), el('span', {}, el('i', { class: 'est-barra est-sale' }), 'Sale')),
      barrasMes(meses, [
        { nombre: 'Entra', clase: 'est-entra', valor: (m) => est.totales.get(m)?.ingresos ?? 0 },
        { nombre: 'Sale', clase: 'est-sale', valor: (m) => sale(est.totales.get(m)) }])),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Mes', 'Entra', 'Costo de lo vendido', 'Gastos', 'Sueldos', 'Queda'].map((h, i) => el('th', { class: i ? 'num' : null }, h)))),
      el('tbody', {}, meses.map((m) => { const x = est.totales.get(m) ?? {}; return el('tr', {},
        el('td', {}, nombreMes(m)), el('td', { class: 'num' }, dinero(x.ingresos ?? 0)), el('td', { class: 'num' }, dinero(x.costo ?? 0)),
        el('td', { class: 'num' }, dinero(x.gastos ?? 0)), el('td', { class: 'num' }, dinero(x.personal ?? 0)),
        el('td', { class: `num ${(x.resultado ?? 0) < 0 ? 'texto-error' : ''}` }, el('strong', {}, dinero(x.resultado ?? 0)))); })))),
    el('p', { class: 'texto-suave texto-chico' }, 'Sueldos = el cálculo de Remuneraciones del mes (no los pagos). Las compras de inventario no van: el costo cuenta cuando se usa o se vende.'));
}

export default vistaVentas;
