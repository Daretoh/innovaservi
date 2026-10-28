// Registro de entrega: participantes, imprimir para firmar, subir el escaneo firmado (marca RRHH) y reabrir.
// Ruta: #/sst.entrega?id=<id>
import { el } from '../../../core/ui/dom.js?v=dab9182';
import { icono } from '../../../core/ui/iconos.js?v=dab9182';
import { boton } from '../../../core/ui/tabla.js?v=dab9182';
import { abrirFormulario } from '../../../core/ui/modal.js?v=dab9182';
import { avisar } from '../../../core/ui/aviso.js?v=dab9182';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=dab9182';
import { fechaLarga } from '../../../core/ui/formato.js?v=dab9182';
import { TIPOS_ENTREGA, nombreDe, cargarPersonas } from '../datos.js?v=dab9182';
import { tiposRrhh } from './entregas.js?v=dab9182';

const ESCANEOS = ['application/pdf', 'image/jpeg', 'image/png'];

export default async function vista(ctx) {
  const [{ data: ent, error }, personas, tipos] = await Promise.all([
    ctx.api.from('sst_entregas').select('*, sst_entrega_personas(persona_id, cargo)').eq('id', ctx.params.id).maybeSingle(),
    cargarPersonas(ctx, { todas: true }),
    tiposRrhh(ctx),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('sst.entregas') }, icono('volver', { tam: 16 }), 'Registros de entrega');
  if (!ent || ent.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Registro no encontrado'));
  const firmado = ent.estado === 'firmado';
  const editable = ctx.puede('sst', 'editar') && !firmado;
  const participantes = ent.sst_entrega_personas.map((x) => ({ ...personas.de.get(x.persona_id), id: x.persona_id, cargo: x.cargo ?? personas.de.get(x.persona_id)?.cargo }))
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  const tipoDoc = tipos.find((t) => t.slug === ent.tipo_doc);

  // ---- Participantes
  const quitar = async (id) => {
    const { error: e } = await ctx.api.from('sst_entrega_personas').delete().eq('entrega_id', ent.id).eq('persona_id', id);
    if (e) avisar(e.message, 'error'); else ctx.refrescar();
  };
  const ya = new Set(participantes.map((p) => p.id));
  const selector = el('select', { class: 'campo', 'aria-label': 'Agregar participante' }, el('option', { value: '' }, 'Agregar participante…'),
    personas.lista.filter((p) => p.estado === 'activo' && !ya.has(p.id)).map((p) => el('option', { value: p.id }, p.nombre)));
  selector.addEventListener('change', async () => {
    const p = personas.de.get(selector.value);
    if (!p) return;
    const { error: e } = await ctx.api.from('sst_entrega_personas').insert({ entrega_id: ent.id, empresa_id: ctx.empresa.id, persona_id: p.id, cargo: p.cargo ?? null });
    if (e) avisar(e.message, 'error'); else ctx.refrescar();
  });

  // ---- Acciones
  const acciones = [boton('Imprimir para firmar', { icono: 'descargar', onclick: (ev) => imprimir(ctx, ent, participantes, ev.currentTarget) })];
  if (ent.archivo) acciones.push(boton('Ver firmado', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, ent.archivo, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }));
  if (!firmado && ctx.puede('sst', 'editar')) acciones.push(boton('Subir registro firmado', { icono: 'check', tipo: 'primario', onclick: () => subirFirmado(ctx, ent, participantes, tipoDoc) }));
  if (firmado && ctx.puede('sst', 'editar')) acciones.push(boton('Volver a por firmar', { icono: 'editar', onclick: () => reabrir(ctx, ent) }));
  if (!firmado && ctx.puede('sst', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar registro', mensaje: 'El registro se elimina con su lista de participantes.', campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error: e } = await ctx.api.from('sst_entregas').update({ deleted_at: new Date().toISOString() }).eq('id', ent.id);
      if (e) throw new Error(e.message);
      location.hash = ctx.ruta('sst.entregas');
    },
  }) }));

  const puntos = (ent.contenido ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, ent.tema), el('p', { class: 'texto-suave' }, `${nombreDe(TIPOS_ENTREGA)[ent.tipo]} · ${fechaLarga(ent.fecha)}${ent.relator ? ` · ${ent.relator}` : ''}`)),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${firmado ? 'chip-ok' : 'chip-prox'}` }, firmado ? 'Firmado' : 'Por firmar'), acciones)),
    firmado ? el('p', { class: 'aviso-bandeja' }, icono('check', { tam: 16 }), 'Registro firmado: no se puede cambiar. Para corregirlo, vuélvelo a "por firmar".') : null,
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, `Participantes (${participantes.length})`),
        participantes.length ? participantes.map((p) => el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre ?? 'Persona'), el('span', { class: 'texto-suave' }, [p.rut, p.cargo].filter(Boolean).join(' · '))),
          editable ? el('div', { class: 'doc-acciones' }, el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar a ${p.nombre}`, onclick: () => quitar(p.id) }, icono('basura', { tam: 16 }))) : null))
          : el('p', { class: 'texto-suave' }, 'Sin participantes.'),
        editable ? selector : null),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Detalle'),
        ent.duracion ? el('p', {}, `Duración: ${ent.duracion}`) : null,
        puntos.length ? el('ul', {}, puntos.map((t) => el('li', {}, t))) : el('p', { class: 'texto-suave' }, 'Sin contenido.'),
        ent.items?.length ? el('div', {}, el('h3', {}, 'Elementos entregados'), el('ul', {}, ent.items.map((x) => el('li', {}, `${x.item} × ${x.cantidad}`)))) : null,
        el('h3', {}, 'Documento de RRHH'),
        el('p', { class: tipoDoc ? '' : 'texto-suave' }, tipoDoc
          ? `Al subir el registro firmado, cada participante queda con "${tipoDoc.nombre}" entregado${ent.vence ? ` (vence ${fechaLarga(ent.vence)})` : ''}.`
          : ent.tipo_doc ? 'El documento elegido no está disponible (revisa Tipos de documento en RRHH).' : 'No marca ningún documento en RRHH.'))),
  );
}

