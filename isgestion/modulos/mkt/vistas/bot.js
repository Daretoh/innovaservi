// Marketing → Bot: lo que sabe el bot de clientes (fichas), cómo habla (configuración) y un simulador para probarlo
// antes de conectarlo a WhatsApp, Messenger e Instagram. Ignacio lo entrena y lo publica (decisión de Enzo, 2026-11-10).
// El simulador llama a la Edge Function mkt-bot, que usa Claude solo con las fichas activas de esta empresa.
import { el } from '../../../core/ui/dom.js?v=dcd938a';
import { icono } from '../../../core/ui/iconos.js?v=dcd938a';
import { boton } from '../../../core/ui/tabla.js?v=dcd938a';
import { avisar } from '../../../core/ui/aviso.js?v=dcd938a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=dcd938a';
import { cargarCss } from '../datos.js?v=dcd938a';

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
  const [rf, rc, rr] = await Promise.all([
    ctx.api.from('mkt_bot_fichas').select('*').eq('empresa_id', eid).is('deleted_at', null).order('categoria').order('orden').order('titulo'),
    ctx.api.from('mkt_bot_config').select('*').eq('empresa_id', eid).maybeSingle(),
    ctx.api.from('mkt_respuestas').select('titulo, texto').eq('empresa_id', eid).is('deleted_at', null).order('orden'),
  ]);
  if (rf.error) throw rf.error;
  if (rc.error) throw rc.error;
  const fichas = rf.data ?? [];
  const cfg = rc.data;
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
  const dato = (etq, v) => el('div', { class: 'mkt-bot-dato' }, el('span', { class: 'texto-suave texto-chico' }, etq), el('span', {}, v || el('span', { class: 'texto-suave' }, 'Sin definir')));
  const canal = (nombre, on) => el('li', {}, el('span', {}, nombre), el('span', { class: 'chip' }, on ? 'Encendido' : 'Sin conectar'));
  const tarjetaConfig = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Cómo habla'), editar ? boton('Editar', { icono: 'editar', onclick: formConfig }) : null),
    dato('Nombre', cfg?.nombre), dato('Saludo', cfg?.saludo), dato('Tono', cfg?.tono || 'Cercano y profesional, sin emojis (por defecto)'), dato('Pasa a una persona además cuando', cfg?.derivar),
    el('h3', { class: 'mkt-bot-cat' }, 'Canales'),
    el('ul', { class: 'mkt-ajustes-lista' }, canal('WhatsApp', cfg?.whatsapp), canal('Messenger', cfg?.messenger), canal('Instagram', cfg?.instagram)),
    el('p', { class: 'texto-suave texto-chico' }, 'Los canales se conectan cuando Meta habilite la cuenta de la empresa. ',
      aprobar ? 'Tu cuenta podrá encenderlos (permiso aprobar).' : 'Encenderlos pide el permiso aprobar de Marketing.'));

  // ---- Simulador
  if (!charlas.has(eid)) charlas.set(eid, []);
  const charla = charlas.get(eid);
  const lista = el('div', { class: 'mkt-bot-chat', 'aria-live': 'polite' });
  const entrada = el('textarea', { class: 'campo', rows: 2, maxlength: 2000, placeholder: 'Escribe como si fueras el cliente…' });
  const enviar = boton('Enviar', { icono: 'derecha', tipo: 'primario', type: 'submit' });
  const pintar = () => {
    lista.replaceChildren(...(charla.length ? charla.map((m) => el('div', { class: `mkt-bot-msj ${m.rol === 'cliente' ? 'es-cliente' : 'es-bot'}${m.error ? ' es-error' : ''}` },
      el('div', { class: 'mkt-bot-burbuja' }, m.texto),
      m.derivar ? el('div', { class: 'mkt-bot-derivar' }, icono('alerta', { tam: 14 }), `Pasaría a una persona: ${m.derivar}`) : null))
      : [el('p', { class: 'texto-suave texto-chico mkt-bot-vacio' }, 'Prueba preguntas reales: "¿cuánto sale un lavado?", "¿atienden el sábado?", "quiero agendar para el jueves". Las respuestas usan solo las fichas activas.')]));
    lista.scrollTop = lista.scrollHeight;
  };
  const preguntar = async (ev) => {
    ev.preventDefault();
    const texto = entrada.value.trim();
    if (!texto || enviar.disabled) return;
    charla.push({ rol: 'cliente', texto });
    entrada.value = '';
    const escribiendo = { rol: 'bot', texto: 'Escribiendo…' };
    charla.push(escribiendo); pintar();
    enviar.disabled = true;
    try {
      const mensajes = charla.filter((m) => m !== escribiendo && !m.error).map(({ rol, texto: t }) => ({ rol, texto: t }));
      const { data, error } = await ctx.api.functions.invoke('mkt-bot', { body: { empresa_id: eid, mensajes } });
      if (error) { let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ } throw new Error(j?.error || error.message || 'El bot no respondió'); }
      Object.assign(escribiendo, { texto: data.respuesta || '(sin respuesta)', derivar: data.derivar });
    } catch (e) {
      Object.assign(escribiendo, { texto: e.message, error: true });
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
    el('div', { class: 'mkt-bot' }, el('div', { class: 'mkt-bot-col' }, tarjetaFichas, tarjetaConfig), simulador));
}
