// Aviso breve en la esquina (toast).
import { el } from './dom.js?v=f6c1abb';
import { icono } from './iconos.js?v=f6c1abb';

export function avisar(texto, tipo = 'ok') {
  const nodo = el('div', { class: `aviso aviso-${tipo}`, role: 'status' },
    icono(tipo === 'ok' ? 'check' : 'alerta', { tam: 16 }), texto);
  document.body.append(nodo);
  setTimeout(() => { nodo.classList.add('saliendo'); setTimeout(() => nodo.remove(), 220); }, 3500);
}
