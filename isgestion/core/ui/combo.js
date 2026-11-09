// Buscador con sugerencias (2026-11-05): toda lista desplegable larga de la plataforma se puede escribir para filtrar.
// - <select> con UMBRAL opciones o más: se muestra un campo de texto; al escribir aparecen las opciones que contienen
//   lo escrito (sin importar tildes ni mayúsculas, palabras en cualquier orden). Flechas o Tab / Shift+Tab mueven la
//   sugerencia marcada, Enter la elige, Esc cierra. El <select> original sigue en la página (oculto) con su valor,
//   sus eventos 'change' y la validación del formulario: el código de cada módulo no cambia.
// - <input list="…"> (texto libre con sugerencias, ej.: faena en Registro de horas): la misma lista en lugar de la del
//   navegador; se puede escribir cualquier cosa y Enter solo elige si se marcó una sugerencia con flechas o Tab.
// Se aplica solo (activarCombos observa la página). Para dejar un campo como el del navegador: atributo data-nativo.
import { el } from './dom.js?v=64053cb';

const UMBRAL = 6;          // opciones desde las que un <select> pasa a buscador
const MAX_VISIBLES = 150;  // sugerencias que se dibujan a la vez
const TACTIL_UMBRAL = 15;  // en teléfono o tablet, listas cortas quedan con el selector del sistema
const hechos = new WeakMap();
const propValor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const propIndice = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
const conPopover = typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
const tactil = () => matchMedia('(pointer: coarse)').matches;
let secuencia = 0;

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Filtra y ordena: primero las que empiezan con lo escrito, después las que lo contienen (todas las palabras)
function filtrar(items, texto) {
  const q = normalizar(texto);
  if (!q) return items;
  const palabras = q.split(/\s+/);
  const empiezan = []; const contienen = [];
  for (const it of items) {
    const k = it.clave;
    if (!palabras.every((p) => k.includes(p))) continue;
    (k.startsWith(q) || it.claveTexto.startsWith(q) ? empiezan : contienen).push(it);
  }
  return [...empiezan, ...contienen];
}

export function activarCombos(raiz = document.body) {
  const revisar = (n) => {
    if (n.nodeType !== 1) return;
    if (n.matches('select')) mejorarSelect(n);
    else if (n.matches('input[list]')) mejorarLista(n);
    else if (n.matches('option, optgroup')) { const s = n.closest('select'); if (s) mejorarSelect(s); return; }
    for (const s of n.querySelectorAll('select')) mejorarSelect(s);
    for (const i of n.querySelectorAll('input[list]')) mejorarLista(i);
  };
  revisar(raiz);
  new MutationObserver((cambios) => {
    for (const m of cambios) {
      if (m.type === 'attributes') { hechos.get(m.target)?.sincronizar(); continue; }
      const s = m.target.closest?.('select');
      if (s) { mejorarSelect(s); hechos.get(s)?.sincronizar(); }
      for (const n of m.addedNodes) revisar(n);
      for (const n of m.removedNodes) if (n.nodeType === 1) quitarHuerfanos(n);
    }
  }).observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'required'] });
}

// Si el código reemplaza o quita el <select>, su campo de texto se va con él
function quitarHuerfanos(n) {
  const lista = n.matches?.('select') ? [n] : [...(n.querySelectorAll?.('select') ?? [])];
  for (const s of lista) { const h = hechos.get(s); if (h && !s.isConnected) h.retirar(); }
}

