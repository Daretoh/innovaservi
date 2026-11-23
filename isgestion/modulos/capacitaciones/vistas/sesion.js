// Ficha de una sesión de capacitación: datos y temario, contenidos de la biblioteca, asistentes con asistencia, nota y
// resultado (se guardan al cambiar), registro para firmar en Prevención SST (si la empresa lo tiene) o respaldo subido,
// acta en PDF y cerrar (los asistentes quedan con "visto" y su resultado en los contenidos) o reabrir.
// Ruta: #/capacitaciones.sesion?id=<id>
import { el } from '../../../core/ui/dom.js?v=b490b0f';
import { icono } from '../../../core/ui/iconos.js?v=b490b0f';
import { boton } from '../../../core/ui/tabla.js?v=b490b0f';
import { abrirFormulario } from '../../../core/ui/modal.js?v=b490b0f';
import { avisar } from '../../../core/ui/aviso.js?v=b490b0f';
import { fechaLarga } from '../../../core/ui/formato.js?v=b490b0f';
import { nuevoPdf } from '../../../core/pdf.js?v=b490b0f';
import { subirArchivo, urlFirmada } from '../../../core/adjuntos.js?v=b490b0f';
import { cargarBiblioteca, cargarPersonas, cargarEstilos, conCarga, duracion, ICONO_TIPO } from '../datos.js?v=b490b0f';
import { formularioSesion } from './sesiones.js?v=b490b0f';

