// Navegador de semana común (2026-11-24, pedido de Enzo: "Semana 48 · 23-11-2026 al 29-11-2026" en una sola línea se
// leía saturado). Una tarjeta con la flecha a cada lado, arriba "Semana 48" chico y abajo el rango "23 – 29 nov 2026";
// "Hoy" solo si no es la semana actual. Y la cabecera de cada día como "Martes 24 nov" (con "Hoy" si corresponde).
import { el } from './dom.js?v=db2b2b7';
import { icono } from './iconos.js?v=db2b2b7';
import { boton } from './tabla.js?v=db2b2b7';
import { numSemana, sumarDias, lunesDe, hoyISO, diaSemana, fechaCorta } from './formato.js?v=db2b2b7';

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const nombreDiaLargo = (iso) => DIAS_LARGOS[diaSemana(iso)];

export function rangoSemana(lunes) {
  const dom = sumarDias(lunes, 6);
  const m1 = lunes.slice(5, 7);
  const [a2, m2] = [dom.slice(0, 4), dom.slice(5, 7)];
  const ini = m1 === m2 ? String(Number(lunes.slice(8, 10))) : fechaCorta(lunes);
  return `${ini} – ${fechaCorta(dom)} ${a2}`;
}

// alMover(n): n = -1 o 1 semanas; alHoy(): vuelve a la semana actual
export function navSemana({ lunes, alMover, alHoy = null, extra = null }) {
  const actual = lunes === lunesDe(hoyISO());
  return el('div', { class: 'rs-semana nav-semana' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => alMover(-1) }, icono('volver')),
    el('div', { class: 'rs-semana-txt' }, el('span', {}, `Semana ${numSemana(lunes)}${actual ? ' · esta semana' : ''}`), el('strong', {}, rangoSemana(lunes))),
    extra,
    alHoy && !actual ? boton('Hoy', { onclick: alHoy }) : null,
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => alMover(1) }, icono('derecha')));
}

// Cabecera de un día: "Martes 24 nov" y "Hoy"
export function cabeceraDia(iso, extra = null) {
  const hoy = iso === hoyISO();
  return el('div', { class: `dia-cab${hoy ? ' dia-hoy' : ''}` },
    el('span', { class: 'dia-cab-num' }, String(Number(iso.slice(8, 10)))),
    el('div', {}, el('strong', {}, nombreDiaLargo(iso)), el('span', { class: 'texto-suave texto-chico' }, fechaCorta(iso))),
    hoy ? el('span', { class: 'chip chip-ok' }, 'Hoy') : null,
    extra);
}
