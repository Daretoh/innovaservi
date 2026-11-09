// Sección desplegable (como las de InnovaGestión, 2026-11-04): cabecera con icono, título, resumen, barra de avance
// y flecha; al tocarla se abre o cierra. Recuerda cuáles quedaron abiertas mientras dura la sesión (por clave), así
// al refrescar la vista no se cierran. `abierta: true` la fuerza abierta (por ejemplo, al buscar).
import { el } from './dom.js?v=4bb9c7a';
import { icono } from './iconos.js?v=4bb9c7a';

const abiertas = new Set();

export function plegable({ clave, titulo, meta = null, ico = null, avance = null, chips = [], acciones = null, abierta = false, cuerpo }) {
  const abre = abierta || abiertas.has(clave);
  const caja = el('div', { class: `plegable${abre ? ' abierta' : ''}` });
  const cab = el('button', { type: 'button', class: 'plegable-cab', 'aria-expanded': String(abre) },
    ico ? el('span', { class: 'plegable-ico' }, icono(ico, { tam: 18 })) : null,
    el('span', { class: 'plegable-tit' }, el('strong', {}, titulo), meta ? el('span', { class: 'texto-suave texto-chico' }, meta) : null),
    ...chips.filter(Boolean),
    avance == null ? null : el('span', { class: 'plegable-barra', title: `${avance}%` }, el('i', { style: `width:${avance}%` })),
    el('span', { class: 'plegable-flecha' }, icono('abajo', { tam: 18 })));
  cab.addEventListener('click', () => {
    const a = !caja.classList.contains('abierta');
    caja.classList.toggle('abierta', a); cab.setAttribute('aria-expanded', String(a));
    if (a) abiertas.add(clave); else abiertas.delete(clave);
  });
  caja.append(acciones ? el('div', { class: 'plegable-fila' }, cab, el('div', { class: 'plegable-acciones' }, acciones)) : cab,
    el('div', { class: 'plegable-cuerpo' }, cuerpo));
  return caja;
}
