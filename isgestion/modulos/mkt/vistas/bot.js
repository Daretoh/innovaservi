// Marketing → Bot: lo que sabe el bot de clientes (fichas), cómo habla (configuración) y un simulador para probarlo
// antes de conectarlo a WhatsApp, Messenger e Instagram. Ignacio lo entrena y lo publica (decisión de Enzo, 2026-11-10).
// El simulador llama a la Edge Function mkt-bot, que usa Claude solo con las fichas activas de esta empresa.
import { el } from '../../../core/ui/dom.js?v=4a56f8d';
import { icono } from '../../../core/ui/iconos.js?v=4a56f8d';
import { boton } from '../../../core/ui/tabla.js?v=4a56f8d';
import { avisar } from '../../../core/ui/aviso.js?v=4a56f8d';
import { abrirFormulario } from '../../../core/ui/modal.js?v=4a56f8d';
import { cargarCss } from '../datos.js?v=4a56f8d';
import { tarjetaHora } from '../hora-bot.js?v=4a56f8d';
import { marcarMala, tarjetaCorrecciones, formHorario, textoAtencion } from '../correcciones.js?v=4a56f8d';

export const CATEGORIAS_BOT = [
  ['servicios', 'Servicios'], ['precios', 'Precios publicados'], ['horarios', 'Horarios'], ['ubicacion', 'Ubicación y contacto'],
  ['agendar', 'Cómo agendar'], ['garantias', 'Garantías'], ['faq', 'Preguntas frecuentes'], ['otro', 'Otros'],
];
const AYUDA_CATEGORIA = {
  precios: 'Solo precios que se pueden decir a cualquier cliente. Lo que no esté aquí, el bot no lo cotiza: pasa a una persona.',
  agendar: 'Cómo se agenda (por ejemplo: "pedimos marca, modelo y servicio; una persona confirma el día"). El bot no reserva horas solo.',
};
const EJEMPLOS = [
  ['horarios', 'Horario de atención', 'Lunes a viernes de 9:00 a 18:00. Sábado de 9:00 a 13:00. Domingo y festivos cerrado.'],
  ['ubicacion', 'Dirección', 'Escribe aquí la dirección del taller y una referencia para llegar.'],
  ['agendar', 'Cómo agendar', 'Para agendar pedimos nombre, marca, modelo y año del vehículo, y el servicio. Una persona del equipo confirma el día y la hora.'],
  ['servicios', 'Servicios principales', 'Lista aquí los servicios, uno por línea, con una frase de qué incluye cada uno.'],
];

// La conversación del simulador sobrevive a refrescar la vista (se borra con Reiniciar o al recargar la página)
const charlas = new Map();