export default async function vista(ctx) {
  cargarEstilos();
  const volver = el('a', { class: 'volver', href: ctx.ruta('capacitaciones.sesiones') }, icono('volver', { tam: 16 }), 'Sesiones');
  const { data: s } = await ctx.api.from('cap_sesiones').select('*').eq('id', ctx.params.id).eq('empresa_id', ctx.empresa.id).maybeSingle();
  if (!s || s.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Sesión no encontrada'));
  const editable = ctx.puede('capacitaciones', 'editar') && s.estado === 'abierta';
  const supervisa = ctx.puede('capacitaciones', 'editar') || ctx.puede('capacitaciones', 'aprobar');
  const [bib, personas, asis] = await Promise.all([
    cargarBiblioteca(ctx),
    supervisa ? cargarPersonas(ctx, { todas: true }) : Promise.resolve({ lista: [], de: new Map() }),
    ctx.api.from('cap_asistentes').select('*').eq('sesion_id', s.id),
  ]);
  const asistentes = (asis.data ?? []).filter((a) => personas.de.has(a.persona_id))
    .sort((a, b) => personas.de.get(a.persona_id).nombre.localeCompare(personas.de.get(b.persona_id).nombre));

  const guardarAsistente = async (a, cambios) => {
    const { error } = await ctx.api.from('cap_asistentes').update(cambios).eq('sesion_id', s.id).eq('persona_id', a.persona_id);
    if (error) { avisar(error.message, 'error'); return false; }
    Object.assign(a, cambios);
    return true;
  };

  // ---- Acciones
  const acciones = [];
  if (editable) acciones.push(boton('Editar', { icono: 'editar', onclick: () => formularioSesion(ctx, s) }));
  if (supervisa) acciones.push(boton('Acta PDF', { icono: 'documento', onclick: (ev) => conCarga(ev, () => acta(ctx, s, bib, personas, asistentes)) }));
  if (ctx.puede('capacitaciones', 'editar')) {
    acciones.push(s.estado === 'abierta'
      ? boton('Cerrar sesión', { icono: 'candado', tipo: 'primario', onclick: () => abrirFormulario({
        titulo: 'Cerrar sesión',
        mensaje: `Quienes asistieron quedan con "visto" en los ${s.contenidos.length} contenidos de la sesión${s.con_evaluacion && ctx.puede('capacitaciones', 'aprobar') ? ', y con aprobado o no según su nota' : ''}. Cerrada no se puede cambiar (se puede reabrir).`,
        campos: [], textoGuardar: 'Cerrar',
        alGuardar: async () => {
          const { error } = await ctx.api.rpc('cap_cerrar_sesion', { p_sesion: s.id });
          if (error) throw new Error(error.message);
          avisar('Sesión cerrada.'); ctx.refrescar();
        },
      }) })
      : boton('Reabrir', { icono: 'deshacer', onclick: (ev) => conCarga(ev, async () => {
        const { error } = await ctx.api.rpc('cap_reabrir_sesion', { p_sesion: s.id });
        if (error) throw new Error(error.message);
        ctx.refrescar();
      }) }));
  }
  if (ctx.puede('capacitaciones', 'eliminar') && s.estado === 'abierta') acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar sesión', mensaje: `"${s.tema}" del ${fechaLarga(s.fecha)} se elimina.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('cap_sesiones').update({ deleted_at: new Date().toISOString() }).eq('id', s.id);
      if (error) throw new Error(error.message);
      location.hash = ctx.ruta('capacitaciones.sesiones');
    },
  }) }));

  // ---- Asistentes
  const agregar = () => {
    const ya = new Set(asistentes.map((a) => a.persona_id));
    abrirFormulario({
      titulo: 'Agregar asistentes',
      campos: [{ id: 'ids', etiqueta: 'Trabajadores activos', tipo: 'checks', opciones: personas.lista.filter((p) => !ya.has(p.id)).map((p) => [p.id, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]) }],
      textoGuardar: 'Agregar',
      alGuardar: async (v) => {
        if (!v.ids.length) throw new Error('Marca al menos uno.');
        const { error } = await ctx.api.from('cap_asistentes').insert(v.ids.map((id) => ({ sesion_id: s.id, persona_id: id, empresa_id: ctx.empresa.id })));
        if (error) throw new Error(error.message);
        ctx.refrescar();
      },
    });
  };
  const resultado = (a) => (a.aprobado ?? (a.nota != null ? a.nota >= s.nota_minima : null));
  const filaAsistente = (a) => {
    const p = personas.de.get(a.persona_id);
    const chip = el('span');
    const pintarChip = () => {
      const r = a.asistio ? resultado(a) : null;
      chip.replaceChildren(!a.asistio ? el('span', { class: 'chip chip-na' }, 'No asistió')
        : !s.con_evaluacion ? el('span', { class: 'chip chip-ok' }, 'Asistió')
          : r === true ? el('span', { class: 'chip chip-ok' }, 'Aprobado') : r === false ? el('span', { class: 'chip chip-venc' }, 'Reprobado') : el('span', { class: 'chip chip-pend' }, 'Sin nota'));
    };
    pintarChip();
    const asistio = el('input', { type: 'checkbox', checked: a.asistio, disabled: !editable, 'aria-label': `Asistió ${p.nombre}` });
    asistio.addEventListener('change', async () => { if (!(await guardarAsistente(a, { asistio: asistio.checked }))) asistio.checked = !asistio.checked; pintarChip(); });
    const nota = el('input', { type: 'number', class: 'campo cap-nota', min: 1, max: 7, step: 0.1, value: a.nota ?? '', disabled: !editable, 'aria-label': `Nota de ${p.nombre}` });
    nota.addEventListener('change', async () => {
      const v = nota.value === '' ? null : Math.round(Number(nota.value.replace(',', '.')) * 10) / 10;
      if (v != null && !(v >= 1 && v <= 7)) { avisar('La nota va de 1 a 7.', 'error'); nota.value = a.nota ?? ''; return; }
      if (await guardarAsistente(a, { nota: v, aprobado: null })) pintarChip();
    });
    const obs = el('input', { class: 'campo', value: a.observacion ?? '', disabled: !editable, placeholder: 'Observación', 'aria-label': `Observación de ${p.nombre}` });
    obs.addEventListener('change', () => guardarAsistente(a, { observacion: obs.value.trim() || null }));
    return el('tr', {},
      el('td', {}, el('strong', {}, p.nombre), p.cargo ? el('span', { class: 'texto-suave texto-chico' }, ` · ${p.cargo}`) : null),
      el('td', {}, asistio),
      s.con_evaluacion ? el('td', {}, nota) : null,
      el('td', {}, chip),
      el('td', {}, obs),
      el('td', {}, editable ? boton('', { icono: 'basura', class: 'boton-icono', 'aria-label': `Quitar a ${p.nombre}`, title: 'Quitar', onclick: (ev) => conCarga(ev, async () => {
        const { error } = await ctx.api.from('cap_asistentes').delete().eq('sesion_id', s.id).eq('persona_id', a.persona_id);
        if (error) throw new Error(error.message);
        ctx.refrescar();
      }) }) : null));
  };

  // ---- Registro firmado: en Prevención SST (si se puede) o respaldo subido aquí
  const registro = el('div', { class: 'cap-bloque' }, el('h2', {}, 'Registro firmado'));
  if (s.entrega_id && ctx.puede('sst', 'ver')) {
    registro.append(el('p', { class: 'texto-suave' }, 'El registro para firmar está en Prevención SST: ahí se imprime y se sube el escaneo firmado (marca la ficha de RRHH de cada asistente).'),
      el('a', { class: 'boton boton-secundario', href: ctx.ruta('sst.entrega', { id: s.entrega_id }) }, icono('documento', { tam: 16 }), 'Abrir registro en SST'));
  } else if (!s.entrega_id && ctx.puede('sst', 'crear') && ctx.puede('capacitaciones', 'editar')) {
    registro.append(el('p', { class: 'texto-suave' }, 'Crea el registro de capacitación en Prevención SST con los asistentes: se imprime para firmar y el escaneo queda en la ficha de cada trabajador.'),
      boton('Crear registro para firmar', { icono: 'documento', onclick: (ev) => conCarga(ev, () => crearRegistroSst(ctx, s, asistentes, personas)) }));
  }
  if (s.respaldo_ruta) {
    registro.append(el('div', { class: 'listado-acciones' }, boton(`Ver ${s.respaldo_nombre ?? 'respaldo'}`, { icono: 'ojo', onclick: (ev) => conCarga(ev, async () => { window.open(await urlFirmada(ctx.api, s.respaldo_ruta, 300), '_blank', 'noopener'); }) })));
  }
  if (editable) {
    registro.append(boton(s.respaldo_ruta ? 'Cambiar respaldo' : 'Subir respaldo (PDF o fotos)', { icono: 'mas', onclick: () => abrirFormulario({
      titulo: 'Respaldo de la sesión', campos: [{ id: 'archivo', etiqueta: 'Registro firmado, fotos o lista', tipo: 'file', accept: 'application/pdf,image/jpeg,image/png', requerido: true }],
      alGuardar: async (v) => {
        if (!v.archivo?.size) throw new Error('Elige el archivo.');
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'capacitaciones', archivo: v.archivo, tabla: 'cap_sesiones', registroId: s.id });
        const { error } = await ctx.api.from('cap_sesiones').update({ respaldo_ruta: ruta, respaldo_nombre: v.archivo.name }).eq('id', s.id);
        if (error) throw new Error(error.message);
        avisar('Respaldo guardado.'); ctx.refrescar();
      },
    }) }));
  }

  const contenidos = s.contenidos.map((id) => bib.contenidoDe.get(id)).filter(Boolean);
  const temario = (s.descripcion ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', { class: 'cap-cabecera' }, el('h1', {}, s.tema),
        el('div', { class: 'chips-fila' },
          el('span', { class: 'chip chip-na' }, icono('calendario', { tam: 12 }), fechaLarga(s.fecha)),
          s.duracion_min ? el('span', { class: 'chip chip-na' }, icono('reloj', { tam: 12 }), duracion(s.duracion_min)) : null,
          s.relator ? el('span', { class: 'chip chip-na' }, `Relator: ${s.relator}`) : null,
          s.lugar ? el('span', { class: 'chip chip-na' }, s.lugar) : null,
          s.con_evaluacion ? el('span', { class: 'chip chip-na' }, `Evaluación · aprueba con ${String(s.nota_minima).replace('.', ',')}`) : null,
          el('span', { class: `chip ${s.estado === 'cerrada' ? 'chip-ok' : 'chip-pend'}` }, s.estado === 'cerrada' ? 'Cerrada' : 'Abierta'))),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'cap-columnas' },
      el('div', { class: 'cap-bloque' }, el('h2', {}, 'Temario'),
        temario.length ? el('ul', { class: 'cap-pasos' }, temario.map((t) => el('li', {}, t))) : el('p', { class: 'texto-suave' }, 'Sin temario.'),
        contenidos.length ? el('h2', {}, 'Contenidos de la biblioteca') : null,
        contenidos.length ? el('ul', { class: 'cap-caja cap-lista' }, contenidos.map((c) => el('li', { class: 'cap-lista-fila' }, icono(ICONO_TIPO[c.tipo], { tam: 18 }),
          el('a', { class: 'cap-lista-texto', href: ctx.ruta('capacitaciones.contenido', { id: c.id }) }, el('strong', {}, c.titulo))))) : null),
      registro),
    supervisa ? el('div', { class: 'cap-bloque' },
      el('div', { class: 'cap-quienes-cabecera' }, el('h2', {}, `Asistentes (${asistentes.filter((a) => a.asistio).length})`), editable ? boton('Agregar asistentes', { icono: 'mas', onclick: agregar }) : null),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Asistió', ...(s.con_evaluacion ? ['Nota'] : []), 'Resultado', 'Observación', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, asistentes.length ? asistentes.map(filaAsistente) : [el('tr', {}, el('td', { colspan: 6, class: 'tabla-vacia' }, 'Sin asistentes todavía.'))])))) : null);
}

