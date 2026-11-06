// Ajustes de Marketing: etapas del embudo (nombre, tipo y orden) y respuestas guardadas para WhatsApp e Instagram.
// En las respuestas, {nombre} se cambia por el nombre del contacto y {empresa} por el de la empresa.
import { el } from '../../../core/ui/dom.js?v=12d5283';
import { icono } from '../../../core/ui/iconos.js?v=12d5283';
import { boton } from '../../../core/ui/tabla.js?v=12d5283';
import { avisar } from '../../../core/ui/aviso.js?v=12d5283';
import { abrirFormulario } from '../../../core/ui/modal.js?v=12d5283';
import { cargarBase, cargarCss, TIPOS_ETAPA } from '../datos.js?v=12d5283';
import { cargarFormulario, tarjetaFormulario } from '../formulario-web.js?v=12d5283';

const EJEMPLOS = [
  ['Saludo', 'Hola {nombre}, gracias por escribir a {empresa}. ¿En qué te podemos ayudar?'],
  ['Horario y ubicación', 'Hola {nombre}, atendemos de lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 13:00. Te esperamos.'],
  ['Pedir datos para cotizar', 'Hola {nombre}, para cotizarte necesito la marca, modelo y año del vehículo, y qué servicio te interesa.'],
  ['Seguimiento', 'Hola {nombre}, ¿pudiste revisar la cotización que te enviamos? Quedo atento a cualquier duda.'],
];

