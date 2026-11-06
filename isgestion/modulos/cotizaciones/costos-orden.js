// Costos de la orden en la cotización (2026-10-30, pedido de Enzo): al armar la cotización desde la orden del taller
// (Cotizar, Traer autos del mes) o con "Traer costos de la orden", cada vehículo trae sus costos como ítems con costo y
// precio 0: el trabajo de un tercero (ej. Daniel, desabolladura y pintura), lo comprado con la patente en esa visita y
// los insumos de inventario usados. Se les pone precio si se cobran (y así se ve el margen); con precio 0 no salen en
// el PDF. Cada costo guarda `registro_id` (o `insumos:<orden>`) para no traerlo dos veces.
// No entran las compras hechas por cuenta de un tercero (a_cuenta_de): se le descuentan a él, no son costo de la empresa.
// La lista y el editor de cotizaciones muestran estos mismos costos aunque nadie los haya traído (costosDeGrupos).
import { diaLocal, hoyISO } from '../../core/ui/formato.js?v=11a5492';

const nombreT = (t) => t?.nombre_fantasia || t?.razon_social || '';

const trozos = (l, n = 80) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

// Gastos e insumos de esas órdenes y patentes, por partes (la lista de cotizaciones no cabe en una sola dirección)
async function fuentes(ctx, idsOrden, patentes) {
  const regs = new Map(); const ins = [];
  const leer = (res) => res.flatMap((r) => { if (r.error) throw new Error(r.error.message); return r.data ?? []; });
  if (ctx.puede('costos', 'ver')) {
    const base = () => ctx.api.from('fin_registros')
      .select('id, fecha, concepto, total, neto, doc_tipo, orden_id, patente, tercero_id, a_cuenta_de, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)')
      .eq('empresa_id', ctx.empresa.id).eq('tipo', 'gasto').is('deleted_at', null).is('a_cuenta_de', null);
    const res = await Promise.all([...trozos(idsOrden).map((t) => base().in('orden_id', t)), ...trozos(patentes).map((t) => base().in('patente', t))]);
    for (const r of leer(res)) regs.set(r.id, r);
  }
  if (ctx.puede('inventario', 'ver')) {
    ins.push(...leer(await Promise.all(trozos(idsOrden).map((t) => ctx.api.from('inv_documentos').select('orden_id, estado, inv_movimientos(cantidad, costo_unitario)')
      .in('orden_id', t).eq('tipo', 'salida').eq('estado', 'vigente')))));
  }
  return { regs: [...regs.values()], ins };
}

function costoDeRegistro(r) {
  const quien = nombreT(r.terceros);
  // En neto (sin IVA) si es factura: la cotización se compara en neto
  const monto = r.doc_tipo === 'factura' && r.neto ? Number(r.neto) : Number(r.total);
  return { descripcion: r.concepto, fecha: r.fecha, costos: [{ desc: quien && !r.concepto.includes(quien) ? `${r.concepto} (${quien})` : r.concepto, monto, registro_id: r.id }] };
}

// Misma regla que "Costos con la patente" en la orden: ligado a la orden, o con la patente dentro de la visita
function costosDeUnaOrden(o, regs, ins) {
  const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at);
  const hasta = diaLocal(o.entregado_at) || hoyISO();
  const lista = regs.filter((r) => r.orden_id === o.id || (!r.orden_id && r.patente && r.patente === o.patente && r.fecha >= desde && r.fecha <= hasta)).map(costoDeRegistro);
  const costoIns = ins.filter((d) => d.orden_id === o.id).flatMap((d) => d.inv_movimientos)
    .reduce((s, m) => s + Math.abs(Number(m.cantidad)) * Number(m.costo_unitario || 0), 0);
  if (costoIns > 0) lista.push({ descripcion: 'Insumos de inventario', fecha: null, costos: [{ desc: 'Insumos usados en la orden', monto: Math.round(costoIns), registro_id: `insumos:${o.id}` }] });
  return lista;
}

// ordenes: [{ id, patente, ingreso_at, fecha_cita, created_at, entregado_at }] → Map(ordenId → [{ descripcion, fecha, costos }])
export async function costosDeOrdenes(ctx, ordenes) {
  if (!ordenes.length) return new Map();
  const { regs, ins } = await fuentes(ctx, ordenes.map((o) => o.id), [...new Set(ordenes.map((o) => o.patente).filter(Boolean))]);
  return new Map(ordenes.map((o) => [o.id, costosDeUnaOrden(o, regs, ins)]));
}

// Costos de cada vehículo de las cotizaciones (2026-11-06): los mismos de la orden ligada; sin orden, los gastos con su
// patente que no son de otra visita. No todo gasto lleva patente: aquí solo entran los que sí.
// ordenDe: Map(ordenId → orden) → Map(grupoId → [{ descripcion, fecha, costos }])
export async function costosDeGrupos(ctx, grupos, ordenDe) {
  if (!grupos.length) return new Map();
  const idsOrden = [...new Set(grupos.map((g) => g.orden_id).filter((id) => ordenDe.has(id)))];
  const { regs, ins } = await fuentes(ctx, idsOrden, [...new Set(grupos.map((g) => g.patente).filter(Boolean))]);
  return new Map(grupos.map((g) => {
    const o = ordenDe.get(g.orden_id);
    return [g.id, o ? costosDeUnaOrden({ ...o, patente: g.patente }, regs, ins)
      : regs.filter((r) => !r.orden_id && g.patente && r.patente === g.patente).map(costoDeRegistro)];
  }));
}

export const sumaCostos = (items) => items.reduce((s, x) => s + x.costos.reduce((a, k) => a + Number(k.monto || 0), 0), 0);

// Quita los que ya salieron en otro vehículo de la misma cotización (vistos se comparte entre sus vehículos)
export const sinRepetir = (items, vistos) => items.filter((x) => {
  const id = x.costos[0]?.registro_id;
  if (vistos.has(id)) return false;
  vistos.add(id); return true;
});

// Cuánto suman al costo de un vehículo los gastos que no están en sus líneas, sin contar nada dos veces: lo ya traído
// (registro_id) no se repite, y los costos escritos a mano suelen ser esos mismos gastos, así que se toma el mayor.
export function costoFuera(lineasGrupo, items, traidos) {
  const fuera = items.filter((x) => !x.costos.some((k) => traidos.has(k.registro_id)));
  const manual = lineasGrupo.flatMap((l) => l.costos ?? []).filter((k) => !k.registro_id).reduce((s, k) => s + Number(k.monto || 0), 0);
  return { fuera, manual, extra: Math.max(0, sumaCostos(fuera) - manual) };
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
