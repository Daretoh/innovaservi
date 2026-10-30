// Edición tipo planilla de gastos e ingresos (como el OS de IS Performance): flechas, Enter y Tab para moverse,
// Shift + flechas o arrastrar para seleccionar, Ctrl + C / V para copiar y pegar (también desde Excel) y Supr para
// borrar la selección. Cada cambio se guarda solo (por fila, medio segundo después); la base recalcula neto e IVA.
// No crea registros nuevos: si se pegan más filas de las que hay, las que sobran se ignoran.
import { el } from '../../core/ui/dom.js?v=89cd423';
import { avisar } from '../../core/ui/aviso.js?v=89cd423';
import { DOCS } from './datos.js?v=89cd423';

const miles = (n) => (Number(n) || 0).toLocaleString('es-CL');
const numero = (t) => Math.round(Number(String(t ?? '').replace(/[^\d,-]/g, '').replace(',', '.')) || 0);
const fechaDe = (t) => {
  const v = String(t ?? '').trim();
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
};
const patenteDe = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

export function planilla(ctx, filas, base) {
  const opcionesCat = base.categorias.map((c) => [c.id, c.nombre]);
  const opcionesCen = [['', '—'], ...base.centros.map((c) => [c.id, c.nombre])];
  // Columnas: campo, título, tipo de control y si Supr la puede vaciar
  const COLS = [
    { k: 'fecha', t: 'Fecha', tipo: 'date' },
    { k: 'concepto', t: 'Concepto' },
    { k: 'categoria_id', t: 'Categoría', opciones: opcionesCat },
    { k: 'centro_id', t: 'Centro', opciones: opcionesCen, vaciable: true },
    { k: 'patente', t: 'Patente', vaciable: true },
    { k: 'doc_tipo', t: 'Documento', opciones: DOCS },
    { k: 'doc_numero', t: 'N°', vaciable: true },
    { k: 'total', t: 'Total', num: true },
  ];
  const pendiente = new Map();   // id → { cambios, timer }
  const guardarFila = async (id) => {
    const p = pendiente.get(id); if (!p) return;
    pendiente.delete(id); clearTimeout(p.timer);
    const { error } = await ctx.api.from('fin_registros').update(p.cambios).eq('id', id);
    if (error) avisar(`No se guardó: ${error.message}`, 'error');
  };
  const agendar = (id, k, v) => {
    const p = pendiente.get(id) ?? { cambios: {} };
    p.cambios[k] = v; clearTimeout(p.timer); p.timer = setTimeout(() => guardarFila(id), 500);
    pendiente.set(id, p);
  };

  // Celdas
  const celdas = filas.map((r) => COLS.map((c, j) => {
    const attrs = { class: 'pl-in', 'data-c': j, 'aria-label': c.t };
    let n;
    if (c.opciones) {
      n = el('select', attrs, c.opciones.map(([v, t]) => el('option', { value: v, selected: v === (r[c.k] ?? '') }, t)));
    } else {
      n = el('input', { ...attrs, type: c.tipo ?? 'text', inputmode: c.num ? 'numeric' : null, spellcheck: false });
      n.value = c.num ? miles(r[c.k]) : r[c.k] ?? '';
    }
    n.addEventListener('change', () => confirmar(r, c, n));
    if (c.num) n.addEventListener('blur', () => { n.value = miles(numero(n.value)); });
    return n;
  }));
  // Pasa la celda al registro y agenda el guardado; si el valor no sirve, vuelve al anterior
  function confirmar(r, c, n) {
    let v = n.value;
    if (c.k === 'fecha') { if (!v) { n.value = r.fecha; return; } }
    else if (c.num) { v = numero(v); if (v <= 0) { n.value = miles(r.total); avisar('El total debe ser mayor que cero.', 'error'); return; } }
    else if (c.k === 'patente') { v = patenteDe(v); n.value = v ?? ''; }
    else if (c.k === 'concepto') { v = v.trim(); if (!v) { n.value = r.concepto; return; } }
    else v = v.trim() || null;
    if ((r[c.k] ?? null) === v) return;
    r[c.k] = v; agendar(r.id, c.k, v);
  }
  const ponerValor = (i, j, texto) => {
    const n = celdas[i]?.[j]; if (!n) return;
    const c = COLS[j]; const v = String(texto ?? '').trim();
    if (c.tipo === 'date') { const f = fechaDe(v); if (!f) return; n.value = f; }
    else if (c.opciones) { const op = c.opciones.find(([val, t]) => val.toLowerCase() === v.toLowerCase() || t.toLowerCase() === v.toLowerCase()); if (!op) return; n.value = op[0]; }
    else if (c.num) n.value = miles(numero(v));
    else n.value = v;
    confirmar(filas[i], c, n);
  };
  const valorTexto = (i, j) => {
    const n = celdas[i][j]; const c = COLS[j];
    if (c.tipo === 'date') { const m = n.value.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
    if (c.opciones) return n.selectedOptions[0]?.textContent ?? '';
    if (c.num) return String(numero(n.value));
    return n.value;
  };

  // Selección (rango de celdas)
  const sel = { a: null, b: null, arrastrando: false, nav: false };
  const posDe = (n) => { const j = Number(n?.dataset?.c); if (!n?.classList?.contains('pl-in')) return null; const i = celdas.findIndex((f) => f[j] === n); return i < 0 ? null : { i, j }; };
  const rango = () => (sel.a && sel.b ? { i0: Math.min(sel.a.i, sel.b.i), i1: Math.max(sel.a.i, sel.b.i), j0: Math.min(sel.a.j, sel.b.j), j1: Math.max(sel.a.j, sel.b.j) } : null);
  const varias = () => { const r = rango(); return !!r && (r.i0 !== r.i1 || r.j0 !== r.j1); };
  const pintar = () => {
    cuerpo.querySelectorAll('.pl-sel').forEach((x) => x.classList.remove('pl-sel'));
    if (!varias()) return;
    const r = rango();
    for (let i = r.i0; i <= r.i1; i += 1) for (let j = r.j0; j <= r.j1; j += 1) celdas[i][j].classList.add('pl-sel');
  };
  const enfocar = (i, j, mantener = false) => {
    i = Math.max(0, Math.min(celdas.length - 1, i)); j = Math.max(0, Math.min(COLS.length - 1, j));
    const n = celdas[i]?.[j]; if (!n) return;
    sel.nav = true; n.focus(); sel.nav = false;
    try { n.select?.(); } catch { /* date no se selecciona */ }
    if (!mantener) sel.a = { i, j };
    sel.b = { i, j }; pintar(); n.scrollIntoView({ block: 'nearest' });
  };

  const cuerpo = el('tbody', {}, filas.map((r, i) => el('tr', {}, celdas[i].map((n, j) => el('td', { class: COLS[j].num ? 'pl-num' : '' }, n)))));
  const tabla = el('table', { class: 'tabla planilla' },
    el('thead', {}, el('tr', {}, COLS.map((c) => el('th', { class: c.num ? 'pl-num' : '' }, c.t)))), cuerpo);

  tabla.addEventListener('focusin', (ev) => { if (sel.nav) return; const p = posDe(ev.target); if (p) { sel.a = sel.b = p; pintar(); } });
  tabla.addEventListener('mousedown', (ev) => {
    const p = posDe(ev.target); if (!p) return;
    if (ev.shiftKey && sel.a) { ev.preventDefault(); sel.b = p; pintar(); return; }
    sel.arrastrando = true; sel.a = sel.b = p; pintar();
  });
  tabla.addEventListener('mouseover', (ev) => {
    if (!sel.arrastrando || !(ev.buttons & 1)) return;
    const p = posDe(ev.target); if (!p || (p.i === sel.b?.i && p.j === sel.b?.j)) return;
    sel.b = p; pintar(); if (varias()) window.getSelection()?.removeAllRanges();
  });
  document.addEventListener('mouseup', () => { sel.arrastrando = false; });
  tabla.addEventListener('keydown', (ev) => {
    const n = ev.target; const p = posDe(n); if (!p) return;
    if (!sel.b || sel.b.i !== p.i || sel.b.j !== p.j) { sel.a = sel.b = p; pintar(); }   // la tecla parte de la celda activa
    const k = ev.key; const mod = ev.ctrlKey || ev.metaKey;
    if (k === 'Escape') { sel.a = sel.b = p; pintar(); return; }
    if ((k === 'Delete' || k === 'Backspace') && varias()) {
      ev.preventDefault(); const r = rango();
      for (let i = r.i0; i <= r.i1; i += 1) for (let j = r.j0; j <= r.j1; j += 1) if (COLS[j].vaciable) ponerValor(i, j, '');
      return;
    }
    const texto = n.tagName === 'INPUT' && n.type === 'text';
    // Con el cursor en el borde del texto, la flecha cambia de celda
    const borde = (lado) => { if (!texto) return true; const s = n.selectionStart; const e = n.selectionEnd; const largo = n.value.length; if (s === 0 && e === largo) return true; return lado < 0 ? s === 0 && e === 0 : s === largo && e === largo; };
    let di = 0; let dj = 0;
    if (k === 'ArrowDown') di = 1; else if (k === 'ArrowUp') di = -1;
    else if (k === 'ArrowLeft' && (ev.shiftKey || borde(-1))) dj = -1;
    else if (k === 'ArrowRight' && (ev.shiftKey || borde(1))) dj = 1;
    else if (k === 'Enter' && !mod) { ev.preventDefault(); confirmar(filas[p.i], COLS[p.j], n); enfocar(p.i + (ev.shiftKey ? -1 : 1), p.j); return; }
    else if (k === 'Tab') {
      ev.preventDefault(); confirmar(filas[p.i], COLS[p.j], n);
      const total = COLS.length; const x = Math.max(0, p.i * total + p.j + (ev.shiftKey ? -1 : 1));
      enfocar(Math.floor(x / total), x % total); return;
    }
    if (!di && !dj) return;
    ev.preventDefault(); confirmar(filas[p.i], COLS[p.j], n);   // también evita que la flecha cambie la fecha o la opción
    if (ev.shiftKey) { if (!sel.a) sel.a = p; const b = sel.b ?? p; enfocar(b.i + di, b.j + dj, true); return; }
    enfocar(p.i + di, p.j + dj);
  });
  tabla.addEventListener('copy', (ev) => {
    const n = document.activeElement; const p = posDe(n); if (!p) return;
    let t;
    if (varias()) {
      const r = rango(); const lineas = [];
      for (let i = r.i0; i <= r.i1; i += 1) { const f = []; for (let j = r.j0; j <= r.j1; j += 1) f.push(valorTexto(i, j)); lineas.push(f.join('\t')); }
      t = lineas.join('\n');
    } else if (n.tagName !== 'INPUT' || n.type !== 'text' || n.selectionStart === n.selectionEnd || (n.selectionStart === 0 && n.selectionEnd === n.value.length)) {
      t = valorTexto(p.i, p.j);   // sin texto marcado: la celda completa
    } else return;
    ev.preventDefault(); ev.clipboardData.setData('text/plain', t); avisar(varias() ? 'Copiado.' : 'Celda copiada.');
  });
  tabla.addEventListener('paste', (ev) => {
    const p = posDe(ev.target); if (!p) return;
    const t = ev.clipboardData?.getData('text/plain') ?? ''; if (!t) return;
    const bloque = t.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
    if (bloque.length === 1 && bloque[0].length === 1 && !varias() && ['concepto', 'patente', 'doc_numero'].includes(COLS[p.j].k)) return;   // un texto: pegado normal
    ev.preventDefault();
    const r = varias() ? rango() : null; const i0 = r ? r.i0 : p.i; const j0 = r ? r.j0 : p.j;
    bloque.forEach((cols, a) => { if (i0 + a < filas.length) cols.forEach((v, b) => { if (j0 + b < COLS.length) ponerValor(i0 + a, j0 + b, v); }); });
    sel.a = { i: i0, j: j0 };
    sel.b = { i: Math.min(filas.length - 1, i0 + bloque.length - 1), j: Math.min(COLS.length - 1, j0 + Math.max(...bloque.map((f) => f.length)) - 1) };
    pintar();
    avisar(`Pegado${i0 + bloque.length > filas.length ? ' (sobraban filas: no se crean registros nuevos)' : ''}.`);
  });

  return {
    nodo: el('div', {},
      el('div', { class: 'tabla-contenedor' }, tabla),
      el('p', { class: 'texto-suave texto-chico pl-ayuda' },
        el('kbd', {}, '↑↓←→'), ' moverse · ', el('kbd', {}, 'Enter'), ' / ', el('kbd', {}, 'Tab'), ' siguiente celda · ', el('kbd', {}, 'Shift'), ' + flechas o arrastrar: seleccionar · ',
        el('kbd', {}, 'Ctrl'), ' + ', el('kbd', {}, 'C'), ' / ', el('kbd', {}, 'V'), ' copiar y pegar (también desde Excel) · ', el('kbd', {}, 'Supr'), ' borrar centro, patente o N° · los cambios se guardan solos')),
    enfocar,
    // Guarda lo que quede pendiente (al salir de la planilla)
    terminar: async () => {
      const n = document.activeElement; const p = posDe(n);
      if (p) confirmar(filas[p.i], COLS[p.j], n);
      await Promise.all([...pendiente.keys()].map(guardarFila));
    },
  };
}
