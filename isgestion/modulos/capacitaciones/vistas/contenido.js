// Ficha de un contenido de la biblioteca: el video, el enlace incrustado (YouTube, Instagram, TikTok, Vimeo), el PDF,
// la imagen o la guía paso a paso; "Marcar como visto" (cuenta propia o RUT en la tablet) y, para quien edita o evalúa,
// quién lo vio, con aprobar / no aprobado.
// Ruta: #/capacitaciones.contenido?id=<id>
import { el } from '../../../core/ui/dom.js?v=591477d';
import { icono } from '../../../core/ui/iconos.js?v=591477d';
import { boton } from '../../../core/ui/tabla.js?v=591477d';
import { abrirFormulario } from '../../../core/ui/modal.js?v=591477d';
import { avisar } from '../../../core/ui/aviso.js?v=591477d';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=591477d';
import { megas } from '../../../core/adjuntos.js?v=591477d';
import { cargarBiblioteca, miPersona, miAvance, urlsDe, red, marcarVisto, cargarPersonas, cargarEstilos, conCarga, TIPO_CORTO, ICONO_TIPO, duracion } from '../datos.js?v=591477d';
import { editarContenido } from './biblioteca.js?v=591477d';

const ORIGEN = { propio: 'su cuenta', tablet: 'la tablet', encargado: 'el encargado', sesion: 'una sesión' };

export default async function vista(ctx) {
  cargarEstilos();
  const volver = el('a', { class: 'volver', href: ctx.ruta('capacitaciones.biblioteca') }, icono('volver', { tam: 16 }), 'Biblioteca');
  const [datos, persona] = await Promise.all([cargarBiblioteca(ctx), miPersona(ctx)]);
  const c = datos.contenidoDe.get(ctx.params.id);
  if (!c) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Contenido no encontrado'));
  const [avance, urls] = await Promise.all([miAvance(ctx, persona), urlsDe(ctx, [c.archivo_ruta])]);
  const mio = avance.get(c.id);
  const supervisa = ctx.puede('capacitaciones', 'editar') || ctx.puede('capacitaciones', 'aprobar');
  const area = datos.areaDe.get(c.area_id);

  const acciones = [];
  if (!persona || !mio?.visto_at) {
    acciones.push(boton(persona ? 'Marcar como visto' : 'Marcar como visto (con RUT)', { icono: 'check', tipo: 'primario', onclick: (ev) => conCarga(ev, async () => {
      const r = await marcarVisto(ctx, c, { persona });
      if (r) { avisar(`${r.nombre}: visto.`); ctx.refrescar(); }
    }) }));
  }
  if (ctx.puede('capacitaciones', 'editar')) acciones.push(boton('Editar', { icono: 'editar', onclick: () => editarContenido(ctx, datos, c) }));
  if (ctx.puede('capacitaciones', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar contenido', mensaje: `"${c.titulo}" deja de verse en la biblioteca y en las rutas. El avance de cada trabajador queda guardado.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('cap_contenidos').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw new Error(error.message);
      avisar('Contenido eliminado.');
      location.hash = ctx.ruta('capacitaciones.biblioteca');
    },
  }) }));

  const estadoMio = mio?.aprobado === true ? el('span', { class: 'chip chip-ok' }, 'Aprobado')
    : mio?.aprobado === false ? el('span', { class: 'chip chip-venc' }, 'No aprobado')
      : mio?.visto_at ? el('span', { class: 'chip chip-ok' }, icono('check', { tam: 12 }), `Visto el ${fechaLarga(diaLocal(mio.visto_at))}`) : null;

  return el('section', { class: 'listado cap-ficha' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', { class: 'cap-cabecera' },
        el('h1', {}, c.titulo),
        el('div', { class: 'chips-fila' },
          area ? el('span', { class: 'chip chip-na' }, area.nombre) : null,
          el('span', { class: 'chip chip-na' }, icono(ICONO_TIPO[c.tipo], { tam: 12 }), c.tipo === 'enlace' ? red(c.url).nombre : TIPO_CORTO[c.tipo]),
          c.duracion_min ? el('span', { class: 'chip chip-na' }, icono('reloj', { tam: 12 }), duracion(c.duracion_min)) : null,
          c.publicado ? null : el('span', { class: 'chip chip-pend' }, 'Borrador'),
          estadoMio)),
      el('div', { class: 'listado-acciones' }, acciones)),
    c.descripcion ? el('p', { class: 'cap-descripcion' }, c.descripcion) : null,
    reproductor(c, urls),
    c.texto ? pasos(c) : null,
    (c.etiquetas ?? []).length ? el('div', { class: 'chips-fila' }, c.etiquetas.map((t) => el('span', { class: 'chip chip-na' }, t))) : null,
    supervisa ? await quienes(ctx, c) : null);
}

