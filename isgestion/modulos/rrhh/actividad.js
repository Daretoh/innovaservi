// Actividad de los trabajadores (como en InnovaGestión), desde el Registro de horas vía rrhh_actividad:
// días y horas de los últimos 30 días, última jornada, franja de 30 días (lista), calendario de 8 semanas y
// faenas de los últimos 4 meses (ficha). Cada cuadro es más intenso según las horas del día.
import { el } from '../../core/ui/dom.js';
import { hoyISO, sumarDias, lunesDe, fechaLarga, nombreDia, horas } from '../../core/ui/formato.js';

const DIAS_FAENAS = 120;

// Map(persona → [{ fecha, minutos, faena }]) desde una fecha (por defecto, los últimos 4 meses)
export async function cargarActividad(ctx, { persona = null, desde = sumarDias(hoyISO(), -DIAS_FAENAS) } = {}) {
  const { data, error } = await ctx.api.rpc('rrhh_actividad', { p_empresa: ctx.empresa.id, p_desde: desde, p_persona: persona });
  if (error) throw error;
  const m = new Map();
  for (const x of data) { const l = m.get(x.persona_id) ?? []; l.push(x); m.set(x.persona_id, l); }
  return m;
}

// Resumen de una persona: días y minutos en los últimos N días, última jornada, minutos por día y faenas
export function resumen(lista = [], dias = 30) {
  const hoy = hoyISO();
  const lim = sumarDias(hoy, -(dias - 1));
  const porDia = new Map();
  const faenas = new Map();
  let ult = '';
  for (const x of lista) {
    porDia.set(x.fecha, (porDia.get(x.fecha) ?? 0) + x.minutos);
    if (x.fecha > ult) ult = x.fecha;
    const f = faenas.get(x.faena) ?? { nombre: x.faena, dias: new Set(), min: 0, ult: '' };
    f.dias.add(x.fecha); f.min += x.minutos; if (x.fecha > f.ult) f.ult = x.fecha;
    faenas.set(x.faena, f);
  }
  const recientes = [...porDia].filter(([f]) => f >= lim && f <= hoy);
  return {
    dias: recientes.length, min: recientes.reduce((s, [, m]) => s + m, 0), ult, porDia,
    faenas: [...faenas.values()].map((f) => ({ ...f, dias: f.dias.size })).sort((a, b) => b.ult.localeCompare(a.ult) || b.dias - a.dias),
  };
}

const nivel = (min) => (!min ? 0 : min < 240 ? 1 : min < 480 ? 2 : 3);
const hace = (f) => {
  if (!f) return '';
  const n = Math.round((new Date(`${hoyISO()}T12:00`) - new Date(`${f}T12:00`)) / 86400000);
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`;
};
const cuadro = (fecha, min, futuro = false) => el('i', {
  class: futuro ? 'act-fut' : `act-n${nivel(min)}`,
  title: `${nombreDia(fecha)} ${fechaLarga(fecha)}${futuro ? '' : min ? ` · ${horas(min)}` : ' · sin registro'}`,
});

// Línea y franja de 30 días para la tarjeta de la lista
export function lineaTarjeta(a) {
  const hoy = hoyISO();
  const texto = a.dias
    ? [el('strong', {}, `${a.dias} día${a.dias === 1 ? '' : 's'}`), ` · ${horas(a.min)} en 30 días · ${hace(a.ult)}`]
    : a.ult ? `Sin jornadas en 30 días · última ${fechaLarga(a.ult)}` : 'Sin jornadas registradas';
  const franja = el('span', { class: 'act-franja', 'aria-hidden': 'true' },
    Array.from({ length: 30 }, (_, i) => { const f = sumarDias(hoy, i - 29); return cuadro(f, a.porDia.get(f) ?? 0); }));
  return [el('span', { class: 'act-linea' }, texto), franja];
}

// Pestaña "Actividad" de la ficha
export function panelActividad(a) {
  const hoy = hoyISO();
  const ini = sumarDias(lunesDe(hoy), -49);
  const semanas = Array.from({ length: 8 }, (_, w) => el('div', { class: 'act-semana' },
    Array.from({ length: 7 }, (_, d) => { const f = sumarDias(ini, w * 7 + d); return cuadro(f, a.porDia.get(f) ?? 0, f > hoy); })));
  const MAX = 6;
  const filaFaena = (f, i) => el('div', { class: `act-faena${i >= MAX ? ' oculto' : ''}` },
    el('div', {}, el('strong', {}, f.nombre), el('span', { class: 'texto-suave texto-chico' }, `Última vez ${nombreDia(f.ult)} ${fechaLarga(f.ult)}`)),
    el('span', { class: 'act-faena-n' }, `${f.dias} día${f.dias === 1 ? '' : 's'}`, el('br'), horas(f.min)));
  const lista = el('div', { class: 'act-faenas' }, a.faenas.map(filaFaena));
  const mas = a.faenas.length > MAX ? el('button', { type: 'button', class: 'boton boton-secundario', onclick: (ev) => {
    for (const x of lista.querySelectorAll('.oculto')) x.classList.remove('oculto'); ev.currentTarget.remove();
  } }, `Ver las ${a.faenas.length} faenas`) : null;

  return el('div', { class: 'act' },
    el('div', { class: 'ficha' },
      el('div', { class: 'act-kpis' },
        el('div', {}, el('strong', {}, String(a.dias)), el('span', {}, 'días trabajados', el('br'), 'últimos 30 días')),
        el('div', {}, el('strong', {}, horas(a.min)), el('span', {}, 'horas', el('br'), 'últimos 30 días')),
        el('div', {}, el('strong', {}, a.ult ? fechaLarga(a.ult).slice(0, 5) : '—'), el('span', {}, 'última jornada', el('br'), a.ult ? hace(a.ult) : 'sin registros'))),
      el('div', { class: 'act-cal' },
        el('div', { class: 'act-dias', 'aria-hidden': 'true' }, ['L', '', 'M', '', 'V', '', 'D'].map((x) => el('span', {}, x))),
        el('div', { class: 'act-semanas', role: 'img', 'aria-label': `Días trabajados en las últimas 8 semanas: ${[...a.porDia.keys()].filter((f) => f >= ini).length}` }, semanas)),
      el('div', { class: 'act-leyenda texto-suave texto-chico' }, el('span', {}, 'Últimas 8 semanas'),
        el('span', { class: 'act-escala' }, 'Menos', [0, 1, 2, 3].map((n) => el('i', { class: `act-n${n}` })), 'Más'))),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Faenas trabajadas ', el('span', { class: 'texto-suave texto-chico' }, '· últimos 4 meses')),
      a.faenas.length ? [lista, mas] : el('p', { class: 'texto-suave' }, 'Sin horas registradas en los últimos 4 meses.')));
}
