// Tarjeta con la hora que juntó el bot (pedir_hora de la Edge Function mkt-bot): servicio, día y hora, cliente y
// vehículo. En el simulador solo se muestra; en la bandeja de WhatsApp trae el botón para dejarla pedida en la agenda.
import { el } from '../../core/ui/dom.js?v=548645c';
import { icono } from '../../core/ui/iconos.js?v=548645c';
import { nombreDia, fechaCorta } from '../../core/ui/formato.js?v=548645c';

export function tarjetaHora(h, texto, { textoBoton = null, alPedir = null } = {}) {
  const fila = (t, v) => (v ? el('div', {}, el('span', {}, t), el('strong', {}, v)) : null);
  const btn = textoBoton && alPedir && h.libre && h.servicio_id
    ? el('button', { type: 'button', class: 'boton boton-primario boton-chico', onclick: (ev) => alPedir(ev.currentTarget) }, icono('calendario', { tam: 14 }), textoBoton) : null;
  return el('div', { class: 'mkt-hora-bot' },
    el('div', { class: 'mkt-hora-bot-cab' }, icono('calendario', { tam: 15 }), el('strong', {}, 'Hora propuesta por el bot')),
    el('div', { class: 'mkt-hora-bot-datos' },
      fila('Día', /^\d{4}-\d{2}-\d{2}$/.test(h.fecha) ? `${nombreDia(h.fecha)} ${fechaCorta(h.fecha)} · ${h.hora}` : `${h.fecha} ${h.hora}`),
      fila('Servicio', h.servicio || 'Sin servicio válido'),
      fila('Cliente', h.nombre),
      fila('Vehículo', [h.marca, h.modelo, h.anio].filter(Boolean).join(' ') + (h.patente ? ` · ${h.patente}` : ''))),
    !h.libre ? el('p', { class: 'mkt-wa-error texto-chico' }, icono('alerta', { tam: 13 }), ' Esa hora ya no está libre en la agenda: elige otra con el cliente.') : null,
    !h.servicio_id ? el('p', { class: 'mkt-wa-error texto-chico' }, icono('alerta', { tam: 13 }), ' El servicio no calza con los de la agenda.') : null,
    el('p', { class: 'texto-suave texto-chico' }, texto),
    btn);
}
