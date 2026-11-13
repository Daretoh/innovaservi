// Panel fijo con el avance de una subida larga (videos): nombre, tamaño, barra y porcentaje.
// const p = panelSubida(); p.estado('Subiendo video.mp4 (84 MB)', 0.4); … p.cerrar();
import { el } from './dom.js?v=60a60f0';
import { icono } from './iconos.js?v=60a60f0';

export function panelSubida() {
  const texto = el('span', { class: 'subida-texto' });
  const pct = el('span', { class: 'subida-pct' });
  const barra = el('i');
  const nodo = el('div', { class: 'subida-panel', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'subida-fila' }, icono('video', { tam: 18 }), texto, pct),
    el('div', { class: 'subida-barra' }, barra));
  document.body.append(nodo);
  return {
    estado(t, frac = null) {
      texto.textContent = t;
      if (frac == null) { pct.textContent = ''; nodo.classList.add('indeterminado'); barra.style.width = '100%'; return; }
      nodo.classList.remove('indeterminado');
      const v = Math.max(0, Math.min(1, frac));
      pct.textContent = `${Math.round(v * 100)}%`;
      barra.style.width = `${v * 100}%`;
    },
    cerrar() { nodo.classList.add('saliendo'); setTimeout(() => nodo.remove(), 220); },
  };
}
