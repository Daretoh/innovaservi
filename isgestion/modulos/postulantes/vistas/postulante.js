// Ficha del postulante: seguimiento (etapa, proceso, próximo contacto, valoración), requisitos, historial de
// entrevistas y notas, documentos iniciales, datos; contratar, descartar, reactivar o eliminar.
// Ruta: #/postulantes.ficha?id=<postulante>
import { el } from '../../../core/ui/dom.js?v=7860387';
import { icono } from '../../../core/ui/iconos.js?v=7860387';
import { boton } from '../../../core/ui/tabla.js?v=7860387';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7860387';
import { avisar } from '../../../core/ui/aviso.js?v=7860387';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=7860387';
import { fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=7860387';
import { cargarBase, formularioPostulante, nombreCompleto, iniciales, requisitosDe, nombreFuente } from '../datos.js?v=7860387';

const TIPOS_EVENTO = [['entrevista', 'Entrevista'], ['llamada', 'Llamada'], ['nota', 'Nota']];
const NOMBRE_EVENTO = { entrevista: 'Entrevista', llamada: 'Llamada', nota: 'Nota', etapa: 'Cambio de etapa', estado: 'Estado' };
const RESULTADOS = [['', 'Sin resultado'], ['positivo', 'Positivo'], ['neutral', 'Neutral'], ['negativo', 'Negativo']];
const ICONO_EVENTO = { entrevista: 'users', llamada: 'reloj', nota: 'editar', etapa: 'derecha', estado: 'check' };
const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const VINCULOS = [['contrato', 'Contrato'], ['spot', 'Spot'], ['honorarios', 'Honorarios'], ['practica', 'Práctica']];

export default async function vista(ctx) {
  const id = ctx.params.id;
  const volver = el('a', { class: 'volver', href: ctx.ruta('postulantes.tablero') }, icono('volver', { tam: 16 }), 'Postulantes');
  const [base, pr, ev, dc] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('sel_postulantes').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    ctx.api.from('sel_eventos').select('*').eq('postulante_id', id).order('fecha', { ascending: false }),
    ctx.api.from('sel_documentos').select('*').eq('postulante_id', id).order('created_at', { ascending: false }),
  ]);
  if (pr.error) throw pr.error;
  const p = pr.data;
  if (!p) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Postulante no encontrado'));
  const editar = ctx.puede('postulantes', 'editar') && p.estado !== 'contratado';
  const hoy = hoyISO();
  const guardar = async (cambios, aviso = 'Guardado.') => {
    const { error } = await ctx.api.from('sel_postulantes').update(cambios).eq('id', p.id);
    if (error) { avisar(error.message, 'error'); return false; }
    avisar(aviso); ctx.refrescar(); return true;
  };

  // ---- Cabecera y acciones
  const req = requisitosDe(p, base.procesoDe);
  const pct = req.lista.length ? Math.round((req.cumplidos / req.lista.length) * 100) : 0;
  const chipEstado = p.estado === 'contratado' ? el('span', { class: 'chip chip-ok' }, 'Contratado')
    : p.estado === 'descartado' ? el('span', { class: 'chip chip-na' }, 'Descartado')
      : el('span', { class: 'chip chip-pend' }, base.etapaDe.get(p.etapa_id)?.nombre ?? 'Sin etapa');
  const acciones = [];
  if (editar) acciones.push(boton('Editar datos', { icono: 'editar', onclick: () => formularioPostulante(ctx, base, p, { alListo: () => ctx.refrescar() }) }));
  if (p.estado === 'activo' && ctx.puede('postulantes', 'editar') && ctx.puede('personas', 'crear')) acciones.push(boton('Contratar', { icono: 'check', tipo: 'primario', onclick: () => contratar(ctx, p) }));
  if (p.estado === 'activo' && editar) acciones.push(boton('Descartar', { icono: 'cerrar', onclick: () => descartar(ctx, p) }));
  if (p.estado === 'descartado' && ctx.puede('postulantes', 'editar')) acciones.push(boton('Reactivar', { icono: 'volver', onclick: async () => {
    const { error } = await ctx.api.rpc('sel_estado', { p_postulante: p.id, p_estado: 'activo' });
    if (error) avisar(error.message, 'error'); else { avisar('Postulante reactivado.'); ctx.refrescar(); }
  } }));
  if (p.persona_id && ctx.puede('rrhh', 'ver')) acciones.push(el('a', { class: 'boton boton-secundario', href: ctx.ruta('rrhh.ficha', { p: p.persona_id }) }, 'Ver ficha del trabajador'));
  if (p.estado !== 'contratado' && ctx.puede('postulantes', 'eliminar')) acciones.push(el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar postulante', 'aria-label': 'Eliminar postulante', onclick: () => eliminar(ctx, p) }, icono('basura', { tam: 18 })));

  const cabecera = el('header', { class: 'listado-cabecera ficha-cabecera' },
    el('span', { class: `avatar ${pct >= 100 ? 'avatar-bien' : pct >= 50 ? 'avatar-medio' : ''}`, style: `--pct:${pct}`, title: req.lista.length ? `${req.cumplidos} de ${req.lista.length} requisitos` : '' }, el('span', {}, iniciales(p))),
    el('div', {},
      el('h1', {}, nombreCompleto(p)),
      el('p', { class: 'texto-suave' }, [p.cargo, base.procesoDe.get(p.proceso_id)?.nombre, p.rut ? `RUT ${p.rut}` : 'Sin RUT', nombreFuente[p.fuente]].filter(Boolean).join(' · '), ' ', chipEstado),
      p.estado === 'descartado' && p.motivo_descarte ? el('p', { class: 'texto-chico' }, `Motivo: ${p.motivo_descarte}`) : null),
    el('div', { class: 'listado-acciones' }, acciones));

  // ---- Seguimiento: etapa, proceso, próximo contacto y valoración (se guardan al cambiar)
  const sel = (opciones, valor, alCambiar, etiqueta) => el('select', { class: 'campo', disabled: !editar, 'aria-label': etiqueta, onchange: (e) => alCambiar(e.currentTarget.value) },
    opciones.map(([v, t]) => el('option', { value: v, selected: v === (valor ?? '') }, t)));
  const fechaContacto = el('input', { type: 'date', class: 'campo', value: p.proximo_contacto ?? '', disabled: !editar, 'aria-label': 'Próximo contacto',
    onchange: (e) => guardar({ proximo_contacto: e.currentTarget.value || null }, e.currentTarget.value ? 'Próximo contacto agendado.' : 'Próximo contacto quitado.') });
  const seguimiento = el('div', { class: 'ficha' },
    el('h2', {}, 'Seguimiento'),
    el('div', { class: 'rejilla-campos' },
      el('label', { class: 'form-fila' }, 'Etapa', sel(base.etapas.filter((x) => x.activo || x.id === p.etapa_id).map((x) => [x.id, x.nombre]), p.etapa_id, (v) => guardar({ etapa_id: v || null }, 'Etapa cambiada.'), 'Etapa')),
      el('label', { class: 'form-fila' }, 'Proceso de selección', sel([['', 'Sin proceso'], ...base.procesos.filter((x) => x.estado === 'abierto' || x.id === p.proceso_id).map((x) => [x.id, x.nombre])], p.proceso_id, (v) => guardar({ proceso_id: v || null }, 'Proceso cambiado.'), 'Proceso')),
      el('label', { class: 'form-fila' }, 'Próximo contacto', fechaContacto,
        p.proximo_contacto && p.proximo_contacto <= hoy && p.estado === 'activo' ? el('span', { class: 'texto-chico texto-error' }, p.proximo_contacto < hoy ? 'Atrasado' : 'Hoy') : null),
      el('label', { class: 'form-fila' }, 'Valoración', sel([['', 'Sin valorar'], ...[5, 4, 3, 2, 1].map((n) => [String(n), `${n} de 5`])], p.valoracion ? String(p.valoracion) : '', (v) => guardar({ valoracion: v ? Number(v) : null }, 'Valoración guardada.'), 'Valoración'))),
    p.nota ? el('p', { class: 'texto-chico' }, p.nota) : null);

  // ---- Requisitos (del proceso): se marcan al tiro
  const requisitos = el('div', { class: 'ficha' },
    el('h2', {}, `Requisitos${req.lista.length ? ` (${req.cumplidos}/${req.lista.length})` : ''}`),
    req.lista.length
      ? el('div', { class: 'checks-lista sel-requisitos' }, req.lista.map((r) => el('label', { class: 'casilla' },
        el('input', { type: 'checkbox', checked: !!p.requisitos?.[r], disabled: !editar,
          onchange: (e) => { const n = { ...(p.requisitos ?? {}) }; if (e.currentTarget.checked) n[r] = true; else delete n[r]; guardar({ requisitos: n }, e.currentTarget.checked ? 'Requisito cumplido.' : 'Requisito pendiente.'); } }), r)))
      : el('p', { class: 'texto-suave' }, p.proceso_id ? 'El proceso no tiene requisitos. Agrégalos en Procesos de selección.' : 'Asigna un proceso de selección para ver sus requisitos.'));

  // ---- Historial
  const historial = el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Historial'),
      editar || (ctx.puede('postulantes', 'editar') && p.estado === 'contratado') ? boton('Registrar entrevista o nota', { icono: 'mas', onclick: () => evento(ctx, p) }) : null),
    (ev.data ?? []).length ? (ev.data ?? []).map((x) => el('div', { class: `doc-fila sel-evento sel-evento-${x.tipo}` },
      el('span', { class: 'sel-evento-icono', 'aria-hidden': 'true' }, icono(ICONO_EVENTO[x.tipo] ?? 'editar', { tam: 14 })),
      el('div', { class: 'doc-nombre' },
        el('strong', {}, x.tipo === 'etapa' ? `Pasó a ${x.texto}` : x.tipo === 'estado' ? x.texto : NOMBRE_EVENTO[x.tipo]),
        x.resultado ? el('span', { class: `chip ${x.resultado === 'positivo' ? 'chip-ok' : x.resultado === 'negativo' ? 'chip-venc' : 'chip-na'}` }, RESULTADOS.find(([k]) => k === x.resultado)[1]) : null,
        x.tipo !== 'etapa' && x.tipo !== 'estado' && x.texto ? el('span', { class: 'texto-chico sel-evento-texto' }, x.texto) : null),
      el('span', { class: 'texto-suave texto-chico' }, `${fechaLarga(diaLocal(x.fecha))} ${new Date(x.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`)))
      : el('p', { class: 'texto-suave' }, 'Sin registros todavía.'));

  // ---- Documentos iniciales
  const entrada = el('input', { type: 'file', accept: ARCHIVOS.join(','), hidden: true });
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0]; if (!archivo) return;
    try {
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'postulantes', archivo, tabla: 'sel_documentos', registroId: p.id, tipos: ARCHIVOS });
      const { error } = await ctx.api.from('sel_documentos').insert({ empresa_id: ctx.empresa.id, postulante_id: p.id, nombre: archivo.name, archivo: ruta });
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      avisar('Documento subido.'); ctx.refrescar();
    } catch (e) { avisar(e.message, 'error'); }
  });
  const documentos = el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Documentos'),
      ctx.puede('postulantes', 'editar') ? [entrada, boton('Subir documento', { icono: 'mas', onclick: () => entrada.click() })] : null),
    (dc.data ?? []).length ? (dc.data ?? []).map((d) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, icono('documento', { tam: 16 }), el('span', {}, d.nombre)),
      el('span', { class: 'texto-suave texto-chico' }, fechaLarga(diaLocal(d.created_at))),
      el('div', { class: 'doc-acciones' },
        el('button', { type: 'button', class: 'boton-enlace', onclick: async () => { try { window.open(await urlFirmada(ctx.api, d.archivo, 120), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }, icono('ojo', { tam: 15 }), 'Ver'),
        ctx.puede('postulantes', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${d.nombre}`, onclick: async () => {
          const { error } = await ctx.api.from('sel_documentos').delete().eq('id', d.id);
          if (error) { avisar(error.message, 'error'); return; }
          await eliminarArchivo(ctx.api, d.archivo).catch(() => {});
          avisar('Documento eliminado.'); ctx.refrescar();
        } }, icono('basura', { tam: 16 })) : null)))
      : el('p', { class: 'texto-suave' }, 'Currículum, certificados u otros documentos que entregó.'));

  // ---- Datos de contacto (y los de la ficha de ingreso, si vino de ahí)
  const extra = Object.entries(p.datos ?? {}).filter(([k, v]) => v && !['telefono', 'email', 'comuna', 'cargo_postula'].includes(k)).slice(0, 20);
  const datos = el('div', { class: 'ficha' },
    el('h2', {}, 'Datos'),
    el('dl', { class: 'datos-lista' },
      [['Teléfono', p.telefono], ['Correo', p.email], ['Comuna', p.comuna], ['Ingresó', fechaLarga(diaLocal(p.created_at))]].flatMap(([t, v]) => [el('dt', {}, t), el('dd', {}, v || '—')]),
      extra.flatMap(([k, v]) => [el('dt', {}, k.replace(/_/g, ' ')), el('dd', {}, String(v))])),
    p.ficha_id && ctx.puede('rrhh', 'ver') ? el('a', { class: 'boton-enlace', href: ctx.ruta('rrhh.ingreso', { f: p.ficha_id }) }, icono('documento', { tam: 15 }), 'Ver ficha de ingreso') : null);

  return el('section', { class: 'listado' }, volver, cabecera,
    el('div', { class: 'sel-ficha' }, el('div', { class: 'ficha-datos' }, seguimiento, requisitos, historial), el('div', { class: 'ficha-datos' }, documentos, datos)));
}

function evento(ctx, p) {
  const ahora = new Date(); const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  abrirFormulario({
    titulo: 'Registrar en el historial',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_EVENTO, valor: 'entrevista' },
      { id: 'fecha', etiqueta: 'Fecha y hora', tipo: 'datetime-local', valor: local, requerido: true },
      { id: 'texto', etiqueta: 'Detalle', tipo: 'textarea', filas: 4, requerido: true },
      { id: 'resultado', etiqueta: 'Resultado', opciones: RESULTADOS, valor: '' },
      { id: 'proximo', etiqueta: 'Próximo contacto (opcional)', tipo: 'date', valor: p.proximo_contacto ?? '' },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sel_eventos').insert({ empresa_id: ctx.empresa.id, postulante_id: p.id, tipo: v.tipo, fecha: new Date(v.fecha).toISOString(), texto: v.texto.trim(), resultado: v.resultado || null });
      if (error) throw new Error(error.message);
      if ((v.proximo || null) !== (p.proximo_contacto ?? null) && p.estado !== 'contratado') await ctx.api.from('sel_postulantes').update({ proximo_contacto: v.proximo || null }).eq('id', p.id);
      avisar('Registrado en el historial.'); ctx.refrescar();
    },
  });
}

function contratar(ctx, p) {
  abrirFormulario({
    titulo: 'Contratar',
    mensaje: 'Crea la persona en la empresa con estos datos (si el RUT ya existe en otra empresa del grupo, se usa esa ficha y solo se completan los datos vacíos). Después la ves en RRHH → Trabajadores.',
    campos: [
      { id: 'cargo', etiqueta: 'Cargo', valor: p.cargo ?? '' },
      { id: 'tipo_vinculo', etiqueta: 'Vínculo', opciones: VINCULOS, valor: 'contrato' },
      { id: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date', valor: hoyISO() },
    ],
    textoGuardar: 'Contratar',
    alGuardar: async (v) => {
      const { data: personaId, error } = await ctx.api.rpc('sel_contratar', { p_postulante: p.id, p_cargo: v.cargo || null, p_tipo_vinculo: v.tipo_vinculo, p_fecha_ingreso: v.fecha_ingreso || null });
      if (error) throw new Error(error.message);
      // Si vino de una ficha de ingreso con cédula, la cédula pasa a los documentos personales (como al incorporar en RRHH)
      let aviso = null;
      if (p.ficha_id) {
        const { data: f } = await ctx.api.from('rrhh_fichas_ingreso').select('*').eq('id', p.ficha_id).maybeSingle();
        if (f && (f.archivo_frente || f.archivo_reverso)) aviso = await (await import('../../rrhh/vistas/ingreso.js?v=7860387')).moverCedula(ctx, f, personaId, null);
      }
      avisar(aviso ?? 'Contratado. Ya está en RRHH → Trabajadores.', aviso ? 'error' : 'ok');
      ctx.refrescar();
    },
  });
}

function descartar(ctx, p) {
  abrirFormulario({
    titulo: 'Descartar postulante',
    mensaje: 'Queda en Descartados con su historial y se puede reactivar.',
    campos: [{ id: 'motivo', etiqueta: 'Motivo (opcional)', tipo: 'textarea' }],
    textoGuardar: 'Descartar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.rpc('sel_estado', { p_postulante: p.id, p_estado: 'descartado', p_motivo: v.motivo || null });
      if (error) throw new Error(error.message);
      avisar('Postulante descartado.'); ctx.refrescar();
    },
  });
}

function eliminar(ctx, p) {
  abrirFormulario({
    titulo: 'Eliminar postulante',
    mensaje: `${nombreCompleto(p)} deja de aparecer en Postulantes. Para guardar su historial, mejor descártalo.`,
    campos: [],
    textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { data, error } = await ctx.api.from('sel_postulantes').update({ deleted_at: new Date().toISOString() }).eq('id', p.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('No tienes permiso para eliminar postulantes.');
      avisar('Postulante eliminado.'); location.hash = ctx.ruta('postulantes.tablero');
    },
  });
}