async function crearRegistroSst(ctx, s, asistentes, personas) {
  const presentes = asistentes.filter((a) => a.asistio);
  if (!presentes.length) throw new Error('Agrega primero a los asistentes.');
  const { data, error } = await ctx.api.from('sst_entregas').insert({
    empresa_id: ctx.empresa.id, tipo: 'capacitacion', tema: s.tema, fecha: s.fecha, relator: s.relator, duracion: s.duracion_min ? duracion(s.duracion_min) : null,
    contenido: s.descripcion,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await ctx.api.from('sst_entrega_personas').insert(presentes.map((a) => ({
    entrega_id: data.id, empresa_id: ctx.empresa.id, persona_id: a.persona_id, cargo: personas.de.get(a.persona_id)?.cargo ?? null,
  })));
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await ctx.api.from('cap_sesiones').update({ entrega_id: data.id }).eq('id', s.id);
  if (e3) throw new Error(e3.message);
  avisar('Registro creado en Prevención SST.');
  location.hash = ctx.ruta('sst.entrega', { id: data.id });
}

// Acta de la sesión: datos, temario, contenidos y asistentes con nota, resultado y espacio para firmar
async function acta(ctx, s, bib, personas, asistentes) {
  const pdf = await nuevoPdf(ctx, { titulo: `Capacitación: ${s.tema}`, subtitulo: `${fechaLarga(s.fecha)}${s.relator ? ` · Relator: ${s.relator}` : ''}` });
  pdf.tabla({ columnas: ['Dato', 'Detalle'], filas: [
    ['Fecha', fechaLarga(s.fecha)], ['Relator', s.relator ?? ''], ['Duración', duracion(s.duracion_min)], ['Lugar', s.lugar ?? ''],
    ['Temario', s.descripcion ?? ''], ['Contenidos', s.contenidos.map((id) => bib.contenidoDe.get(id)?.titulo).filter(Boolean).join('; ')],
    ...(s.con_evaluacion ? [['Evaluación', `Nota de 1 a 7; aprueba con ${String(s.nota_minima).replace('.', ',')}`]] : []),
  ] });
  const res = (a) => (!a.asistio ? 'No asistió' : !s.con_evaluacion ? 'Asistió' : (a.aprobado ?? (a.nota != null ? a.nota >= s.nota_minima : null)) === true ? 'Aprobado' : a.nota == null ? '' : 'Reprobado');
  pdf.tabla({
    columnas: ['N°', 'Nombre', 'Cargo', ...(s.con_evaluacion ? ['Nota'] : []), 'Resultado', 'Firma'],
    filas: asistentes.map((a, i) => [i + 1, personas.de.get(a.persona_id)?.nombre ?? '', personas.de.get(a.persona_id)?.cargo ?? '',
      ...(s.con_evaluacion ? [a.nota != null ? String(a.nota).replace('.', ',') : ''] : []), res(a), '']),
  });
  pdf.guardar(`capacitacion-${s.fecha}`);
}
