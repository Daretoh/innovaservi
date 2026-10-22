// Datos y utilidades compartidas de Inventario. El stock se calcula (vista inv_stock), no se guarda.

export const TIPOS_DOC = [['entrada', 'Entrada'], ['salida', 'Salida'], ['ajuste', 'Ajuste'], ['traslado', 'Traslado']];
export const nombreDoc = Object.fromEntries(TIPOS_DOC);
export const DOCS_COMPRA = [['factura', 'Factura'], ['guia', 'Guía de despacho'], ['boleta', 'Boleta'], ['sin', 'Sin documento']];
export const CATEGORIAS = [['venta', 'Producto en venta'], ['insumo', 'Insumo']];
export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';

// Cantidad sin decimales innecesarios (1, 2,5)
export const cant = (n) => Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  const [almacenes, tipos] = await Promise.all([
    ctx.api.from('inv_almacenes').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('inv_tipos').select('*').eq('empresa_id', e).order('orden').order('nombre'),
  ]);
  if (almacenes.error) throw almacenes.error;
  if (tipos.error) throw tipos.error;
  return { almacenes: almacenes.data, tipos: tipos.data, tipoDe: new Map(tipos.data.map((t) => [t.id, t])), almacenDe: new Map(almacenes.data.map((a) => [a.id, a])) };
}

export async function cargarProductos(ctx, { todos = false } = {}) {
  let q = ctx.api.from('inv_productos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('nombre');
  if (!todos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Stock: producto → { almacén → cantidad, total }
export async function cargarStock(ctx) {
  const { data, error } = await ctx.api.from('inv_stock').select('producto_id, almacen_id, cantidad').eq('empresa_id', ctx.empresa.id);
  if (error) throw error;
  const m = new Map();
  for (const s of data) {
    const x = m.get(s.producto_id) ?? { total: 0 };
    x[s.almacen_id] = Number(s.cantidad); x.total += Number(s.cantidad);
    m.set(s.producto_id, x);
  }
  return m;
}

// Registra un documento con sus líneas (atómico en la base, con control de stock)
export async function registrar(ctx, { tipo, fecha, almacen, lineas, destino = null, tercero = null, docTipo = null, docNumero = null, motivo = null, archivo = null, solicitud = null, orden = null, origen = null }) {
  const { data, error } = await ctx.api.rpc('inv_registrar', {
    p_empresa: ctx.empresa.id, p_tipo: tipo, p_fecha: fecha, p_almacen: almacen, p_lineas: lineas, p_destino: destino, p_tercero: tercero,
    p_doc_tipo: docTipo, p_doc_numero: docNumero, p_motivo: motivo, p_archivo: archivo, p_solicitud: solicitud, p_orden: orden, p_origen: origen,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function anular(ctx, documentoId, motivo) {
  const { error } = await ctx.api.rpc('inv_anular', { p_documento: documentoId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}
