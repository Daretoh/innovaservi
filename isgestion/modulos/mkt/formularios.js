// Formularios de Marketing: contacto, actividad, campaña y publicación. base = cargarBase(ctx).
import { abrirFormulario } from '../../core/ui/modal.js?v=37c9450';
import { avisar } from '../../core/ui/aviso.js?v=37c9450';
import { hoyISO, telefono, campoTelefono } from '../../core/ui/formato.js?v=37c9450';
import { ORIGENES, CANALES, ESTADOS_CAMPANA, REDES, FORMATOS, ESTADOS_PUB, TIPOS_EVENTO, opcionesUsuarios, opcionesCampanas, codigoDesde } from './datos.js?v=37c9450';

const texto = (v) => (String(v ?? '').trim() || null);
const numero = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(String(v).replace(/[^\d-]/g, '')) || 0)));

// inicial: datos para llenar un contacto nuevo (ej.: desde un cliente: nombre, teléfono, correo, organizacion, origen, tercero_id)
export function formContacto(ctx, base, c = null, { etapa = null, inicial = null, alGuardar } = {}) {
  const d = c ?? inicial ?? {};
  const abierta = base.etapas.find((x) => x.tipo === 'abierta');
  abrirFormulario({
    titulo: c ? 'Editar contacto' : 'Nuevo contacto',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: d.nombre },
      campoTelefono('telefono', 'Teléfono (WhatsApp)', d.telefono),
      { id: 'instagram', etiqueta: 'Instagram', valor: c?.instagram, ayuda: 'Usuario sin @' },
      { id: 'correo', etiqueta: 'Correo', tipo: 'email', valor: d.correo },
      { id: 'organizacion', etiqueta: 'Empresa del contacto (si es cliente de empresa)', valor: d.organizacion },
      { id: 'interes', etiqueta: 'Qué le interesa', valor: c?.interes, ayuda: 'Servicio o producto, ej.: cerámico, pulido, limpieza de estanque' },
      { id: 'origen', etiqueta: 'Cómo llegó', opciones: ORIGENES, valor: d.origen ?? 'whatsapp' },
      { id: 'campana', etiqueta: 'Campaña', opciones: opcionesCampanas(base.campanas.filter((x) => x.estado !== 'terminada' || x.id === c?.campana_id)), valor: c?.campana_id ?? '' },
      { id: 'etapa', etiqueta: 'Etapa', opciones: base.etapas.map((x) => [x.id, x.nombre]), valor: c?.etapa_id ?? etapa ?? abierta?.id },
      { id: 'responsable', etiqueta: 'Responsable', opciones: opcionesUsuarios(base.usuarios), valor: c?.responsable_id ?? ctx.usuario.id },
      { id: 'valor', etiqueta: 'Valor estimado ($)', tipo: 'number', valor: c?.valor_estimado ?? '' },
      { id: 'proximo', etiqueta: 'Próximo contacto', tipo: 'date', valor: c?.proximo_contacto ?? '' },
      { id: 'consentimiento', etiqueta: 'Mensajes de promociones', opciones: [['no', 'No ha aceptado'], ['si', 'Aceptó recibir promociones']], valor: c?.consentimiento ? 'si' : 'no',
        ayuda: 'Solo a quien aceptó se le pueden enviar campañas por WhatsApp (reglas de Meta y ley de datos personales).' },
      { id: 'medio', etiqueta: 'Cómo lo aceptó', valor: c?.consentimiento_medio, ayuda: 'Ej.: lo pidió por WhatsApp, formulario, en el local' },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: c?.notas },
    ],
    textoGuardar: c ? 'Guardar' : 'Crear contacto',
    alGuardar: async (v) => {
      const datos = {
        nombre: v.nombre.trim(), telefono: telefono(v.telefono), instagram: texto(v.instagram?.replace(/^@/, '')), correo: texto(v.correo),
        organizacion: texto(v.organizacion), interes: texto(v.interes), origen: v.origen, campana_id: v.campana || null, etapa_id: v.etapa || null,
        responsable_id: v.responsable || null, valor_estimado: numero(v.valor), proximo_contacto: v.proximo || null,
        consentimiento: v.consentimiento === 'si', consentimiento_medio: v.consentimiento === 'si' ? texto(v.medio) : null, notas: texto(v.notas),
      };
      if (!datos.telefono && !datos.instagram && !datos.correo) throw new Error('Anota al menos un teléfono, Instagram o correo para poder contactarlo.');
      const q = c ? ctx.api.from('mkt_contactos').update(datos).eq('id', c.id) : ctx.api.from('mkt_contactos').insert({ empresa_id: ctx.empresa.id, tercero_id: inicial?.tercero_id ?? null, ...datos });
      const { data, error } = await q.select('*').single();
      if (error) throw new Error(error.message);
      avisar(c ? 'Contacto guardado.' : 'Contacto creado.');
      alGuardar?.(data);
    },
  });
}

