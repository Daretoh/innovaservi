// Revisión de una ficha de ingreso: incorporar (crea o completa la persona y su vínculo,
// y pasa la cédula a sus documentos personales) o descartar (borra la cédula).
// Ruta: #/rrhh.ingreso?f=<ficha_id>
import { el } from '../../../core/ui/dom.js?v=e4cf9a2';
import { icono } from '../../../core/ui/iconos.js?v=e4cf9a2';
import { boton } from '../../../core/ui/tabla.js?v=e4cf9a2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=e4cf9a2';
import { avisar } from '../../../core/ui/aviso.js?v=e4cf9a2';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=e4cf9a2';
import { VINCULOS } from '../datos.js?v=e4cf9a2';

const GRUPOS = [
  ['Datos', [['fecha_nacimiento', 'Nacimiento'], ['sexo', 'Sexo'], ['nacionalidad', 'Nacionalidad'], ['estado_civil', 'Estado civil'], ['cargo_postula', 'Cargo al que postula']]],
  ['Contacto', [['telefono', 'Teléfono'], ['email', 'Correo'], ['direccion', 'Calle'], ['numero', 'Número'], ['poblacion', 'Población'], ['comuna', 'Comuna'], ['region', 'Región'], ['emergencia', 'Emergencia']]],
  ['Previsión', [['afp', 'AFP'], ['salud', 'Salud'], ['cargas', 'Cargas'], ['discapacidad', 'Discapacidad']]],
  ['Pago', [['banco', 'Banco'], ['tipo_cuenta', 'Tipo de cuenta'], ['num_cuenta', 'Número de cuenta']]],
  ['Educación y tallas', [['titulo_educacion', 'Estudios'], ['institucion_titulo', 'Institución'], ['talla_ropa', 'Ropa'], ['talla_botas', 'Calzado']]],
];
const ESTADO = { pendiente: 'Pendiente', postulante: 'En Postulantes', incorporada: 'Incorporada', descartada: 'Descartada' };

export default async function vista(ctx) {
  const { data: f, error } = await ctx.api.from('rrhh_fichas_ingreso').select('*').eq('id', ctx.params.f).maybeSingle();
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('rrhh.fichas') }, icono('volver', { tam: 16 }), 'Fichas de ingreso');
  if (!f) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Ficha no encontrada'));

  const nombre = [f.nombres, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ');
  const ver = (ruta, texto) => el('button', {
    type: 'button', class: 'boton-enlace',
    onclick: async () => { try { window.open(await urlFirmada(ctx.api, ruta, 120), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } },
  }, icono('ojo', { tam: 15 }), texto);

  const acciones = [];
  if (f.estado === 'pendiente' && ctx.puede('rrhh', 'crear') && ctx.puede('personas', 'crear')) {
    acciones.push(boton('Incorporar', { icono: 'check', tipo: 'primario', onclick: () => incorporar(ctx, f) }));
  }
  if (f.estado === 'pendiente' && ctx.puede('postulantes', 'crear')) {
    acciones.push(boton('Pasar a Postulantes', { icono: 'users', onclick: () => aPostulantes(ctx, f) }));
  }
  if (f.estado === 'postulante' && ctx.puede('postulantes', 'ver')) acciones.push(el('a', { class: 'boton boton-secundario', href: ctx.ruta('postulantes.tablero') }, 'Ver en Postulantes'));
  if (f.estado === 'pendiente' && ctx.puede('rrhh', 'editar')) {
    acciones.push(boton('Descartar', { icono: 'basura', onclick: () => descartar(ctx, f) }));
  }
  if (f.persona_id) acciones.push(el('a', { class: 'boton boton-secundario', href: ctx.ruta('rrhh.ficha', { p: f.persona_id }) }, 'Ver ficha del trabajador'));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {},
        el('h1', {}, nombre),
        el('p', { class: 'texto-suave' }, `RUT ${f.rut} · recibida el ${new Date(f.created_at).toLocaleString('es-CL')} · `,
          el('span', { class: `chip ${f.estado === 'pendiente' ? 'chip-pend' : f.estado === 'incorporada' ? 'chip-ok' : 'chip-na'}` }, ESTADO[f.estado]))),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Cédula de identidad'),
      f.archivo_frente || f.archivo_reverso
        ? el('div', { class: 'listado-acciones' }, f.archivo_frente ? ver(f.archivo_frente, 'Ver frente') : null, f.archivo_reverso ? ver(f.archivo_reverso, 'Ver reverso') : null)
        : el('p', { class: 'texto-suave' }, f.estado === 'pendiente' ? 'No adjuntó la cédula.' : 'Los archivos ya se movieron a la ficha del trabajador o se eliminaron.')),
    GRUPOS.map(([titulo, campos]) => el('div', { class: 'ficha' },
      el('h2', {}, titulo),
      el('dl', { class: 'datos-lista' }, campos.flatMap(([k, t]) => {
        const v = f.datos?.[k];
        const texto = k === 'fecha_nacimiento' && v ? new Date(`${v}T12:00`).toLocaleDateString('es-CL') : v;
        return [el('dt', {}, t), el('dd', {}, texto || '—')];
      })))),
    el('p', { class: 'texto-suave texto-chico' }, `Consentimiento de tratamiento de datos aceptado el ${new Date(f.consentimiento_at).toLocaleString('es-CL')}.`),
  );
}

