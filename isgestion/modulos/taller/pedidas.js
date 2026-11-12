// Horas pedidas en línea (Marketing 006: agenda pública /agenda/): franja arriba de la Agenda del taller con las que
// esperan confirmación. Confirmar crea cliente (o usa el del teléfono), vehículo (por patente) y la orden agendada con
// el servicio; se puede cambiar el día y la hora. Rechazar pide el motivo. Después, avisar al cliente por WhatsApp.
import { el } from '../../core/ui/dom.js?v=bdac687';
import { icono } from '../../core/ui/iconos.js?v=bdac687';
import { boton } from '../../core/ui/tabla.js?v=bdac687';
import { avisar } from '../../core/ui/aviso.js?v=bdac687';
import { abrirFormulario } from '../../core/ui/modal.js?v=bdac687';
import { nombreDia, fechaCorta, hhmm } from '../../core/ui/formato.js?v=bdac687';
import { verPatente } from './datos.js?v=bdac687';

const whatsapp = (tel, texto) => {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) d = `56${d}`;
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
};
const cuando = (fecha, hora) => `${nombreDia(fecha).toLowerCase()} ${fechaCorta(fecha)} a las ${hhmm(hora)}`;

function avisarCliente(ctx, r, texto) {
  const url = whatsapp(r.telefono, texto);
  ctx.refrescar();
  if (!url) return;
  abrirFormulario({ titulo: 'Avisar al cliente', mensaje: texto, campos: [], textoGuardar: 'Avisar por WhatsApp',
    alGuardar: () => { window.open(url, '_blank', 'noopener'); } });
}

export async function franjaPedidas(ctx) {
  const { data, error } = await ctx.api.from('mkt_reservas').select('*').eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente').order('fecha').order('hora').limit(50);
  if (error || !data?.length) return null;
  const crear = ctx.puede('taller', 'crear');
  const primero = (r) => r.nombre.split(/\s+/)[0];

  const confirmar = (r) => abrirFormulario({
    titulo: 'Confirmar hora', textoGuardar: 'Confirmar y agendar',
    mensaje: `${r.nombre} · ${[r.marca, r.modelo, r.anio].filter(Boolean).join(' ') || 'Vehículo sin datos'}${r.patente ? ` · ${verPatente(r.patente)}` : ''}${r.servicio ? ` · ${r.servicio}` : ''}. Se crea la orden agendada (y el cliente y el vehículo si no existen).`,
    campos: [{ id: 'fecha', etiqueta: 'Día', tipo: 'date', requerido: true, valor: r.fecha }, { id: 'hora', etiqueta: 'Hora', tipo: 'time', requerido: true, valor: hhmm(r.hora) }],
    alGuardar: async (v) => {
      const { error: e } = await ctx.api.rpc('mkt_confirmar_reserva', { p_id: r.id, p_fecha: v.fecha, p_hora: v.hora });
      if (e) throw new Error(e.message);
      avisar('Hora confirmada: quedó en la agenda.');
      setTimeout(() => avisarCliente(ctx, r, `Hola ${primero(r)}, te confirmamos tu hora en ${ctx.empresa.nombre_fantasia || ctx.empresa.razon_social} para el ${cuando(v.fecha, v.hora)}${r.servicio ? ` (${r.servicio})` : ''}. ¡Te esperamos!`), 50);
    },
  });
  const rechazar = (r) => abrirFormulario({
    titulo: 'No se puede esa hora', textoGuardar: 'Rechazar',
    campos: [{ id: 'motivo', etiqueta: 'Motivo (para el registro)', requerido: true, valor: 'Sin cupo ese día' }],
    alGuardar: async (v) => {
      const { error: e } = await ctx.api.rpc('mkt_rechazar_reserva', { p_id: r.id, p_motivo: v.motivo });
      if (e) throw new Error(e.message);
      avisar('Hora rechazada.');
      setTimeout(() => avisarCliente(ctx, r, `Hola ${primero(r)}, gracias por agendar con nosotros. Lamentablemente el ${cuando(r.fecha, r.hora)} no tenemos disponibilidad. ¿Te acomoda otro día u hora?`), 50);
    },
  });

  return el('section', { class: 'ficha tal-pedidas' },
    el('div', { class: 'listado-cabecera' },
      el('h2', {}, icono('calendario', { tam: 18 }), ` Horas pedidas en línea (${data.length})`),
      el('span', { class: 'texto-suave texto-chico' }, 'Confirma o cambia la hora: recién ahí entra a la agenda.')),
    el('ul', { class: 'tal-pedidas-lista' }, data.map((r) => el('li', {},
      el('div', { class: 'tal-pedida-datos' },
        el('strong', {}, `${nombreDia(r.fecha)} ${fechaCorta(r.fecha)} · ${hhmm(r.hora)}`),
        el('span', {}, r.nombre, ' · ', el('a', { href: whatsapp(r.telefono, `Hola ${primero(r)}`) ?? '#', target: '_blank', rel: 'noopener' }, r.telefono)),
        el('span', { class: 'texto-chico' }, [[r.marca, r.modelo, r.anio].filter(Boolean).join(' '), verPatente(r.patente), r.servicio].filter(Boolean).join(' · ') || 'Sin datos del vehículo'),
        r.nota ? el('span', { class: 'texto-suave texto-chico' }, `"${r.nota}"`) : null,
        r.socio_id ? el('span', { class: 'chip chip-ok' }, 'Inscrito como cliente') : null),
      crear ? el('div', { class: 'listado-acciones' },
        boton('Confirmar', { icono: 'check', tipo: 'primario', onclick: () => confirmar(r) }),
        boton('Rechazar', { onclick: () => rechazar(r) })) : null))));
}

// Tarjeta de cliente (Marketing 007) en la orden: sellos del cliente y, si completó la tarjeta, canjear el premio aquí.
export async function avisoTarjeta(ctx, o) {
  if (!o.tercero_id || o.estado === 'anulada') return null;
  const { data, error } = await ctx.api.rpc('mkt_tarjeta_cliente', { p_empresa: ctx.empresa.id, p_tercero: o.tercero_id });
  const t = data?.[0];
  if (error || !t?.activo) return null;
  const premio = t.sellos >= t.meta;
  const canjear = () => abrirFormulario({ titulo: 'Canjear premio', textoGuardar: 'Canjear', campos: [],
    mensaje: `${t.premio}. Se descuentan ${t.meta} sellos de la tarjeta del cliente. Si el premio es un servicio gratis o un descuento, aplícalo en el cobro de esta orden.`,
    alGuardar: async () => {
      const { error: e } = await ctx.api.rpc('mkt_canjear', { p_socio: t.socio_id, p_orden: o.id, p_nota: `Orden N° ${o.numero}` });
      if (e) throw new Error(e.message);
      avisar('Premio canjeado.'); ctx.refrescar();
    } });
  return el('p', { class: `aviso-bandeja${premio ? ' tal-premio' : ''}` }, icono('etiqueta', { tam: 16 }),
    premio ? ` Tarjeta de cliente completa (${t.sellos}/${t.meta}): tiene de premio ${t.premio}. ` : ` Tarjeta de cliente: ${t.sellos}/${t.meta} sellos${o.cobrado ? '' : '; al cobrar esta orden suma sello'}. `,
    premio && ctx.puede('taller', 'editar') ? boton('Canjear premio', { icono: 'check', tipo: 'primario', class: 'boton boton-primario boton-chico', onclick: canjear }) : null);
}