function mejorarSelect(sel) {
  if (hechos.has(sel) || sel.multiple || sel.size > 1 || sel.hasAttribute('data-nativo') || sel.closest('[data-nativo]')) return;
  if (sel.options.length < UMBRAL || (tactil() && sel.options.length < TACTIL_UMBRAL)) return;
  const items = () => [...sel.options].map((o, i) => {
    const grupo = o.parentNode?.tagName === 'OPTGROUP' ? o.parentNode.label : null;
    const texto = o.label || o.textContent.trim();
    return { i, valor: o.value, texto, grupo, desactivada: o.disabled || o.parentNode?.disabled, clave: normalizar(`${texto} ${grupo ?? ''}`), claveTexto: normalizar(texto) };
  });
  const entrada = el('input', { type: 'text', class: `${sel.className} combo-entrada`.trim(), autocomplete: 'off', spellcheck: 'false' });
  if (sel.style.cssText) entrada.style.cssText = sel.style.cssText;
  for (const a of ['title', 'aria-label']) if (sel.hasAttribute(a)) entrada.setAttribute(a, sel.getAttribute(a));
  const control = crearControl(entrada, {
    modo: 'select', items,
    elegir: (it) => {
      if (propIndice.get.call(sel) !== it.i) {
        propIndice.set.call(sel, it.i);
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      pintar();
    },
    actual: () => propIndice.get.call(sel),
    restaurar: () => pintar(),
  });
  function pintar() {
    const o = sel.options[propIndice.get.call(sel)];
    const vacia = !o || o.value === '';
    entrada.value = vacia ? '' : (o.label || o.textContent.trim());
    entrada.placeholder = vacia ? (o?.textContent.trim() || 'Escribe para buscar') : '';
    entrada.title = sel.title || (vacia ? '' : entrada.value);
  }
  function sincronizar() {
    entrada.disabled = sel.disabled; entrada.hidden = sel.hidden;
    entrada.className = `${[...sel.classList].filter((c) => c !== 'combo-nativo').join(' ')} combo-entrada`;
    if (document.activeElement !== entrada) pintar();
  }
  // El valor puesto por código (sel.value = …) también se ve en el campo
  Object.defineProperty(sel, 'value', { configurable: true, get() { return propValor.get.call(this); }, set(v) { propValor.set.call(this, v); pintar(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return propIndice.get.call(this); }, set(v) { propIndice.set.call(this, v); pintar(); } });
  sel.addEventListener('change', pintar);
  // El <label for> y la validación del formulario apuntan al select: se pasa el foco al campo
  sel.addEventListener('focus', () => entrada.focus());
  sel.addEventListener('invalid', () => entrada.classList.add('campo-error'));
  entrada.addEventListener('input', () => entrada.classList.remove('campo-error'));
  sel.classList.add('combo-nativo'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  sel.after(entrada, control.lista);
  hechos.set(sel, { sincronizar, retirar: () => { entrada.remove(); control.lista.remove(); } });
  sincronizar();
  if (document.activeElement === sel) entrada.focus();   // ej.: el modal enfoca su primer campo antes de mejorarlo
}

function mejorarLista(inp) {
  if (hechos.has(inp) || inp.hasAttribute('data-nativo') || inp.closest('[data-nativo]')) return;
  const id = inp.getAttribute('list');
  const fuente = () => document.getElementById(id);
  inp.removeAttribute('list');   // sin la lista del navegador
  inp.setAttribute('autocomplete', 'off');
  const items = () => [...(fuente()?.options ?? [])].map((o, i) => ({ i, valor: o.value, texto: o.value, ayuda: o.label && o.label !== o.value ? o.label : null, clave: normalizar(`${o.value} ${o.label ?? ''}`), claveTexto: normalizar(o.value) }));
  const control = crearControl(inp, {
    modo: 'lista', items,
    elegir: (it) => {
      if (inp.value !== it.valor) {
        inp.value = it.valor;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    },
    actual: () => -1,
    restaurar: () => {},
  });
  inp.after(control.lista);
  hechos.set(inp, { sincronizar: () => {}, retirar: () => control.lista.remove() });
}

// Lista desplegable, teclado y posición (común a los dos modos)
function crearControl(entrada, { modo, items, elegir, actual, restaurar }) {
  const id = `combo-${++secuencia}`;
  const lista = el('div', { class: 'combo-lista', id, role: 'listbox', hidden: true });
  if (conPopover) lista.setAttribute('popover', 'manual');
  entrada.setAttribute('role', 'combobox');
  entrada.setAttribute('aria-autocomplete', 'list');
  entrada.setAttribute('aria-expanded', 'false');
  entrada.setAttribute('aria-controls', id);
  let visibles = []; let marcada = -1; let abierta = false; let navego = false;

  const dibujar = (texto) => {
    const todos = items();
    visibles = filtrar(todos, texto).filter((it) => !it.desactivada || it.valor === '');
    const mostrar = visibles.slice(0, MAX_VISIBLES);
    const nodos = []; let grupo = null;
    mostrar.forEach((it, k) => {
      if (it.grupo && it.grupo !== grupo) { grupo = it.grupo; nodos.push(el('div', { class: 'combo-grupo', role: 'presentation' }, grupo)); }
      nodos.push(el('div', { class: 'combo-opcion', role: 'option', id: `${id}-${k}`, 'data-k': k, 'aria-selected': 'false', 'aria-current': String(it.i === actual()) },
        el('span', {}, resaltar(it.texto, texto)), it.ayuda ? el('span', { class: 'combo-ayuda' }, it.ayuda) : null));
    });
    if (!mostrar.length) nodos.push(el('div', { class: 'combo-vacio' }, modo === 'lista' ? 'Sin sugerencias: se guarda lo escrito' : 'Sin resultados'));
    else if (visibles.length > mostrar.length) nodos.push(el('div', { class: 'combo-vacio' }, `Y ${visibles.length - mostrar.length} más: sigue escribiendo`));
    lista.replaceChildren(...nodos);
    visibles = mostrar;
  };
  const marcar = (k) => {
    marcada = visibles.length ? (k + visibles.length) % visibles.length : -1;
    for (const n of lista.querySelectorAll('.combo-opcion')) n.setAttribute('aria-selected', String(Number(n.dataset.k) === marcada));
    const n = marcada >= 0 ? lista.querySelector(`[data-k="${marcada}"]`) : null;
    if (n) { n.scrollIntoView({ block: 'nearest' }); entrada.setAttribute('aria-activedescendant', n.id); } else entrada.removeAttribute('aria-activedescendant');
  };
  const ubicar = () => {
    const r = entrada.getBoundingClientRect();
    const abajo = innerHeight - r.bottom - 8; const arriba = r.top - 8;
    const alto = Math.min(320, Math.max(abajo, arriba));
    Object.assign(lista.style, { left: `${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 240) - 8))}px`, width: `${Math.max(r.width, 240)}px`, maxHeight: `${alto}px` });
    if (abajo < 160 && arriba > abajo) { lista.style.top = ''; lista.style.bottom = `${innerHeight - r.top + 4}px`; } else { lista.style.bottom = ''; lista.style.top = `${r.bottom + 4}px`; }
  };
  const alMover = (ev) => { if (abierta && !lista.contains(ev.target)) ubicar(); };
  const abrir = (texto) => {
    dibujar(texto);
    const k = texto ? (modo === 'select' ? 0 : -1) : visibles.findIndex((it) => it.i === actual());
    if (!abierta) {
      abierta = true; lista.hidden = false;
      if (conPopover) { try { lista.showPopover(); } catch { /* ya abierta */ } }
      entrada.setAttribute('aria-expanded', 'true');
      addEventListener('scroll', alMover, true); addEventListener('resize', alMover);
    }
    ubicar(); marcar(k);
  };
  const cerrar = () => {
    if (!abierta) return;
    abierta = false; navego = false;
    if (conPopover) { try { lista.hidePopover(); } catch { /* ya cerrada */ } }
    lista.hidden = true; entrada.setAttribute('aria-expanded', 'false'); entrada.removeAttribute('aria-activedescendant');
    removeEventListener('scroll', alMover, true); removeEventListener('resize', alMover);
  };
  const confirmar = (k) => { const it = visibles[k]; if (it) { cerrar(); elegir(it); } };

  entrada.addEventListener('input', () => { navego = false; abrir(entrada.value); });
  entrada.addEventListener('mousedown', () => {
    if (entrada.disabled || entrada.readOnly) return;
    if (abierta) { cerrar(); return; }
    setTimeout(() => { abrir(''); if (modo === 'select') entrada.select(); }, 0);
  });
  entrada.addEventListener('keydown', (ev) => {
    if (entrada.disabled || entrada.readOnly) return;
    const k = ev.key;
    if ((k === 'ArrowDown' || k === 'ArrowUp') && !ev.altKey) {
      ev.preventDefault(); navego = true;
      if (!abierta) { abrir(modo === 'lista' ? entrada.value : ''); if (modo === 'select') entrada.select(); return; }
      marcar(marcada + (k === 'ArrowDown' ? 1 : -1)); return;
    }
    if (k === 'ArrowDown' && ev.altKey) { ev.preventDefault(); abrir(''); return; }
    if (k === 'Tab' && abierta && visibles.length && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault(); navego = true;
      marcar(marcada < 0 ? (ev.shiftKey ? visibles.length - 1 : 0) : marcada + (ev.shiftKey ? -1 : 1)); return;
    }
    if (k === 'Enter' && abierta) {
      if (modo === 'lista' && !navego) { cerrar(); return; }   // texto libre: Enter deja lo escrito
      ev.preventDefault(); ev.stopPropagation(); confirmar(marcada >= 0 ? marcada : 0); return;
    }
    if (k === 'Escape' && abierta) { ev.preventDefault(); ev.stopPropagation(); cerrar(); restaurar(); return; }
    if ((k === 'Home' || k === 'End') && abierta && navego) { ev.preventDefault(); marcar(k === 'Home' ? 0 : visibles.length - 1); }
  });
  entrada.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === entrada) return;
      // Select: si borró el texto y hay una opción vacía ("Sin centro", "Todos"…), queda esa
      if (modo === 'select' && !entrada.value.trim()) { const vacia = items().find((it) => it.valor === ''); if (vacia && vacia.i !== actual()) { cerrar(); elegir(vacia); return; } }
      cerrar(); restaurar();
    }, 120);
  });
  lista.addEventListener('mousedown', (ev) => {
    ev.preventDefault();   // el foco se queda en el campo
    const n = ev.target.closest('.combo-opcion');
    if (n) confirmar(Number(n.dataset.k));
  });
  return { lista };
}

// Marca en negrita lo escrito dentro de la opción (por nodos de texto, sin innerHTML)
function resaltar(texto, q) {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return texto;
  const base = normalizar(texto);
  if (base.length !== texto.length) return texto;   // caracteres que cambian de largo al normalizar: sin resaltar
  const marca = new Array(texto.length).fill(false);
  for (const p of palabras) { let i = base.indexOf(p); while (i >= 0) { for (let j = i; j < i + p.length; j++) marca[j] = true; i = base.indexOf(p, i + p.length); } }
  const partes = []; let i = 0;
  while (i < texto.length) {
    let j = i; while (j < texto.length && marca[j] === marca[i]) j++;
    partes.push(marca[i] ? el('mark', {}, texto.slice(i, j)) : texto.slice(i, j)); i = j;
  }
  return partes;
}
