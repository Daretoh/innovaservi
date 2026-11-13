// Aviso de versión nueva (2026-11-13, pedido de Enzo): al publicar, publicar.mjs escribe version.json con el commit y
// cada archivo lleva ?v=<commit>. La app compara su versión con version.json al volver a la pestaña y cada 5 minutos;
// si cambió, muestra un aviso fijo con "Actualizar" (recarga la página). En local (sin ?v) no hace nada.
import { el } from './ui/dom.js?v=92f4191';
import { icono } from './ui/iconos.js?v=92f4191';

const actual = new URL(import.meta.url).searchParams.get('v');
let mostrado = false;

async function revisar() {
  if (!actual || mostrado || document.visibilityState === 'hidden') return;
  try {
    const url = new URL('../version.json?v=92f4191', import.meta.url);
    url.search = `?t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return;
    const { v, nota } = await r.json();
    if (v && v !== actual) mostrar(nota);
  } catch { /* sin red: se revisa la próxima vez */ }
}

function mostrar(nota) {
  mostrado = true;
  const barra = el('div', { class: 'aviso-version', role: 'alert' },
    icono('alerta', { tam: 18 }),
    el('span', {}, el('strong', {}, 'Hay una actualización de ISgestión. '), nota ? `${nota} ` : '', 'Guarda lo que estés escribiendo y toca Actualizar.'),
    el('button', { type: 'button', class: 'boton', onclick: () => location.reload() }, 'Actualizar'));
  document.body.append(barra);
}

export function vigilarVersion() {
  if (!actual) return;
  setInterval(revisar, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', revisar);
  addEventListener('focus', revisar);
  setTimeout(revisar, 30 * 1000);
}
