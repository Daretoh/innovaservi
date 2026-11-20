// Marketing → WhatsApp (Marketing 008): bandeja del número de WhatsApp de la empresa (API de la nube de Meta).
// - Izquierda: conversaciones con búsqueda y filtros (todas, no leídas, ventana abierta), avatar y no leídos.
// - Centro: chat con burbujas, separadores por día, estado de cada envío (enviado, entregado, leído, falló con
//   Reintentar) y caja de respuesta que crece; respuestas guardadas y "Sugerir con el bot" (Edge Function mkt-bot con
//   la conversación: llena la caja, no envía). Responder pide editar y solo dentro de las 24 horas desde el último
//   mensaje del cliente (regla de WhatsApp); lo envía la Edge Function mkt-wa-enviar.
// - Derecha (se oculta): el contacto del Embudo (etapa, cliente, vehículos del taller y accesos).
// Se actualiza sola cada 10 segundos sin perder lo que se está escribiendo ni mover el chat si se está leyendo arriba.
// Ruta: #/mkt.whatsapp[?c=<conversación>]
import { el } from '../../../core/ui/dom.js?v=394625e';
import { icono } from '../../../core/ui/iconos.js?v=394625e';
import { boton } from '../../../core/ui/tabla.js?v=394625e';
import { avisar } from '../../../core/ui/aviso.js?v=394625e';
import { diaLocal, hoyISO, fechaLarga, fechaCorta, nombreDia } from '../../../core/ui/formato.js?v=394625e';
import { cargarCss } from '../datos.js?v=394625e';
import { tarjetaHora } from '../hora-bot.js?v=394625e';
import { marcarMala } from '../correcciones.js?v=394625e';
import { DATOS, nombreUso, armar } from '../plantillas-wa.js?v=394625e';
import { abrirFormulario } from '../../../core/ui/modal.js?v=394625e';

const ESTADO = { pendiente: 'Enviando', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', fallido: 'No se envió' };
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const cuando = (ts) => {
  const d = diaLocal(ts);
  if (d === hoyISO()) return hora(ts);
  const dias = Math.round((new Date(hoyISO()) - new Date(d)) / 86400000);
  return dias === 1 ? 'Ayer' : dias < 7 ? nombreDia(d) : fechaCorta(d);
};
const tituloDia = (d) => {
  if (d === hoyISO()) return 'Hoy';
  const dias = Math.round((new Date(hoyISO()) - new Date(d)) / 86400000);
  return dias === 1 ? 'Ayer' : `${nombreDia(d)} ${fechaLarga(d)}`;
};
const verNumero = (wa) => (wa?.startsWith('56') && wa.length === 11 ? `+56 ${wa.slice(2, 3)} ${wa.slice(3, 7)} ${wa.slice(7)}` : `+${wa}`);
const horasVentana = (c) => (c.ultimo_cliente_at ? 24 - (Date.now() - new Date(c.ultimo_cliente_at).getTime()) / 3600000 : -1);
const nombreDe = (c) => c.mkt_contactos?.nombre || c.nombre_perfil || verNumero(c.wa_id);
const iniciales = (t) => String(t).replace(/^\+/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const avatar = (c, clase = '') => el('span', { class: `mkt-wa-avatar ${clase}`, 'aria-hidden': 'true' }, /^\+?\d/.test(nombreDe(c)) ? icono('users', { tam: 18 }) : iniciales(nombreDe(c)));

// Ticks de estado (SVG propio, sin emojis)
const NS = 'http://www.w3.org/2000/svg';
function tick(estado) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 18 12'); s.setAttribute('class', `mkt-wa-tick ${estado}`); s.setAttribute('aria-hidden', 'true');
  const linea = (d) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); };
  if (estado === 'pendiente') { linea('M9 2.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M9 4v2.2l1.4 1'); }
  else if (estado === 'fallido') { linea('M9 2v5M9 9.4v.6'); }
  else { linea('M1.5 6.5l3 3L10.5 3'); if (estado !== 'enviado') linea('M7 9.5l6-6.5'); }
  return s;
}