export default async function vista(ctx) {
  cargarCss();
  const eid = ctx.empresa.id;
  const [rf, rc, rr, rk, rh] = await Promise.all([
    ctx.api.from('mkt_bot_fichas').select('*').eq('empresa_id', eid).is('deleted_at', null).order('categoria').order('orden').order('titulo'),
    ctx.api.from('mkt_bot_config').select('*').eq('empresa_id', eid).maybeSingle(),
    ctx.api.from('mkt_respuestas').select('titulo, texto').eq('empresa_id', eid).is('deleted_at', null).order('orden'),
    ctx.api.from('mkt_bot_correcciones').select('*').eq('empresa_id', eid).order('created_at', { ascending: false }).limit(100),
    ctx.api.rpc('mkt_bot_horario', { p_empresa: eid }),
  ]);
  if (rf.error) throw rf.error;
  if (rc.error) throw rc.error;
  const fichas = rf.data ?? [];
  const cfg = rc.data;
  const horario = rh.error ? null : rh.data;
  const editar = ctx.puede('mkt', 'editar');
  const eliminar = ctx.puede('mkt', 'eliminar');
  const aprobar = ctx.puede('mkt', 'aprobar');
  const guardar = async (q, ok) => { const { error } = await q; if (error) throw new Error(error.message); avisar(ok); ctx.refrescar(); };
  const boti = (ic, titulo, onclick) => el('button', { type: 'button', class: 'boton-icono', 'aria-label': titulo, title: titulo, onclick }, icono(ic, { tam: 16 }));

  // ---- Fichas de conocimiento
  const formFicha = (f = null, categoria = 'faq') => abrirFormulario({
    titulo: f ? 'Editar ficha' : 'Nueva ficha', textoGuardar: 'Guardar',
    mensaje: 'Escribe como se lo explicarías a alguien nuevo en el mesón. El bot solo responde con lo que esté en las fichas activas.',
    campos: [
      { id: 'categoria', etiqueta: 'Tema', opciones: CATEGORIAS_BOT, valor: f?.categoria ?? categoria,
        alCambiar: ({ valor, estado }) => estado(AYUDA_CATEGORIA[valor] ?? '') },
      { id: 'titulo', etiqueta: 'Título', requerido: true, valor: f?.titulo, ayuda: 'Ej.: "Precio del lavado de motor", "¿Hacen despacho?"' },
      { id: 'contenido', etiqueta: 'Lo que el bot debe saber', tipo: 'textarea', filas: 8, requerido: true, valor: f?.contenido,
        ayuda: 'Máximo 4.000 caracteres.' },
      { id: 'activa', etiqueta: 'Estado', tipo: 'checks', opciones: [['si', 'Activa (el bot la usa)']], valor: (f?.activa ?? true) ? ['si'] : [] },
    ],
    alGuardar: (v) => {
      const datos = { categoria: v.categoria, titulo: v.titulo.trim(), contenido: v.contenido.trim(), activa: v.activa.includes('si') };
      if (datos.titulo.length > 120) throw new Error('El título puede tener hasta 120 caracteres.');
      if (datos.contenido.length > 4000) throw new Error('El contenido puede tener hasta 4.000 caracteres.');
      return guardar(f ? ctx.api.from('mkt_bot_fichas').update(datos).eq('id', f.id)
        : ctx.api.from('mkt_bot_fichas').insert({ ...datos, empresa_id: eid, orden: fichas.filter((x) => x.categoria === datos.categoria).length + 1 }), 'Ficha guardada.');
    },
  });
  const alternar = (f) => guardar(ctx.api.from('mkt_bot_fichas').update({ activa: !f.activa }).eq('id', f.id), f.activa ? 'Ficha pausada: el bot ya no la usa.' : 'Ficha activa.');
  const quitar = (f) => abrirFormulario({ titulo: 'Eliminar ficha', mensaje: `Se elimina la ficha "${f.titulo}". El bot deja de usarla.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: () => guardar(ctx.api.from('mkt_bot_fichas').update({ deleted_at: new Date().toISOString() }).eq('id', f.id), 'Ficha eliminada.') });
  const traerRespuestas = () => {
    const ya = new Set(fichas.map((f) => f.titulo.trim().toLowerCase()));
    const nuevas = (rr.data ?? []).filter((r) => !ya.has(r.titulo.trim().toLowerCase()));
    if (!nuevas.length) { avisar('Las respuestas guardadas ya están como fichas.'); return; }
    abrirFormulario({ titulo: 'Traer respuestas guardadas', campos: [], textoGuardar: 'Traer',
      mensaje: `Se crean ${nuevas.length} ficha${nuevas.length === 1 ? '' : 's'} en Preguntas frecuentes con el texto de las respuestas guardadas. Revísalas: {nombre} y {empresa} el bot los entiende como el cliente y la empresa.`,
      alGuardar: () => guardar(ctx.api.from('mkt_bot_fichas').insert(nuevas.map((r, i) => ({ empresa_id: eid, categoria: 'faq', titulo: r.titulo.slice(0, 120), contenido: r.texto.slice(0, 4000), orden: 100 + i }))), 'Fichas creadas.') });
  };
  const cargarEjemplos = () => guardar(ctx.api.from('mkt_bot_fichas').insert(EJEMPLOS.map(([categoria, titulo, contenido], i) => ({ empresa_id: eid, categoria, titulo, contenido, activa: false, orden: i + 1 }))),
    'Ejemplos cargados en pausa: complétalos y actívalos.');

  const activas = fichas.filter((f) => f.activa).length;
  const grupos = CATEGORIAS_BOT.map(([k, nombre]) => [nombre, fichas.filter((f) => f.categoria === k)]).filter(([, l]) => l.length);
  const tarjetaFichas = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Lo que sabe el bot'), editar ? boton('Nueva ficha', { icono: 'mas', onclick: () => formFicha() }) : null),
    el('p', { class: 'texto-suave texto-chico' }, `${activas} ficha${activas === 1 ? '' : 's'} activa${activas === 1 ? '' : 's'}. `,
      'Solo esto llega a la IA: nunca costos, márgenes ni datos de otros clientes. Lo que no esté aquí, el bot lo pasa a una persona.'),
    grupos.length ? el('div', { class: 'mkt-bot-grupos' }, grupos.map(([nombre, lista]) => el('div', {},
      el('h3', { class: 'mkt-bot-cat' }, nombre),
      el('ul', { class: 'mkt-ajustes-lista' }, lista.map((f) => el('li', { class: f.activa ? '' : 'mkt-bot-pausada' },
        el('span', { class: 'mkt-respuesta' },
          el('strong', {}, f.titulo, f.activa ? null : el('span', { class: 'chip' }, 'En pausa')),
          el('span', { class: 'texto-suave texto-chico mkt-notas' }, f.contenido)),
        editar ? el('span', { class: 'listado-acciones' },
          boti(f.activa ? 'ojo' : 'check', f.activa ? 'Pausar' : 'Activar', () => alternar(f)),
          boti('editar', 'Editar', () => formFicha(f)),
          eliminar ? boti('basura', 'Eliminar', () => quitar(f)) : null) : null))))))
      : el('div', {}, el('p', { class: 'texto-suave' }, 'Todavía no hay fichas: el bot no sabe nada de la empresa.'),
        editar ? boton('Cargar 4 ejemplos', { icono: 'mas', onclick: cargarEjemplos }) : null),
    editar && (rr.data ?? []).length ? el('div', { class: 'mkt-bot-pie' }, boton('Traer respuestas guardadas', { icono: 'copiar', onclick: traerRespuestas })) : null);

  // ---- Configuración
  const formConfig = () => abrirFormulario({
    titulo: 'Cómo habla el bot', textoGuardar: 'Guardar',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre del bot (opcional)', valor: cfg?.nombre, ayuda: 'Si se deja vacío, se presenta como el asistente de la empresa.' },
      { id: 'saludo', etiqueta: 'Saludo', tipo: 'textarea', filas: 3, valor: cfg?.saludo, ayuda: 'Ej.: "Hola, gracias por escribir a IS Performance. ¿En qué te ayudo?"' },
      { id: 'tono', etiqueta: 'Tono', tipo: 'textarea', filas: 3, valor: cfg?.tono, ayuda: 'Ej.: "cercano, de tú, sin emojis" o "formal, de usted".' },
      { id: 'derivar', etiqueta: 'Cuándo pasar a una persona', tipo: 'textarea', filas: 4, valor: cfg?.derivar,
        ayuda: 'Además de lo que no sepa, reclamos y reservas de día y hora. Ej.: "pedidos de PPF o polarizado completo", "flotas o empresas".' },
    ],
    alGuardar: (v) => {
      const datos = { nombre: v.nombre.trim().slice(0, 60) || null, saludo: v.saludo.trim().slice(0, 500) || null, tono: v.tono.trim().slice(0, 500) || null, derivar: v.derivar.trim().slice(0, 1500) || null };
      return guardar(cfg ? ctx.api.from('mkt_bot_config').update(datos).eq('empresa_id', eid) : ctx.api.from('mkt_bot_config').insert({ ...datos, empresa_id: eid }), 'Configuración guardada.');
    },
  });
  // Menú de bienvenida (Marketing 011): lista que el bot manda en su primera respuesta
  const MENU_BASE = { activo: true, texto: '¿En qué te podemos ayudar? Elige una opción o escríbenos tu consulta.', boton: 'Ver opciones', opciones: [
    { titulo: 'Agendar una hora', descripcion: 'Elige servicio, día y hora' },
    { titulo: 'Servicios y precios', descripcion: 'Qué hacemos y cuánto cuesta' },
    { titulo: 'Estado de mi vehículo', descripcion: 'Cómo va tu auto en el taller' },
    { titulo: 'Tarjeta de cliente', descripcion: 'Tus sellos y premios' },
    { titulo: 'Hablar con una persona', descripcion: 'Te atiende alguien del equipo' }] };
  const menu = cfg?.menu ?? null;
  const formMenu = () => abrirFormulario({
    titulo: 'Menú de bienvenida', textoGuardar: 'Guardar',
    mensaje: 'En su primera respuesta, el bot manda esta lista para que el cliente elija tocando (como el "tipo de atención" de otros soportes). Lo que el cliente elige le llega al bot como si lo hubiera escrito.',
    campos: [
      { id: 'activo', etiqueta: 'Estado', tipo: 'checks', opciones: [['si', 'Mandar el menú en la primera respuesta']], valor: (menu?.activo ?? true) ? ['si'] : [] },
      { id: 'texto', etiqueta: 'Texto sobre la lista', valor: menu?.texto ?? MENU_BASE.texto },
      { id: 'boton', etiqueta: 'Texto del botón que abre la lista (máx. 20)', valor: menu?.boton ?? MENU_BASE.boton },
      { id: 'opciones', etiqueta: 'Opciones (una por línea: Título | descripción). Hasta 10; título de máx. 24 letras.', tipo: 'textarea', filas: 8,
        valor: (menu?.opciones ?? MENU_BASE.opciones).map((o) => (o.descripcion ? `${o.titulo} | ${o.descripcion}` : o.titulo)).join('\n') },
    ],
    alGuardar: (v) => {
      const opciones = v.opciones.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [t, ...d] = l.split('|'); return { titulo: t.trim(), descripcion: d.join('|').trim() || undefined }; });
      if (!opciones.length) throw new Error('Agrega al menos una opción.');
      if (opciones.length > 10) throw new Error('WhatsApp acepta hasta 10 opciones.');
      const larga = opciones.find((o) => o.titulo.length > 24 || (o.descripcion ?? '').length > 72);
      if (larga) throw new Error(`"${larga.titulo}" es muy largo: título hasta 24 letras y descripción hasta 72.`);
      if (v.boton.trim().length > 20) throw new Error('El texto del botón puede tener hasta 20 letras.');
      const datos = { menu: { activo: v.activo.includes('si'), texto: v.texto.trim().slice(0, 300), boton: v.boton.trim() || 'Ver opciones', opciones } };
      return guardar(cfg ? ctx.api.from('mkt_bot_config').update(datos).eq('empresa_id', eid) : ctx.api.from('mkt_bot_config').insert({ ...datos, empresa_id: eid }), 'Menú guardado.');
    },
  });
  const dato = (etq, v) => el('div', { class: 'mkt-bot-dato' }, el('span', { class: 'texto-suave texto-chico' }, etq), el('span', {}, v || el('span', { class: 'texto-suave' }, 'Sin definir')));
  const canal = (nombre, on) => el('li', {}, el('span', {}, nombre), el('span', { class: 'chip' }, on ? 'Encendido' : 'Sin conectar'));
  // WhatsApp ya está conectado (Marketing 008): se enciende y apaga aquí (aprobar). La pausa es por conversación.
  const encenderWa = async () => {
    const on = !cfg?.whatsapp;
    const datos = { whatsapp: on };
    const { error: e } = cfg ? await ctx.api.from('mkt_bot_config').update(datos).eq('empresa_id', eid) : await ctx.api.from('mkt_bot_config').insert({ ...datos, empresa_id: eid });
    if (e) { avisar(e.message, 'error'); return; }
    avisar(on ? 'Bot encendido en WhatsApp: responde solo a los clientes.' : 'Bot apagado en WhatsApp: solo responden personas.'); ctx.refrescar();
  };
  const formPausa = () => abrirFormulario({ titulo: 'Pausa del bot', textoGuardar: 'Guardar',
    mensaje: 'Cuando una persona responde desde la bandeja, o el bot pasa la conversación a una persona, el bot deja de responder en esa conversación por este tiempo. Se puede reactivar antes desde la bandeja.',
    campos: [{ id: 'horas', etiqueta: 'Horas de pausa', tipo: 'number', valor: cfg?.pausa_horas ?? 12 }],
    alGuardar: (v) => { const h = Math.round(Number(v.horas)); if (!(h >= 1 && h <= 168)) throw new Error('Entre 1 y 168 horas.'); return guardar(cfg ? ctx.api.from('mkt_bot_config').update({ pausa_horas: h }).eq('empresa_id', eid) : ctx.api.from('mkt_bot_config').insert({ pausa_horas: h, empresa_id: eid }), 'Pausa guardada.'); } });
  const filaWa = el('li', {}, el('span', {}, 'WhatsApp'),
    el('span', { class: 'listado-acciones' },
      el('span', { class: `chip ${cfg?.whatsapp ? 'chip-ok' : 'chip-pend'}` }, cfg?.whatsapp ? 'Responde solo' : 'Apagado'),
      aprobar ? boton(cfg?.whatsapp ? 'Apagar' : 'Encender', { tipo: cfg?.whatsapp ? 'secundario' : 'primario', class: `boton boton-${cfg?.whatsapp ? 'secundario' : 'primario'} boton-chico`, onclick: encenderWa }) : null));
  const tarjetaConfig = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Cómo habla'), editar ? boton('Editar', { icono: 'editar', onclick: formConfig }) : null),
    dato('Nombre', cfg?.nombre), dato('Saludo', cfg?.saludo), dato('Tono', cfg?.tono || 'Cercano y profesional, sin emojis (por defecto)'), dato('Pasa a una persona además cuando', cfg?.derivar),
    el('div', { class: 'listado-cabecera mkt-bot-menu-cab' }, el('h3', { class: 'mkt-bot-cat' }, 'Menú de bienvenida'),
      editar ? boton(menu ? 'Editar menú' : 'Crear menú', { icono: 'lista', class: 'boton boton-secundario boton-chico', onclick: formMenu }) : null),
    menu?.opciones?.length
      ? el('p', { class: 'texto-chico' }, el('span', { class: `chip ${menu.activo ? 'chip-ok' : 'chip-pend'}` }, menu.activo ? 'Activo' : 'Apagado'), ' ', menu.opciones.map((o) => o.titulo).join(' · '))
      : el('p', { class: 'texto-suave texto-chico' }, 'Sin menú: el bot responde solo con texto.'),
    el('h3', { class: 'mkt-bot-cat' }, 'Canales'),
    el('ul', { class: 'mkt-ajustes-lista' }, filaWa, canal('Messenger', cfg?.messenger), canal('Instagram', cfg?.instagram)),
    el('p', { class: 'texto-suave texto-chico' }, `Encendido, el bot responde solo a cada mensaje de WhatsApp. Si una persona responde desde la bandeja, el bot se pausa ${cfg?.pausa_horas ?? 12} h en esa conversación. `,
      editar ? el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: formPausa }, 'Cambiar') : null,
      ' Messenger e Instagram se conectan cuando Meta apruebe los permisos de la app. ', aprobar ? '' : 'Encender pide el permiso aprobar de Marketing.'),
    // Horario (Marketing 014): siempre o solo fuera del horario de atención
    el('div', { class: 'listado-cabecera mkt-bot-menu-cab' }, el('h3', { class: 'mkt-bot-cat' }, 'Horario'),
      aprobar ? boton('Editar horario', { icono: 'calendario', class: 'boton boton-secundario boton-chico', onclick: () => formHorario(ctx, cfg, ctx.refrescar) }) : null),
    el('p', { class: 'texto-chico' },
      el('span', { class: 'chip' }, (cfg?.horario_modo ?? 'siempre') === 'fuera' ? 'Solo fuera de horario' : 'Responde siempre'), ' ',
      textoAtencion(cfg?.atencion ?? { 1: ['09:00', '18:30'], 2: ['09:00', '18:30'], 3: ['09:00', '18:30'], 4: ['09:00', '18:30'], 5: ['09:00', '18:30'], 6: ['09:00', '13:00'] })),
    el('p', { class: 'texto-suave texto-chico' }, horario
      ? (horario.en_horario ? `Ahora: en horario de atención (hasta las ${horario.cierra}).${horario.modo === 'fuera' ? ' El bot no responde en WhatsApp: atiende el equipo.' : ''}`
        : `Ahora: fuera de horario${horario.proxima ? `; abre ${horario.proxima}` : ''}. Si el bot pasa a una persona, le dice al cliente cuándo le responden.`) : '',
      aprobar ? '' : ' Cambiar el horario pide el permiso aprobar.'));
  const tarjetaCorr = tarjetaCorrecciones(ctx, { correcciones: rk.data ?? [], fichas, categorias: CATEGORIAS_BOT, editar, alCambiar: ctx.refrescar });

  // ---- Simulador
  if (!charlas.has(eid)) charlas.set(eid, []);
  const charla = charlas.get(eid);
  const lista = el('div', { class: 'mkt-bot-chat', 'aria-live': 'polite' });
  const entrada = el('textarea', { class: 'campo', rows: 2, maxlength: 2000, placeholder: 'Escribe como si fueras el cliente…' });
  const enviar = boton('Enviar', { icono: 'derecha', tipo: 'primario', type: 'submit' });
  const pintar = () => {
    lista.replaceChildren(...(charla.length ? charla.map((m) => el('div', { class: `mkt-bot-msj ${m.rol === 'cliente' ? 'es-cliente' : 'es-bot'}${m.error ? ' es-error' : ''}` },
      el('div', { class: 'mkt-bot-burbuja' }, m.texto),
      m.derivar ? el('div', { class: 'mkt-bot-derivar' }, icono('alerta', { tam: 14 }), `Pasaría a una persona: ${m.derivar}`) : null,
      m.opciones && m === charla.at(-1) ? el('div', { class: `mkt-bot-opciones ${m.opciones.tipo}` },
        m.opciones.tipo === 'lista' ? el('span', { class: 'mkt-bot-lista-tit' }, icono('lista', { tam: 14 }), ` ${m.opciones.boton || 'Ver opciones'}`) : null,
        m.opciones.opciones.map((o) => el('button', { type: 'button', class: 'mkt-bot-opcion', onclick: () => { entrada.value = o.titulo; preguntar(new Event('submit')); } },
          el('strong', {}, o.titulo), o.descripcion ? el('small', {}, o.descripcion) : null))) : null,
      m.pedir ? tarjetaHora(m.pedir, 'Simulación: en WhatsApp esta hora quedaría pedida en Taller → Agenda (por confirmar). Aquí no se guarda nada.') : null,
      m.enHorario ? el('div', { class: 'mkt-bot-derivar' }, icono('alerta', { tam: 14 }), 'En WhatsApp el bot no habría respondido ahora: es horario de atención y está en "solo fuera de horario".') : null,
      m.rol === 'bot' && !m.error && !m.esperando && editar ? el('div', { class: 'mkt-bot-marcar' },
        m.marcada ? el('span', { class: 'texto-suave texto-chico' }, 'Marcada para corregir')
          : el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: () => {
            const i = charla.indexOf(m);
            const pregunta = charla.slice(0, i).reverse().find((x) => x.rol === 'cliente')?.texto ?? null;
            marcarMala(ctx, { pregunta, respuesta: m.texto, alListo: () => { m.marcada = true; ctx.refrescar(); } });
          } }, 'Estuvo mal')) : null))
      : [el('p', { class: 'texto-suave texto-chico mkt-bot-vacio' }, 'Prueba preguntas reales: "¿cuánto sale un lavado?", "¿atienden el sábado?", "quiero agendar para el jueves". Las respuestas usan solo las fichas activas.')]));
    lista.scrollTop = lista.scrollHeight;
  };
  const preguntar = async (ev) => {
    ev?.preventDefault?.();
    const texto = entrada.value.trim();
    if (!texto || enviar.disabled) return;
    charla.push({ rol: 'cliente', texto });
    entrada.value = '';
    const escribiendo = { rol: 'bot', texto: 'Escribiendo…', esperando: true };
    charla.push(escribiendo); pintar();
    enviar.disabled = true;
    try {
      const mensajes = charla.filter((m) => m !== escribiendo && !m.error).map(({ rol, texto: t }) => ({ rol, texto: t }));
      const { data, error } = await ctx.api.functions.invoke('mkt-bot', { body: { empresa_id: eid, mensajes } });
      if (error) { let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ } throw new Error(j?.error || error.message || 'El bot no respondió'); }
      Object.assign(escribiendo, { texto: data.respuesta || '(sin respuesta)', derivar: data.derivar, pedir: data.pedir_hora, opciones: data.opciones, esperando: false,
        enHorario: data.horario_modo === 'fuera' && data.horario?.en_horario });
    } catch (e) {
      Object.assign(escribiendo, { texto: e.message, error: true, esperando: false });
    } finally {
      enviar.disabled = false; pintar(); entrada.focus();
    }
  };
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(e); } });
  pintar();
  const simulador = el('div', { class: 'ficha mkt-bot-sim' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Probar el bot'),
      boton('Reiniciar', { icono: 'circulo', onclick: () => { charla.length = 0; pintar(); } })),
    lista,
    el('form', { class: 'mkt-bot-entrada', onsubmit: preguntar }, entrada, enviar),
    el('p', { class: 'texto-suave texto-chico' }, 'Cada respuesta usa créditos de la IA (pocos pesos). Nada de esto se envía a clientes.'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Bot de clientes')),
    el('div', { class: 'mkt-bot' }, el('div', { class: 'mkt-bot-col' }, tarjetaCorr, tarjetaFichas, tarjetaConfig), simulador));
}
