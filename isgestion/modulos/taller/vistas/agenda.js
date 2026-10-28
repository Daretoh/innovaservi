// Agenda del taller: citas de la semana por día, con su estado. Hoy destacado; en tablet las columnas se
// deslizan y parte mostrando el día de hoy; "+" para agendar en un día (aparece al pasar el mouse).
import { el } from '../../../core/ui/dom.js?v=faa3077';
import { icono } from '../../../core/ui/iconos.js?v=faa3077';
import { boton } from '../../../core/ui/tabla.js?v=faa3077';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, hhmm, esFinde } from '../../../core/ui/formato.js?v=faa3077';
import { SELECT_ORDEN, CHIP_PRIORIDAD, nombreEstado, verPatente, nombreVehiculo, nombreTercero } from '../datos.js?v=faa3077';
import { recepcion } from '../recepcion.js?v=faa3077';

const estado = { lunes: lunesDe(hoyISO()) };

export default async function vista(ctx) {
  const lunes = estado.lunes;
  const domingo = sumarDias(lunes, 6);
  const hoy = hoyISO();
  const { data, error } = await ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('empresa_id', ctx.empresa.id)
    .neq('estado', 'anulada').gte('fecha_cita', lunes).lte('fecha_cita', domingo).order('hora_cita', { nullsFirst: false });
  if (error) throw error;
  const crear = ctx.puede('taller', 'crear');

  const chipEstado = (o) => (o.estado === 'agendado' ? CHIP_PRIORIDAD[o.prioridad] : o.estado === 'entregado' ? 'chip-ok' : 'chip-prox');
  const columnas = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const fecha = sumarDias(lunes, i);
    const del = data.filter((o) => o.fecha_cita === fecha);
    const clases = ['plan-columna', 'tal-dia', fecha === hoy ? 'hoy' : '', esFinde(fecha) ? 'finde' : '', fecha < hoy ? 'pasado' : ''].filter(Boolean).join(' ');
    return el('div', { class: clases, 'data-fecha': fecha },
      el('div', { class: 'tal-dia-cab' },
        el('span', { class: 'tal-dia-nombre' }, nombreDia(fecha)),
        el('span', { class: 'tal-dia-num' }, String(Number(fecha.slice(8)))),
        del.length ? el('span', { class: 'tal-cuenta' }, `${del.length} ${del.length === 1 ? 'cita' : 'citas'}`) : null),
      del.map((o) => el('a', { class: `plan-tarjeta tal-cita prio-${o.prioridad}`, href: ctx.ruta('taller.orden', { id: o.id }) },
        el('div', { class: 'plan-fila' },
          el('span', { class: 'tal-hora' }, o.hora_cita ? hhmm(o.hora_cita) : 'Sin hora'),
          el('span', { class: `chip ${chipEstado(o)}` }, nombreEstado[o.estado])),
        el('strong', {}, nombreVehiculo(o.tal_vehiculos)),
        el('span', { class: 'tal-placa' }, verPatente(o.tal_vehiculos?.patente) || 'Sin patente'),
        o.terceros ? el('span', { class: 'texto-chico' }, nombreTercero(o.terceros)) : null,
        o.tal_orden_servicios.length ? el('span', { class: 'texto-suave texto-chico' }, o.tal_orden_servicios.map((s) => s.nombre).join(' + ')) : null)),
      del.length ? null : el('p', { class: 'tal-vacia texto-suave texto-chico' }, 'Libre'),
      crear && fecha >= hoy ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico tal-agendar', 'aria-label': `Agendar el ${fechaCorta(fecha)}`, onclick: () => recepcion(ctx, { fecha }) }, icono('mas', { tam: 14 }), 'Agendar') : null);
  });

  const tablero = el('div', { class: 'plan-tablero tal-agenda' }, columnas);
  // En tablet o teléfono: mostrar el día de hoy al abrir (si está en la semana)
  setTimeout(() => {
    const dia = tablero.querySelector('.tal-dia.hoy');
    if (dia && tablero.scrollWidth > tablero.clientWidth) tablero.scrollTo({ left: dia.offsetLeft - tablero.offsetLeft - 4, behavior: 'smooth' });
  }, 50);

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); ctx.refrescar(); };
  const total = data.length;
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Agenda'),
      el('div', { class: 'listado-acciones' },
        el('div', { class: 'nav-periodo' },
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
          el('strong', {}, `Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} – ${fechaCorta(domingo)}`),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha'))),
        lunes !== lunesDe(hoy) ? boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoy); ctx.refrescar(); } }) : null,
        crear ? boton('Agendar vehículo', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx) }) : null)),
    el('p', { class: 'texto-suave' }, total ? `${total} ${total === 1 ? 'cita' : 'citas'} esta semana` : 'Sin citas esta semana.'),
    tablero);
}