export function formActividad(ctx, contacto, { tipo = 'nota', textoInicial = '', alGuardar } = {}) {
  abrirFormulario({
    titulo: 'Registrar actividad',
    mensaje: contacto.nombre,
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_EVENTO, valor: tipo },
      { id: 'texto', etiqueta: 'Qué pasó', tipo: 'textarea', requerido: true, valor: textoInicial },
      { id: 'proximo', etiqueta: 'Próximo contacto (opcional)', tipo: 'date', valor: contacto.proximo_contacto ?? '' },
    ],
    textoGuardar: 'Registrar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('mkt_eventos').insert({ empresa_id: ctx.empresa.id, contacto_id: contacto.id, tipo: v.tipo, texto: v.texto.trim() });
      if (error) throw new Error(error.message);
      if ((v.proximo || null) !== (contacto.proximo_contacto ?? null) && ctx.puede('mkt', 'editar')) {
        const r = await ctx.api.from('mkt_contactos').update({ proximo_contacto: v.proximo || null }).eq('id', contacto.id);
        if (r.error) throw new Error(r.error.message);
      }
      avisar('Actividad registrada.');
      alGuardar?.();
    },
  });
}

export function formCampana(ctx, c = null, { alGuardar } = {}) {
  abrirFormulario({
    titulo: c ? 'Editar campaña' : 'Nueva campaña',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre },
      { id: 'objetivo', etiqueta: 'Objetivo', valor: c?.objetivo, ayuda: 'Ej.: 20 agendamientos de cerámico en noviembre' },
      { id: 'canal', etiqueta: 'Canal principal', opciones: CANALES, valor: c?.canal ?? 'instagram' },
      { id: 'estado', etiqueta: 'Estado', opciones: ESTADOS_CAMPANA, valor: c?.estado ?? 'planificada' },
      { id: 'inicio', etiqueta: 'Inicio', tipo: 'date', valor: c?.inicio ?? hoyISO() },
      { id: 'fin', etiqueta: 'Término', tipo: 'date', valor: c?.fin ?? '' },
      { id: 'presupuesto', etiqueta: 'Presupuesto ($)', tipo: 'number', valor: c?.presupuesto ?? '' },
      { id: 'gasto', etiqueta: 'Gasto real ($)', tipo: 'number', valor: c?.gasto ?? '', ayuda: 'Lo que se pagó en anuncios, diseño, etc. Sirve para el costo por contacto.' },
      { id: 'url', etiqueta: 'Página de destino (opcional)', tipo: 'url', valor: c?.url_destino, ayuda: 'Con un código, se arma el enlace con UTM para saber cuántos llegan desde la campaña.' },
      { id: 'codigo', etiqueta: 'Código para el enlace', valor: c?.codigo, ayuda: 'Minúsculas, números y guiones. Si lo dejas vacío, se arma con el nombre. Identifica la campaña en los enlaces (UTM y formulario web).' },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: c?.notas },
      // Formulario web propio de la campaña (su enlace y QR); vacío = el formulario general
      { id: 'form_titulo', etiqueta: 'Formulario de la campaña: texto (opcional)', valor: c?.form_titulo ?? '', ayuda: 'Ej.: "Participa en el sorteo de un lavado completo". Vacío = el texto del formulario general.' },
      { id: 'form_intereses', etiqueta: 'Formulario de la campaña: opciones (opcional)', tipo: 'lista', valor: c?.form_intereses ?? [], textoAgregar: 'Agregar opción', placeholder: 'Ej.: Quiero participar' },
      { id: 'form_condiciones', etiqueta: 'Formulario de la campaña: casilla obligatoria (opcional)', valor: c?.form_condiciones ?? '', ayuda: 'Ej.: "Acepto las bases del sorteo". Si la escribes, el cliente debe marcarla para enviar.' },
    ],
    textoGuardar: c ? 'Guardar' : 'Crear campaña',
    alGuardar: async (v) => {
      const url = texto(v.url);
      const codigo = texto(v.codigo) ? codigoDesde(v.codigo) : codigoDesde(v.nombre) || null;   // sirve para UTM y para el formulario web
      if (codigo && codigo.length < 2) throw new Error('El código es muy corto.');
      const datos = { nombre: v.nombre.trim(), objetivo: texto(v.objetivo), canal: v.canal, estado: v.estado, inicio: v.inicio || null, fin: v.fin || null,
        presupuesto: numero(v.presupuesto), gasto: numero(v.gasto), url_destino: url, codigo, notas: texto(v.notas),
        form_titulo: texto(v.form_titulo), form_intereses: (v.form_intereses ?? []).map((x) => x.slice(0, 60)), form_condiciones: texto(v.form_condiciones) };
      if (datos.inicio && datos.fin && datos.fin < datos.inicio) throw new Error('El término es anterior al inicio.');
      const q = c ? ctx.api.from('mkt_campanas').update(datos).eq('id', c.id) : ctx.api.from('mkt_campanas').insert({ empresa_id: ctx.empresa.id, ...datos });
      const { error } = await q;
      if (error) throw new Error(/mkt_campanas_codigo_uq/.test(error.message) ? 'Ya hay otra campaña con ese código.' : error.message);
      avisar(c ? 'Campaña guardada.' : 'Campaña creada.');
      alGuardar?.();
    },
  });
}

