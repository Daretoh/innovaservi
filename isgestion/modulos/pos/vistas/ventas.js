// Ventas: ventas del mes con el cuadre por medio de pago (del día elegido y del mes) y exportación CSV.
import { avisar } from '../../../core/ui/aviso.js?v=a8e0f26';
import { el } from '../../../core/ui/dom.js?v=a8e0f26';
import { icono } from '../../../core/ui/iconos.js?v=a8e0f26';
import { listado, boton } from '../../../core/ui/tabla.js?v=a8e0f26';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=a8e0f26';
import { MEDIOS, nombreMedio, nombreDocVenta } from '../datos.js?v=a8e0f26';

const estado = { mes: hoyISO().slice(0, 7), dia: hoyISO() };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  if (estado.dia < desde || estado.dia > hasta) estado.dia = estado.mes === hoyISO().slice(0, 7) ? hoyISO() : desde;
  const { data, error } = await ctx.api.from('pos_ventas').select('*, terceros(razon_social, nombre_fantasia), pos_lineas(descripcion, cantidad)')
    .eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta).order('numero', { ascending: false });
  if (error) throw error;
  const vigentes = data.filter((v) => v.estado === 'vigente');
  const delDia = vigentes.filter((v) => v.fecha === estado.dia);
  const cliente = (v) => v.terceros?.nombre_fantasia || v.terceros?.razon_social || v.cliente || '';

  // Cuadre: total por medio de pago
  const cuadre = (titulo, ventas) => {
    const por = Object.fromEntries(MEDIOS.map(([k]) => [k, 0]));
    for (const v of ventas) por[v.medio_pago] += v.total;
    const total = ventas.reduce((s, v) => s + v.total, 0);
    return el('div', { class: 'ficha doc-grupo pos-cuadre' },
      el('h2', {}, titulo),
      MEDIOS.filter(([k]) => por[k]).map(([k, n]) => el('div', { class: 'pos-cuadre-fila' }, el('span', {}, n), el('span', {}, dinero(por[k])))),
      el('div', { class: 'pos-cuadre-fila pos-cuadre-total' }, el('strong', {}, `Total (${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'})`), el('strong', {}, dinero(total))));
  };
  const dia = el('input', { class: 'campo', type: 'date', value: estado.dia, min: desde, max: hasta, 'aria-label': 'Día del cuadre' });
  dia.addEventListener('change', () => { if (dia.value) { estado.dia = dia.value; ctx.refrescar(); } });

  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')))];
  if (ctx.puede('pos', 'exportar') && data.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => import('../../../core/excel.js?v=a8e0f26').then(({ exportarExcel }) => exportarExcel(ctx, {
    titulo: `Ventas · ${nombreMes(estado.mes)}`, nombre: `ventas-${estado.mes}`,
    columnas: ['N°', { t: 'Fecha', tipo: 'fecha' }, 'Cliente', 'Patente', 'Medio de pago', 'Documento', 'N° documento', { t: 'Descuento', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, 'Estado'],
    filas: data.map((v) => [v.numero, v.fecha, cliente(v), v.patente ?? '', nombreMedio[v.medio_pago], nombreDocVenta[v.doc_tipo], v.doc_numero ?? '', v.descuento, v.total, v.estado === 'anulada' ? 'Anulada' : 'Vigente']),
    total: ['Total', null, null, null, null, null, null, data.filter((v) => v.estado !== 'anulada').reduce((s, v) => s + Number(v.descuento || 0), 0), data.filter((v) => v.estado !== 'anulada').reduce((s, v) => s + Number(v.total || 0), 0), 'sin anuladas'],
  })).catch((e) => avisar(e.message, 'error')) }));
  if (ctx.puede('pos', 'crear')) acciones.push(boton('Nueva venta', { icono: 'mas', tipo: 'primario', onclick: () => { location.hash = ctx.ruta('pos.venta'); } }));

  const tabla = listado({
    titulo: 'Ventas',
    filas: data,
    acciones,
    vacio: 'Sin ventas en el mes.',
    columnas: [
      { titulo: 'N°', valor: (v) => el('a', { href: ctx.ruta('pos.detalle', { id: v.id }) }, el('strong', {}, `N° ${v.numero}`)) },
      { titulo: 'Fecha', valor: (v) => fechaLarga(v.fecha) },
      { titulo: 'Cliente', valor: (v) => [cliente(v), v.patente].filter(Boolean).join(' · ') },
      { titulo: 'Detalle', valor: (v) => v.pos_lineas.map((l) => l.descripcion).join(', ') },
      { titulo: 'Pago', valor: (v) => `${nombreMedio[v.medio_pago]}${v.doc_numero ? ` · ${nombreDocVenta[v.doc_tipo]} ${v.doc_numero}` : ''}` },
      { titulo: 'Total', valor: (v) => (v.estado === 'anulada' ? el('span', { class: 'chip chip-na' }, `Anulada · ${dinero(v.total)}`) : dinero(v.total)) },
    ],
  });
  // El cuadre va entre la cabecera y la tabla
  const cabecera = tabla.querySelector('.listado-cabecera');
  const resumen = el('div', { class: 'pos-cuadres' },
    el('div', {}, el('div', { class: 'form-fila' }, el('label', {}, 'Cuadre del día'), dia), cuadre(`Día ${fechaLarga(estado.dia)}`, delDia)),
    cuadre(nombreMes(estado.mes), vigentes));
  cabecera ? cabecera.after(resumen) : tabla.prepend(resumen);
  return tabla;
}
