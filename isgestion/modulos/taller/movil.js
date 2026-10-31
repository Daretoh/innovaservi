// Piezas del taller para el teléfono (dirección B "Patente al centro", aprobada por Enzo el 2026-10-27): línea de etapas,
// tarjeta de auto con la placa y lo que necesita atención. Las usan el Inicio, el Tablero y la Orden en el teléfono.
import { el } from '../../core/ui/dom.js?v=e4cf9a2';
import { placa } from '../../core/ui/placa.js?v=e4cf9a2';
import { hhmm, fechaCorta, hoyISO } from '../../core/ui/formato.js?v=e4cf9a2';
import { ESTADOS, PRIORIDADES, nombreVehiculo, minutosTrabajo, textoMinutos, hora } from './datos.js?v=e4cf9a2';
import { avance } from './seguimiento.js?v=e4cf9a2';

export const ETAPAS = ESTADOS.slice(0, 4);   // agendado, espera, proceso, terminado (entregado sale del tablero del teléfono)
const ESPERA_LARGA = 60;

export const minutosDesde = (ts) => (ts ? Math.max(0, Math.round((Date.now() - new Date(ts)) / 60000)) : null);
export const largo = (m) => (m == null ? '' : m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : textoMinutos(m));

// Cuatro barras (agendado → terminado): hechas en verde, la actual en el color de la empresa. Con horas: la hora de cada paso.
export function pasosEtapa(o, { horas = false } = {}) {
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const marca = { agendado: o.fecha_cita ? `${fechaCorta(o.fecha_cita)}${o.hora_cita ? ` ${hhmm(o.hora_cita)}` : ''}` : '', espera: hora(o.ingreso_at), proceso: hora(o.inicio_at), terminado: hora(o.termino_at) };
  return el('ol', { class: 'tm-pasos', 'aria-label': `Etapa: ${ESTADOS[i]?.[1] ?? o.estado}` },
    ETAPAS.map(([k, n], j) => el('li', { class: j < i ? 'hecho' : j === i ? 'actual' : '', 'aria-current': j === i ? 'step' : null },
      el('span', { class: 'tm-paso-barra', 'aria-hidden': 'true' }),
      el('span', { class: 'tm-paso-nombre' }, n),
      horas ? el('span', { class: 'tm-paso-hora' }, marca[k] || (j === i ? 'ahora' : '—')) : null)));
}

// Texto de tiempo de la tarjeta según la etapa
export function tiempoOrden(o) {
  if (o.estado === 'agendado') return o.fecha_cita ? `Cita ${o.fecha_cita === hoyISO() ? 'hoy' : fechaCorta(o.fecha_cita)}${o.hora_cita ? ` ${hhmm(o.hora_cita)}` : ''}` : 'Sin fecha';
  if (o.estado === 'espera') return `Esperando ${largo(minutosDesde(o.ingreso_at)) || 'recién'}`;
  if (o.estado === 'proceso') return `Lleva ${largo(minutosTrabajo(o)) || '0 min'}`;
  if (o.estado === 'terminado') return `Terminó hace ${largo(minutosDesde(o.termino_at)) || 'un momento'}`;
  return '';
}

// Por qué un auto necesita atención (Inicio); null si no
export function motivoAtencion(o) {
  if (o.estado === 'terminado') return { orden: 0, texto: `Listo hace ${largo(minutosDesde(o.termino_at)) || 'un momento'}: avisar al cliente` };
  if (o.estado === 'espera' && minutosDesde(o.ingreso_at) >= ESPERA_LARGA) return { orden: 1, texto: `Esperando ${largo(minutosDesde(o.ingreso_at))} sin comenzar` };
  if (o.estado === 'proceso') return { orden: 2, texto: `Lleva ${largo(minutosTrabajo(o)) || '0 min'} en proceso` };
  if (o.estado === 'agendado' && o.fecha_cita === hoyISO()) return { orden: 3, texto: `Cita hoy${o.hora_cita ? ` ${hhmm(o.hora_cita)}` : ''}` };
  return null;
}

const servicioDe = (o) => {
  const s = [...(o.tal_orden_servicios ?? [])].sort((a, b) => a.orden - b.orden).map((x) => x.nombre).join(' + ');
  const n = o.tareas?.length ?? 0;
  return [s || 'Sin servicios', o.estado === 'proceso' && n ? `${o.tareas.filter((t) => t.ok).length} de ${n} tareas` : ''].filter(Boolean).join(' · ');
};

// Tarjeta de un auto: placa, vehículo y servicio; abajo, según `pie`: 'pasos' (Inicio) o 'avance' (Tablero)
export function tarjetaAuto(ctx, o, { texto, pie = 'pasos', retraso = 0, accion = null } = {}) {
  const v = o.tal_vehiculos;
  const pct = avance(o);
  const prio = PRIORIDADES.find((p) => p[0] === o.prioridad)?.[1] ?? '';
  // Toda la tarjeta abre la orden (enlace estirado sobre la tarjeta); el botón de la acción queda encima
  const nodo = el('div', { class: 'tm-auto', style: `animation-delay:${retraso}ms` },
    el('div', { class: 'tm-auto-cab' },
      placa(v?.patente),
      el('div', { class: 'tm-auto-texto' }, el('a', { class: 'tm-enlace', href: ctx.ruta('taller.orden', { id: o.id }) }, nombreVehiculo(v)), el('span', {}, texto ?? servicioDe(o))),
      pie === 'avance' ? el('span', { class: 'tm-auto-pct' }, `${pct}%`) : null),
    pie === 'pasos' ? pasosEtapa(o)
      : [el('span', { class: 'tm-barra', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Avance' }, el('i', { style: `width:${pct}%` })),
        el('div', { class: 'tm-auto-pie' },
          el('span', {}, tiempoOrden(o)),
          el('span', { class: `tm-prio tm-prio-${o.prioridad}` }, prio),
          accion)]);
  return nodo;
}
