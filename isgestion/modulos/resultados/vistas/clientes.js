// Resultado por cliente (como Finanzas de InnovaGestión): ventas netas, costos directos de sus faenas, margen y
// participación en las ventas, por mes o por año. Montos netos, sin IVA.
import { el } from '../../../core/ui/dom.js?v=0e371c2';
import { icono } from '../../../core/ui/iconos.js?v=0e371c2';
import { listado, boton } from '../../../core/ui/tabla.js?v=0e371c2';
import { avisar } from '../../../core/ui/aviso.js?v=0e371c2';
import { dinero, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=0e371c2';
import { pct } from '../datos.js?v=0e371c2';

const estado = { modo: 'mes', mes: hoyISO().slice(0, 7), anio: Number(hoyISO().slice(0, 4)) };

export default async function vista(ctx) {
  const anual = estado.modo === 'anio';
  const desde = anual ? `${estado.anio}-01-01` : rangoMes(estado.mes).desde;
  const hasta = anual ? `${estado.anio}-12-31` : rangoMes(estado.mes).hasta;
  const { data, error } = await ctx.api.rpc('res_por_cliente', { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta });
  if (error) throw error;
  const ids = data.map((r) => r.tercero_id);
  const ter = ids.length ? (await ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').in('id', ids)).data ?? [] : [];
  const nombre = new Map(ter.map((t) => [t.id, t.nombre_fantasia || t.razon_social]));
  const total = data.reduce((s, r) => s + Number(r.ventas), 0);
  const filas = data.map((r) => ({ ...r, ventas: Number(r.ventas), costos: Number(r.costos), nombre: nombre.get(r.tercero_id) ?? 'Cliente' }))
    .map((r) => ({ ...r, margen: r.ventas - r.costos }));

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Periodo' },
    [['mes', 'Mes'], ['anio', 'Año']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.modo === k), onclick: () => { estado.modo = k; ctx.refrescar(); } }, n)));
  const mover = (n) => { if (anual) estado.anio += n; else estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const nav = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, anual ? String(estado.anio) : nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Siguiente', onclick: () => mover(1) }, icono('derecha')));
  const acciones = [segmento, nav];
  if (ctx.puede('resultados', 'exportar') && filas.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => import('../../../core/excel.js?v=0e371c2').then(({ exportarExcel }) => exportarExcel(ctx, {
    titulo: 'Resultado por cliente', subtitulo: `${anual ? estado.anio : nombreMes(estado.mes)} · montos netos, sin IVA`, nombre: `resultado-por-cliente-${anual ? estado.anio : estado.mes}`,
    columnas: ['Cliente', { t: 'Ventas', tipo: 'dinero' }, { t: 'Costos directos', tipo: 'dinero' }, { t: 'Margen', tipo: 'dinero' }, '% de las ventas'],
    filas: filas.map((r) => [r.nombre, r.ventas, r.costos, r.margen, pct(r.ventas, total)]),
  })).catch((e) => avisar(e.message, 'error')) }));

  const lista = listado({
    titulo: 'Resultado por cliente',
    filas,
    acciones,
    vacio: 'Sin ventas ni costos por cliente en el período.',
    columnas: [
      { titulo: 'Cliente', valor: (r) => el('strong', {}, r.nombre) },
      { titulo: 'Ventas', valor: (r) => dinero(r.ventas) },
      { titulo: '% ventas', valor: (r) => el('div', { class: 'cli-part' }, el('span', { class: 'seg-barra' }, el('i', { style: `width:${total ? Math.round((r.ventas / total) * 100) : 0}%` })), el('span', { class: 'texto-chico' }, pct(r.ventas, total))) },
      { titulo: 'Costos directos', valor: (r) => (r.costos ? dinero(r.costos) : el('span', { class: 'texto-suave' }, '—')) },
      { titulo: 'Margen', valor: (r) => el('strong', { class: r.margen < 0 ? 'texto-error' : '' }, dinero(r.margen)) },
      { titulo: 'Margen %', valor: (r) => pct(r.margen, r.ventas) },
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, `Total ventas ${dinero(total)}. Costos directos = gastos de Costos ligados a una faena del cliente. Los gastos generales y el personal no se reparten por cliente.`));
  return lista;
}
