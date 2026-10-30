// Costos de la orden en la cotización (2026-10-30, pedido de Enzo): al armar la cotización desde la orden del taller
// (Cotizar, Traer autos del mes) o con "Traer costos de la orden", cada vehículo trae sus costos como ítems con costo y
// precio 0: el trabajo de un tercero (ej. Daniel, desabolladura y pintura), lo comprado con la patente en esa visita y
// los insumos de inventario usados. Se les pone precio si se cobran (y así se ve el margen); con precio 0 no salen en
// el PDF. Cada costo guarda `registro_id` (o `insumos:<orden>`) para no traerlo dos veces.
// No entran las compras hechas por cuenta de un tercero (a_cuenta_de): se le descuentan a él, no son costo de la empresa.
import { diaLocal, hoyISO } from '../../core/ui/formato.js?v=ca87e0a';

const nombreT = (t) => t?.nombre_fantasia || t?.razon_social || '';

// ordenes: [{ id, patente, ingreso_at, fecha_cita, created_at, entregado_at }] → Map(ordenId → [{ descripcion, costos }])
export async function costosDeOrdenes(ctx, ordenes) {
  const porOrden = new Map(ordenes.map((o) => [o.id, []]));
  if (!ordenes.length) return porOrden;
  const patentes = [...new Set(ordenes.map((o) => o.patente).filter(Boolean))];
  const [regs, ins] = await Promise.all([
    ctx.puede('costos', 'ver') ? ctx.api.from('fin_registros')
      .select('id, fecha, concepto, total, neto, doc_tipo, orden_id, patente, tercero_id, a_cuenta_de, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)')
      .eq('empresa_id', ctx.empresa.id).eq('tipo', 'gasto').is('deleted_at', null).is('a_cuenta_de', null)
      .or([`orden_id.in.(${ordenes.map((o) => o.id).join(',')})`, patentes.length ? `patente.in.(${patentes.join(',')})` : null].filter(Boolean).join(',')) : { data: [] },
    ctx.puede('inventario', 'ver') ? ctx.api.from('inv_documentos').select('orden_id, estado, inv_movimientos(cantidad, costo_unitario)')
      .in('orden_id', ordenes.map((o) => o.id)).eq('tipo', 'salida').eq('estado', 'vigente') : { data: [] },
  ]);
  for (const o of ordenes) {
    // Misma regla que "Costos con la patente" en la orden: ligado a la orden, o con la patente dentro de la visita
    const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at);
    const hasta = diaLocal(o.entregado_at) || hoyISO();
    const lista = porOrden.get(o.id);
    for (const r of regs.data ?? []) {
      if (!(r.orden_id === o.id || (!r.orden_id && r.patente && r.patente === o.patente && r.fecha >= desde && r.fecha <= hasta))) continue;
      const quien = nombreT(r.terceros);
      // En neto (sin IVA) si es factura: la cotización se compara en neto
      const monto = r.doc_tipo === 'factura' && r.neto ? Number(r.neto) : Number(r.total);
      lista.push({ descripcion: r.concepto, costos: [{ desc: quien && !r.concepto.includes(quien) ? `${r.concepto} (${quien})` : r.concepto, monto, registro_id: r.id }] });
    }
    const costoIns = (ins.data ?? []).filter((d) => d.orden_id === o.id).flatMap((d) => d.inv_movimientos)
      .reduce((s, m) => s + Math.abs(Number(m.cantidad)) * Number(m.costo_unitario || 0), 0);
    if (costoIns > 0) lista.push({ descripcion: 'Insumos de inventario', costos: [{ desc: 'Insumos usados en la orden', monto: Math.round(costoIns), registro_id: `insumos:${o.id}` }] });
  }
  return porOrden;
}

// Ids de costos ya traídos a un grupo (para no repetirlos)
export const yaTraidos = (lineas) => new Set(lineas.flatMap((l) => (l.costos ?? []).map((k) => k.registro_id).filter(Boolean)));

// Líneas para insertar: cada costo como ítem con precio 0 (los ya traídos se omiten)
export function lineasCosto(costos, excluir = new Set()) {
  const nuevos = costos.filter((x) => !x.costos.some((k) => excluir.has(k.registro_id)));
  if (!nuevos.length) return [];
  return nuevos.map((x) => ({ tipo: 'item', descripcion: x.descripcion, cantidad: 1, precio: 0, desc_pct: 0, costos: x.costos }));
}

// Solo costo: ítem sin precio con costos internos (no se imprime en el PDF)
export const soloCosto = (l) => l.tipo === 'item' && !Number(l.precio) && (l.costos ?? []).some((k) => Number(k.monto));
