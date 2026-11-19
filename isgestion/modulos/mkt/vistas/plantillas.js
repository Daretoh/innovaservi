// Marketing → Plantillas de WhatsApp (Marketing 009): las que la empresa usa para escribirle primero a un cliente o
// después de 24 horas (hora confirmada, recordatorio, premio de la tarjeta, promociones). Se escriben con datos con
// nombre ({nombre}, {fecha}…), se ven como quedarán y se mandan a aprobación de Meta (permiso aprobar). "Actualizar
// estados" trae de Meta si quedaron aprobadas o rechazadas (con el motivo). Las aprobadas se usan desde la bandeja.
import { el } from '../../../core/ui/dom.js?v=92e612c';
import { icono } from '../../../core/ui/iconos.js?v=92e612c';
import { boton } from '../../../core/ui/tabla.js?v=92e612c';
import { avisar } from '../../../core/ui/aviso.js?v=92e612c';
import { abrirFormulario } from '../../../core/ui/modal.js?v=92e612c';
import { cargarCss } from '../datos.js?v=92e612c';
import { DATOS, USOS, nombreUso, CATEGORIAS, ESTADOS, SUGERIDAS, aMeta, deMeta, armar, nombreMeta } from '../plantillas-wa.js?v=92e612c';

export default async function vista(ctx) {
  cargarCss();
  const eid = ctx.empresa.id;
  const editar = ctx.puede('mkt', 'editar');
  const aprobar = ctx.puede('mkt', 'aprobar');
  const eliminar = ctx.puede('mkt', 'eliminar');
  const { data, error } = await ctx.api.from('mkt_wa_plantillas').select('*').eq('empresa_id', eid).is('deleted_at', null).order('created_at');
  if (error) throw error;
  const nombres = new Set(data.map((t) => t.nombre));
  const empresa = ctx.empresa.nombre_fantasia || ctx.empresa.razon_social || '';
  const funcion = async (body, ok) => {
    const { data: r, error: e } = await ctx.api.functions.invoke('mkt-wa-plantillas', { body });
    if (e) { let j = null; try { j = await e.context?.json?.(); } catch { /* sin cuerpo */ } throw new Error(j?.error || e.message); }
    if (ok) avisar(typeof ok === 'function' ? ok(r) : ok);
    return r;
  };

  const ayudaDatos = `Datos que puedes usar: ${Object.keys(DATOS).map((k) => `{${k}}`).join(' ')}. Meta no deja un dato al principio ni al final del texto.`;
  const formPlantilla = (t = null, base = null) => abrirFormulario({
    titulo: t ? 'Editar plantilla' : 'Nueva plantilla', textoGuardar: 'Guardar borrador',
    mensaje: 'La plantilla queda como borrador. Después la mandas a Meta para que la apruebe (minutos u horas).',
    campos: [
      { id: 'uso', etiqueta: 'Para qué es', opciones: USOS, valor: t?.uso ?? base?.uso ?? 'hora_confirmada' },
      { id: 'categoria', etiqueta: 'Categoría en Meta', opciones: CATEGORIAS, valor: t?.categoria ?? base?.categoria ?? 'UTILITY',
        ayuda: 'Utilidad: avisos ligados a una atención (confirmación, recordatorio). Marketing: promociones. Meta puede cambiarla si no calza.' },
      { id: 'texto', etiqueta: 'Mensaje', tipo: 'textarea', filas: 5, requerido: true, valor: t ? deMeta(t.cuerpo, t.variables) : base?.texto ?? '', ayuda: ayudaDatos },
    ],
    alGuardar: async (v) => {
      const { cuerpo, variables, ejemplos } = aMeta(v.texto);
      if (/^\{\{\d+\}\}/.test(cuerpo) || /\{\{\d+\}\}[.!?\s]*$/.test(cuerpo)) throw new Error('Meta no acepta un dato al principio ni al final del mensaje: agrega texto antes o después.');
      const datos = { uso: v.uso, categoria: v.categoria, cuerpo, variables, ejemplos };
      const q = t ? ctx.api.from('mkt_wa_plantillas').update(datos).eq('id', t.id)
        : ctx.api.from('mkt_wa_plantillas').insert({ ...datos, empresa_id: eid, nombre: nombreMeta(v.uso, nombres), idioma: 'es' });
      const { error: e } = await q;
      if (e) throw new Error(e.message);
      avisar('Plantilla guardada como borrador.'); ctx.refrescar();
    },
  });
  const cargarSugeridas = async () => {
    const filas = SUGERIDAS.filter((s) => !data.some((t) => t.uso === s.uso)).map((s) => {
      const m = aMeta(s.texto);
      const nombre = nombreMeta(s.uso, nombres); nombres.add(nombre);
      return { empresa_id: eid, nombre, idioma: 'es', uso: s.uso, categoria: s.categoria, ...m };
    });
    if (!filas.length) { avisar('Las sugeridas ya están cargadas.'); return; }
    const { error: e } = await ctx.api.from('mkt_wa_plantillas').insert(filas);
    if (e) { avisar(e.message, 'error'); return; }
    avisar(`${filas.length} plantillas sugeridas cargadas como borrador: revísalas y mándalas a Meta.`); ctx.refrescar();
  };
  const mandar = (t) => abrirFormulario({ titulo: 'Mandar a aprobación de Meta', textoGuardar: 'Mandar', campos: [],
    mensaje: `Meta revisa la plantilla "${nombreUso[t.uso] ?? t.nombre}" y la aprueba o rechaza, normalmente en minutos. Una vez mandada ya no se edita: para cambiarla se crea otra.`,
    alGuardar: async () => { await funcion({ accion: 'enviar', plantilla_id: t.id }, (r) => (r.estado === 'aprobada' ? 'Meta aprobó la plantilla.' : 'Plantilla en revisión de Meta.')); ctx.refrescar(); } });
  const quitar = (t) => abrirFormulario({ titulo: 'Eliminar plantilla', textoGuardar: 'Eliminar', campos: [],
    mensaje: 'Se quita de ISgestión. Si ya estaba en Meta, allá sigue existiendo (se puede borrar en WhatsApp Manager).',
    alGuardar: async () => { const { error: e } = await ctx.api.from('mkt_wa_plantillas').update({ deleted_at: new Date().toISOString() }).eq('id', t.id); if (e) throw new Error(e.message); avisar('Plantilla eliminada.'); ctx.refrescar(); } });
  const sincronizar = async (btn) => {
    btn.disabled = true;
    try { await funcion({ accion: 'sincronizar', empresa_id: eid }, (r) => `Estados al día (${r.revisadas} revisadas).`); ctx.refrescar(); } catch (e) { avisar(e.message, 'error'); btn.disabled = false; }
  };

  const tarjeta = (t) => {
    const [txtEstado, chip] = ESTADOS[t.estado] ?? [t.estado, 'chip-pend'];
    const ejemplos = t.variables.map((k, i) => t.ejemplos[i] || DATOS[k]?.ejemplo || '');
    const editable = editar && ['borrador', 'rechazada'].includes(t.estado);
    return el('article', { class: 'mkt-pl' },
      el('header', { class: 'mkt-pl-cab' },
        el('div', {}, el('strong', {}, nombreUso[t.uso] ?? t.uso), el('small', { class: 'texto-suave' }, ` · ${t.nombre}`)),
        el('span', { class: `chip ${chip}` }, txtEstado)),
      el('div', { class: 'mkt-pl-vista' }, el('div', { class: 'mkt-wa-burbuja mkt-pl-burbuja' }, el('span', { class: 'mkt-wa-texto' }, armar(t.cuerpo, ejemplos.map((e) => e.replace('IS Performance', empresa || e)))))),
      el('div', { class: 'mkt-pl-pie' },
        el('span', { class: 'chip' }, t.categoria === 'MARKETING' ? 'Marketing' : 'Utilidad'),
        t.variables.length ? el('span', { class: 'texto-suave texto-chico' }, `Datos: ${t.variables.map((k) => DATOS[k]?.etiqueta ?? k).join(', ')}`) : null),
      t.estado === 'rechazada' && t.motivo ? el('p', { class: 'mkt-wa-error texto-chico' }, icono('alerta', { tam: 13 }), ` Meta la rechazó: ${t.motivo}. Corrígela y mándala de nuevo.`) : null,
      el('div', { class: 'listado-acciones' },
        editable ? boton('Editar', { icono: 'editar', class: 'boton boton-secundario boton-chico', onclick: () => formPlantilla(t) }) : null,
        aprobar && ['borrador', 'rechazada'].includes(t.estado) ? boton('Mandar a Meta', { icono: 'derecha', tipo: 'primario', class: 'boton boton-primario boton-chico', onclick: () => mandar(t) }) : null,
        eliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar', onclick: () => quitar(t) }, icono('basura', { tam: 16 })) : null));
  };

  const btnSync = boton('Actualizar estados', { icono: 'circulo', onclick: (ev) => sincronizar(ev.currentTarget) });
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Plantillas de WhatsApp'),
      el('div', { class: 'listado-acciones' },
        data.some((t) => t.estado !== 'borrador') ? btnSync : null,
        editar ? boton('Nueva plantilla', { icono: 'mas', tipo: 'primario', onclick: () => formPlantilla() }) : null)),
    el('p', { class: 'texto-suave texto-chico mkt-pl-ayuda' },
      'WhatsApp solo deja escribirle primero a un cliente, o después de 24 horas desde su último mensaje, con una plantilla aprobada por Meta. ',
      'Cada envío de plantilla tiene un costo pequeño (utilidad es más barata que marketing). Responder dentro de las 24 horas es gratis y no necesita plantilla.'),
    data.length ? el('div', { class: 'mkt-pl-lista' }, data.map(tarjeta))
      : el('div', { class: 'ficha' }, el('p', {}, 'Todavía no hay plantillas.'),
        editar ? boton(`Cargar ${SUGERIDAS.length} sugeridas para el taller`, { icono: 'mas', tipo: 'primario', onclick: cargarSugeridas }) : null),
    data.length && editar && SUGERIDAS.some((s) => !data.some((t) => t.uso === s.uso)) ? el('p', {}, boton('Cargar las sugeridas que faltan', { icono: 'mas', onclick: cargarSugeridas })) : null);
}