export default async function vista(ctx) {
  cargarCss();
  const eid = ctx.empresa.id;
  const editar = ctx.puede('mkt', 'editar');
  const conTaller = ctx.puede('taller', 'ver');
  const [rn, re, rr] = await Promise.all([
    ctx.api.from('mkt_wa_numeros').select('*').eq('empresa_id', eid).eq('activo', true),
    ctx.api.from('mkt_etapas').select('id, nombre, tipo, orden').eq('empresa_id', eid).is('deleted_at', null).order('orden'),
    ctx.api.from('mkt_respuestas').select('titulo, texto').eq('empresa_id', eid).is('deleted_at', null).order('orden').order('titulo'),
  ]);
  const { data: botCfg } = await ctx.api.from('mkt_bot_config').select('whatsapp, pausa_horas').eq('empresa_id', eid).maybeSingle();
  const { data: corrs } = await ctx.api.from('mkt_bot_correcciones').select('mensaje_id').eq('empresa_id', eid).not('mensaje_id', 'is', null).limit(2000);
  const corregidos = new Set((corrs ?? []).map((x) => x.mensaje_id));
  const botOn = !!botCfg?.whatsapp;
  if (rn.error) throw rn.error;
  const etapas = re.data ?? [];
  const respuestas = rr.data ?? [];
  const { data: plantillas } = await ctx.api.from('mkt_wa_plantillas').select('id, nombre, uso, cuerpo, variables, ejemplos').eq('empresa_id', eid).eq('estado', 'aprobada').is('deleted_at', null).order('uso');
  const empresa = ctx.empresa.nombre_fantasia || ctx.empresa.razon_social || '';
  let actual = ctx.params?.c ?? null;
  let convs = [];
  let filtro = 'todas';
  let buscar = '';
  let firmaMsjs = '';
  let panelAbierto = (() => { try { return localStorage.getItem('isg.wa.panel') !== '0'; } catch { return true; } })();

  // ---------------------------------------------------------------- Lista de conversaciones
  const items = el('div', { class: 'mkt-wa-items' });
  const campoBuscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar nombre o número', 'aria-label': 'Buscar conversación' });
  campoBuscar.addEventListener('input', () => { buscar = campoBuscar.value.trim().toLowerCase(); pintarLista(); });
  const chips = [['todas', 'Todas'], ['no_leidas', 'No leídas'], ['abiertas', 'Ventana abierta']].map(([k, t]) => el('button', {
    type: 'button', class: 'mkt-wa-chip', 'aria-pressed': String(k === filtro), onclick: () => { filtro = k; chips.forEach((b, i) => b.setAttribute('aria-pressed', String(['todas', 'no_leidas', 'abiertas'][i] === filtro))); pintarLista(); },
  }, t));
  const lista = el('nav', { class: 'mkt-wa-lista', 'aria-label': 'Conversaciones' },
    el('div', { class: 'mkt-wa-lista-cab' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), campoBuscar), el('div', { class: 'mkt-wa-chips' }, chips)),
    items);

  const pintarLista = () => {
    const visibles = convs.filter((c) => (filtro === 'no_leidas' ? c.no_leidos > 0 : filtro === 'abiertas' ? horasVentana(c) > 0 : true))
      .filter((c) => !buscar || `${nombreDe(c)} ${c.nombre_perfil ?? ''} ${c.wa_id}`.toLowerCase().includes(buscar.replace(/[\s+]/g, '')) || nombreDe(c).toLowerCase().includes(buscar));
    items.replaceChildren(...(visibles.length ? visibles.map((c) => el('a', {
      class: `mkt-wa-item${c.id === actual ? ' activa' : ''}${c.no_leidos ? ' no-leida' : ''}`, href: ctx.ruta('mkt.whatsapp', { c: c.id }),
      onclick: (ev) => { ev.preventDefault(); abrir(c.id); },
    },
      avatar(c),
      el('span', { class: 'mkt-wa-item-txt' },
        el('span', { class: 'mkt-wa-item-cab' }, el('strong', {}, nombreDe(c)), el('small', {}, cuando(c.ultimo_at))),
        el('span', { class: 'mkt-wa-item-pie' }, el('span', { class: 'mkt-wa-prev' }, c.ultimo_texto || ''),
          c.no_leidos ? el('span', { class: 'mkt-wa-cuenta' }, String(c.no_leidos)) : horasVentana(c) > 0 ? el('span', { class: 'mkt-wa-punto', title: 'Ventana de 24 horas abierta' }) : null))))
      : [el('div', { class: 'mkt-wa-vacio' }, icono('chat', { tam: 28 }),
        el('p', {}, convs.length ? 'Nada coincide con la búsqueda o el filtro.' : 'Todavía no hay conversaciones. Cuando un cliente escriba al WhatsApp de la empresa aparecerá aquí.'))]));
  };
  const cargarLista = async () => {
    const { data, error } = await ctx.api.from('mkt_wa_conversaciones').select('*, mkt_contactos(id, nombre, etapa_id, tercero_id, interes, origen, correo)').eq('empresa_id', eid)
      .eq('archivada', false).order('ultimo_at', { ascending: false }).limit(300);
    if (error) throw error;
    convs = data;
    pintarLista();
  };

  // ---------------------------------------------------------------- Chat
  const chat = el('section', { class: 'mkt-wa-chat' });
  const panel = el('aside', { class: 'mkt-wa-panel', 'aria-label': 'Contacto' });
  const raiz = el('div', { class: `mkt-wa${panelAbierto ? ' con-panel' : ''}` }, lista, chat, panel);
  let caja = null;

  const pintarMensajes = (msjs, forzarAbajo = false) => {
    if (!caja) return;
    const abajo = forzarAbajo || caja.scrollHeight - caja.scrollTop - caja.clientHeight < 80;
    let dia = '';
    const filas = [];
    for (const m of msjs) {
      const d = diaLocal(m.created_at);
      if (d !== dia) { dia = d; filas.push(el('div', { class: 'mkt-wa-dia' }, el('span', {}, tituloDia(d)))); }
      const sale = m.direccion === 'salida';
      filas.push(el('div', { class: `mkt-wa-msj ${m.direccion}${m.estado === 'fallido' ? ' fallido' : ''}` },
        el('div', { class: 'mkt-wa-burbuja' },
          m.autor === 'bot' ? el('span', { class: 'mkt-wa-autor' }, 'Bot') : null,
          el('span', { class: 'mkt-wa-texto' }, m.texto || `[${m.tipo}]`),
          el('span', { class: 'mkt-wa-meta' }, hora(m.created_at), sale ? tick(m.estado) : null)),
        sale && m.estado === 'fallido' ? el('div', { class: 'mkt-wa-fallo' }, icono('alerta', { tam: 13 }), ` ${ESTADO.fallido}${m.error ? `: ${m.error}` : ''}`,
          editar ? el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: () => enviarTexto(m.texto) }, 'Reintentar') : null) : null,
        // Marketing 014: marcar una respuesta del bot para corregirla en la pestaña Bot
        m.autor === 'bot' && editar ? el('div', { class: 'mkt-wa-corregir' }, corregidos.has(m.id)
          ? el('span', { class: 'texto-suave texto-chico' }, 'Marcada para corregir')
          : el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: () => marcarMala(ctx, { mensajeId: m.id, respuesta: m.texto,
            alListo: () => { corregidos.add(m.id); firmaMsjs = ''; pintarMensajes(msjs); } }) }, 'Estuvo mal')) : null));
    }
    caja.replaceChildren(...(filas.length ? filas : [el('p', { class: 'mkt-wa-sin' }, 'Sin mensajes todavía.')]));
    if (abajo) caja.scrollTop = caja.scrollHeight;
  };
  const traerMensajes = async (c) => {
    const { data, error } = await ctx.api.from('mkt_wa_mensajes').select('id, direccion, tipo, texto, estado, error, autor, created_at').eq('conversacion_id', c.id).order('created_at').limit(500);
    if (error) throw error;
    return data;
  };
  let enviarTexto = async () => {};

  const pintarChat = async () => {
    const c = convs.find((x) => x.id === actual);
    if (!c) {
      caja = null;
      chat.replaceChildren(el('div', { class: 'mkt-wa-nada' }, el('span', { class: 'mkt-wa-nada-ico' }, icono('chat', { tam: 34 })),
        el('strong', {}, 'WhatsApp de la empresa'), el('p', { class: 'texto-suave' }, 'Elige una conversación para leerla y responder.')));
      panel.replaceChildren();
      return;
    }
    const msjs = await traerMensajes(c);
    firmaMsjs = msjs.map((m) => `${m.id}:${m.estado}`).join('|');
    const horas = horasVentana(c);
    const abierta = horas > 0;
    caja = el('div', { class: 'mkt-wa-mensajes', 'aria-live': 'polite' });

    // Caja de respuesta
    const entrada = el('textarea', { class: 'mkt-wa-entrada', rows: 1, maxlength: 4096, placeholder: abierta ? 'Escribe un mensaje' : 'Ventana de 24 horas cerrada', disabled: !editar || !abierta });
    const crecer = () => { entrada.style.height = 'auto'; entrada.style.height = `${Math.min(entrada.scrollHeight, 140)}px`; };
    entrada.addEventListener('input', crecer);
    const btnEnviar = el('button', { type: 'submit', class: 'mkt-wa-enviar', 'aria-label': 'Enviar', title: 'Enviar (Enter)', disabled: !editar || !abierta }, icono('derecha', { tam: 18 }));
    const nota = el('div', { class: 'mkt-wa-nota', 'aria-live': 'polite' });
    let opcionesPendientes = null;   // botones o lista que propuso el bot para el próximo envío
    enviarTexto = async (texto) => {
      texto = String(texto ?? '').trim();
      if (!texto || btnEnviar.disabled) return false;
      btnEnviar.disabled = true;
      const opciones = opcionesPendientes; opcionesPendientes = null;
      const { error: e } = await ctx.api.functions.invoke('mkt-wa-enviar', { body: { conversacion_id: c.id, texto, ...(opciones ? { opciones } : {}) } });
      btnEnviar.disabled = false;
      if (e) { let msj = null; try { msj = (await e.context?.json?.())?.error; } catch { /* sin cuerpo */ } avisar(msj || e.message, 'error'); }
      pintarMensajes(await traerMensajes(c), true);
      cargarLista().catch(() => {});
      return !e;
    };
    const mandar = async (ev) => {
      ev?.preventDefault();
      const texto = entrada.value;
      if (!texto.trim()) return;
      entrada.value = ''; crecer(); nota.replaceChildren();
      const ok = await enviarTexto(texto);
      if (!ok && !entrada.value) { entrada.value = texto; crecer(); }
      entrada.focus();
    };
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) mandar(ev); });

    // Respuestas guardadas ({nombre}, {empresa})
    const primerNombre = String(c.mkt_contactos?.nombre || c.nombre_perfil || '').trim().split(/\s+/)[0] ?? '';
    const menuResp = el('div', { class: 'mkt-wa-menu', hidden: true },
      respuestas.length ? respuestas.map((r) => el('button', { type: 'button', onclick: () => {
        entrada.value = r.texto.replaceAll('{nombre}', primerNombre).replaceAll('{empresa}', empresa); crecer(); menuResp.hidden = true; entrada.focus();
      } }, el('strong', {}, r.titulo), el('span', {}, r.texto))) : el('p', { class: 'texto-suave texto-chico' }, 'No hay respuestas guardadas. Se crean en Marketing → Ajustes.'));
    const btnResp = el('button', { type: 'button', class: 'mkt-wa-herr', title: 'Respuestas guardadas', 'aria-label': 'Respuestas guardadas', disabled: !editar || !abierta,
      onclick: () => { menuResp.hidden = !menuResp.hidden; } }, icono('lista', { tam: 18 }));
    // Sugerir con el bot (no envía: deja el borrador en la caja)
    const btnBot = el('button', { type: 'button', class: 'mkt-wa-herr', title: 'Sugerir respuesta con el bot', 'aria-label': 'Sugerir respuesta con el bot', disabled: !editar || !abierta,
      onclick: async () => {
        btnBot.disabled = true; btnBot.classList.add('pensando');
        nota.replaceChildren(el('span', { class: 'texto-suave' }, 'El bot está pensando una respuesta…'));
        try {
          const historial = (await traerMensajes(c)).filter((m) => m.texto && m.estado !== 'fallido').slice(-20)
            .map((m) => ({ rol: m.direccion === 'entrada' ? 'cliente' : 'bot', texto: m.texto }));
          const { data, error } = await ctx.api.functions.invoke('mkt-bot', { body: { empresa_id: eid, mensajes: historial } });
          if (error) { let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ } throw new Error(j?.error || error.message); }
          entrada.value = data.respuesta || ''; crecer(); entrada.focus();
          opcionesPendientes = data.opciones || null;
          nota.replaceChildren(icono('chat', { tam: 13 }), data.derivar ? ` Sugerencia del bot. Ojo: el bot pasaría esto a una persona (${data.derivar}).` : ' Sugerencia del bot: revísala antes de enviar.');
          if (data.opciones) {
            nota.append(el('div', { class: 'mkt-wa-opc' }, el('span', {}, data.opciones.tipo === 'lista' ? 'Se enviará con el menú:' : 'Se enviará con botones:'),
              ...data.opciones.opciones.map((o) => el('span', { class: 'chip' }, o.titulo)),
              el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: (ev) => { opcionesPendientes = null; ev.currentTarget.parentElement.remove(); } }, 'Quitar')));
          }
          if (data.pedir_hora) {
            const pedir = async (btn) => {
              btn.disabled = true;
              const { data: r, error: er } = await ctx.api.functions.invoke('mkt-bot', { body: { accion: 'reservar', empresa_id: eid, conversacion_id: c.id, datos: data.pedir_hora } });
              if (er) { let j = null; try { j = await er.context?.json?.(); } catch { /* sin cuerpo */ } avisar(j?.error || er.message, 'error'); btn.disabled = false; return; }
              avisar(`Hora pedida para el ${r.fecha} a las ${r.hora}: queda por confirmar en Taller → Agenda.`);
              nota.replaceChildren(icono('check', { tam: 13 }), ' Hora pedida en la agenda. Envía la respuesta al cliente para avisarle.');
            };
            nota.append(tarjetaHora(data.pedir_hora, 'El bot juntó estos datos. Revísalos y pide la hora: queda por confirmar en Taller → Agenda.', { textoBoton: 'Pedir hora en la agenda', alPedir: pedir }));
          }
        } catch (e) { nota.replaceChildren(el('span', { class: 'mkt-wa-error' }, e.message)); }
        btnBot.disabled = false; btnBot.classList.remove('pensando');
      } }, icono('auto', { tam: 18 }));

    // Plantilla aprobada: se puede mandar aunque la ventana de 24 horas esté cerrada
    const usarPlantilla = () => {
      if (!plantillas?.length) { avisar('No hay plantillas aprobadas todavía. Créalas en Marketing → Plantillas.', 'error'); return; }
      const sugerido = { nombre: primerNombre, empresa };
      const campos = [{ id: 'plantilla', etiqueta: 'Plantilla', opciones: plantillas.map((t) => [t.id, nombreUso[t.uso] ?? t.nombre]), valor: plantillas[0].id,
        alCambiar: ({ valor, poner }) => { const t = plantillas.find((x) => x.id === valor); t?.variables.forEach((k, i) => poner(`v${i}`, sugerido[k] ?? '')); } }];
      const maxVars = Math.max(...plantillas.map((t) => t.variables.length));
      for (let i = 0; i < maxVars; i++) {
        const k = plantillas[0].variables[i];
        campos.push({ id: `v${i}`, etiqueta: `Dato ${i + 1}${k ? ` (${DATOS[k]?.etiqueta ?? k})` : ''}`, valor: k ? sugerido[k] ?? '' : '', ayuda: 'Se ignora si la plantilla elegida no lo usa.' });
      }
      abrirFormulario({ titulo: 'Enviar plantilla', textoGuardar: 'Enviar', mensaje: 'Las plantillas sirven para escribirle aunque hayan pasado más de 24 horas. Cada envío tiene un costo pequeño en Meta.', campos,
        alGuardar: async (v) => {
          const t = plantillas.find((x) => x.id === v.plantilla);
          const valores = t.variables.map((_, i) => String(v[`v${i}`] ?? '').trim());
          if (valores.some((x) => !x)) throw new Error(`Completa los datos: ${t.variables.map((k) => DATOS[k]?.etiqueta ?? k).join(', ')}.`);
          const { error: e } = await ctx.api.functions.invoke('mkt-wa-enviar', { body: { conversacion_id: c.id, plantilla_id: t.id, valores } });
          if (e) { let j = null; try { j = await e.context?.json?.(); } catch { /* sin cuerpo */ } avisar(j?.error || e.message, 'error'); }
          pintarMensajes(await traerMensajes(c), true); cargarLista().catch(() => {});
        } });
    };
    const btnPlantilla = el('button', { type: 'button', class: 'mkt-wa-herr', title: 'Enviar plantilla (sirve con la ventana cerrada)', 'aria-label': 'Enviar plantilla', disabled: !editar, onclick: usarPlantilla }, icono('documento', { tam: 18 }));

    const etapa = etapas.find((x) => x.id === c.mkt_contactos?.etapa_id);
    chat.replaceChildren(...[
      el('header', { class: 'mkt-wa-cab' },
        el('button', { type: 'button', class: 'mkt-wa-volver boton-icono', 'aria-label': 'Volver a las conversaciones', onclick: () => raiz.classList.remove('con-chat') }, icono('volver', { tam: 18 })),
        avatar(c),
        el('div', { class: 'mkt-wa-cab-txt' }, el('strong', {}, nombreDe(c)),
          el('small', {}, verNumero(c.wa_id), etapa ? ` · ${etapa.nombre}` : '', c.nombre_perfil && c.nombre_perfil !== nombreDe(c) ? ` · perfil: ${c.nombre_perfil}` : '')),
        el('span', { class: `mkt-wa-ventana${abierta ? ' abierta' : ''}`, title: 'WhatsApp permite responder libremente hasta 24 horas después del último mensaje del cliente' },
          icono('reloj', { tam: 13 }), abierta ? ` Ventana abierta · ${horas >= 1 ? `${Math.floor(horas)} h` : `${Math.max(1, Math.round(horas * 60))} min`}` : ' Ventana cerrada'),
        botOn ? (() => {
          const pausado = c.bot_pausado_hasta && new Date(c.bot_pausado_hasta) > new Date();
          const cambiar = async () => {
            const hasta = pausado ? null : new Date(Date.now() + (botCfg.pausa_horas ?? 12) * 3600e3).toISOString();
            const { error: e } = await ctx.api.from('mkt_wa_conversaciones').update({ bot_pausado_hasta: hasta }).eq('id', c.id);
            if (e) { avisar(e.message, 'error'); return; }
            c.bot_pausado_hasta = hasta; avisar(pausado ? 'El bot vuelve a responder en esta conversación.' : 'Bot pausado en esta conversación: respondes tú.'); pintarChat();
          };
          return el('button', { type: 'button', class: `mkt-wa-bot-estado${pausado ? ' pausado' : ''}`, disabled: !editar, onclick: cambiar,
            title: pausado ? `Pausado hasta ${new Date(c.bot_pausado_hasta).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}. Toca para que vuelva a responder.` : 'El bot responde solo. Toca para pausarlo en esta conversación.' },
            icono('auto', { tam: 13 }), pausado ? ' Bot pausado' : ' Bot activo');
        })() : null,
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mostrar u ocultar el contacto', title: 'Contacto', 'aria-pressed': String(panelAbierto),
          onclick: (ev) => { panelAbierto = !panelAbierto; raiz.classList.toggle('con-panel', panelAbierto); ev.currentTarget.setAttribute('aria-pressed', String(panelAbierto)); try { localStorage.setItem('isg.wa.panel', panelAbierto ? '1' : '0'); } catch { /* sin almacenamiento */ } } },
          icono('users', { tam: 18 }))),
      caja,
      abierta ? null : el('p', { class: 'mkt-wa-cerrada' }, icono('alerta', { tam: 14 }),
        ' Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla aprobada. ',
        editar ? el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: usarPlantilla }, 'Enviar plantilla') : null),
      editar ? el('form', { class: 'mkt-wa-compositor', onsubmit: mandar }, menuResp, nota,
        el('div', { class: 'mkt-wa-fila' }, btnResp, btnBot, btnPlantilla, entrada, btnEnviar)) : null,
    ].filter(Boolean));
    pintarMensajes(msjs, true);
    pintarPanel(c);
    if (abierta && editar) setTimeout(() => entrada.focus(), 50);
    if (c.no_leidos && editar) {
      await ctx.api.from('mkt_wa_conversaciones').update({ no_leidos: 0 }).eq('id', c.id);
      c.no_leidos = 0;
      pintarLista();
    }
  };

  // ---------------------------------------------------------------- Panel del contacto
  const pintarPanel = async (c) => {
    const k = c.mkt_contactos;
    const filas = [];
    filas.push(el('div', { class: 'mkt-wa-panel-cab' }, avatar(c, 'grande'), el('strong', {}, nombreDe(c)), el('span', { class: 'texto-suave' }, verNumero(c.wa_id))));
    if (k) {
      const sel = el('select', { class: 'campo', disabled: !editar, 'aria-label': 'Etapa del embudo' },
        etapas.map((e) => el('option', { value: e.id, selected: e.id === k.etapa_id }, e.nombre)));
      sel.addEventListener('change', async () => {
        const { error } = await ctx.api.from('mkt_contactos').update({ etapa_id: sel.value }).eq('id', k.id);
        if (error) { avisar(error.message, 'error'); sel.value = k.etapa_id; return; }
        k.etapa_id = sel.value; avisar('Etapa cambiada.');
      });
      filas.push(el('div', { class: 'mkt-wa-dato' }, el('span', {}, 'Etapa del embudo'), sel));
      if (k.interes) filas.push(el('div', { class: 'mkt-wa-dato' }, el('span', {}, 'Le interesa'), el('strong', {}, k.interes)));
      if (k.correo) filas.push(el('div', { class: 'mkt-wa-dato' }, el('span', {}, 'Correo'), el('strong', {}, k.correo)));
    }
    const acciones = el('div', { class: 'mkt-wa-acciones' },
      k ? el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('mkt.contacto', { id: k.id }) }, icono('users', { tam: 14 }), 'Ficha del contacto') : null,
      el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: async () => { try { await navigator.clipboard.writeText(`+${c.wa_id}`); avisar('Número copiado.'); } catch { avisar('No se pudo copiar.', 'error'); } } }, icono('copiar', { tam: 14 }), 'Copiar número'),
      conTaller ? el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('taller.agenda') }, icono('calendario', { tam: 14 }), 'Agenda del taller') : null);
    const vehiculos = el('div', { class: 'mkt-wa-vehiculos' });
    panel.replaceChildren(...filas, vehiculos, acciones);
    if (k?.tercero_id && conTaller) {
      const [{ data: t }, { data: vs }] = await Promise.all([
        ctx.api.from('terceros').select('razon_social, nombre_fantasia').eq('id', k.tercero_id).maybeSingle(),
        ctx.api.from('tal_vehiculos').select('id, marca, modelo, anio, patente').eq('tercero_id', k.tercero_id).is('deleted_at', null).limit(6),
      ]);
      if (actual !== c.id) return;   // se cambió de conversación mientras cargaba
      vehiculos.replaceChildren(
        el('div', { class: 'mkt-wa-dato' }, el('span', {}, 'Cliente'), el('strong', {}, t?.nombre_fantasia || t?.razon_social || 'Cliente vinculado')),
        ...(vs?.length ? [el('span', { class: 'mkt-wa-sub' }, 'Vehículos'), ...vs.map((v) => el('a', { class: 'mkt-wa-vehiculo', href: ctx.ruta('taller.vehiculo', { id: v.id }) },
          icono('camion', { tam: 15 }), el('span', {}, [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Vehículo'), el('small', {}, v.patente || '')))] : []));
    } else if (k && !k.tercero_id) {
      vehiculos.replaceChildren(el('p', { class: 'texto-suave texto-chico' }, 'Todavía no está vinculado a un cliente. Se vincula desde la ficha del contacto.'));
    }
  };

  // ---------------------------------------------------------------- Navegación y actualización
  const abrir = async (id) => {
    actual = id;
    history.replaceState(null, '', ctx.ruta('mkt.whatsapp', { c: id }));
    raiz.classList.add('con-chat');
    pintarLista();
    await pintarChat();
  };
  const refrescar = async () => {
    await cargarLista();
    const c = convs.find((x) => x.id === actual);
    if (!c || !caja) return;
    const msjs = await traerMensajes(c);
    const firma = msjs.map((m) => `${m.id}:${m.estado}`).join('|');
    if (firma !== firmaMsjs) { firmaMsjs = firma; pintarMensajes(msjs); }
    if (c.no_leidos && editar && document.hasFocus()) { await ctx.api.from('mkt_wa_conversaciones').update({ no_leidos: 0 }).eq('id', c.id); c.no_leidos = 0; pintarLista(); }
  };

  await cargarLista();
  if (actual) raiz.classList.add('con-chat');
  await pintarChat();
  // La bandeja ocupa justo el alto que queda bajo la cabecera, para que la caja de respuesta siempre se vea
  const ajustarAlto = () => {
    if (!document.contains(raiz)) return;
    const arriba = raiz.getBoundingClientRect().top + window.scrollY;
    const abajo = window.matchMedia('(max-width: 760px)').matches ? (document.querySelector('.barra-movil')?.offsetHeight ?? 0) : 0;
    raiz.style.height = `${Math.max(360, window.innerHeight - arriba - abajo - 16)}px`;
  };
  requestAnimationFrame(ajustarAlto);
  setTimeout(ajustarAlto, 300);
  window.addEventListener('resize', ajustarAlto);
  const reloj = setInterval(() => {
    if (!document.contains(raiz)) { clearInterval(reloj); window.removeEventListener('resize', ajustarAlto); return; }
    if (document.hidden) return;
    refrescar().catch(() => { /* sin conexión: reintenta en el siguiente */ });
  }, 10_000);

  const numero = rn.data[0];
  return el('section', { class: 'listado mkt-wa-vista' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'WhatsApp'),
      el('span', { class: 'mkt-wa-numero' }, icono('chat', { tam: 14 }), numero ? ` ${numero.nombre || 'Número'} · ${numero.numero || numero.phone_number_id}` : ' Sin número conectado')),
    numero ? raiz : el('p', { class: 'texto-suave' }, 'Esta empresa todavía no tiene un número de WhatsApp conectado.'));
}