export default async function vista(ctx) {
  cargarCss();
  const [base, formWeb] = await Promise.all([cargarBase(ctx), cargarFormulario(ctx)]);
  const { data: respuestas, error } = await ctx.api.from('mkt_respuestas').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('orden').order('titulo');
  if (error) throw error;
  const crear = ctx.puede('mkt', 'crear');
  const editar = ctx.puede('mkt', 'editar');
  const eliminar = ctx.puede('mkt', 'eliminar');
  const nombreTipo = Object.fromEntries(TIPOS_ETAPA);
  const guardar = async (q, ok) => { const { error: e } = await q; if (e) throw new Error(e.message); avisar(ok); ctx.refrescar(); };

  // ---- Etapas
  const formEtapa = (et = null) => abrirFormulario({
    titulo: et ? 'Editar etapa' : 'Nueva etapa', textoGuardar: 'Guardar',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: et?.nombre },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ETAPA, valor: et?.tipo ?? 'abierta', ayuda: 'Ganada cuenta como cliente en los indicadores; perdida pide el motivo.' }],
    alGuardar: (v) => guardar(et ? ctx.api.from('mkt_etapas').update({ nombre: v.nombre.trim(), tipo: v.tipo }).eq('id', et.id)
      : ctx.api.from('mkt_etapas').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), tipo: v.tipo, orden: (base.etapas.at(-1)?.orden ?? 0) + 1 }), 'Etapa guardada.'),
  });
  const mover = async (i, d) => {
    const a = base.etapas[i]; const b = base.etapas[i + d];
    if (!a || !b) return;
    const r = await Promise.all([ctx.api.from('mkt_etapas').update({ orden: b.orden === a.orden ? a.orden + d : b.orden }).eq('id', a.id),
      ctx.api.from('mkt_etapas').update({ orden: a.orden }).eq('id', b.id)]);
    const e = r.find((x) => x.error);
    if (e) avisar(e.error.message, 'error'); else ctx.refrescar();
  };
  const quitarEtapa = async (et) => {
    const { count } = await ctx.api.from('mkt_contactos').select('id', { count: 'exact', head: true }).eq('etapa_id', et.id).is('deleted_at', null);
    if (count) { avisar(`La etapa tiene ${count} contacto${count === 1 ? '' : 's'}: muévelos a otra antes de eliminarla.`, 'error'); return; }
    if (base.etapas.length <= 2) { avisar('El embudo necesita al menos dos etapas.', 'error'); return; }
    abrirFormulario({ titulo: 'Eliminar etapa', mensaje: `Se elimina la etapa ${et.nombre}.`, campos: [], textoGuardar: 'Eliminar',
      alGuardar: () => guardar(ctx.api.from('mkt_etapas').update({ deleted_at: new Date().toISOString() }).eq('id', et.id), 'Etapa eliminada.') });
  };
  const etapas = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Etapas del embudo'), editar ? boton('Agregar etapa', { icono: 'mas', onclick: () => formEtapa() }) : null),
    el('p', { class: 'texto-suave texto-chico' }, 'La primera etapa es donde entran los contactos nuevos (y donde se cuentan los "sin atender").'),
    el('ol', { class: 'mkt-ajustes-lista' }, base.etapas.map((et, i) => el('li', {},
      el('span', {}, el('strong', {}, et.nombre), el('span', { class: 'texto-suave texto-chico' }, ` · ${nombreTipo[et.tipo]}`)),
      editar ? el('span', { class: 'listado-acciones' },
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Subir', title: 'Subir', disabled: i === 0, onclick: () => mover(i, -1) }, icono('arriba', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Bajar', title: 'Bajar', disabled: i === base.etapas.length - 1, onclick: () => mover(i, 1) }, icono('abajo', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Editar', title: 'Editar', onclick: () => formEtapa(et) }, icono('editar', { tam: 16 })),
        eliminar ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Eliminar', title: 'Eliminar', onclick: () => quitarEtapa(et) }, icono('basura', { tam: 16 })) : null) : null))));

  // ---- Respuestas guardadas
  const formRespuesta = (r = null) => abrirFormulario({
    titulo: r ? 'Editar respuesta' : 'Nueva respuesta', textoGuardar: 'Guardar',
    campos: [{ id: 'titulo', etiqueta: 'Nombre corto', requerido: true, valor: r?.titulo },
      { id: 'texto', etiqueta: 'Mensaje', tipo: 'textarea', filas: 6, requerido: true, valor: r?.texto, ayuda: '{nombre} = nombre del contacto · {empresa} = nombre de la empresa' }],
    alGuardar: (v) => guardar(r ? ctx.api.from('mkt_respuestas').update({ titulo: v.titulo.trim(), texto: v.texto.trim() }).eq('id', r.id)
      : ctx.api.from('mkt_respuestas').insert({ empresa_id: ctx.empresa.id, titulo: v.titulo.trim(), texto: v.texto.trim(), orden: respuestas.length + 1 }), 'Respuesta guardada.'),
  });
  const cargarEjemplos = () => guardar(ctx.api.from('mkt_respuestas').insert(EJEMPLOS.map(([titulo, texto], i) => ({ empresa_id: ctx.empresa.id, titulo, texto, orden: i + 1 }))),
    'Ejemplos cargados: ajústalos a la empresa.');
  const copiar = async (r) => { try { await navigator.clipboard.writeText(r.texto); avisar('Copiado.'); } catch { avisar('No se pudo copiar.', 'error'); } };
  const resp = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Respuestas guardadas'), crear ? boton('Nueva respuesta', { icono: 'mas', onclick: () => formRespuesta() }) : null),
    el('p', { class: 'texto-suave texto-chico' }, 'Se usan desde la ficha del contacto (botón WhatsApp) o se copian para Instagram. Más adelante serán la base del bot de preguntas frecuentes.'),
    respuestas.length ? el('ul', { class: 'mkt-ajustes-lista' }, respuestas.map((r) => el('li', {},
      el('span', { class: 'mkt-respuesta' }, el('strong', {}, r.titulo), el('span', { class: 'texto-suave texto-chico mkt-notas' }, r.texto)),
      el('span', { class: 'listado-acciones' },
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Copiar', title: 'Copiar', onclick: () => copiar(r) }, icono('copiar', { tam: 16 })),
        editar ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Editar', title: 'Editar', onclick: () => formRespuesta(r) }, icono('editar', { tam: 16 })) : null,
        eliminar ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Eliminar', title: 'Eliminar', onclick: () => abrirFormulario({ titulo: 'Eliminar respuesta', mensaje: r.titulo, campos: [], textoGuardar: 'Eliminar',
          alGuardar: () => guardar(ctx.api.from('mkt_respuestas').update({ deleted_at: new Date().toISOString() }).eq('id', r.id), 'Respuesta eliminada.') }) }, icono('basura', { tam: 16 })) : null))))
      : el('div', {}, el('p', { class: 'texto-suave' }, 'Todavía no hay respuestas guardadas.'), crear ? boton('Cargar 4 ejemplos', { icono: 'mas', onclick: cargarEjemplos }) : null));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Ajustes de marketing')),
    el('div', { class: 'mkt-ajustes' }, tarjetaFormulario(ctx, formWeb), etapas, resp));
}
