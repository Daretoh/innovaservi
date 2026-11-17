// Marketing → WhatsApp (Marketing 008): bandeja de conversaciones del número de WhatsApp de la empresa (API de la nube
// de Meta). A la izquierda las conversaciones (no leídas primero en negrita), a la derecha el chat con su contacto del
// Embudo. Responder pide editar y solo dentro de las 24 horas desde el último mensaje del cliente (regla de WhatsApp);
// lo envía la Edge Function mkt-wa-enviar. Se actualiza sola cada 10 segundos mientras está abierta.
// Ruta: #/mkt.whatsapp[?c=<conversación>]
import { el } from '../../../core/ui/dom.js?v=e104b69';
import { icono } from '../../../core/ui/iconos.js?v=e104b69';
import { boton } from '../../../core/ui/tabla.js?v=e104b69';
import { avisar } from '../../../core/ui/aviso.js?v=e104b69';
import { diaLocal, hoyISO, fechaLarga } from '../../../core/ui/formato.js?v=e104b69';
import { cargarCss } from '../datos.js?v=e104b69';

const ESTADO = { pendiente: 'Enviando…', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', fallido: 'No se envió' };
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const cuando = (ts) => (diaLocal(ts) === hoyISO() ? hora(ts) : fechaLarga(diaLocal(ts)));
const verNumero = (wa) => (wa?.startsWith('56') && wa.length === 11 ? `+56 ${wa.slice(2, 3)} ${wa.slice(3, 7)} ${wa.slice(7)}` : `+${wa}`);
const enVentana = (c) => c.ultimo_cliente_at && Date.now() - new Date(c.ultimo_cliente_at).getTime() < 24 * 3600 * 1000;

export default async function vista(ctx) {
  cargarCss();
  const eid = ctx.empresa.id;
  const editar = ctx.puede('mkt', 'editar');
  const { data: numeros, error: en } = await ctx.api.from('mkt_wa_numeros').select('*').eq('empresa_id', eid).eq('activo', true);
  if (en) throw en;
  let actual = ctx.params?.c ?? null;
  let convs = [];

  const lista = el('nav', { class: 'mkt-wa-lista', 'aria-label': 'Conversaciones' });
  const chat = el('section', { class: 'mkt-wa-chat' });
  const raiz = el('div', { class: 'mkt-wa' }, lista, chat);

  const cargarLista = async () => {
    const { data, error } = await ctx.api.from('mkt_wa_conversaciones').select('*, mkt_contactos(id, nombre)').eq('empresa_id', eid).eq('archivada', false)
      .order('ultimo_at', { ascending: false }).limit(200);
    if (error) throw error;
    convs = data;
    lista.replaceChildren(...(convs.length ? convs.map((c) => el('a', {
      class: `mkt-wa-item${c.id === actual ? ' activa' : ''}${c.no_leidos ? ' no-leida' : ''}`, href: ctx.ruta('mkt.whatsapp', { c: c.id }),
      onclick: (ev) => { ev.preventDefault(); abrir(c.id); },
    },
      el('span', { class: 'mkt-wa-item-cab' }, el('strong', {}, c.mkt_contactos?.nombre || c.nombre_perfil || verNumero(c.wa_id)), el('small', {}, cuando(c.ultimo_at))),
      el('span', { class: 'mkt-wa-item-pie' }, el('span', { class: 'mkt-wa-prev' }, c.ultimo_texto || ''), c.no_leidos ? el('span', { class: 'mkt-wa-cuenta' }, String(c.no_leidos)) : null)))
      : [el('p', { class: 'texto-suave texto-chico mkt-wa-vacio' }, 'Todavía no hay conversaciones. Cuando un cliente escriba al WhatsApp de la empresa aparecerá aquí.')]));
  };

  const pintarChat = async () => {
    const c = convs.find((x) => x.id === actual);
    if (!c) { chat.replaceChildren(el('div', { class: 'mkt-wa-nada' }, icono('chat', { tam: 40 }), el('p', { class: 'texto-suave' }, 'Elige una conversación.'))); return; }
    const { data: msjs, error } = await ctx.api.from('mkt_wa_mensajes').select('*').eq('conversacion_id', c.id).order('created_at').limit(500);
    if (error) throw error;
    let dia = '';
    const burbujas = [];
    for (const m of msjs) {
      const d = diaLocal(m.created_at);
      if (d !== dia) { dia = d; burbujas.push(el('div', { class: 'mkt-wa-dia' }, d === hoyISO() ? 'Hoy' : fechaLarga(d))); }
      burbujas.push(el('div', { class: `mkt-wa-msj ${m.direccion}${m.estado === 'fallido' ? ' fallido' : ''}` },
        el('div', { class: 'mkt-wa-burbuja' }, m.texto || `[${m.tipo}]`),
        el('small', {}, hora(m.created_at), m.direccion === 'salida' ? ` · ${m.autor === 'bot' ? 'Bot · ' : ''}${ESTADO[m.estado] ?? m.estado}` : '',
          m.error ? el('span', { class: 'mkt-wa-error' }, ` (${m.error})`) : null)));
    }
    const caja = el('div', { class: 'mkt-wa-mensajes' }, burbujas);
    const abierta = enVentana(c);
    const entrada = el('textarea', { class: 'campo', rows: 2, maxlength: 4096, placeholder: 'Escribe una respuesta…', disabled: !editar || !abierta });
    const enviar = boton('Enviar', { icono: 'derecha', tipo: 'primario', type: 'submit', disabled: !editar || !abierta });
    const mandar = async (ev) => {
      ev.preventDefault();
      const texto = entrada.value.trim();
      if (!texto || enviar.disabled) return;
      enviar.disabled = true;
      const { error: e } = await ctx.api.functions.invoke('mkt-wa-enviar', { body: { conversacion_id: c.id, texto } });
      let msj = null;
      if (e) { try { msj = (await e.context?.json?.())?.error; } catch { /* sin cuerpo */ } avisar(msj || e.message, 'error'); } else entrada.value = '';
      enviar.disabled = false;
      await refrescar();
    };
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) mandar(ev); });
    chat.replaceChildren(
      el('header', { class: 'mkt-wa-cab' },
        el('div', {}, el('strong', {}, c.mkt_contactos?.nombre || c.nombre_perfil || verNumero(c.wa_id)),
          el('small', { class: 'texto-suave' }, verNumero(c.wa_id), c.nombre_perfil && c.mkt_contactos?.nombre && c.nombre_perfil !== c.mkt_contactos.nombre ? ` · perfil: ${c.nombre_perfil}` : '')),
        c.contacto_id ? el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('mkt.contacto', { id: c.contacto_id }) }, icono('users', { tam: 14 }), 'Ficha') : null),
      caja,
      abierta ? null : el('p', { class: 'aviso-bandeja texto-chico' }, icono('alerta', { tam: 14 }),
        ' Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla aprobada (próximamente).'),
      editar ? el('form', { class: 'mkt-bot-entrada', onsubmit: mandar }, entrada, enviar) : null);
    caja.scrollTop = caja.scrollHeight;
    if (c.no_leidos && editar) {
      await ctx.api.from('mkt_wa_conversaciones').update({ no_leidos: 0 }).eq('id', c.id);
      c.no_leidos = 0;
      lista.querySelector('.mkt-wa-item.activa')?.classList.remove('no-leida');
      lista.querySelector('.mkt-wa-item.activa .mkt-wa-cuenta')?.remove();
    }
  };

  const abrir = async (id) => {
    actual = id;
    history.replaceState(null, '', ctx.ruta('mkt.whatsapp', { c: id }));
    lista.querySelectorAll('.mkt-wa-item').forEach((a) => a.classList.toggle('activa', a.getAttribute('href') === ctx.ruta('mkt.whatsapp', { c: id })));
    raiz.classList.add('con-chat');
    await pintarChat();
  };
  const refrescar = async () => {
    const escribiendo = chat.querySelector('textarea');
    const borrador = escribiendo?.value ?? '';
    const tenia = document.activeElement === escribiendo;
    await cargarLista();
    await pintarChat();
    const nueva = chat.querySelector('textarea');
    if (nueva && borrador) { nueva.value = borrador; if (tenia) nueva.focus(); }
  };

  await cargarLista();
  if (actual) raiz.classList.add('con-chat');
  await pintarChat();
  const reloj = setInterval(() => {
    if (!document.contains(raiz)) { clearInterval(reloj); return; }
    if (document.hidden) return;
    refrescar().catch(() => { /* sin conexión: reintenta en el siguiente */ });
  }, 10_000);

  const numero = numeros[0];
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'WhatsApp'),
      el('span', { class: 'texto-suave texto-chico' }, numero ? `${numero.nombre || 'Número'} · ${numero.numero || numero.phone_number_id}` : 'Sin número conectado'),
      el('button', { type: 'button', class: 'boton boton-secundario boton-chico mkt-wa-volver', onclick: () => raiz.classList.remove('con-chat') }, icono('volver', { tam: 14 }), 'Conversaciones')),
    numero ? raiz : el('p', { class: 'texto-suave' }, 'Esta empresa todavía no tiene un número de WhatsApp conectado.'));
}
