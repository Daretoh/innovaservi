// Datos y reglas compartidas por las vistas de RRHH.
import { el } from '../../core/ui/dom.js?v=605af68';
import { icono } from '../../core/ui/iconos.js?v=605af68';

export const VINCULOS = [['contrato', 'Contrato'], ['spot', 'Spot'], ['honorarios', 'Honorarios'], ['practica', 'Práctica']];
export const nombreVinculo = Object.fromEntries(VINCULOS);

export const nombreCompleto = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
export const iniciales = (p) => `${p.nombres?.[0] ?? ''}${p.apellido_paterno?.[0] ?? ''}`.toUpperCase();

// Personas con vínculo en la empresa activa, tipos de documento y documentos.
// Un documento de tipo 'persona' se toma del registro personal (empresa_id nulo),
// que comparten todas las empresas del grupo.
export async function cargarRrhh(ctx, { personaId = null } = {}) {
  let q = ctx.api.from('persona_empresa')
    .select('id, persona_id, cargo, tipo_vinculo, jornada, fecha_ingreso, fecha_termino, contrato_vence, contrato_indefinido, estado, buk, buk_at, personas(*)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
    .order('estado', { ascending: true });   // 'activo' antes que 'inactivo'
  if (personaId) q = q.eq('persona_id', personaId);
  const [vinculos, tipos] = await Promise.all([
    q,
    ctx.api.from('rrhh_tipos_doc').select('*').eq('empresa_id', ctx.empresa.id).order('orden').order('nombre'),
  ]);
  if (vinculos.error) throw vinculos.error;
  if (tipos.error) throw tipos.error;

  // Un vínculo por persona (el activo si hay más de uno).
  const porPersona = new Map();
  for (const v of vinculos.data) if (!porPersona.has(v.persona_id)) porPersona.set(v.persona_id, v);
  const lista = [...porPersona.values()].sort((a, b) => nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));

  let docs = [];
  if (lista.length) {
    const r = await ctx.api.from('rrhh_documentos').select('*')
      .is('deleted_at', null)
      .in('persona_id', lista.map((v) => v.persona_id))
      .or(`empresa_id.eq.${ctx.empresa.id},empresa_id.is.null`);
    if (r.error) throw r.error;
    docs = r.data;
  }
  const ambito = new Map(tipos.data.map((t) => [t.slug, t.ambito]));
  const mapa = new Map();
  for (const d of docs) {
    const personal = d.empresa_id === null;
    if ((ambito.get(d.tipo_slug) === 'persona') === personal) mapa.set(`${d.persona_id}|${d.tipo_slug}`, d);
  }
  return {
    vinculos: lista,
    tipos: tipos.data,
    tiposActivos: tipos.data.filter((t) => t.activo),
    doc: (personaId_, slug) => mapa.get(`${personaId_}|${slug}`) ?? null,
  };
}

// Estado de un documento (misma regla que InnovaGestión).
export function estadoDoc(tipo, doc, hoy = new Date()) {
  if (doc?.estado === 'no_aplica') return { k: 'na', texto: 'No aplica' };
  if (!doc || doc.estado !== 'entregado') return { k: 'pend', texto: 'Pendiente' };
  if (tipo.vence && doc.vence) {
    const dias = Math.floor((new Date(`${doc.vence}T12:00`) - hoy) / 86400000);
    if (dias < 0) return { k: 'venc', texto: `Vencido hace ${-dias} d`, dias };
    if (dias <= tipo.dias_aviso) return { k: 'prox', texto: dias === 0 ? 'Vence hoy' : `Vence en ${dias} d`, dias };
  }
  return { k: 'ok', texto: 'Entregado' };
}

// % al día = vigentes (entregado o por vencer) ÷ los que le aplican (sin "No aplica").
export function cumplimiento(datos, personaId) {
  let ok = 0; let n = 0; let entregados = 0;
  const cuenta = { ok: 0, prox: 0, venc: 0, pend: 0, na: 0 };
  for (const t of datos.tiposActivos) {
    const d = datos.doc(personaId, t.slug);
    const e = estadoDoc(t, d);
    if (d?.estado === 'entregado') entregados += 1;
    // Buk (se guarda allá) y los propios de un cliente no cuentan en el % base
    if (!t.cuenta || t.fuente === 'buk' || t.tercero_id) continue;
    cuenta[e.k] += 1;
    if (e.k === 'na') continue;
    n += 1;
    if (e.k === 'ok' || e.k === 'prox') ok += 1;
  }
  // ok = vigentes (al día + por vencer); cuenta.ok solo los "al día", por eso va primero y se sobrescribe.
  return { ...cuenta, ok, n, pct: n ? Math.round((ok / n) * 100) : 100, entregados };
}

// Contrato: plazo fijo (vence), indefinido o spot (sin fecha)
export const tipoContrato = (v) => (v.contrato_indefinido ? 'Indefinido' : v.contrato_vence ? 'Plazo fijo' : 'Spot / sin fecha');

export const nivel = (pct) => (pct >= 80 ? 'bien' : pct >= 50 ? 'medio' : 'mal');

// Avatar con anillo de % de documentación.
export function avatar(persona, pct, tam = 52) {
  return el('div', {
    class: `avatar avatar-${nivel(pct)}`, style: `--pct:${pct};--tam:${tam}px`,
    title: `${pct}% de documentación al día`, 'aria-hidden': 'true',
  }, el('span', {}, iniciales(persona)));
}

const ICONO_ESTADO = { ok: 'check', prox: 'reloj', venc: 'alerta', pend: 'circulo', na: 'menos' };
export function chipEstado(e) {
  return el('span', { class: `chip chip-${e.k}` }, icono(ICONO_ESTADO[e.k], { tam: 14 }), e.texto);
}
export function iconoEstado(e) {
  return el('span', { class: `celda-estado chip-${e.k}`, title: e.texto }, icono(ICONO_ESTADO[e.k], { tam: 16 }));
}
