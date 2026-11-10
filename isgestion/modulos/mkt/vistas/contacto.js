// Ficha del contacto: etapa (se cambia con un clic), datos, actividad (lo que se habló, cambios de etapa) y acciones:
// escribir por WhatsApp con una respuesta guardada (abre WhatsApp y queda en la actividad), registrar actividad,
// crear tarea de seguimiento, vincular o crear el cliente en Clientes y proveedores, editar y eliminar. ?id=
import { el } from '../../../core/ui/dom.js?v=c16a35c';
import { icono } from '../../../core/ui/iconos.js?v=c16a35c';
import { boton } from '../../../core/ui/tabla.js?v=c16a35c';
import { avisar } from '../../../core/ui/aviso.js?v=c16a35c';
import { abrirFormulario } from '../../../core/ui/modal.js?v=c16a35c';
import { dinero, fechaLarga, fechaCorta, diaLocal, hhmm } from '../../../core/ui/formato.js?v=c16a35c';
import { cargarBase, cargarCss, nombreOrigen, nombreEvento, enlaceWhatsapp, diasHasta, MOTIVOS, opcionesUsuarios } from '../datos.js?v=c16a35c';
import { formContacto, formActividad } from '../formularios.js?v=c16a35c';

export default async function vista(ctx) {
  cargarCss();
  const id = ctx.params?.id;
  const [base, rc, rv, rr] = await Promise.all([cargarBase(ctx),
    ctx.api.from('mkt_contactos').select('*').eq('id', id).eq('empresa_id', ctx.empresa.id).maybeSingle(),
    ctx.api.from('mkt_eventos').select('*').eq('contacto_id', id).order('created_at', { ascending: false }).limit(300),
    ctx.api.from('mkt_respuestas').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('orden').order('titulo')]);
  if (rc.error) throw rc.error;
  const c = rc.data;
  if (!c || c.deleted_at) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Contacto'), el('p', { class: 'texto-suave' }, 'El contacto no existe o fue eliminado.'),
      el('a', { class: 'boton boton-secundario', href: ctx.ruta('mkt.embudo') }, 'Volver al embudo'));
  }
  const eventos = rv.data ?? [];
  const respuestas = rr.data ?? [];
  const tercero = c.tercero_id ? (await ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('id', c.tercero_id).maybeSingle()).data : null;
  const campana = base.campanas.find((x) => x.id === c.campana_id);
  const etapa = base.etapas.find((x) => x.id === c.etapa_id);
  const nombreEtapa = new Map(base.etapas.map((x) => [x.id, x.nombre]));
  const editar = ctx.puede('mkt', 'editar');
  const crear = ctx.puede('mkt', 'crear');

  // Cambiar de etapa con un clic (perdida pide el motivo)
  const cambiarEtapa = async (et) => {
    if (et.id === c.etapa_id) return;
    const guardar = async (extra = {}) => {
      const { error } = await ctx.api.from('mkt_contactos').update({ etapa_id: et.id, ...extra }).eq('id', c.id);
      if (error) throw new Error(error.message);
      avisar(`Pasó a ${et.nombre}.`);
      ctx.refrescar();
    };
    if (et.tipo !== 'perdida') { guardar().catch((e) => avisar(e.message, 'error')); return; }
    abrirFormulario({ titulo: `Pasar a ${et.nombre}`, mensaje: c.nombre, textoGuardar: 'Guardar',
      campos: [{ id: 'motivo', etiqueta: 'Por qué se perdió', valor: c.motivo_perdida ?? '', sugerencias: MOTIVOS }],
      alGuardar: (v) => guardar({ motivo_perdida: v.motivo.trim() || null }) });
  };
  const etapas = el('div', { class: 'mkt-etapas', role: 'group', 'aria-label': 'Etapa' }, base.etapas.map((et) =>
    el('button', { type: 'button', class: `mkt-etapa mkt-etapa-${et.tipo}`, 'aria-pressed': String(et.id === c.etapa_id), disabled: !editar, onclick: () => cambiarEtapa(et) }, et.nombre)));

  // WhatsApp con respuesta guardada: queda registrado en la actividad
  const whatsapp = () => {
    const llenar = (t) => String(t ?? '').replaceAll('{nombre}', c.nombre.split(' ')[0]).replaceAll('{empresa}', ctx.empresa.nombre_fantasia ?? ctx.empresa.razon_social ?? '');
    abrirFormulario({
      titulo: 'Escribir por WhatsApp', mensaje: `${c.nombre} · ${c.telefono}`, textoGuardar: 'Abrir WhatsApp',
      campos: [
        respuestas.length ? { id: 'respuesta', etiqueta: 'Respuesta guardada', opciones: [['', 'Escribir un mensaje nuevo'], ...respuestas.map((r) => [r.id, r.titulo])], valor: '',
          alCambiar: ({ valor, poner }) => poner('texto', llenar(respuestas.find((r) => r.id === valor)?.texto ?? '')) } : null,
        { id: 'texto', etiqueta: 'Mensaje', tipo: 'textarea', filas: 6, requerido: true, valor: '' },
      ].filter(Boolean),
      alGuardar: async (v) => {
        const url = enlaceWhatsapp(c.telefono, v.texto.trim());
        window.open(url, '_blank', 'noopener');
        if (crear) await ctx.api.from('mkt_eventos').insert({ empresa_id: ctx.empresa.id, contacto_id: c.id, tipo: 'whatsapp', texto: v.texto.trim() });
        ctx.refrescar();
      },
    });
  };

  // Tarea de seguimiento en Tareas
  const tarea = () => abrirFormulario({
    titulo: 'Tarea de seguimiento', textoGuardar: 'Crear tarea',
    campos: [
      { id: 'titulo', etiqueta: 'Tarea', requerido: true, valor: `Contactar a ${c.nombre}` },
      { id: 'fecha', etiqueta: 'Vence', tipo: 'date', valor: c.proximo_contacto ?? '' },
      { id: 'responsable', etiqueta: 'Responsable', opciones: opcionesUsuarios(base.usuarios), valor: c.responsable_id ?? ctx.usuario.id },
      { id: 'detalle', etiqueta: 'Detalle', tipo: 'textarea', valor: [c.interes ? `Le interesa: ${c.interes}` : null, c.telefono ? `Teléfono: ${c.telefono}` : null, 'Contacto en Marketing → Embudo.'].filter(Boolean).join('\n') },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('tar_tareas').insert({ empresa_id: ctx.empresa.id, titulo: v.titulo.trim(), detalle: v.detalle.trim() || null,
        fecha: v.fecha || null, responsable_id: v.responsable || null, prioridad: 'media' });
      if (error) throw new Error(error.message);
      if (crear) await ctx.api.from('mkt_eventos').insert({ empresa_id: ctx.empresa.id, contacto_id: c.id, tipo: 'nota', texto: `Tarea creada: ${v.titulo.trim()}` });
      avisar('Tarea creada en Tareas.');
      ctx.refrescar();
    },
  });

  // Cliente: vincular uno existente (sugiere los del mismo teléfono o correo) o crearlo con los datos del contacto
  const cliente = async () => {
    const { data: ts, error } = await ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, telefono, email').eq('empresa_id', ctx.empresa.id)
      .is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social').limit(3000);
    if (error) { avisar(error.message, 'error'); return; }
    const dig = (t) => String(t ?? '').replace(/\D/g, '').slice(-8);
    const parecidos = ts.filter((t) => (c.telefono && dig(t.telefono) && dig(t.telefono) === dig(c.telefono)) || (c.correo && t.email && t.email.toLowerCase() === c.correo.toLowerCase()));
    const nombreT = (t) => t.nombre_fantasia ? `${t.razon_social} (${t.nombre_fantasia})` : t.razon_social;
    const puedeCrear = ctx.puede('terceros', 'crear');
    abrirFormulario({
      titulo: 'Cliente', textoGuardar: 'Guardar',
      mensaje: parecidos.length ? `Hay ${parecidos.length === 1 ? 'un cliente' : `${parecidos.length} clientes`} con el mismo teléfono o correo.` : 'Vincula el contacto a un cliente de Clientes y proveedores.',
      campos: [{ id: 'tercero', etiqueta: 'Cliente', requerido: true, valor: parecidos[0]?.id ?? (puedeCrear ? 'nuevo' : ''),
        opciones: [...(puedeCrear ? [['nuevo', `Crear cliente nuevo: ${c.organizacion || c.nombre}`]] : [['', 'Elegir…']]),
          ...parecidos.map((t) => [t.id, `${nombreT(t)} · mismo contacto`]), ...ts.filter((t) => !parecidos.includes(t)).map((t) => [t.id, nombreT(t)])] }],
      alGuardar: async (v) => {
        let tid = v.tercero;
        if (tid === 'nuevo') {
          const r = await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, razon_social: c.organizacion || c.nombre, contacto: c.organizacion ? c.nombre : null,
            email: c.correo, telefono: c.telefono, tipo: ['cliente'] }).select('id').single();
          if (r.error) throw new Error(r.error.message);
          tid = r.data.id;
        }
        const ganada = base.etapas.find((x) => x.tipo === 'ganada');
        const { error: e2 } = await ctx.api.from('mkt_contactos').update({ tercero_id: tid, ...(ganada && etapa?.tipo !== 'ganada' ? { etapa_id: ganada.id } : {}) }).eq('id', c.id);
        if (e2) throw new Error(e2.message);
        avisar(ganada && etapa?.tipo !== 'ganada' ? `Vinculado al cliente y pasó a ${ganada.nombre}.` : 'Vinculado al cliente.');
        ctx.refrescar();
      },
    });
  };

  const eliminar = () => abrirFormulario({
    titulo: 'Eliminar contacto', mensaje: `Se elimina ${c.nombre} del embudo. Su actividad queda en la auditoría.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('mkt_contactos').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw new Error(error.message);
      avisar('Contacto eliminado.');
      location.hash = ctx.ruta('mkt.embudo');
    },
  });

  const prox = c.proximo_contacto ? diasHasta(c.proximo_contacto) : null;
  const dato = (etiqueta, valor) => (valor == null || valor === '' ? null : el('div', { class: 'mkt-dato' }, el('span', { class: 'texto-suave texto-chico' }, etiqueta), el('span', {}, valor)));
  const enlace = (href, t) => el('a', { href, target: '_blank', rel: 'noopener' }, t);
  const datos = el('div', { class: 'ficha mkt-datos' },
    dato('Teléfono', c.telefono ? enlace(enlaceWhatsapp(c.telefono), c.telefono) : null),
    dato('Instagram', c.instagram ? enlace(`https://instagram.com/${encodeURIComponent(c.instagram)}`, `@${c.instagram}`) : null),
    dato('Correo', c.correo ? enlace(`mailto:${c.correo}`, c.correo) : null),
    dato('Empresa', c.organizacion),
    dato('Le interesa', c.interes),
    dato('Cómo llegó', nombreOrigen[c.origen]),
    dato('Campaña', campana?.nombre),
    dato('Responsable', base.nombreUsuario.get(c.responsable_id) ?? 'Sin asignar'),
    dato('Valor estimado', c.valor_estimado ? dinero(c.valor_estimado) : null),
    dato('Próximo contacto', c.proximo_contacto ? el('span', { class: prox < 0 ? 'texto-error' : '' }, fechaLarga(c.proximo_contacto), prox < 0 ? ' (atrasado)' : prox === 0 ? ' (hoy)' : '') : null),
    dato('Último contacto', c.ultimo_contacto_at ? fechaLarga(diaLocal(c.ultimo_contacto_at)) : 'Sin registrar'),
    dato('Promociones', c.consentimiento ? `Aceptó${c.consentimiento_at ? ` el ${fechaLarga(diaLocal(c.consentimiento_at))}` : ''}${c.consentimiento_medio ? ` (${c.consentimiento_medio})` : ''}` : 'No ha aceptado'),
    dato('Cliente', tercero ? tercero.razon_social : null),
    dato('Motivo de pérdida', etapa?.tipo === 'perdida' ? c.motivo_perdida || 'Sin motivo' : null),
    dato('Creado', fechaLarga(diaLocal(c.created_at))),
    c.notas ? el('div', { class: 'mkt-dato mkt-dato-ancho' }, el('span', { class: 'texto-suave texto-chico' }, 'Notas'), el('span', { class: 'mkt-notas' }, c.notas)) : null);

  const evento = (e) => el('li', { class: `mkt-evento mkt-evento-${e.tipo}` },
    el('span', { class: 'mkt-evento-icono' }, icono({ etapa: 'derecha', cliente: 'briefcase', whatsapp: 'chat', instagram: 'chat', llamada: 'reloj', correo: 'correo', reunion: 'users' }[e.tipo] ?? 'lista', { tam: 14 })),
    el('div', {},
      el('div', { class: 'texto-chico texto-suave' }, `${fechaCorta(diaLocal(e.created_at))} ${hhmm(new Date(e.created_at).toTimeString())} · ${nombreEvento[e.tipo] ?? e.tipo}${e.created_by ? ` · ${base.nombreUsuario.get(e.created_by) ?? ''}` : ''}`),
      e.tipo === 'etapa' ? el('div', {}, e.etapa_antes ? `${nombreEtapa.get(e.etapa_antes) ?? 'Etapa eliminada'} → ` : '', el('strong', {}, nombreEtapa.get(e.etapa_despues) ?? (e.texto ?? 'Sin etapa')), e.etapa_antes ? null : e.texto && e.etapa_despues ? ` · ${e.texto}` : null)
        : el('div', { class: 'mkt-notas' }, e.texto ?? '')));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('a', { class: 'volver', href: ctx.ruta('mkt.embudo') }, icono('volver', { tam: 16 }), 'Embudo'), el('h1', {}, c.nombre)),
      el('div', { class: 'listado-acciones' },
        c.telefono ? boton('WhatsApp', { icono: 'chat', tipo: 'primario', onclick: whatsapp }) : null,
        crear ? boton('Registrar actividad', { icono: 'mas', onclick: () => formActividad(ctx, c, { alGuardar: () => ctx.refrescar() }) }) : null,
        ctx.puede('tareas', 'crear') ? boton('Tarea', { icono: 'check', onclick: tarea }) : null,
        editar && ctx.puede('terceros', 'ver') ? boton(tercero ? 'Cambiar cliente' : 'Cliente', { icono: 'briefcase', onclick: cliente }) : null,
        editar ? boton('Editar', { icono: 'editar', onclick: () => formContacto(ctx, base, c, { alGuardar: () => ctx.refrescar() }) }) : null,
        ctx.puede('mkt', 'eliminar') ? boton('Eliminar', { icono: 'basura', onclick: eliminar }) : null)),
    etapas,
    el('div', { class: 'mkt-ficha' },
      datos,
      el('div', { class: 'ficha mkt-actividad' }, el('h2', {}, 'Actividad'),
        eventos.length ? el('ul', { class: 'mkt-eventos' }, eventos.map(evento)) : el('p', { class: 'texto-suave' }, 'Sin actividad registrada.'))));
}