function reproductor(c, urls) {
  const url = urls.get(c.archivo_ruta);
  if (c.tipo === 'enlace') {
    const r = red(c.url);
    const abrir = el('a', { class: 'boton boton-secundario', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, icono('enlace', { tam: 16 }), `Abrir en ${r.nombre}`);
    if (!r.src) return el('div', { class: 'cap-enlace' }, icono('enlace', { tam: 28 }), el('span', { class: 'cap-url' }, c.url), abrir);
    return el('div', { class: 'cap-medio' },
      el('div', { class: `cap-embed ${r.vertical ? 'vertical' : ''}` },
        el('iframe', { src: r.src, title: c.titulo, loading: 'lazy', allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })),
      el('div', { class: 'listado-acciones' }, abrir));
  }
  if (c.tipo === 'guia' && !c.archivo_ruta) return null;
  if (!url) return el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'No se pudo abrir el archivo.');
  const tam = c.archivo_tamano ? ` (${megas(c.archivo_tamano)})` : '';
  const descargar = el('a', { class: 'boton boton-secundario', href: url, target: '_blank', rel: 'noopener' }, icono('descargar', { tam: 16 }), `Abrir ${c.archivo_nombre ?? 'archivo'}${tam}`);
  const mime = c.archivo_mime ?? '';
  if (mime.startsWith('video/')) return el('div', { class: 'cap-medio' }, el('video', { class: 'cap-video', src: url, controls: true, playsinline: true, preload: 'metadata' }));
  if (mime.startsWith('image/')) return el('div', { class: 'cap-medio' }, el('img', { class: 'cap-imagen', src: url, alt: c.titulo }), el('div', { class: 'listado-acciones' }, descargar));
  if (mime === 'application/pdf') return el('div', { class: 'cap-medio' }, el('iframe', { class: 'cap-pdf', src: url, title: c.titulo }), el('div', { class: 'listado-acciones' }, descargar));
  return el('div', { class: 'cap-medio' }, descargar);
}

function pasos(c) {
  const lineas = c.texto.split('\n').map((t) => t.trim()).filter(Boolean);
  if (c.tipo !== 'guia') return el('div', { class: 'cap-caja cap-notas' }, el('h2', {}, 'Notas'), ...lineas.map((t) => el('p', {}, t)));
  return el('div', { class: 'cap-caja cap-notas' }, el('h2', {}, 'Paso a paso'),
    el('ol', { class: 'cap-pasos' }, lineas.map((t) => el('li', {}, t.replace(/^\d+[.)-]\s*/, '')))));
}

