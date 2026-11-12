// Lectura de documentos con IA (Gemini en la Edge Function leer-documento), igual al lector de Finanzas de
// InnovaGestión: lee al agregar la foto, sin botón. La clave está solo en el servidor.
// modo: compra (boleta o factura de un proveedor) · venta (factura emitida) · pago (comprobante) · sindoc (sin documento).
import { comprimirFoto, esImagen } from './imagenes.js?v=9dfb925';

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

// Vencimientos con IA (modo vence): fotos o PDF (archivo elegido o URL firmada del ya guardado). modulo: rrhh, flota o
// acreditacion (el servidor revisa que el usuario pueda crear o editar ahí). Devuelve { datos, modelo, ms } o lanza.
const MAX_PDF = 8 * 1024 * 1024;
export async function leerVencConIA(api, { empresaId, modulo, fuentes }) {
  if (sinClave) throw new Error('La lectura con IA no está configurada');
  const partes = [];
  for (const f of fuentes) {
    const b0 = f instanceof Blob ? f : await fetch(f).then((r) => { if (!r.ok) throw new Error('No se pudo abrir el archivo guardado'); return r.blob(); });
    const blob = b0 instanceof File ? b0 : new File([b0], 'documento', { type: b0.type });   // comprimirFoto usa el nombre
    const pdf = blob.type === 'application/pdf' || /\.pdf$/i.test(blob.name || '') || (!(f instanceof Blob) && /\.pdf(\?|$)/i.test(String(f)));
    if (pdf) {
      if (blob.size > MAX_PDF) throw new Error('El PDF es muy grande para leerlo con IA (máx. 8 MB)');
      partes.push({ mime: 'application/pdf', data: await aBase64(blob) });
    } else if (blob.type.startsWith('image/') || esImagen(blob)) {
      const j = await comprimirFoto(blob, 1800);
      if (/^image\/(jpeg|png|webp)$/.test(j.type)) partes.push({ mime: j.type, data: await aBase64(j) });
    }
  }
  if (!partes.length) throw new Error('La IA lee fotos o PDF');
  const { data, error } = await api.functions.invoke('leer-documento', { body: { empresa_id: empresaId, modo: 'vence', modulo, images: partes.slice(0, 4) } });
  if (error) {
    let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ }
    if (j?.sinClave) sinClave = true;
    throw new Error(j?.error || error.message || 'No se pudo leer');
  }
  return data;
}
