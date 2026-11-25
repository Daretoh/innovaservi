// Documentos de terreno de una faena-día (Faenas 007): la AST y el permiso de trabajo firmados en terreno (foto o PDF;
// varias fotos se juntan en un PDF), adjuntados desde Prevención SST → En terreno o desde la faena. También muestra las
// fotos que la cuadrilla subió al parte con la etapa "AST y permiso de trabajo" (Reportes 011).
import { el } from '../../core/ui/dom.js?v=1d279d8';
import { icono } from '../../core/ui/iconos.js?v=1d279d8';
import { boton } from '../../core/ui/tabla.js?v=1d279d8';
import { avisar } from '../../core/ui/aviso.js?v=1d279d8';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=1d279d8';
import { prepararArchivos } from '../../core/imagenes.js?v=1d279d8';

export const TIPOS_DOC = [['ast', 'AST'], ['permiso', 'Permiso de trabajo'], ['otro', 'Otro documento']];
const nombreTipo = Object.fromEntries(TIPOS_DOC);
const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// "faena|fecha" → [{ id, tipo, nombre, archivo, origen }]
export async function cargarDocsTerreno(ctx, desde, hasta) {
  const mapa = new Map();
  const poner = (k, x) => { if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(x); };
  const [docs, fotos] = await Promise.all([
    ctx.api.from('ope_terreno_docs').select('id, faena_id, fecha, tipo, nombre, archivo, created_at').eq('empresa_id', ctx.empresa.id)
      .is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta).order('created_at'),
    ctx.puede('reportes', 'ver')
      ? ctx.api.from('rep_media').select('id, faena_id, ruta, nombre, rep_partes!inner(fecha, deleted_at)').eq('empresa_id', ctx.empresa.id).eq('etapa', 'terreno')
        .gte('rep_partes.fecha', desde).lte('rep_partes.fecha', hasta).then((r) => r, () => ({ data: [] }))
      : Promise.resolve({ data: [] }),
  ]);
  if (docs.error) throw docs.error;
  for (const d of docs.data) poner(`${d.faena_id}|${d.fecha}`, { ...d, origen: 'terreno' });
  for (const m of fotos.data ?? []) if (m.faena_id && !m.rep_partes?.deleted_at) poner(`${m.faena_id}|${m.rep_partes.fecha}`, { id: m.id, tipo: 'parte', nombre: 'Foto del parte (cuadrilla)', archivo: m.ruta, origen: 'parte' });
  return mapa;
}

// Estado de la carpeta: qué pide la faena y qué ya está adjunto
export function estadoCarpeta(carpeta, docs = []) {
  // Las fotos del parte no cuentan solas (no se sabe si son la AST o el permiso): se ven en la lista
  const hay = (t) => docs.some((d) => d.tipo === t);
  return [
    carpeta.ast ? { tipo: 'ast', texto: 'AST', ok: hay('ast') } : null,
    carpeta.permiso ? { tipo: 'permiso', texto: 'Permiso de trabajo', ok: hay('permiso') } : null,
  ].filter(Boolean);
}
export const chipsCarpeta = (estado) => estado.map((x) => el('span', { class: `chip ${x.ok ? 'chip-ok' : x.tipo === 'permiso' ? 'chip-venc' : 'chip-prox'}`, title: x.ok ? 'Adjunto' : 'Falta adjuntarlo' },
  icono(x.ok ? 'check' : 'documento', { tam: 12 }), x.texto));