// ---- Quién lo vio: asignados por ruta + cualquiera con avance; marcar visto, aprobar o no
async function quienes(ctx, c) {
  const puedeEval = ctx.puede('capacitaciones', 'aprobar');
  const [personas, av, items] = await Promise.all([
    cargarPersonas(ctx, { todas: true }),
    ctx.api.from('cap_avance').select('*').eq('contenido_id', c.id),
    ctx.api.from('cap_ruta_items').select('ruta_id').eq('contenido_id', c.id),
  ]);
  const rutas = (items.data ?? []).map((i) => i.ruta_id);
  const { data: asig } = rutas.length
    ? await ctx.api.from('cap_ruta_personas').select('persona_id').in('ruta_id', rutas)
    : { data: [] };
  const avDe = new Map((av.data ?? []).map((a) => [a.persona_id, a]));
  const ids = [...new Set([...(asig ?? []).map((a) => a.persona_id), ...avDe.keys()])]
    .filter((id) => personas.de.has(id)).sort((a, b) => personas.de.get(a).nombre.localeCompare(personas.de.get(b).nombre));

  const guardarEval = async (pid, aprobado, nota, quitar) => {
    const { error } = await ctx.api.rpc('cap_evaluar', { p_empresa: ctx.empresa.id, p_contenido: c.id, p_persona: pid, p_aprobado: aprobado, p_nota: nota, p_quitar_visto: quitar });
    if (error) throw new Error(error.message);
    ctx.refrescar();
  };
  const evaluar = async (pid, aprobado, quitar = false) => {
    if (aprobado !== false) return guardarEval(pid, aprobado, null, quitar);
    abrirFormulario({ titulo: 'No aprobado', campos: [{ id: 'nota', etiqueta: 'Qué le faltó (opcional)', tipo: 'textarea', filas: 2 }],
      alGuardar: (v) => guardarEval(pid, false, v.nota, false) });
  };
  const marcar = async (pid) => {
    const { error } = await ctx.api.rpc('cap_marcar_visto', { p_empresa: ctx.empresa.id, p_contenido: c.id, p_persona: pid });
    if (error) throw new Error(error.message);
    ctx.refrescar();
  };

  const filas = ids.map((pid) => {
    const p = personas.de.get(pid);
    const a = avDe.get(pid);
    const estado = a?.aprobado === true ? el('span', { class: 'chip chip-ok' }, 'Aprobado')
      : a?.aprobado === false ? el('span', { class: 'chip chip-venc' }, 'No aprobado')
        : a?.visto_at ? el('span', { class: 'chip chip-ok' }, 'Visto') : el('span', { class: 'chip chip-pend' }, 'Pendiente');
    const botones = [];
    if (!a?.visto_at) botones.push(boton('Marcar visto', { icono: 'check', class: 'boton boton-secundario boton-chico', onclick: (ev) => conCarga(ev, () => marcar(pid)) }));
    if (puedeEval) {
      if (a?.aprobado !== true) botones.push(boton('Aprobar', { icono: 'check', class: 'boton boton-secundario boton-chico', onclick: (ev) => conCarga(ev, () => evaluar(pid, true)) }));
      if (a?.aprobado !== false) botones.push(boton('No aprobado', { icono: 'cerrar', class: 'boton boton-secundario boton-chico', onclick: (ev) => conCarga(ev, () => evaluar(pid, false)) }));
      if (a) botones.push(boton('', { icono: 'deshacer', class: 'boton boton-secundario boton-chico', title: 'Quitar visto y evaluación', 'aria-label': 'Quitar visto y evaluación',
        onclick: (ev) => conCarga(ev, () => evaluar(pid, null, true)) }));
    }
    return el('tr', {},
      el('td', {}, el('strong', {}, p.nombre), p.cargo ? el('span', { class: 'texto-suave texto-chico' }, ` · ${p.cargo}`) : null),
      el('td', {}, estado),
      el('td', { class: 'texto-chico texto-suave' }, a?.visto_at ? `${fechaLarga(diaLocal(a.visto_at))} · ${ORIGEN[a.visto_origen] ?? ''}` : ''),
      el('td', { class: 'texto-chico' }, a?.nota ?? ''),
      el('td', {}, el('div', { class: 'cap-botones' }, botones)));
  });

  const agregar = boton('Marcar a otra persona', { icono: 'mas', onclick: () => abrirFormulario({
    titulo: 'Marcar como visto',
    campos: [{ id: 'persona', etiqueta: 'Trabajador', opciones: personas.lista.filter((p) => !avDe.has(p.id)).map((p) => [p.id, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]) }],
    alGuardar: async (v) => { if (v.persona) await marcar(v.persona); },
  }) });

  return el('div', { class: 'cap-caja cap-quienes' },
    el('div', { class: 'cap-quienes-cabecera' }, el('h2', {}, 'Quién lo ha visto'), ctx.puede('capacitaciones', 'editar') || puedeEval ? agregar : null),
    ids.length
      ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Estado', 'Visto', 'Nota', ''].map((t) => el('th', {}, t)))), el('tbody', {}, filas)))
      : el('p', { class: 'texto-suave' }, 'Nadie lo ha visto todavía y no está en ninguna ruta.'));
}