async function imprimir(ctx, ent, participantes, b) {
  b.disabled = true;
  try {
    const { pdfEntrega } = await import('../documentos.js?v=dab9182');
    const doc = await pdfEntrega(ctx, ent, participantes);
    window.open(doc.output('bloburl'), '_blank', 'noopener');
  } catch (e) { avisar(`No se pudo generar: ${e.message}`, 'error'); } finally { b.disabled = false; }
}

function subirFirmado(ctx, ent, participantes, tipoDoc) {
  if (!participantes.length) { avisar('Agrega los participantes antes de subir el registro.', 'error'); return; }
  const marcaRrhh = tipoDoc && ctx.puede('rrhh', 'crear') && ctx.puede('rrhh', 'editar');
  abrirFormulario({
    titulo: 'Subir registro firmado',
    mensaje: tipoDoc
      ? (marcaRrhh ? `Se guarda el escaneo y ${participantes.length} ${participantes.length === 1 ? 'persona queda' : 'personas quedan'} con "${tipoDoc.nombre}" entregado en RRHH.`
        : `Se guarda el escaneo. No tienes permiso para editar RRHH: "${tipoDoc.nombre}" no se marcará en las fichas.`)
      : 'Se guarda el escaneo y el registro queda firmado.',
    campos: [
      { id: 'archivo', etiqueta: 'Escaneo o foto del registro firmado (PDF, JPG o PNG)', tipo: 'file', accept: ESCANEOS.join(','), requerido: true },
      // El documento de RRHH vence: sin fecha quedaría entregado sin vencimiento
      ...(marcaRrhh && tipoDoc.vence ? [{ id: 'vence', etiqueta: `Vencimiento de "${tipoDoc.nombre}"`, tipo: 'date', requerido: true, valor: ent.vence ?? '' }] : []),
    ],
    textoGuardar: 'Subir',
    alGuardar: async (v) => {
      if (!v.archivo?.size) throw new Error('Elige el archivo.');
      // Va a la carpeta de RRHH (es documentación de cada trabajador); sin permiso de RRHH, a la de SST
      const modulo = ctx.puede('rrhh', 'crear') ? 'rrhh' : 'sst';
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo, archivo: v.archivo, tabla: 'sst_entregas', registroId: ent.id, tipos: ESCANEOS });
      if (v.vence) ent.vence = v.vence;
      const { error } = await ctx.api.from('sst_entregas').update({ archivo: ruta, estado: 'firmado', vence: ent.vence ?? null }).eq('id', ent.id);
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      let marcadas = 0;
      if (marcaRrhh) {
        for (const p of participantes) if (await marcarDocumento(ctx, p.id, tipoDoc, ent, ruta)) marcadas += 1;
      }
      avisar(marcaRrhh ? `Registro firmado. ${marcadas} de ${participantes.length} fichas actualizadas en RRHH.` : 'Registro firmado.');
      ctx.refrescar();
    },
  });
}

// Deja el documento entregado en la ficha (si no hay uno más reciente)
async function marcarDocumento(ctx, personaId, tipoDoc, ent, ruta) {
  const datos = { estado: 'entregado', fecha: ent.fecha, vence: tipoDoc.vence ? ent.vence : null, archivo: ruta, nota: `Registro de entrega: ${ent.tema}` };
  const { data: doc } = await ctx.api.from('rrhh_documentos').select('id, estado, fecha').eq('empresa_id', ctx.empresa.id)
    .eq('persona_id', personaId).eq('tipo_slug', tipoDoc.slug).is('deleted_at', null).maybeSingle();
  if (doc && doc.estado === 'entregado' && doc.fecha && doc.fecha > ent.fecha) return false;
  const r = doc
    ? await ctx.api.from('rrhh_documentos').update(datos).eq('id', doc.id).select('id')
    : await ctx.api.from('rrhh_documentos').insert({ empresa_id: ctx.empresa.id, persona_id: personaId, tipo_slug: tipoDoc.slug, ...datos }).select('id');
  return !r.error && !!r.data?.length;
}

function reabrir(ctx, ent) {
  abrirFormulario({
    titulo: 'Volver a por firmar',
    mensaje: 'El registro vuelve a editable. El escaneo subido se conserva en las fichas de RRHH que ya lo usan; al subir uno nuevo se reemplaza en el registro.',
    campos: [],
    textoGuardar: 'Volver a por firmar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('sst_entregas').update({ estado: 'pendiente', archivo: null }).eq('id', ent.id);
      if (error) throw new Error(error.message);
      avisar('El registro está de nuevo por firmar.');
      ctx.refrescar();
    },
  });
}
