// Asistente de soporte (etapa 1, 2026-11-10): botón flotante en todas las pantallas que abre un chat de ayuda de uso.
// Pregunta a la Edge Function `soporte` (Claude, con la clave solo en el servidor), que responde con el manual de los
// módulos que la cuenta puede ver y enlaces #/<modulo>.<vista>. La respuesta se arma con nodos de texto (sin innerHTML):
// solo **negrita**, listas y enlaces a rutas de la app. La conversación vive en la pestaña hasta cambiar de empresa.
import { el } from './ui/dom.js?v=65230b8';
import { icono } from './ui/iconos.js?v=65230b8';
import { formularioSugerencia, misSugerencias } from './sugerencias.js?v=65230b8';

const RUTA = /^#\/[a-z]+\.[a-z0-9_]+(\?[\w=&%.-]*)?$/;
const SUGERENCIAS = ['¿Cómo agrego a un usuario nuevo?', '¿Dónde veo lo que tengo pendiente?', '¿Cómo descargo esta pantalla en Excel?'];

// Negrita y enlaces dentro de una línea
function enLinea(txt) {
  const nodos = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0, m;
  while ((m = re.exec(txt))) {
    if (m.index > i) nodos.push(txt.slice(i, m.index));
    if (m[1]) nodos.push(el('strong', {}, ...enLinea(m[1])));   // la negrita puede traer un enlace adentro
    else if (RUTA.test(m[3])) nodos.push(el('a', { href: m[3], class: 'sop-enlace' }, m[2]));
    else nodos.push(m[2]);
    i = re.lastIndex;
  }
  if (i < txt.length) nodos.push(txt.slice(i));
  return nodos;
}

