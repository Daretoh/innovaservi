// Registros de entrega (capacitación, charla, EPP, PTS): se arma la lista, se imprime para firmar y
// se sube el escaneo; al subirlo, cada persona queda con el documento de RRHH entregado.
import { el } from '../../../core/ui/dom.js?v=96471b3';
import { listado, boton } from '../../../core/ui/tabla.js?v=96471b3';
import { abrirFormulario } from '../../../core/ui/modal.js?v=96471b3';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=96471b3';
import { TIPOS_ENTREGA, nombreDe, cargarPersonas } from '../datos.js?v=96471b3';
import { cargarDestinos, agrupar, barraAvance } from '../acreditacion.js?v=96471b3';

let filtro = 'todos';
const nombreTipo = nombreDe(TIPOS_ENTREGA);

// "Casco de seguridad 2", "Guantes; 3" o "Lentes x 1" → { item, cantidad }
export const leerItems = (texto) => texto.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(.*?)[\s;,x×]+(\d+)$/i);
  return m ? { item: m[1].trim(), cantidad: Number(m[2]) } : { item: l, cantidad: 1 };
});

// Tipos de documento de RRHH (de la empresa) que una entrega puede marcar
export async function tiposRrhh(ctx) {
  if (!ctx.puede('rrhh', 'ver')) return [];
  const { data } = await ctx.api.from('rrhh_tipos_doc').select('slug, nombre, vence').eq('empresa_id', ctx.empresa.id)
    .eq('ambito', 'empresa').eq('activo', true).order('orden');
  return data ?? [];
}

