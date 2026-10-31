// Lectura de documentos con IA (Gemini en la Edge Function leer-documento), igual al lector de Finanzas de
// InnovaGestión: lee al agregar la foto, sin botón. La clave está solo en el servidor.
// modo: compra (boleta o factura de un proveedor) · venta (factura emitida) · pago (comprobante) · sindoc (sin documento).
import { comprimirFoto, esImagen } from './imagenes.js?v=66a811d';

let sinClave = false;   // si el servidor no tiene la clave, no se vuelve a intentar en esta sesión
export const iaDisponible = () => !sinClave;

const aBase64 = (blob) => new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] ?? ''); fr.onerror = mal; fr.readAsDataURL(blob); });

// Devuelve { modelo, ms, datos } o lanza un error con un mensaje para mostrar
export async function leerConIA(api, { empresaId, modo, archivos }) {
  if (sinClave) throw new Error('La lectura con IA no está configurada');
  const fotos = [...archivos].filter((f) => esImagen(f)).slice(0, 4);
  if (!fotos.length) throw new Error('La IA lee fotos (JPG o PNG); para PDF o XML se usa el lector del timbre');
  const images = await Promise.all(fotos.map(async (f) => { const j = await comprimirFoto(f, 1800); return { mime: 'image/jpeg', data: await aBase64(j) }; }));
  const { data, error } = await api.functions.invoke('leer-documento', { body: { empresa_id: empresaId, modo, images } });
  if (error) {
    let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ }
    if (j?.sinClave) sinClave = true;
    throw new Error(j?.error || error.message || 'No se pudo leer');
  }
  return data;
}

export const numIA = (v) => { const s = String(v ?? '').replace(/[^\d-]/g, ''); return s === '' || s === '-' ? null : parseInt(s, 10); };
export const fechaIA = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : null);
export const MEDIOS_IA = ['transferencia', 'efectivo', 'debito', 'credito', 'cheque', 'otro'];
export const medioIA = (v) => { const m = String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return MEDIOS_IA.includes(m) ? m : null; };
// ¿La boleta o factura dice que se pagó al comprar? (débito, tarjeta, efectivo…)
export const pagadoAlComprar = (d) => /d[eé]bito|cr[eé]dito|efectivo|contado|tarjeta|transfer|redcompra|cmr/i.test(String(d?.medio_pago ?? ''));
export const textoModelo = (r) => `Leído por ${/gemini/i.test(r?.modelo ?? '') ? `Gemini (${r.modelo})` : r?.modelo || 'IA'}${r?.ms ? ` en ${Math.round(r.ms / 100) / 10} s` : ''}`;
