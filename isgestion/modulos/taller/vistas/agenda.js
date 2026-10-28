// Agenda del taller: citas de la semana por día, con su estado. Hoy destacado; en tablet las columnas se
// deslizan y parte mostrando el día de hoy; "+" para agendar en un día (aparece al pasar el mouse).
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, hhmm, esFinde, nombreMes } from '../../../core/ui/formato.js?v=b8da9fc';
import { placa } from '../../../core/ui/placa.js?v=b8da9fc';
import { esTelefono } from '../../../core/movil.js?v=b8da9fc';
import { SELECT_ORDEN, CHIP_PRIORIDAD, nombreEstado, verPatente, nombreVehiculo, nombreTercero } from '../datos.js?v=b8da9fc';
import { recepcion } from '../recepcion.js?v=b8da9fc';

const estado = { lunes: lunesDe(hoyISO()), dia: null };

export default async function vista(ctx) {
  const lunes = estado.lunes;
  const domingo = sumarDias(lunes, 6);
  const hoy = hoyISO();
  const { data, error } = await ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('empresa_id', ctx.empresa.id)
    .neq('estado', 'anulada').gte('fecha_cita', lunes).lte('fecha_cita', domingo).order('hora_cita', { nullsFirst: false });
  if (error) throw error;
  const crear = ctx.puede('taller', 'crear');
  if (esTelefono()) return agendaMovil(ctx, data, { lunes, hoy, crear });

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

// Teléfono (dirección B): franja con los 7 días (punto si hay citas) y la línea de tiempo del día elegido; flechas o
// deslizar para cambiar de semana. Día vacío: "Agendar este día".
const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
function agendaMovil(ctx, data, { lunes, hoy, crear }) {
  const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(lunes, i));
  if (!dias.includes(estado.dia)) estado.dia = dias.includes(hoy) ? hoy : lunes;
  const chip = { agendado: 'chip-pend', espera: 'chip-prox', proceso: 'chip-prox', terminado: 'chip-ok', entregado: 'chip-ok' };

  const titulo = el('h2', { class: 'ag-titulo' });
  const lista = el('div', { class: 'ag-lista' });
  const botones = dias.map((f, i) => el('button', { type: 'button', role: 'tab', class: `ag-dia${f === hoy ? ' hoy' : ''}`, onclick: () => { estado.dia = f; pintar(); } },
    el('span', {}, nombreDia(f)), el('strong', {}, String(Number(f.slice(8)))),
    el('i', { class: data.some((o) => o.fecha_cita === f) ? 'con-citas' : '', 'aria-hidden': 'true' }),
    el('span', { class: 'sr-solo' }, `${DIAS_LARGOS[i]}, ${data.filter((o) => o.fecha_cita === f).length} citas`)));
  const pintar = () => {
    botones.forEach((b, i) => b.setAttribute('aria-selected', String(dias[i] === estado.dia)));
    const del = data.filter((o) => o.fecha_cita === estado.dia);
    const i = dias.indexOf(estado.dia);
    titulo.textContent = `${estado.dia === hoy ? `Hoy, ${DIAS_LARGOS[i].toLowerCase()}` : DIAS_LARGOS[i]} ${Number(estado.dia.slice(8))} · ${del.length} ${del.length === 1 ? 'cita' : 'citas'}`;
    lista.replaceChildren(...(del.length ? del.map((o, j) => el('a', { class: 'ag-cita', href: ctx.ruta('taller.orden', { id: o.id }), style: `animation-delay:${j * 60}ms` },
      el('div', { class: 'ag-hora' }, el('strong', {}, o.hora_cita ? hhmm(o.hora_cita) : '—'), el('i', { 'aria-hidden': 'true' })),
      el('div', { class: 'ag-tarjeta' },
        el('div', { class: 'ag-tarjeta-cab' }, placa(o.tal_vehiculos?.patente, { tam: 'chica' }), el('span', { class: `chip ${chip[o.estado] ?? 'chip-pend'}` }, nombreEstado[o.estado])),
        el('strong', {}, nombreVehiculo(o.tal_vehiculos)),
        el('span', { class: 'texto-suave' }, [o.tal_orden_servicios.map((s) => s.nombre).join(' + '), o.terceros ? nombreTercero(o.terceros) : ''].filter(Boolean).join(' · ') || 'Sin servicios'))))
      : [el('div', { class: 'tm-vacio' }, el('span', {}, estado.dia < hoy ? 'Sin citas este día.' : 'Día libre: sin citas.'),
        crear && estado.dia >= hoy ? boton('Agendar este día', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx, { fecha: estado.dia }) }) : null)]));
  };
  pintar();

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); estado.dia = null; ctx.refrescar(); };
  const franja = el('div', { class: 'ag-franja', role: 'tablist', 'aria-label': 'Días de la semana' }, botones);
  let x0 = null;
  franja.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  franja.addEventListener('touchend', (ev) => { if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) >= 60) mover(dx < 0 ? 1 : -1); }, { passive: true });
  return el('section', { class: 'listado tm ag' },
    el('header', { class: 'tm-cab ag-cab' },
      el('div', { class: 'tm-cab-fila' },
        el('h1', {}, 'Agenda'),
        el('div', { class: 'ag-semana' },
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
          el('span', {}, nombreMes(lunes.slice(0, 7)).split(' ')[0]),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')))),
      franja,
      lunes !== lunesDe(hoy) ? el('button', { type: 'button', class: 'ag-hoy', onclick: () => { estado.lunes = lunesDe(hoy); estado.dia = hoy; ctx.refrescar(); } }, 'Volver a hoy') : null),
    titulo,
    lista);
}