function incorporar(ctx, f) {
  abrirFormulario({
    titulo: 'Incorporar a la empresa',
    mensaje: 'Si el RUT ya existe en otra empresa del grupo, se usa esa ficha y solo se completan los datos vacíos.',
    campos: [
      { id: 'cargo', etiqueta: 'Cargo', valor: f.datos?.cargo_postula ?? '' },
      { id: 'tipo_vinculo', etiqueta: 'Vínculo', opciones: VINCULOS, valor: 'contrato' },
      { id: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date', valor: new Date().toISOString().slice(0, 10) },
      ...(f.archivo_frente || f.archivo_reverso
        ? [{ id: 'vence_cedula', etiqueta: 'Vencimiento de la cédula (opcional)', tipo: 'date', ayuda: 'Está impreso en la cédula. Si lo dejas vacío, podrás completarlo después.' }]
        : []),
    ],
    textoGuardar: 'Incorporar',
    alGuardar: async (v) => {
      const { data: personaId, error } = await ctx.api.rpc('rrhh_incorporar_ficha', {
        p_ficha: f.id, p_cargo: v.cargo || null, p_tipo_vinculo: v.tipo_vinculo, p_fecha_ingreso: v.fecha_ingreso || null,
      });
      if (error) throw new Error(error.message);
      const aviso = await moverCedula(ctx, f, personaId, v.vence_cedula || null);
      avisar(aviso ?? 'Persona incorporada.', aviso ? 'error' : 'ok');
      location.hash = ctx.ruta('rrhh.ficha', { p: personaId });
    },
  });
}

// Pasa la cédula de la ficha a los documentos personales de la persona (personas/<id>/rrhh/).
// Si ya tenía una cédula entregada, no se reemplaza. Devuelve un aviso si algo no se pudo.
export async function moverCedula(ctx, f, personaId, vence) {
  if (!f.archivo_frente && !f.archivo_reverso) return null;
  try {
    const { data: existente } = await ctx.api.from('rrhh_documentos').select('id, estado, archivo')
      .is('empresa_id', null).eq('persona_id', personaId).eq('tipo_slug', 'cedula').is('deleted_at', null).maybeSingle();
    if (!(existente?.estado === 'entregado' && existente.archivo)) {
      const copiar = async (ruta) => {
        if (!ruta) return null;
        const blob = await (await fetch(await urlFirmada(ctx.api, ruta, 60))).blob();
        const nombreArchivo = ruta.split('/').pop().replace(/^[0-9a-f-]{36}-/, 'cedula-');
        const archivo = new File([blob], nombreArchivo, { type: blob.type });
        return (await subirArchivo(ctx.api, { personaId, modulo: 'rrhh', archivo })).ruta;
      };
      const archivo = await copiar(f.archivo_frente);
      const archivo2 = await copiar(f.archivo_reverso);
      const datos = { estado: 'entregado', fecha: new Date().toISOString().slice(0, 10), vence, archivo, archivo2 };
      const r = existente
        ? await ctx.api.from('rrhh_documentos').update(datos).eq('id', existente.id)
        : await ctx.api.from('rrhh_documentos').insert({ empresa_id: null, persona_id: personaId, tipo_slug: 'cedula', ...datos });
      if (r.error) throw new Error(r.error.message);
    }
    for (const ruta of [f.archivo_frente, f.archivo_reverso]) if (ruta) await eliminarArchivo(ctx.api, ruta);
    await ctx.api.from('rrhh_fichas_ingreso').update({ archivo_frente: null, archivo_reverso: null }).eq('id', f.id);
    return null;
  } catch (e) {
    return `La persona quedó incorporada, pero la cédula sigue en la ficha de ingreso: ${e.message}`;
  }
}

// La ficha pasa al módulo Postulantes (selección); al contratar desde ahí, se incorpora sola.
async function aPostulantes(ctx, f) {
  const { data: procesos } = await ctx.api.from('sel_procesos').select('id, nombre').eq('empresa_id', ctx.empresa.id).eq('estado', 'abierto').is('deleted_at', null).order('nombre');
  abrirFormulario({
    titulo: 'Pasar a Postulantes',
    mensaje: 'Queda como postulante en la primera etapa, con sus datos y la cédula en esta ficha. Al contratarlo desde Postulantes, la ficha se incorpora.',
    campos: [{ id: 'proceso', etiqueta: 'Proceso de selección', opciones: [['', 'Sin proceso'], ...(procesos ?? []).map((x) => [x.id, x.nombre])] }],
    textoGuardar: 'Pasar a Postulantes',
    alGuardar: async (v) => {
      await ctx.api.rpc('sel_preparar', { p_empresa: ctx.empresa.id });
      const { data: id, error } = await ctx.api.rpc('sel_desde_ficha', { p_ficha: f.id, p_proceso: v.proceso || null });
      if (error) throw new Error(error.message);
      avisar('La ficha pasó a Postulantes.');
      location.hash = ctx.ruta('postulantes.ficha', { id });
    },
  });
}

function descartar(ctx, f) {
  abrirFormulario({
    titulo: 'Descartar ficha',
    mensaje: 'La ficha queda como descartada y se eliminan los archivos de la cédula. No se puede deshacer.',
    campos: [],
    textoGuardar: 'Descartar',
    alGuardar: async () => {
      for (const ruta of [f.archivo_frente, f.archivo_reverso]) if (ruta) await eliminarArchivo(ctx.api, ruta);
      const { data, error } = await ctx.api.from('rrhh_fichas_ingreso')
        .update({ estado: 'descartada', archivo_frente: null, archivo_reverso: null }).eq('id', f.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('No tienes permiso para descartar fichas.');
      avisar('Ficha descartada.');
      location.hash = ctx.ruta('rrhh.fichas');
    },
  });
}