// Lista de documentos y botones para adjuntar (AST, permiso u otro)
export function bloqueDocsTerreno(ctx, { f, fecha, docs = [], alCambiar }) {
  const puedeSubir = ctx.puede('sst', 'crear') || ctx.puede('ope', 'crear');
  const puedeQuitar = ctx.puede('sst', 'editar') || ctx.puede('ope', 'editar');
  const ver = async (ruta) => {
    const v = window.open('', '_blank');
    try { const u = await urlFirmada(ctx.api, ruta, 300); if (v) v.location = u; else window.open(u, '_blank', 'noopener'); }
    catch (e) { v?.close(); avisar(e.message, 'error'); }
  };
  const subir = (tipo) => {
    const inp = el('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, hidden: true });
    inp.addEventListener('change', async () => {
      try {
        const archivo = await prepararArchivos(inp.files);
        if (!archivo) return;
        avisar('Subiendo…');
        const modulo = ctx.puede('sst', 'crear') ? 'sst' : 'ope';
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo, archivo, tabla: 'ope_terreno_docs', tipos: ARCHIVOS });
        const { error } = await ctx.api.from('ope_terreno_docs').insert({ empresa_id: ctx.empresa.id, faena_id: f.id, fecha, tipo, nombre: `${nombreTipo[tipo]} · ${archivo.name}`.slice(0, 200), archivo: ruta });
        if (error) throw new Error(error.message);
        avisar(`${nombreTipo[tipo]} adjunto.`);
        alCambiar?.();
      } catch (e) { avisar(e.message, 'error'); } finally { inp.remove(); }
    });
    document.body.append(inp); inp.click();
  };
  const quitar = async (d) => {
    if (!confirm(`¿Quitar "${d.nombre}"?`)) return;
    const { error } = await ctx.api.from('ope_terreno_docs').update({ deleted_at: new Date().toISOString() }).eq('id', d.id);
    if (error) avisar(error.message, 'error'); else { avisar('Quitado.'); alCambiar?.(); }
  };
  return el('div', { class: 'ter-docs' },
    docs.length ? docs.map((d) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, d.origen === 'parte' ? d.nombre : nombreTipo[d.tipo] ?? d.tipo),
        el('span', { class: 'texto-suave texto-chico' }, d.origen === 'parte' ? 'Subida desde el link de la cuadrilla' : d.nombre)),
      el('div', { class: 'doc-acciones' },
        boton('Ver', { icono: 'ojo', onclick: () => ver(d.archivo) }),
        d.origen === 'terreno' && puedeQuitar ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${d.nombre}`, onclick: () => quitar(d) }, icono('basura', { tam: 15 })) : null)))
      : el('p', { class: 'texto-suave texto-chico' }, 'Sin documentos adjuntos.'),
    puedeSubir ? el('div', { class: 'listado-acciones' }, TIPOS_DOC.map(([t, n]) => boton(`Adjuntar ${t === 'otro' ? 'otro' : n}`, { icono: 'mas', onclick: () => subir(t) }))) : null);
}

// Formatos nuestros para imprimir (Documentos preventivos en una categoría "Formatos de terreno…"): ver o imprimir la
// versión vigente y abrir el editor. Solo con permiso para ver Prevención SST.
let formatosCache = null;
export async function formatosParaImprimir(ctx) {
  if (!ctx.puede('sst', 'ver')) return [];
  if (formatosCache?.empresa === ctx.empresa.id && Date.now() - formatosCache.t < 60000) return formatosCache.lista;
  const { data } = await ctx.api.from('sst_documentos').select('id, codigo, titulo, area, sst_doc_categorias!inner(nombre), sst_documento_versiones(version, archivo, fecha, created_at)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('activo', true).ilike('sst_doc_categorias.nombre', 'Formatos de terreno%').order('codigo');
  const lista = (data ?? []).map((d) => ({ ...d, vigente: [...(d.sst_documento_versiones ?? [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null }));
  formatosCache = { empresa: ctx.empresa.id, t: Date.now(), lista };
  return lista;
}
// texto: cliente y lugar de la faena; se muestran los formatos cuyo nombre de categoría o área los menciona
const normal = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function bloqueFormatosImprimir(ctx, todos, texto = '') {
  const palabras = normal(texto).split(/[^a-z0-9]+/).filter((x) => x.length > 3);
  const lista = palabras.length ? todos.filter((d) => palabras.some((w) => normal(`${d.sst_doc_categorias?.nombre} ${d.area}`).includes(w))) : [];
  if (!lista.length) return null;
  const ver = async (ruta) => {
    const v = window.open('', '_blank');
    try { const u = await urlFirmada(ctx.api, ruta, 300); if (v) v.location = u; else window.open(u, '_blank', 'noopener'); }
    catch (e) { v?.close(); avisar(e.message, 'error'); }
  };
  return el('div', { class: 'ter-docs' },
    el('span', { class: 'texto-chico texto-suave' }, 'Formatos para imprimir y llevar (se firman en terreno):'),
    lista.map((d) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, [d.codigo, d.titulo].filter(Boolean).join(' · ')), el('span', { class: 'texto-suave texto-chico' }, d.area ?? '')),
      el('div', { class: 'doc-acciones' },
        d.vigente ? boton('Imprimir', { icono: 'descargar', onclick: () => ver(d.vigente.archivo) }) : null,
        el('a', { class: 'boton boton-chico', href: ctx.ruta('sst.editar', { id: d.id }) }, icono('editar', { tam: 14 }), 'Editar')))));
}