// Botón bajo el formulario: el primer clic pide confirmar, el segundo elimina (deleted_at) y cierra la ventana
function eliminarPublicacion(ctx, p, alGuardar) {
  let confirmar = false;
  return {
    texto: 'Eliminar esta publicación', icono: 'basura',
    alClic: async ({ estado }) => {
      if (!confirmar) { confirmar = true; estado('Toca de nuevo para eliminarla.', 'mal'); return; }
      const { error } = await ctx.api.from('mkt_publicaciones').update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
      if (error) { estado(error.message, 'mal'); return; }
      const d = document.querySelector('dialog[open]');
      d?.close(); d?.remove();
      avisar('Publicación eliminada.');
      alGuardar?.();
    },
  };
}

export function formPublicacion(ctx, base, p = null, { fecha = hoyISO(), alGuardar } = {}) {
  const aprobar = ctx.puede('mkt', 'aprobar');
  // Sin permiso de aprobar, solo los estados hasta "por aprobar" (o el que ya tiene)
  const estados = ESTADOS_PUB.filter(([k]) => aprobar || ['idea', 'diseno', 'por_aprobar'].includes(k) || k === p?.estado);
  abrirFormulario({
    titulo: p ? 'Editar publicación' : 'Nueva publicación',
    campos: [
      { id: 'titulo', etiqueta: 'Tema o título', requerido: true, valor: p?.titulo },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: p?.fecha ?? fecha },
      { id: 'hora', etiqueta: 'Hora (opcional)', tipo: 'time', valor: p?.hora?.slice(0, 5) ?? '' },
      { id: 'redes', etiqueta: 'Redes', tipo: 'checks', opciones: REDES, valor: p?.redes ?? ['instagram'] },
      { id: 'formato', etiqueta: 'Formato', opciones: FORMATOS, valor: p?.formato ?? 'post' },
      { id: 'estado', etiqueta: 'Estado', opciones: estados, valor: p?.estado ?? 'idea', ayuda: aprobar ? null : 'Aprobar la pieza la hace quien tiene el permiso de aprobar.' },
      { id: 'responsable', etiqueta: 'Responsable', opciones: opcionesUsuarios(base.usuarios), valor: p?.responsable_id ?? ctx.usuario.id },
      { id: 'campana', etiqueta: 'Campaña', opciones: opcionesCampanas(base.campanas), valor: p?.campana_id ?? '' },
      { id: 'texto', etiqueta: 'Texto de la publicación', tipo: 'textarea', filas: 5, valor: p?.texto },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: p?.notas },
      { id: 'pieza', etiqueta: 'Enlace a la pieza (Canva, Drive…)', tipo: 'url', valor: p?.pieza_url },
      { id: 'publicada', etiqueta: 'Enlace a la publicación (cuando se publique)', tipo: 'url', valor: p?.publicada_url },
      { id: 'alcance', etiqueta: 'Alcance', tipo: 'number', valor: p?.alcance ?? '' },
      { id: 'interacciones', etiqueta: 'Interacciones (me gusta, comentarios, guardados)', tipo: 'number', valor: p?.interacciones ?? '' },
      { id: 'clics', etiqueta: 'Clics o mensajes', tipo: 'number', valor: p?.clics ?? '' },
      { id: 'leads', etiqueta: 'Contactos que generó', tipo: 'number', valor: p?.leads ?? '',
        accion: p && ctx.puede('mkt', 'eliminar') ? eliminarPublicacion(ctx, p, alGuardar) : null },  // (los textarea no llevan acción)
    ],
    textoGuardar: p ? 'Guardar' : 'Crear publicación',
    alGuardar: async (v) => {
      if (!v.redes?.length) throw new Error('Elige al menos una red.');
      const datos = { titulo: v.titulo.trim(), fecha: v.fecha, hora: v.hora || null, redes: v.redes, formato: v.formato, estado: v.estado,
        responsable_id: v.responsable || null, campana_id: v.campana || null, texto: texto(v.texto), pieza_url: texto(v.pieza), publicada_url: texto(v.publicada),
        alcance: numero(v.alcance), interacciones: numero(v.interacciones), clics: numero(v.clics), leads: numero(v.leads), notas: texto(v.notas) };
      const q = p ? ctx.api.from('mkt_publicaciones').update(datos).eq('id', p.id) : ctx.api.from('mkt_publicaciones').insert({ empresa_id: ctx.empresa.id, ...datos });
      const { error } = await q;
      if (error) throw new Error(error.message);
      avisar(p ? 'Publicación guardada.' : 'Publicación creada.');
      alGuardar?.();
    },
  });
}
