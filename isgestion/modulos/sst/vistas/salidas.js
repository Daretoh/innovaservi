// Salidas a atención médica por malestar (no laboral): registro y documento con membrete para firmar.
import { el } from '../../../core/ui/dom.js?v=7c7795a';
import { listado, boton } from '../../../core/ui/tabla.js?v=7c7795a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7c7795a';
import { avisar } from '../../../core/ui/aviso.js?v=7c7795a';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=7c7795a';
import { hoyISO, fechaLarga, hhmm } from '../../../core/ui/formato.js?v=7c7795a';
import { SINTOMAS, TRASLADOS, cargarPersonas } from '../datos.js?v=7c7795a';

const ahora = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`; };

export default async function vista(ctx) {
  const [{ data, error }, personas] = await Promise.all([
    ctx.api.from('sst_salidas').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }).limit(500),
    cargarPersonas(ctx, { todas: true }),
  ]);
  if (error) throw error;
  const editable = ctx.puede('sst', 'editar');

  const acciones = ctx.puede('sst', 'crear') ? [boton('Nueva salida', { icono: 'mas', tipo: 'primario', onclick: () => formulario(ctx, null, personas) })] : [];
  const lista = listado({
    titulo: 'Salidas médicas',
    filas: data,
    acciones,
    vacio: 'Sin salidas registradas.',
    columnas: [
      { titulo: 'Fecha', valor: (s) => `${fechaLarga(s.fecha)}${s.hora_salida ? ` · ${hhmm(s.hora_salida)}` : ''}` },
      { titulo: 'Trabajador', valor: (s) => editable
        ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); formulario(ctx, s, personas); } }, personas.de.get(s.persona_id)?.nombre ?? 'Persona')
        : personas.de.get(s.persona_id)?.nombre ?? 'Persona' },
      { titulo: 'Síntomas', valor: (s) => [...s.sintomas, s.otro].filter(Boolean).join(', ') },
      { titulo: 'Documento', valor: (s) => el('div', { class: 'acciones-fila' },
        s.pdf_ruta ? boton('Ver PDF', { icono: 'ojo', onclick: () => abrirPdf(ctx, s.pdf_ruta) }) : el('span', { class: 'chip chip-pend' }, 'Sin PDF'),
        editable ? boton(s.pdf_ruta ? 'Rehacer' : 'Generar', { icono: 'descargar', onclick: (ev) => generar(ctx, s, personas, ev.currentTarget) }) : null) },
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Para malestar no relacionado con el trabajo. Si el malestar tiene origen laboral, regístralo en Accidentes e incidentes y haz la denuncia al organismo administrador.'));
  return lista;
}

async function abrirPdf(ctx, ruta) {
  try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); }
}

// Genera el PDF, lo guarda en el bucket privado y reemplaza el anterior
async function generar(ctx, s, personas, b) {
  if (b) b.disabled = true;
  try {
    const { pdfSalida } = await import('../documentos.js?v=7c7795a');
    const doc = await pdfSalida(ctx, s, personas.de.get(s.persona_id));
    const archivo = new File([doc.output('blob')], `salida-medica-${s.fecha}.pdf`, { type: 'application/pdf' });
    const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'sst', archivo, tabla: 'sst_salidas', registroId: s.id });
    const { error } = await ctx.api.from('sst_salidas').update({ pdf_ruta: ruta }).eq('id', s.id);
    if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
    if (s.pdf_ruta) await eliminarArchivo(ctx.api, s.pdf_ruta).catch(() => {});
    window.open(doc.output('bloburl'), '_blank', 'noopener');
    avisar('Documento generado. Imprímelo para la firma del trabajador y de quien autoriza.');
    ctx.refrescar();
  } catch (e) { avisar(`No se pudo generar: ${e.message}`, 'error'); if (b) b.disabled = false; }
}

function formulario(ctx, s, personas) {
  const activas = personas.lista.filter((p) => p.estado === 'activo' || p.id === s?.persona_id);
  abrirFormulario({
    titulo: s ? 'Salida a atención médica' : 'Nueva salida a atención médica',
    campos: [
      { id: 'persona_id', etiqueta: 'Trabajador', requerido: true, opciones: [['', 'Elige…'], ...activas.map((p) => [p.id, `${p.nombre}${p.rut ? ` · ${p.rut}` : ''}`])], valor: s?.persona_id ?? '' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: s?.fecha ?? hoyISO() },
      { id: 'area', etiqueta: 'Área o faena', valor: s?.area ?? '' },
      { id: 'sintomas', etiqueta: 'Síntomas informados', tipo: 'checks', opciones: SINTOMAS.map((x) => [x, x]), valor: s?.sintomas ?? [] },
      { id: 'otro', etiqueta: 'Otro síntoma', valor: s?.otro ?? '' },
      { id: 'descripcion', etiqueta: 'Descripción breve', tipo: 'textarea', valor: s?.descripcion ?? '' },
      { id: 'hora_aviso', etiqueta: 'Hora de aviso del malestar', tipo: 'time', valor: hhmm(s?.hora_aviso) || ahora() },
      { id: 'hora_salida', etiqueta: 'Hora de salida autorizada', tipo: 'time', valor: hhmm(s?.hora_salida) || ahora() },
      { id: 'centro', etiqueta: 'Centro médico (si corresponde)', valor: s?.centro ?? '' },
      { id: 'traslado', etiqueta: 'Traslado', opciones: [['', 'Elige…'], ...TRASLADOS.map((t) => [t, t])], valor: s?.traslado ?? '' },
      { id: 'autorizado_por', etiqueta: 'Autorizado por', valor: s?.autorizado_por ?? '' },
      { id: 'observaciones', etiqueta: 'Observaciones', valor: s?.observaciones ?? '' },
    ],
    textoGuardar: s ? 'Guardar' : 'Guardar y generar documento',
    alGuardar: async (v) => {
      if (!v.sintomas.length && !v.otro.trim()) throw new Error('Marca al menos un síntoma.');
      const p = personas.de.get(v.persona_id);
      const datos = {
        persona_id: v.persona_id, fecha: v.fecha, cargo: p?.cargo ?? null, area: v.area.trim() || null, sintomas: v.sintomas, otro: v.otro.trim() || null,
        descripcion: v.descripcion.trim() || null, hora_aviso: v.hora_aviso || null, hora_salida: v.hora_salida || null, centro: v.centro.trim() || null,
        traslado: v.traslado || null, autorizado_por: v.autorizado_por.trim() || null, observaciones: v.observaciones.trim() || null,
      };
      const r = s
        ? await ctx.api.from('sst_salidas').update(datos).eq('id', s.id).select('*').single()
        : await ctx.api.from('sst_salidas').insert({ ...datos, empresa_id: ctx.empresa.id }).select('*').single();
      if (r.error) throw new Error(r.error.message);
      if (s) { avisar(s.pdf_ruta ? 'Guardado. Usa "Rehacer" para actualizar el documento.' : 'Guardado.'); ctx.refrescar(); }
      else await generar(ctx, r.data, personas, null);
    },
  });
}
