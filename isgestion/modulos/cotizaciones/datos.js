// Datos y cálculos compartidos de Cotizaciones.

export const ESTADOS = [['borrador', 'Borrador'], ['enviada', 'Enviada'], ['aceptada', 'Aceptada'], ['rechazada', 'Rechazada']];
export const nombreEstado = Object.fromEntries(ESTADOS);
export const CHIP_ESTADO = { borrador: 'chip-pend', enviada: 'chip-prox', aceptada: 'chip-ok', rechazada: 'chip-na' };
export const TALLAS = ['S', 'M', 'L', 'XL'];
export const IVA = 0.19;

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';
export const normalizarPatente = (t) => (t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
export const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');
export const numeroTexto = (n) => String(n).padStart(6, '0');

// Total de una línea: cantidad × precio − descuento %
export const totalLinea = (l) => (l.tipo === 'seccion' ? 0 : Math.round(Number(l.cantidad || 0) * Number(l.precio || 0) * (1 - Number(l.desc_pct || 0) / 100)));
export const costoLinea = (l) => (l.costos ?? []).reduce((s, c) => s + Number(c.monto || 0), 0);

// Totales de la cotización: por grupo, subtotal, descuento adicional, neto, IVA, total, costo y margen
export function totales(c, grupos, lineas) {
  const porGrupo = new Map(grupos.map((g) => [g.id, lineas.filter((l) => l.grupo_id === g.id).reduce((s, l) => s + totalLinea(l), 0)]));
  const sub = [...porGrupo.values()].reduce((s, n) => s + n, 0);
  const desc = Math.round(sub * Number(c.desc_adic_pct || 0) / 100);
  const neto = sub - desc;
  const iva = c.con_iva ? Math.round(neto * IVA) : 0;
  const costo = lineas.reduce((s, l) => s + costoLinea(l), 0);
  return { porGrupo, sub, desc, neto, iva, total: neto + iva, costo, margen: neto - costo };
}

export const SELECT_COT = '*, cot_grupos(*), cot_lineas(*)';
export async function cargarCotizacion(ctx, id) {
  const { data, error } = await ctx.api.from('cot_cotizaciones').select(SELECT_COT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.cot_grupos.sort((a, b) => a.orden - b.orden);
  data.cot_lineas.sort((a, b) => a.orden - b.orden);
  return data;
}

export async function cargarConfig(ctx) {
  const { data } = await ctx.api.from('cot_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle();
  return data ?? { validez_dias: 7, pago: [], contactos: [] };
}

// Catálogo para sugerir descripciones y precios: lista del cliente primero, luego servicios del taller
export async function cargarCatalogo(ctx, terceroId) {
  const [precios, servicios] = await Promise.all([
    terceroId ? ctx.api.from('cot_precios').select('*').eq('tercero_id', terceroId) : Promise.resolve({ data: [] }),
    ctx.puede('taller', 'ver') ? ctx.api.from('tal_servicios').select('*').eq('empresa_id', ctx.empresa.id).eq('activo', true).order('orden') : Promise.resolve({ data: [] }),
  ]);
  const cliente = new Map((precios.data ?? []).map((p) => [p.descripcion.toLowerCase(), p]));
  const taller = new Map((servicios.data ?? []).map((s) => [s.nombre.toLowerCase(), s]));
  const nombres = [...new Set([...(precios.data ?? []).map((p) => p.descripcion), ...(servicios.data ?? []).map((s) => s.nombre)])];
  // Precio sugerido para una descripción y talla (null si no hay)
  const precio = (desc, talla) => {
    const k = (desc ?? '').trim().toLowerCase();
    const t = (talla || 'M').toLowerCase();
    const p = cliente.get(k);
    if (p) return p[`precio_${t}`] ?? p.precio ?? null;
    const s = taller.get(k);
    return s ? s[`precio_${t}`] ?? null : null;
  };
  return { nombres, precio, tieneLista: cliente.size > 0, taller: servicios.data ?? [] };
}

export async function siguienteNumero(ctx) {
  const { data, error } = await ctx.api.rpc('siguiente_correlativo', { p_empresa: ctx.empresa.id, p_modulo: 'cotizaciones', p_clave: 'cotizaciones.numero' });
  if (error) throw new Error(error.message);
  return data;
}

// Copia del cliente a la cotización
export const datosCliente = (t) => ({
  tercero_id: t?.id ?? null, cliente_nombre: t?.razon_social ?? null, cliente_rut: t?.rut ?? null, cliente_giro: t?.giro ?? null,
  cliente_contacto: t?.contacto ?? null, cliente_correo: t?.email ?? null, cliente_telefono: t?.telefono ?? null,
});