// Párrafos y listas ("- " o "1. ")
function respuestaNodos(txt) {
  const out = [];
  let lista = null;
  for (const linea of txt.replace(/\r/g, '').split('\n')) {
    const l = linea.trim();
    const item = l.match(/^(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (item) {
      const tipo = item[1] ? 'ol' : 'ul';
      if (!lista || lista.tagName.toLowerCase() !== tipo) out.push((lista = el(tipo)));
      lista.append(el('li', {}, ...enLinea(item[2])));
      continue;
    }
    lista = null;
    if (l) out.push(el('p', {}, ...enLinea(l.replace(/^#+\s*/, ''))));
  }
  return out;
}

// db: cliente de Supabase · empresaId(): empresa real activa · usuarioId · pantallas(): [{ id, nombre, modulo, moduloNombre, oculto }]
// Pestañas: Preguntar (asistente), Sugerir (core/sugerencias.js, Núcleo 024) y Mis sugerencias.
export function botonSoporte({ db, empresaId, usuarioId, pantallas }) {
  const historial = [];   // { p, r, id }
  let enviando = false, cerradoAntes = false;

  const mensajes = el('div', { class: 'sop-mensajes', 'aria-live': 'polite' });
  const entrada = el('textarea', { class: 'sop-entrada', rows: 1, maxlength: 2000, placeholder: 'Escribe tu pregunta…', 'aria-label': 'Tu pregunta' });
  const enviar = el('button', { type: 'submit', class: 'boton boton-chico', 'aria-label': 'Enviar' }, icono('derecha', { tam: 16 }));
  const pie = el('div', { class: 'sop-quedan' });
  const form = el('form', { class: 'sop-form' }, entrada, enviar);
  const actual = () => (location.hash.match(/^#\/([a-z]+\.[a-z0-9_]+)/) ?? [])[1] ?? null;
  const visibles = () => pantallas().filter((p) => !p.oculto).map(({ id, nombre }) => ({ id, nombre }));
  const preguntarCaja = el('div', { class: 'sop-cuerpo' }, mensajes, form, pie);
  const sugerirCaja = el('div', { class: 'sop-cuerpo sop-desliza', hidden: true });
  const miasCaja = el('div', { class: 'sop-cuerpo sop-desliza', hidden: true });
  let sugerir = null;
  const pestanas = [['preguntar', 'Preguntar', preguntarCaja], ['sugerir', 'Sugerir', sugerirCaja], ['mias', 'Mis sugerencias', miasCaja]];
  const barra = el('div', { class: 'sop-pestanas', role: 'tablist' });
  async function verPestana(id) {
    for (const [k, , caja] of pestanas) caja.hidden = k !== id;
    for (const b of barra.children) { const si = b.dataset.p === id; b.classList.toggle('activa', si); b.setAttribute('aria-selected', String(si)); }
    if (id === 'sugerir') {
      // La pantalla abierta se sugiere sola en el primer punto si todavía está vacío
      sugerir ??= formularioSugerencia({ db, empresaId, usuarioId, pantallas, actual, alEnviar: (n) => { avisarEnviada(n); miasCaja.dataset.listo = ''; verPestana('mias'); } });
      if (!sugerirCaja.firstChild) sugerirCaja.append(sugerir);
    }
    if (id === 'mias' && !miasCaja.dataset.listo) {
      miasCaja.dataset.listo = '1';
      miasCaja.replaceChildren(el('div', { class: 'cargador', 'aria-label': 'Cargando' }));
      miasCaja.replaceChildren(...[aviso, await misSugerencias(db)].filter(Boolean));
      aviso = null;
    }
    if (id === 'preguntar') setTimeout(() => entrada.focus(), 30);
  }
  let aviso = null;
  const avisarEnviada = (n) => { aviso = el('div', { class: 'sug-enviada' }, icono('check', { tam: 16 }), n ? `Sugerencia N° ${n} enviada. Te avisaremos cuando la revisemos.` : 'Sugerencia enviada.'); };
  barra.append(...pestanas.map(([k, t]) => el('button', { type: 'button', role: 'tab', class: 'sop-pestana', 'data-p': k, onclick: () => verPestana(k) }, t)));
  const panel = el('section', { class: 'sop-panel', hidden: true, role: 'dialog', 'aria-label': 'Ayuda de ISgestión' },
    el('header', { class: 'sop-cabeza' },
      el('span', { class: 'sop-titulo' }, icono('chat', { tam: 16 }), 'Ayuda'),
      el('button', { type: 'button', class: 'boton-icono', title: 'Cerrar', 'aria-label': 'Cerrar ayuda', onclick: () => abrir(false) }, icono('cerrar'))),
    barra, preguntarCaja, sugerirCaja, miasCaja);
  const boton = el('button', { type: 'button', class: 'sop-boton', title: 'Ayuda: pregúntale al asistente', 'aria-label': 'Abrir la ayuda', onclick: () => abrir(panel.hidden) }, icono('chat', { tam: 22 }));

  const bajar = () => { mensajes.scrollTop = mensajes.scrollHeight; };
  const burbuja = (quien, ...hijos) => { const b = el('div', { class: `sop-msg sop-${quien}` }, ...hijos); mensajes.append(b); bajar(); return b; };

  function bienvenida() {
    mensajes.replaceChildren(
      burbuja('ia', el('p', {}, 'Hola. Pregúntame cómo hacer algo en ISgestión y te llevo a la pantalla.'),
        el('div', { class: 'sop-sugerencias' }, ...SUGERENCIAS.map((s) => el('button', { type: 'button', class: 'sop-sugerencia', onclick: () => preguntar(s) }, s)))));
  }

  function valorar(id, util, cont) {
    cont.replaceChildren(el('span', { class: 'sop-gracias' }, util ? 'Gracias.' : 'Gracias, lo vamos a mejorar.'));
    Promise.resolve(db.from('soporte_preguntas').update({ util }).eq('id', id)).catch(() => {});
  }

  async function preguntar(texto) {
    const q = String(texto ?? '').trim();
    if (!q || enviando) return;
    enviando = true; enviar.disabled = true;
    entrada.value = ''; ajustarAlto();
    burbuja('yo', el('p', {}, q));
    const espera = burbuja('ia', el('span', { class: 'sop-escribiendo' }, el('i'), el('i'), el('i')));
    try {
      const pantalla = (location.hash.match(/^#\/([a-z]+\.[a-z0-9_]+)/) ?? [])[1] ?? null;
      const { data, error } = await db.functions.invoke('soporte', {
        body: { empresa_id: empresaId(), pregunta: q, pantalla, pantallas: visibles(), historial: historial.slice(-4).map(({ p, r }) => ({ p, r })) },
      });
      if (error) {
        let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ }
        throw new Error(j?.error || 'No se pudo conectar con el asistente. Intenta de nuevo.');
      }
      historial.push({ p: q, r: data.respuesta, id: data.id });
      const votos = el('div', { class: 'sop-votos' }, el('span', {}, '¿Te sirvió?'),
        el('button', { type: 'button', class: 'sop-voto', onclick: () => valorar(data.id, true, votos) }, 'Sí'),
        el('button', { type: 'button', class: 'sop-voto', onclick: () => valorar(data.id, false, votos) }, 'No'));
      espera.replaceChildren(...respuestaNodos(data.respuesta), votos);
      pie.textContent = Number.isFinite(data.quedan) && data.quedan <= 5 ? `Te quedan ${data.quedan} preguntas por hoy.` : '';
    } catch (e) {
      espera.classList.add('sop-error');
      espera.replaceChildren(el('p', {}, e.message));
    } finally {
      enviando = false; enviar.disabled = false; bajar();
      if (!panel.hidden) entrada.focus();
    }
  }

  function ajustarAlto() {
    entrada.style.height = 'auto';
    entrada.style.height = `${Math.min(entrada.scrollHeight, 120)}px`;
    entrada.style.overflowY = entrada.scrollHeight > 120 ? 'auto' : 'hidden';   // sin barra mientras cabe
  }
  entrada.addEventListener('input', ajustarAlto);
  entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); preguntar(entrada.value); } });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); preguntar(entrada.value); });
  // Un enlace de la respuesta lleva a la pantalla; en el teléfono el chat se cierra para verla
  mensajes.addEventListener('click', (ev) => { if (ev.target.closest('a.sop-enlace') && matchMedia('(max-width: 760px)').matches) abrir(false); });
  panel.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); abrir(false); boton.focus(); } });

  function abrir(si) {
    panel.hidden = !si;
    boton.classList.toggle('abierto', si);
    boton.setAttribute('aria-expanded', String(si));
    if (si) {
      if (!cerradoAntes && !historial.length) { bienvenida(); verPestana('preguntar'); }
      cerradoAntes = true;
      if (!preguntarCaja.hidden) setTimeout(() => entrada.focus(), 30);
    }
  }

  // Desde el aviso "Tu sugerencia N° …" (./?ayuda=sugerencias): abre Mis sugerencias
  if (new URLSearchParams(location.search).get('ayuda') === 'sugerencias') {
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => { abrir(true); verPestana('mias'); }, 600);
  }

  return el('div', { class: 'sop' }, panel, boton);
}
