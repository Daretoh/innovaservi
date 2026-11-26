// Campos interactivos de los registros en terreno (charla diaria y checklist): ítems marcables, listas de datos ya
// cargados, firmas que repiten el nombre elegido y lecturas de gases que se pintan según sus límites.
// Lo escrito se conserva al cambiar de charla o de trabajadores (el documento se vuelve a armar).
// o: { sitiosDe(cliente) → [nombres], cargoDe(nombre) → cargo, prevNombre, gases: [{ k, op: [min, max], acep(x) }] }
export function activarCampos(hoja, o) {
  const valor = (k) => hoja.querySelector(`[data-k="${k}"]`)?.textContent.trim() ?? '';
  const marcar = (c, on) => { c.classList.toggle('on', !!on); c.setAttribute('aria-checked', on ? 'true' : 'false'); };

  const llenarLugares = () => {
    const sel = hoja.querySelector('.dg-pk[data-dest="lug"]'); if (!sel) return;
    const cliente = valor('cli'); if (sel.dataset.cli === cliente) return;
    const L = o.sitiosDe(cliente);
    sel.dataset.cli = cliente; sel.hidden = !L.length; sel.replaceChildren(new Option('', ''), ...L.map((x) => new Option(x, x)));
  };
  const refrescar = () => {
    for (const x of hoja.querySelectorAll('[data-espejo]')) x.textContent = valor(x.dataset.espejo);
    const fp = hoja.querySelector('.ch-fprev');
    if (fp) fp.style.display = o.prevNombre && valor('rel') === o.prevNombre ? '' : 'none';
    llenarLugares();
    let fuera = 0;
    for (const td of hoja.querySelectorAll('td[data-gas]')) {
      const g = o.gases?.find((x) => x.k === td.dataset.gas), m = /-?\d+(?:[.,]\d+)?/.exec(td.textContent || '');
      let est = '';
      if (g && m) {
        const n = parseFloat(m[0].replace(',', '.'));
        est = g.acep(n) ? (n >= g.op[0] && n <= g.op[1] ? '' : 'gas-am') : 'gas-ro';
        if (est === 'gas-ro') fuera += 1;
      }
      td.classList.remove('gas-am', 'gas-ro'); if (est) td.classList.add(est);
    }
    const av = hoja.querySelector('.gas-av'); if (av) av.style.display = fuera ? '' : 'none';
  };

  hoja.addEventListener('click', (ev) => { const c = ev.target.closest('.dg-ck'); if (c) marcar(c, !c.classList.contains('on')); });
  hoja.addEventListener('keydown', (ev) => {
    if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.classList?.contains('dg-ck')) { ev.preventDefault(); marcar(ev.target, !ev.target.classList.contains('on')); }
  });
  hoja.addEventListener('input', (ev) => { if (ev.target.closest?.('[data-k]')) refrescar(); });
  hoja.addEventListener('change', (ev) => {
    const s = ev.target; if (!s.classList?.contains('dg-pk') || !s.value) return;
    const poner = (k, t) => { const x = hoja.querySelector(`[data-k="${k}"]`); if (x) { x.textContent = t; x.classList.remove('dg-vacio'); x.dispatchEvent(new Event('input', { bubbles: true })); } };
    const k = s.dataset.dest, v = s.value;
    poner(k, v);
    if (k === 'cli') { const L = o.sitiosDe(v); if (L.length === 1 && !valor('lug')) poner('lug', L[0]); }
    if (k === 'rel') { const c = o.cargoDe(v); if (c) poner('relc', c); }
    s.value = '';
  });

  return {
    refrescar,
    copiar: () => Object.fromEntries([...hoja.querySelectorAll('[data-k]')].map((x) => [x.dataset.k, x.classList.contains('dg-ck') ? x.classList.contains('on') : x.textContent])),
    restaurar: (st) => {
      for (const x of hoja.querySelectorAll('[data-k]')) {
        if (!(x.dataset.k in st)) continue;
        if (x.classList.contains('dg-ck')) marcar(x, st[x.dataset.k]); else x.textContent = st[x.dataset.k];
      }
    },
  };
}
