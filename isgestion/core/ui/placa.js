// Placa patente chilena (blanca, borde negro, "CHILE" abajo), como en la maqueta B del teléfono. Los colores son los de
// una placa real, no del tema: se ve igual en claro y oscuro. tam: 'chica' | 'normal' | 'grande'.
import { el } from './dom.js?v=89cd423';

export const textoPlaca = (p) => {
  const t = (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length === 6 ? `${t.slice(0, 4)}·${t.slice(4)}` : t;
};

export function placa(patente, { tam = 'normal', href, titulo } = {}) {
  const texto = textoPlaca(patente);
  const hijos = [el('span', { class: 'placa-num' }, texto || 'S/P'), el('span', { class: 'placa-pais', 'aria-hidden': 'true' }, 'CHILE')];
  const attrs = { class: `placa placa-${tam}`, 'aria-label': texto ? `Patente ${texto.replace('·', ' ')}` : 'Sin patente', title: titulo ?? null };
  return href ? el('a', { ...attrs, href }, hijos) : el('span', attrs, hijos);
}
