// Datos compartidos de Costos y gastos.
import { hoyISO, rangoMes } from '../../core/ui/formato.js';

export const CLASES = [['gasto', 'Gasto (va al resultado)'], ['personal', 'Personal (va a la línea Personal)'], ['inventario', 'Compra de inventario (es stock: no va al resultado)'], ['ingreso', 'Otro ingreso']];
export const nombreClase = { gasto: 'Gasto', personal: 'Personal', inventario: 'Compra de inventario', ingreso: 'Ingreso' };
export const DOCS = [['factura', 'Factura'], ['boleta', 'Boleta'], ['guia', 'Guía de despacho'], ['otro', 'Otro comprobante'], ['sin', 'Sin documento']];
export const nombreDoc = Object.fromEntries(DOCS);
export const MEDIOS = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['debito', 'Débito'], ['credito', 'Crédito'], ['cheque', 'Cheque'], ['otro', 'Otro']];
export const nombreMedio = Object.fromEntries(MEDIOS);
export const IVA = 0.19;

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';

// Neto e IVA (lo mismo que fija la base): con factura se separa el IVA; si no, todo es neto
export function netoDe(total, doc) {
  const t = Math.round(Number(total) || 0);
  if (doc !== 'factura') return { neto: t, iva: 0 };
  const neto = Math.round(t / (1 + IVA));
  return { neto, iva: t - neto };
}

export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  const [cat, cen, ter] = await Promise.all([
    ctx.api.from('fin_categorias').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('fin_centros').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).order('razon_social'),
  ]);
  for (const r of [cat, cen, ter]) if (r.error) throw r.error;
  return {
    categorias: cat.data, centros: cen.data, terceros: ter.data,
    categoriaDe: new Map(cat.data.map((c) => [c.id, c])),
    centroDe: new Map(cen.data.map((c) => [c.id, c])),
  };
}

// ---- Recurrentes
const ultimoDia = (mes) => Number(rangoMes(mes).hasta.slice(8, 10));
export const fechaEnMes = (mes, dia) => `${mes}-${String(Math.min(dia || 1, ultimoDia(mes))).padStart(2, '0')}`;

// ¿Corresponde cobrar este recurrente en el mes? (vigencia, ciclo anual)
export function tocaEnMes(r, mes) {
  if (!r.activo) return false;
  if (r.desde.slice(0, 7) > mes) return false;
  if (r.hasta && r.hasta.slice(0, 7) < mes) return false;
  return r.ciclo === 'mensual' || Number(mes.slice(5, 7)) === r.mes_anual;
}

// Próximo cobro desde hoy (para el semáforo)
export function proximoCobro(r, hoy = hoyISO()) {
  if (!r.activo) return null;
  let mes = hoy.slice(0, 7);
  for (let i = 0; i < 13; i++) {
    if (tocaEnMes(r, mes)) {
      const f = fechaEnMes(mes, r.dia);
      if (f >= hoy) return f;
    }
    const [a, m] = mes.split('-').map(Number);
    mes = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  }
  return null;
}

// Monto mensual equivalente en CLP (USD con el tipo de cambio dado; anual / 12)
export function mensualCLP(r, tipoCambio) {
  const clp = r.moneda === 'USD' ? (tipoCambio ? r.monto * tipoCambio : 0) : Number(r.monto);
  return Math.round(r.ciclo === 'anual' ? clp / 12 : clp);
}

// Crea los registros del mes que falten (uno por recurrente y mes). Devuelve cuántos creó.
export async function generarMes(ctx, recurrentes, mes, tipoCambio) {
  const e = ctx.empresa.id;
  const { data: hechos, error } = await ctx.api.from('fin_registros').select('recurrente_id').eq('empresa_id', e).eq('periodo', mes).is('deleted_at', null);
  if (error) throw error;
  const ya = new Set(hechos.map((h) => h.recurrente_id));
  const pendientes = recurrentes.filter((r) => tocaEnMes(r, mes) && !ya.has(r.id) && Number(r.monto) > 0);
  if (pendientes.some((r) => r.moneda === 'USD') && !(tipoCambio > 0)) throw new Error('Indica el valor del dólar para los gastos en USD.');
  if (!pendientes.length) return 0;
  const filas = pendientes.map((r) => {
    const usd = r.moneda === 'USD';
    const total = Math.round(usd ? Number(r.monto) * tipoCambio : Number(r.monto));
    const fecha = fechaEnMes(mes, r.dia);
    return {
      empresa_id: e, tipo: 'gasto', fecha, concepto: r.concepto, categoria_id: r.categoria_id, centro_id: r.centro_id, tercero_id: r.tercero_id,
      doc_tipo: r.doc_tipo, total, ...netoDe(total, r.doc_tipo), moneda: r.moneda, monto_origen: usd ? r.monto : null, tipo_cambio: usd ? tipoCambio : null,
      recurrente_id: r.id, periodo: mes,
      // Pago automático: queda pagado en su fecha
      estado_pago: r.autopago ? 'pagado' : 'pendiente', fecha_pago: r.autopago ? fecha : null, medio_pago: r.autopago ? 'credito' : null,
    };
  });
  const { error: e2 } = await ctx.api.from('fin_registros').insert(filas);
  if (e2) throw new Error(e2.message);
  return filas.length;
}

// ---- Compras de Inventario → gastos por pagar (sin duplicar). Costo de la entrada = neto si es factura.
export async function traerComprasInventario(ctx, categoriaId) {
  const e = ctx.empresa.id;
  const [docs, hechos] = await Promise.all([
    ctx.api.from('inv_documentos').select('id, numero, fecha, tercero_id, doc_tipo, doc_numero, inv_movimientos(cantidad, costo_unitario)')
      .eq('empresa_id', e).eq('tipo', 'entrada').eq('estado', 'vigente').order('fecha'),
    ctx.api.from('fin_registros').select('documento_id').eq('empresa_id', e).not('documento_id', 'is', null).is('deleted_at', null),
  ]);
  if (docs.error) throw docs.error;
  if (hechos.error) throw hechos.error;
  const ya = new Set(hechos.data.map((h) => h.documento_id));
  const filas = docs.data.filter((d) => !ya.has(d.id)).map((d) => {
    const neto = Math.round(d.inv_movimientos.reduce((s, m) => s + Number(m.cantidad) * m.costo_unitario, 0));
    const doc = d.doc_tipo ?? 'sin';
    const total = doc === 'factura' ? Math.round(neto * (1 + IVA)) : neto;
    return {
      empresa_id: e, tipo: 'gasto', fecha: d.fecha, concepto: `Compra de inventario (entrada N° ${d.numero})`, categoria_id: categoriaId,
      tercero_id: d.tercero_id, doc_tipo: doc, doc_numero: d.doc_numero, total, neto, iva: total - neto, documento_id: d.id,
    };
  }).filter((f) => f.total > 0);
  if (!filas.length) return 0;
  const { error } = await ctx.api.from('fin_registros').insert(filas);
  if (error) throw new Error(error.message);
  return filas.length;
}
