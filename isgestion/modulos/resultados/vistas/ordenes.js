// Utilidad directa por orden cobrada en el mes: ingreso neto − insumos − gastos ligados a la orden o con su
// patente (10 días antes del ingreso a 10 días después del término). No descuenta gastos fijos ni personal.
import { el } from '../../../core/ui/dom.js?v=3a264c0';
import { icono } from '../../../core/ui/iconos.js?v=3a264c0';
import { listado } from '../../../core/ui/tabla.js?v=3a264c0';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=3a264c0';
import { pct } from '../datos.js?v=3a264c0';

const estado = { mes: hoyISO().slice(0, 7), orden: 'fecha' };
const ORDENES = [['fecha', 'Más recientes'], ['margen', 'Menor margen'], ['utilidad', 'Mayor utilidad']];

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  const args = { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta };
  const [o, s] = await Promise.all([ctx.api.rpc('res_ordenes', args), ctx.api.rpc('res_gastos_sin_orden', args)]);
  if (o.error) throw new Error(o.error.message);
  const filas = o.data.map((x) => ({ ...x, util: x.ingreso - x.insumos - x.gastos }));
  filas.forEach((x) => { x.margen = x.ingreso ? x.util / x.ingreso : null; });
  if (estado.orden === 'margen') filas.sort((a, b) => (a.margen ?? 9) - (b.margen ?? 9));
  if (estado.orden === 'utilidad') filas.sort((a, b) => b.util - a.util);
  const tot = filas.reduce((t, x) => ({ ing: t.ing + x.ingreso, ins: t.ins + x.insumos, gas: t.gas + x.gastos }), { ing: 0, ins: 0, gas: 0 });
  const util = tot.ing - tot.ins - tot.gas;
  const conTaller = ctx.puede('taller', 'ver');

  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [
    el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ordenar' }, ORDENES.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.orden === k), onclick: () => { estado.orden = k; ctx.refrescar(); } }, n))),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, nombreMes(estado.mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')))];

  const chipMargen = (m) => (m === null ? '—' : el('span', { class: `chip ${m < 0.2 ? 'chip-venc' : m < 0.4 ? 'chip-prox' : 'chip-ok'}` }, `${Math.round(m * 100)}%`));
  const tabla = listado({
    titulo: 'Utilidad por orden',
    filas,
    acciones,
    vacio: 'No hay órdenes cobradas en el mes.',
    columnas: [
      { titulo: 'Orden', valor: (x) => el('div', {}, conTaller ? el('a', { href: ctx.ruta('taller.orden', { id: x.orden_id }) }, el('strong', {}, `N° ${x.numero}`)) : el('strong', {}, `N° ${x.numero}`),
        el('div', { class: 'texto-suave texto-chico' }, `cobrada ${fechaLarga(x.cobrado)}`)) },
      { titulo: 'Vehículo', valor: (x) => el('div', {}, el('strong', {}, x.patente ?? '—'), el('div', { class: 'texto-suave texto-chico' }, [x.vehiculo, x.cliente].filter(Boolean).join(' · '))) },
      { titulo: 'Ingreso neto', valor: (x) => dinero(x.ingreso) },
      { titulo: 'Insumos', valor: (x) => (x.insumos ? dinero(x.insumos) : '—') },
      { titulo: 'Gastos', valor: (x) => (x.gastos ? `${dinero(x.gastos)} (${x.n_gastos})` : '—') },
      { titulo: 'Utilidad', valor: (x) => el('strong', { class: x.util < 0 ? 'pct-mal' : '' }, dinero(x.util)) },
      { titulo: 'Margen', valor: (x) => chipMargen(x.margen) },
    ],
  });
  const tarjeta = (titulo, valor, nota) => el('div', { class: 'ficha doc-grupo fin-tarjeta' },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  tabla.querySelector('.listado-cabecera').after(el('div', {},
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Órdenes cobradas', String(filas.length)),
      tarjeta('Ingreso neto', dinero(tot.ing)),
      tarjeta('Costos directos', dinero(tot.ins + tot.gas), 'insumos + gastos ligados'),
      tarjeta('Utilidad directa', dinero(util), `${pct(util, tot.ing)} de margen`)),
    el('p', { class: 'texto-suave texto-chico' }, 'Utilidad directa = ingreso neto − insumos usados en la orden − gastos ligados a la orden o con su patente (10 días antes del ingreso a 10 después del término). No descuenta gastos fijos ni personal: eso está en el Estado de resultados.')));
  const sueltos = s.data ?? [];
  if (sueltos.length) {
    tabla.append(el('details', { class: 'ficha doc-grupo' },
      el('summary', {}, el('strong', {}, `Gastos con patente sin orden cobrada (${sueltos.length} · ${dinero(sueltos.reduce((a, g) => a + Number(g.neto), 0))})`)),
      el('p', { class: 'texto-suave texto-chico' }, 'Auto aún sin cobrar, o patente mal escrita. Se suman a la utilidad cuando la orden se cobre.'),
      sueltos.map((g) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, ctx.puede('costos', 'ver') ? el('a', { href: ctx.ruta('costos.registro', { id: g.registro_id }) }, g.concepto) : el('span', {}, g.concepto),
          el('span', { class: 'texto-suave texto-chico' }, `${fechaLarga(g.fecha)} · ${g.patente}`)),
        el('strong', {}, dinero(g.neto))))));
  }
  return tabla;
}
