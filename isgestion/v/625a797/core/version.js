// Aviso de versión nueva (2026-11-13, pedido de Enzo): al publicar, publicar.mjs escribe version.json con el commit.
// La app compara su versión con version.json al volver a la pestaña y cada 5 minutos; si cambió, muestra un aviso con
// "Actualizar" (recarga la página) y "Más tarde". En local (sin versión) no hace nada.
// Versiones guardadas aparte (2026-11-26, reclamos a Enzo: la app se recargaba sola y sacaba a la gente de lo que hacía):
// cada publicación queda en v/<commit>/ y quien tiene la app abierta sigue con su versión completa hasta que actualiza.
// Nada se recarga solo: el aviso es la única forma, y se puede dejar para más tarde.
import { el } from './ui/dom.js';
import { icono } from './ui/iconos.js';

// Publicada en v/<commit>/core/version.js (o, las anteriores, en core/version.js?v=<commit>)
const enCarpeta = import.meta.url.match(/\/v\/([0-9a-f]{7,40})\/core\//);
const actual = enCarpeta?.[1] ?? new URL(import.meta.url).searchParams.get('v');
const RAIZ = enCarpeta ? '../../../' : '../';
const MAS_TARDE = 45 * 60 * 1000;   // "Más tarde" esconde el aviso 45 minutos
let barra = null;
let escondidoHasta = 0;
let ultimaNota = '';

async function revisar() {
  if (!actual || barra || Date.now() < escondidoHasta || document.visibilityState === 'hidden') return;
  try {
    const url = new URL(`${RAIZ}version.json`, import.meta.url);
    url.search = `?t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return;
    const { v, nota } = await r.json();
    if (v && v !== actual) mostrar(nota);
  } catch { /* sin red: se revisa la próxima vez */ }
}

function mostrar(nota, urgente = false) {
  if (barra) return;
  ultimaNota = nota ?? ultimaNota;
  barra = el('div', { class: 'aviso-version', role: 'status' },
    icono('alerta', { tam: 18 }),
    el('span', {}, el('strong', {}, 'Hay una versión nueva de ISgestión. '), ultimaNota ? `${ultimaNota} ` : '',
      urgente ? 'Esta pantalla necesita la versión nueva: guarda lo que estés haciendo y toca Actualizar.'
        : 'Puedes seguir trabajando: actualiza cuando termines lo que estás haciendo.'),
    el('div', { class: 'aviso-version-botones' },
      urgente ? null : el('button', { type: 'button', class: 'boton boton-secundario', onclick: masTarde }, 'Más tarde'),
      el('button', { type: 'button', class: 'boton', onclick: () => location.reload() }, 'Actualizar')));
  document.body.append(barra);
}

function masTarde() {
  barra?.remove(); barra = null;
  escondidoHasta = Date.now() + MAS_TARDE;
}

// Una pantalla no se pudo cargar porque su versión ya no está publicada (se guardan las últimas): pedir actualizar.
export const esVersionVencida = (e) => /dynamically imported module|Importing a module script failed|error loading dynamically|versión nueva de ISgestión/i.test(e?.message ?? '');
export function pedirActualizar() {
  if (!actual) return;
  if (barra) { barra.remove(); barra = null; }
  mostrar(null, true);
}

export function vigilarVersion() {
  if (!actual) return;
  setInterval(revisar, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', revisar);
  addEventListener('focus', revisar);
  setTimeout(revisar, 30 * 1000);
}
