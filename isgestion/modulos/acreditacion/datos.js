// Datos y reglas compartidas de Acreditación.
import { hoyISO, moverMes } from '../../core/ui/formato.js?v=b52224b';

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';
export const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dias = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 86400000);

export const CHIP = {
  sin: ['chip-pend', 'Sin archivo'], ok: ['chip-ok', 'Vigente'], cargado: ['chip-ok', 'Cargado'],
  prox: ['chip-prox', 'Por vencer'], venc: ['chip-venc', 'Vencido'],
};
const PESO = { venc: 4, sin: 3, prox: 2, ok: 1, cargado: 1 };

// Estado de una versión según su tipo
export function estadoVersion(doc, tipo) {
  if (!doc) return { k: 'sin' };
  if (!tipo.vence || !doc.vence) return { k: tipo.vence ? 'ok' : 'cargado' };
  const n = dias(doc.vence);
  if (n < 0) return { k: 'venc', n };
  if (n <= tipo.dias_aviso) return { k: 'prox', n };
  return { k: 'ok', n };
}
export const textoEstado = (e) => (e.k === 'prox' ? `Vence en ${e.n} ${e.n === 1 ? 'día' : 'días'}` : e.k === 'venc' ? `Venció hace ${-e.n} ${e.n === -1 ? 'día' : 'días'}` : CHIP[e.k][1]);

// Versiones vigentes de un tipo: la más reciente, o una por titular si el tipo admite varios
export function vigentes(tipo, docs) {
  const orden = [...docs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  if (!tipo.multi) return orden.slice(0, 1);
  const vistos = new Set();
  return orden.filter((d) => { const k = (d.titular ?? '').trim().toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}
// Estado del tipo: el peor de sus vigentes
export function estadoTipo(tipo, docs) {
  const v = vigentes(tipo, docs);
  if (!v.length) return { k: 'sin', vigentes: v };
  const e = v.map((d) => estadoVersion(d, tipo)).sort((a, b) => PESO[b.k] - PESO[a.k])[0];
  return { ...e, vigentes: v };
}

export async function cargarDocumentos(ctx) {
  const e = ctx.empresa.id;
  const [carpetas, tipos, docs] = await Promise.all([
    ctx.api.from('acr_carpetas').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('acr_tipos').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('acr_documentos').select('*').eq('empresa_id', e).is('deleted_at', null),
  ]);
  for (const r of [carpetas, tipos, docs]) if (r.error) throw r.error;
  const docsDe = (id) => docs.data.filter((d) => d.tipo_id === id);
  return {
    carpetas: carpetas.data,
    tipos: tipos.data.map((t) => ({ ...t, docs: docsDe(t.id), estado: estadoTipo(t, docsDe(t.id)) })),
  };
}

// Meses que se exigen de un requisito mensual: desde su inicio hasta el mes anterior (máx. 24)
export function mesesExigidos(req) {
  const fin = moverMes(mesActual(), -1);
  const out = [];
  for (let p = req.desde; p <= fin && out.length < 24; p = moverMes(p, 1)) out.push(p);
  return out;
}

// Cumplimiento de los requisitos de un mandante: { filas, pct, pendientes }
export function cumplimientoMandante(requisitos, cumplimientos, tipos) {
  let esperados = 0; let ok = 0; let pendientes = 0;
  const filas = requisitos.filter((r) => r.activo).map((r) => {
    const de = cumplimientos.filter((c) => c.requisito_id === r.id);
    if (r.periodicidad === 'mensual') {
      const meses = mesesExigidos(r);
      const hechos = meses.filter((p) => de.some((c) => c.periodo === p)).length;
      esperados += meses.length; ok += hechos; pendientes += meses.length - hechos;
      return { r, meses, de };
    }
    // Única: con documento de empresa vigente, o marcada como subida
    const tipo = r.tipo_id ? tipos.find((t) => t.id === r.tipo_id) : null;
    const est = tipo ? tipo.estado : (de.some((c) => c.periodo === 'unica') ? { k: 'cargado' } : { k: 'sin' });
    const cumple = ['ok', 'cargado', 'prox'].includes(est.k);
    esperados += 1; ok += cumple ? 1 : 0; pendientes += cumple ? 0 : 1;
    return { r, tipo, est, de };
  });
  return { filas, pct: esperados ? Math.round((ok / esperados) * 100) : 100, pendientes };
}
