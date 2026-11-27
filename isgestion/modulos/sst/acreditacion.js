// Para qué acreditación es una entrega (SST 006): mandante (cliente) y, si aplica, su lugar (ej.: SAL LOBOS → Camanchaca,
// Ensenada). Se elige al crear la entrega individual o después en la entrega; Acreditación las muestra en el mandante.
import { el } from '../../core/ui/dom.js?v=c3310e4';
import { abrirFormulario } from '../../core/ui/modal.js?v=c3310e4';
import { avisar } from '../../core/ui/aviso.js?v=c3310e4';

const nombreT = (t) => t?.nombre_fantasia || t?.razon_social || 'Cliente';

// Clientes y sus lugares (de Faenas, si está instalado y se puede ver)
export async function cargarDestinos(ctx) {
  const [cli, sit] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('ope_sitios').select('id, nombre, tercero_id').eq('empresa_id', ctx.empresa.id).order('nombre').then((r) => r, () => ({ data: [] })),
  ]);
  if (cli.error) throw cli.error;
  const clientes = cli.data ?? [];
  const sitios = sit.error ? [] : (sit.data ?? []);
  const de = new Map(clientes.map((c) => [c.id, c]));
  const sitio = new Map(sitios.map((s) => [s.id, s]));
  // Opciones de un solo select: "Mandante" y "Mandante → Lugar"
  const opciones = [];
  for (const c of [...clientes].sort((a, b) => nombreT(a).localeCompare(nombreT(b)))) {
    opciones.push([`${c.id}|`, nombreT(c)]);
    for (const s of sitios.filter((x) => x.tercero_id === c.id)) opciones.push([`${c.id}|${s.id}`, `${nombreT(c)} → ${s.nombre}`]);
  }
  const texto = (terceroId, sitioId) => {
    if (!terceroId) return '';
    const t = nombreT(de.get(terceroId));
    const s = sitioId ? sitio.get(sitioId)?.nombre : null;
    return s ? `${t} → ${s}` : t;
  };
  return { clientes, sitios, opciones, texto, nombreT };
}

export const valorDestino = (tercero, sitio) => (tercero ? `${tercero}|${sitio ?? ''}` : '');
export const leerDestino = (v) => {
  const [t, s] = String(v ?? '').split('|');
  return { acr_tercero_id: t || null, acr_sitio_id: (t && s) || null };
};

// Select para formularios propios (entrega individual)
export function selectDestino(dest, valor = '', id = 'acr-destino') {
  return el('select', { class: 'campo', id },
    el('option', { value: '' }, 'Sin acreditación'),
    dest.opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t)));
}

// Cambia la acreditación de uno o varios registros (los de un lote)
export async function elegirAcreditacion(ctx, ids, actual = '') {
  const dest = await cargarDestinos(ctx);
  abrirFormulario({
    titulo: 'Para qué acreditación',
    mensaje: 'La entrega queda en Acreditación, en el mandante (y lugar) que elijas, con su avance de firmas y su ZIP.',
    campos: [{ id: 'destino', etiqueta: 'Mandante y lugar', opciones: [['', 'Sin acreditación'], ...dest.opciones], valor: actual }],
    textoGuardar: 'Guardar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sst_entregas').update(leerDestino(v.destino)).in('id', ids);
      if (error) throw new Error(error.message);
      avisar(v.destino ? `Queda para ${dest.texto(...v.destino.split('|'))}.` : 'Sin acreditación.');
      ctx.refrescar();
    },
  });
}

// Clave de un documento dentro de una entrega: su código (el PTS por cargo cambia de número por persona: PTS-FUN); sin
// código, la sigla con que parte el título si es una sigla ("IRL Juan Pérez" → IRL: la IRL subida de cada uno)
export function claveDoc(d) {
  if (d.codigo) return String(d.codigo).replace(/^PTS-FUN-\d+$/, 'PTS-FUN');
  const w = String(d.titulo ?? '').split(/\s+/)[0];
  return /^[A-ZÁÉÍÓÚÑ]{2,6}$/.test(w) ? w : String(d.titulo ?? '');
}
// Documentos de una entrega, cada uno con quiénes lo recibieron y si ya lo firmaron
export function documentosDe(rs) {
  const m = new Map();
  for (const r of rs) for (const d of r.documentos ?? []) {
    const k = claveDoc(d);
    if (!m.has(k)) m.set(k, { clave: k, codigo: d.codigo ? k : '', titulos: new Set(), items: [] });
    const x = m.get(k);
    // "INV-PREV-08 · Inventario de riesgos…" → "Inventario de riesgos…"
    x.titulos.add(d.codigo ? String(d.titulo).replace(/^[^·]*·\s*/, '') : d.titulo);
    x.items.push({ r, d, firmado: !!d.archivo_firmado || r.estado === 'firmado' });
  }
  return [...m.values()].map((x) => {
    const t = [...x.titulos];
    const nombre = x.clave === 'PTS-FUN' ? 'PTS acorde a sus funciones (según el cargo de cada uno)'
      : t.length === 1 ? t[0] : x.codigo ? t[0] : `${x.clave} de cada trabajador`;
    return { ...x, nombre, firmados: x.items.filter((i) => i.firmado).length, total: x.items.length };
  });
}

// Agrupa registros en entregas: los de un mismo lote van juntos; el resto, uno por fila
export function agrupar(registros) {
  const grupos = new Map();
  for (const r of registros) {
    const k = r.lote_id ? `l:${r.lote_id}` : `r:${r.id}`;
    if (!grupos.has(k)) grupos.set(k, { clave: k, lote: r.lote_id ?? null, registros: [] });
    grupos.get(k).registros.push(r);
  }
  return [...grupos.values()].map((g) => {
    const rs = g.registros;
    const firmados = rs.filter((r) => r.estado === 'firmado').length;
    const personas = rs.reduce((s, r) => s + (r.sst_entrega_personas?.length ?? 0), 0);
    // Documentos únicos del lote (el PTS por cargo cambia de código por persona: se cuenta una vez por título base)
    const documentos = documentosDe(rs);
    const docs = documentos.map((x) => x.codigo || x.nombre);
    const acr = [...new Set(rs.map((r) => valorDestino(r.acr_tercero_id, r.acr_sitio_id)))];
    return { ...g, primero: rs[0], fecha: rs.map((r) => r.fecha).sort()[0], firmados, total: rs.length, personas, docs, documentos,
      acr: acr.length === 1 ? acr[0] : 'varias', estado: firmados === rs.length ? 'firmado' : 'pendiente' };
  });
}

export function barraAvance(hechos, total, texto = null) {
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  return el('div', { class: 'tal-progreso', title: `${hechos} de ${total}` },
    el('span', { class: 'tal-progreso-barra' }, el('i', { style: `width:${pct}%` })),
    el('span', { class: 'texto-chico' }, texto ?? `${hechos}/${total}`));
}