export default async function vista(ctx) {
  const [res, dest] = await Promise.all([
    ctx.api.from('sst_entregas').select('id, tipo, tema, fecha, relator, estado, tipo_doc, lote_id, acr_tercero_id, acr_sitio_id, documentos, sst_entrega_personas(persona_id)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }).order('created_at').limit(500),
    cargarDestinos(ctx).catch(() => null),
  ]);
  if (res.error) throw res.error;
  // Una fila por documento: una entrega individual (lote, un registro por trabajador) se abre en sus documentos, cada uno
  // con quiénes lo recibieron y cuántos lo firmaron; los registros grupales (charla, capacitación…) son una fila
  const filasDe = (g) => g.lote && g.documentos.length
    ? g.documentos.map((d) => ({ ...g, doc: d, clave: `${g.clave}|${d.clave}`, personas: d.total, firmados: d.firmados, total: d.total, estado: d.firmados === d.total ? 'firmado' : 'pendiente' }))
    : [{ ...g, doc: null }];
  const todas = agrupar(res.data).flatMap(filasDe);
  const data = todas.filter((g) => filtro === 'todos' || g.estado === filtro);

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    [['todos', 'Todos'], ['pendiente', 'Por firmar'], ['firmado', 'Firmados']].map(([v, t]) =>
      el('button', { type: 'button', 'aria-pressed': String(filtro === v), onclick: () => { filtro = v; ctx.refrescar(); } }, t)));
  const acciones = [segmento];
  // Con el generador de documentos: elegir plantilla (charla, checklist) o registro libre
  const nuevoRegistro = async () => {
    if (!ctx.puede('documentos', 'ver')) { nuevo(ctx); return; }
    const { elegirRegistro } = await import('../../documentos/elegir.js?v=96471b3');
    elegirRegistro(ctx, { libre: () => nuevo(ctx) });
  };
  // ZIP de las entregas que se ven (según Todos / Por firmar / Firmados): una carpeta por trabajador, partes de 19 MB
  if (data.length) acciones.push(boton('Descargar ZIP', { icono: 'descargar', title: 'Las entregas de esta lista, en partes de hasta 19 MB para adjuntar en Outlook', onclick: async (ev) => {
    const b = ev.currentTarget;
    const { descargarEntregasZip } = await import('../zip.js?v=96471b3');
    await descargarEntregasZip(ctx, [...new Set(data.flatMap((g) => g.registros.map((r) => r.id)))], { nombre: { todos: 'Registros de entrega', pendiente: 'Registros por firmar', firmado: 'Registros firmados' }[filtro], boton: b });
  } }));
  if (ctx.puede('sst', 'crear')) acciones.push(boton('Nuevo registro', { icono: 'mas', tipo: 'primario', onclick: nuevoRegistro }));

  const enlace = (g) => g.doc ? ctx.ruta('sst.lote', { id: g.lote, doc: g.doc.clave }) : g.lote ? ctx.ruta('sst.lote', { id: g.lote }) : ctx.ruta('sst.entrega', { id: g.primero.id });
  const paraDe = (g) => (g.acr === 'varias' ? 'Varias acreditaciones' : g.acr ? dest?.texto(...g.acr.split('|')) ?? '' : '');
  // Documento (o tema) y, debajo, para qué acreditación es
  const tema = (g) => el('div', { class: 'sst-doc-celda' },
    el('a', { href: enlace(g) }, g.doc ? (g.doc.codigo ? `${g.doc.codigo} · ${g.doc.nombre}` : g.doc.nombre) : g.primero.tema),
    paraDe(g) ? el('div', { class: 'texto-suave texto-chico' }, `Para ${paraDe(g)}`) : null);
  const lista = listado({
    titulo: 'Registros de entrega',
    filas: data,
    acciones,
    vacio: 'No hay registros.',
    columnas: [
      { titulo: 'Fecha', valor: (g) => fechaLarga(g.fecha) },
      { titulo: 'Tipo', valor: (g) => (g.doc ? 'Entrega individual' : nombreTipo[g.primero.tipo]) },
      { titulo: 'Documento o tema', valor: tema },
      { titulo: 'Personas', valor: (g) => g.personas },
      { titulo: 'Firmas', valor: (g) => g.total > 1 ? barraAvance(g.firmados, g.total) : null },
      { titulo: 'Estado', valor: (g) => el('span', { class: `chip ${g.estado === 'firmado' ? 'chip-ok' : 'chip-prox'}` }, g.estado === 'firmado' ? 'Firmado' : g.firmados ? `Faltan ${g.total - g.firmados}` : 'Por firmar') },
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Se firma por WhatsApp (o se imprime y se sube el escaneo). Cada persona que firma queda con el registro en su ficha de RRHH. En una entrega individual cada documento es una fila: ábrelo para ver quién lo firmó y descargar su ZIP.'));
  return lista;
}

async function nuevo(ctx) {
  const [personas, tipos] = await Promise.all([cargarPersonas(ctx), tiposRrhh(ctx)]);
  abrirFormulario({
    titulo: 'Nuevo registro de entrega',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ENTREGA, valor: 'capacitacion' },
      { id: 'tema', etiqueta: 'Tema', requerido: true, ayuda: 'Ej.: Primeros auxilios, Entrega de EPP de invierno, PTS trabajo en altura.' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'relator', etiqueta: 'Relator o responsable' },
      { id: 'duracion', etiqueta: 'Duración', ayuda: 'Ej.: 1 hora.' },
      { id: 'contenido', etiqueta: 'Contenido o instrucciones (una línea por punto)', tipo: 'textarea' },
      { id: 'items', etiqueta: 'Solo EPP: elementos entregados (uno por línea, con cantidad al final)', tipo: 'textarea', ayuda: 'Ej.: Casco de seguridad 1' },
      { id: 'tipo_doc', etiqueta: 'Documento de RRHH que marca al subir el registro firmado', opciones: [['', 'Ninguno'], ...tipos.map((t) => [t.slug, t.nombre])] },
      { id: 'vence', etiqueta: 'Vencimiento del documento (si aplica)', tipo: 'date' },
      { id: 'personas', etiqueta: 'Participantes', tipo: 'checks', opciones: personas.lista.map((p) => [p.id, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]) },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      if (!v.personas.length) throw new Error('Marca al menos un participante.');
      const tipoDoc = tipos.find((t) => t.slug === v.tipo_doc);
      if (tipoDoc?.vence && !v.vence) throw new Error(`"${tipoDoc.nombre}" vence: indica la fecha de vencimiento.`);
      const { data, error } = await ctx.api.from('sst_entregas').insert({
        empresa_id: ctx.empresa.id, tipo: v.tipo, tema: v.tema.trim(), fecha: v.fecha, relator: v.relator.trim() || null, duracion: v.duracion.trim() || null,
        contenido: v.contenido.trim() || null, items: v.tipo === 'epp' ? leerItems(v.items) : [], tipo_doc: v.tipo_doc || null, vence: v.vence || null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('sst_entrega_personas').insert(v.personas.map((id) => ({
        entrega_id: data.id, empresa_id: ctx.empresa.id, persona_id: id, cargo: personas.de.get(id)?.cargo ?? null,
      })));
      if (e2) throw new Error(e2.message);
      location.hash = ctx.ruta('sst.entrega', { id: data.id });
    },
  });
}
