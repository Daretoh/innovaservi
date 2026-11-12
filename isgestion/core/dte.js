// Documentos tributarios electrónicos (OpenFactura, Núcleo 021): llamadas a la Edge Function `dte`, que es la única que
// habla con Haulmer. En 'pruebas' (ambiente de desarrollo de Haulmer, timbre simulado) nada se escribe en facturas,
// órdenes ni gastos: los documentos quedan marcados como prueba. Ver supabase/functions/dte/index.ts.
import { el } from './ui/dom.js?v=d222bfb';
import { icono } from './ui/iconos.js?v=d222bfb';

export async function llamarDte(ctx, accion, datos = {}) {
  const { data, error } = await ctx.api.functions.invoke('dte', { body: { accion, empresa_id: ctx.empresa.id, ...datos } });
  if (error) {
    let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ }
    throw new Error(j?.error || error.message || 'No se pudo conectar con OpenFactura.');
  }
  return data;
}

// Llave única de una emisión (OpenFactura no emite dos veces con la misma llave en 24 horas)
export const nuevaLlave = () => crypto.randomUUID().replace(/-/g, '');

// Estado de la conexión (ambiente y contribuyente), en memoria 5 minutos por empresa
const cache = new Map();
export async function estadoDte(ctx, { forzar = false } = {}) {
  const c = cache.get(ctx.empresa.id);
  if (!forzar && c && Date.now() - c.t < 3e5) return c.v;
  const v = await llamarDte(ctx, 'estado').catch((e) => ({ conectado: false, error: e.message, prueba: true }));
  cache.set(ctx.empresa.id, { t: Date.now(), v });
  return v;
}

// Aviso del ambiente de pruebas (para los formularios y pantallas)
export const avisoPrueba = (texto = 'Ambiente de pruebas de OpenFactura: el documento es de prueba (timbre simulado) y no se guarda en ISgestión.') =>
  el('p', { class: 'aviso-bandeja dte-prueba' }, icono('alerta', { tam: 16 }), ' ', texto);

export const NOMBRE_DTE = { 33: 'Factura', 34: 'Factura exenta', 39: 'Boleta', 41: 'Boleta exenta', 43: 'Liquidación factura', 46: 'Factura de compra', 52: 'Guía de despacho', 56: 'Nota de débito', 61: 'Nota de crédito' };
