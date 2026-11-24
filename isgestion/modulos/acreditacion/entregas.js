// Entregas de Prevención SST para la acreditación de un mandante (SST 006: sst_entregas.acr_tercero_id / acr_sitio_id).
// Trazabilidad: qué se entregó, a quién, para qué lugar, quién firmó; avance por entrega y ZIP por entrega o por lugar.
// Se ve con permiso de Prevención SST (ver); sin él la sección no aparece.
import { el } from '../../core/ui/dom.js?v=190b5a4';
import { icono } from '../../core/ui/iconos.js?v=190b5a4';
import { boton } from '../../core/ui/tabla.js?v=190b5a4';
import { fechaLarga } from '../../core/ui/formato.js?v=190b5a4';
import { cargarDestinos, agrupar, barraAvance, claveDoc } from '../sst/acreditacion.js?v=190b5a4';

const SEL = 'id, tipo, tema, fecha, relator, estado, lote_id, acr_tercero_id, acr_sitio_id, documentos, created_at, sst_entrega_personas(persona_id)';

// Avance de firmas por mandante (para las tarjetas de Requisitos por mandante): Map tercero → { firmados, total, lugares }
export async function avancePorMandante(ctx) {
  if (!ctx.puede('sst', 'ver')) return null;
  const { data, error } = await ctx.api.from('sst_entregas').select('acr_tercero_id, acr_sitio_id, estado')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).not('acr_tercero_id', 'is', null);
  if (error) return null;
  const m = new Map();
  for (const r of data) {
    const x = m.get(r.acr_tercero_id) ?? { firmados: 0, total: 0, lugares: new Map() };
    const l = x.lugares.get(r.acr_sitio_id ?? '') ?? { firmados: 0, total: 0 };
    x.total += 1; l.total += 1;
    if (r.estado === 'firmado') { x.firmados += 1; l.firmados += 1; }
    x.lugares.set(r.acr_sitio_id ?? '', l);
    m.set(r.acr_tercero_id, x);
  }
  return m;
}

const zipDoc = (ctx, ids, nombre, soloDoc) => boton('ZIP', { icono: 'descargar', title: 'Carpeta por trabajador (firmado si ya firmó), en partes de hasta 19 MB', onclick: async (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  const b = ev.currentTarget;
  const { descargarEntregasZip } = await import('../sst/zip.js?v=190b5a4');
  await descargarEntregasZip(ctx, ids, { nombre, soloDoc, boton: b });
} });
const zip = (ctx, ids, nombre) => boton('ZIP', { icono: 'descargar', title: 'Carpeta por trabajador con cada documento (firmado si ya firmó), en partes de hasta 19 MB', onclick: async (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  const b = ev.currentTarget;
  const { descargarEntregasZip } = await import('../sst/zip.js?v=190b5a4');
  await descargarEntregasZip(ctx, ids, { nombre, boton: b });
} });

// sitio: solo las entregas de ese lugar (pestaña del lugar en el mandante)
export async function seccionEntregas(ctx, c, { sitio = null } = {}) {
  if (!ctx.puede('sst', 'ver')) return null;
  const [res, dest] = await Promise.all([
    ctx.api.from('sst_entregas').select(SEL).eq('empresa_id', ctx.empresa.id).eq('acr_tercero_id', c.id).is('deleted_at', null)
      .order('fecha', { ascending: false }).order('created_at'),
    cargarDestinos(ctx).catch(() => null),
  ]);
  if (res.error) throw res.error;
  if (sitio) res.data = res.data.filter((r) => r.acr_sitio_id === sitio);
  const nombreC = dest?.nombreT(c) ?? c.razon_social;
  const cab = el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Documentos firmados (Prevención SST)'));
  if (!res.data.length) {
    return el('div', { class: 'ficha doc-grupo' }, cab,
      el('p', { class: 'texto-suave' }, `Aún no hay entregas asignadas a ${nombreC}. En Prevención SST → Registros de entrega, abre una entrega y elige "Para la acreditación de".`));
  }
  const firmados = res.data.filter((r) => r.estado === 'firmado').length;
  cab.append(zip(ctx, res.data.map((r) => r.id), `Acreditacion ${nombreC}`));
  // Por lugar (sin lugar = el mandante en general)
  const lugares = new Map();
  for (const r of res.data) {
    const k = r.acr_sitio_id ?? '';
    if (!lugares.has(k)) lugares.set(k, []);
    lugares.get(k).push(r);
  }
  const bloques = [...lugares.entries()].sort(([a], [b]) => (a ? 1 : 0) - (b ? 1 : 0)).map(([sitio, rs]) => {
    const titulo = sitio ? dest?.texto(c.id, sitio) ?? 'Lugar' : `${nombreC} (general)`;
    const fl = rs.filter((r) => r.estado === 'firmado').length;
    return el('div', { class: 'acr-lugar' },
      el('div', { class: 'listado-cabecera' }, el('h3', {}, titulo),
        lugares.size > 1 ? zip(ctx, rs.map((r) => r.id), `Acreditacion ${titulo}`) : null),
      barraAvance(fl, rs.length, `${fl} de ${rs.length} firmados`),
      // Una fila por documento (de una entrega individual) o por registro grupal, con su estado
      agrupar(rs).flatMap((g) => (g.lote && g.documentos.length ? g.documentos.map((d) => ({ g, d })) : [{ g, d: null }])).map(({ g, d }) => {
        const href = d ? ctx.ruta('sst.lote', { id: g.lote, doc: d.clave }) : g.lote ? ctx.ruta('sst.lote', { id: g.lote }) : ctx.ruta('sst.entrega', { id: g.primero.id });
        const nombre = d ? (d.codigo ? `${d.codigo} · ${d.nombre}` : d.nombre) : g.primero.tema;
        const [hechos, total] = d ? [d.firmados, d.total] : [g.firmados, g.total];
        const regs = d ? d.items.map((i) => i.r.id) : g.registros.map((r) => r.id);
        return el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, el('a', { href }, el('strong', {}, nombre)),
            el('span', { class: 'texto-suave texto-chico' }, `${d ? 'Entrega individual · ' : ''}${fechaLarga(g.fecha)} · ${total} persona${total === 1 ? '' : 's'}`)),
          el('div', { class: 'doc-acciones' },
            total > 1 ? barraAvance(hechos, total) : null,
            el('span', { class: `chip ${hechos === total ? 'chip-ok' : 'chip-prox'}` }, hechos === total ? 'Firmado' : hechos ? `Faltan ${total - hechos}` : 'Por firmar'),
            zipDoc(ctx, regs, `${(d?.codigo || nombre).slice(0, 60)} ${titulo}`, d ? (x) => claveDoc(x) === d.clave : null),
            el('a', { class: 'boton-icono', href, 'aria-label': 'Abrir' }, icono('derecha', { tam: 16 }))));
      }));
  });
  return el('div', { class: 'ficha doc-grupo' }, cab,
    barraAvance(firmados, res.data.length, `${firmados} de ${res.data.length} registros firmados`),
    el('p', { class: 'texto-suave texto-chico' }, 'Entregas de Prevención SST asignadas a este mandante. Cada documento con su estado: ábrelo para ver quién lo firmó. El ZIP lleva una carpeta por trabajador.'),
    bloques);
}
