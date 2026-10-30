// Aviso breve en la esquina (toast).
import { el } from './dom.js?v=a8e0f26';
import { icono } from './iconos.js?v=a8e0f26';

export function avisar(texto, tipo = 'ok') {
  const nodo = el('div', { class: `aviso aviso-${tipo}`, role: 'status' },
    icono(tipo === 'ok' ? 'check' : 'alerta', { tam: 16 }), texto);
  document.body.append(nodo);
  setTimeout(() => { nodo.classList.add('saliendo'); setTimeout(() => nodo.remove(), 220); }, 3500);
}
