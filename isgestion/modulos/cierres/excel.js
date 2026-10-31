// Excel con el detalle del cierre mensual (como "Exportar detalle (Excel)" del Cierre GM del OS, 2026-10-22):
// una fila por vehículo con N°, vehículo, patente, talla, el valor de cada servicio en su columna, extras, descuento,
// total y notas, y la fila TOTAL DEL MES. Con el membrete y los colores de la empresa (core/excel.js).
import { nombreTercero, nombreMesLargo, numeroTexto } from './datos.js?v=66a811d';

const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');

export async function excelDetalleCierre(ctx, c, lineas) {
  const vivas = lineas.filter((l) => !l.excluida);
  const ordenes = vivas.map((l) => l.orden_id).filter(Boolean);
  let detalle = new Map();
  if (ordenes.length && ctx.puede('taller', 'ver')) {
    const [o, s] = await Promise.all([
      ctx.api.from('tal_ordenes').select('id, numero, descuento, tal_vehiculos(marca, modelo, patente, talla)').in('id', ordenes),
      ctx.api.from('tal_orden_servicios').select('orden_id, nombre, precio, orden').in('orden_id', ordenes).order('orden'),
    ]);
    if (o.error) throw o.error;
    if (s.error) throw s.error;
    detalle = new Map(o.data.map((x) => [x.id, { ...x, servicios: s.data.filter((y) => y.orden_id === x.id) }]));
  }
  // Columnas de servicios: los que aparecen en el mes, en el orden en que salen
  const servicios = [];
  for (const x of detalle.values()) for (const s of x.servicios) if (!servicios.includes(s.nombre)) servicios.push(s.nombre);

  const filas = vivas.map((l, i) => {
    const d = l.orden_id ? detalle.get(l.orden_id) : null;
    const v = d?.tal_vehiculos;
    const porServicio = servicios.map((n) => (d ? d.servicios.filter((s) => s.nombre === n).reduce((t, s) => t + Number(s.precio || 0), 0) || null : null));
    const suma = porServicio.reduce((t, x) => t + (x ?? 0), 0);
    const descuento = Number(d?.descuento || 0) || null;
    // Lo que no viene de servicios (línea manual o monto ajustado a mano) va como extra
    const extra = d ? Math.max(0, l.monto - (suma - (descuento ?? 0))) || null : l.monto || null;
    return [i + 1, v ? [v.marca, v.modelo].filter(Boolean).join(' ') || l.descripcion : l.descripcion, verPatente(v?.patente ?? l.patente), v?.talla ?? '',
      ...porServicio, extra, descuento, l.monto, [d ? `Orden N° ${d.numero}` : null, l.detalle && !d ? l.detalle : null, l.notas].filter(Boolean).join(' · ')];
  });
  const total = vivas.reduce((t, l) => t + Number(l.monto || 0), 0);
  const { exportarExcel } = await import('../../core/excel.js?v=66a811d');
  await exportarExcel(ctx, {
    titulo: `Detalle ${nombreTercero(c.terceros)} · ${nombreMesLargo(c.mes)}`,
    subtitulo: [c.numero ? `Cierre N° ${numeroTexto(c.numero)}` : 'Sin emitir', `${vivas.length} vehículos`, 'montos netos'].join(' · '),
    columnas: ['N°', 'Vehículo', 'Patente', 'Talla', ...servicios.map((n) => ({ t: n, tipo: 'dinero' })),
      { t: 'Extras', tipo: 'dinero' }, { t: 'Descuento', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, 'Notas'],
    filas,
    total: ['TOTAL DEL MES', '', '', '', ...servicios.map(() => null), null, null, total, ''],
    nombre: `detalle-${(c.terceros?.nombre_fantasia || c.terceros?.razon_social || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.mes}`,
  });
}
