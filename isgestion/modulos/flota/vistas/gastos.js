// Resumen de gastos de la flota por vehículo y mes, y por categoría, con exportación a CSV.
import { avisar } from '../../../core/ui/aviso.js?v=384ede1';
import { el } from '../../../core/ui/dom.js?v=384ede1';
import { icono } from '../../../core/ui/iconos.js?v=384ede1';
import { boton } from '../../../core/ui/tabla.js?v=384ede1';
import { dinero } from '../../../core/ui/formato.js?v=384ede1';
import { CATEGORIAS, nombreCat } from '../datos.js?v=384ede1';

const estado = { anio: new Date().getFullYear() };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function vista(ctx) {
  const a = estado.anio;
  const [v, r] = await Promise.all([
    ctx.api.from('flo_vehiculos').select('id, nombre, patente, deleted_at').eq('empresa_id', ctx.empresa.id).order('nombre'),
    ctx.api.from('flo_registros').select('vehiculo_id, categoria, fecha, monto').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
      .gte('fecha', `${a}-01-01`).lte('fecha', `${a}-12-31`).limit(10000),
  ]);
  if (v.error) throw v.error;
  if (r.error) throw r.error;
  const regs = r.data;
  const mes = (x) => Number(x.fecha.slice(5, 7)) - 1;
  const conGasto = v.data.filter((x) => regs.some((g) => g.vehiculo_id === x.id));
  const porVeh = conGasto.map((x) => {
    const m = Array(12).fill(0);
    regs.filter((g) => g.vehiculo_id === x.id).forEach((g) => { m[mes(g)] += Number(g.monto); });
    return { x, m, total: m.reduce((s, n) => s + n, 0) };
  });
  const porCat = CATEGORIAS.map(([k]) => ({ k, total: regs.filter((g) => g.categoria === k).reduce((s, g) => s + Number(g.monto), 0) })).filter((c) => c.total);
  const totMes = Array.from({ length: 12 }, (_, i) => porVeh.reduce((s, f) => s + f.m[i], 0));
  const total = totMes.reduce((s, n) => s + n, 0);
  const nombre = (x) => `${x.nombre}${x.patente ? ` · ${x.patente}` : ''}${x.deleted_at ? ' (eliminado)' : ''}`;

  const exportar = async () => {
    const { nuevoExcel } = await import('../../../core/excel.js?v=384ede1');
    const x = await nuevoExcel(ctx, { titulo: `Gastos de la flota · ${a}` });
    x.tabla({ titulo: 'Por vehículo', columnas: ['Vehículo', 'Patente', ...MESES.map((m) => ({ t: m, tipo: 'dinero' })), { t: 'Total', tipo: 'dinero' }],
      filas: porVeh.map((f) => [f.x.nombre, f.x.patente ?? '', ...f.m, f.total]), total: ['Total', '', ...totMes, total] });
    x.tabla({ titulo: 'Por categoría', columnas: ['Categoría', { t: 'Total', tipo: 'dinero' }], filas: porCat.map((c) => [nombreCat[c.k], c.total]), total: ['Total', total] });
    await x.guardar(`gastos-flota-${a}`);
  };
  const mover = (n) => { estado.anio += n; ctx.refrescar(); };
  const acciones = [el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, String(a)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año siguiente', onclick: () => mover(1) }, icono('derecha')))];
  if (regs.length && ctx.puede('flota', 'exportar')) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => exportar().catch((e) => avisar(e.message, 'error')) }));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Gastos de la flota'), el('div', { class: 'listado-acciones' }, acciones)),
    regs.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Vehículo'), MESES.map((m) => el('th', { class: 'num' }, m)), el('th', { class: 'num' }, 'Total'))),
      el('tbody', {}, porVeh.map((f) => el('tr', {},
        el('td', {}, f.x.deleted_at ? nombre(f.x) : el('a', { href: ctx.ruta('flota.vehiculo', { id: f.x.id }) }, nombre(f.x))),
        f.m.map((n) => el('td', { class: 'num' }, n ? dinero(n) : '')), el('td', { class: 'num' }, el('strong', {}, dinero(f.total)))))),
      el('tfoot', {}, el('tr', {}, el('th', {}, 'Total'), totMes.map((n) => el('th', { class: 'num' }, n ? dinero(n) : '')), el('th', { class: 'num' }, dinero(total))))))
      : el('p', { class: 'texto-suave' }, `Sin gastos registrados en ${a}.`),
    porCat.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Por categoría'),
      porCat.sort((x, y) => y.total - x.total).map((c) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, nombreCat[c.k])),
        el('span', {}, `${Math.round((c.total / total) * 100)} %`),
        el('strong', {}, dinero(c.total))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Los peajes son gasto del vehículo; no se reembolsan en remuneraciones.'));
}
