// Proyectos → Proyecto: la hoja del proyecto. Se ve como el resumen formal (cabecera, indicadores, zonas y áreas con
// totales) y se edita como planilla: se escribe en las celdas, Enter baja, Esc deshace, se pega desde Excel en Ítem
// y se arrastra una fila por sus puntos a otra área. En pantallas anchas, panel lateral con el 3D del mueble.
// Ruta: #/proyectos.hoja?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=0e0b56e';
import { icono } from '../../../core/ui/iconos.js?v=0e0b56e';
import { boton } from '../../../core/ui/tabla.js?v=0e0b56e';
import { abrirFormulario } from '../../../core/ui/modal.js?v=0e0b56e';
import { avisar } from '../../../core/ui/aviso.js?v=0e0b56e';
import {
  ESTADOS, NOMBRE_ESTADO, NO_SUMA, UNIDADES, clp, subtotal, suma, sinPrecioN, vigentes, tienePrecio, gDe, alerta, esArchivo, neto,
  ordenGrupos, zonasDe, leerNum, fmtNum, hoyISO, fechaCL, hoyLargo, plegado, cargarTodo, cargarEstilos, selectorProyecto, sinProyectos,
  guardarPartida, guardarProyecto, insertarPartidas, ordenEntre, renumerar, mapasInv, estadoModelo, m3dDe, chipModelo, modeloDe,
  cargarInventario, abrirLink, urlsImagenes, fichaPartida, guardarActual,
} from '../datos.js?v=0e0b56e';
import { ventana3d, asegurarThree, cargarMallas, crearVisor, ponerMueble, camara, texturasPara } from '../visor3d.js?v=0e0b56e';
import { excelProyecto } from '../exportar.js?v=0e0b56e';

const filtro = { texto: '', zona: '', pend: false };   // se mantiene al refrescar

export default async function vista(ctx) {
  cargarEstilos();
  const d = await cargarTodo(ctx);
  if (!d.proyecto) return sinProyectos(ctx, d, 'Proyectos');
  const puedeEditar = ctx.puede('proyectos', 'editar');
  const puedeCrear = ctx.puede('proyectos', 'crear');
  const puedeEliminar = ctx.puede('proyectos', 'eliminar');
  const pl = plegado(ctx);
  let mp = mapasInv(d.inventario);
  let imagen = await urlsImagenes(ctx, d.partidas);
  let sel = null;
  if (!zonasDe(d.proyecto, d.partidas).includes(filtro.zona)) filtro.zona = '';

  const hoja = el('article', { class: 'pro-hoja', 'data-nativo': '' });
  const panel = el('aside', { class: 'pro-panel', 'aria-label': 'Vista previa de la fila' });
  const cuerpo = el('div', { class: 'pro-cuerpo con-panel' }, hoja, panel);
  const deshacer = el('div', { class: 'pro-deshacer', role: 'status', hidden: true });
  const ancho = window.matchMedia('(min-width: 1280px)');
  const panelVisible = () => ancho.matches && panel.isConnected;

  // ---------------------------------------------------------------- Guardar
  const fallo = (e) => { avisar(e.message, 'error'); ctx.refrescar(); };
  async function cambiar(x, cambios) {
    if (Object.entries(cambios).every(([c, v]) => (x[c] ?? null) === (v ?? null) || (c === 'cantidad' && Number(x[c]) === Number(v) && v != null))) return;
    Object.assign(x, cambios);
    refrescar();
    try { await guardarPartida(ctx, x, cambios); } catch (e) { fallo(e); }
  }
  const ordenadas = () => [...d.partidas].sort((a, b) => a.orden - b.orden);

  // ---------------------------------------------------------------- Dibujo
  const k = (x, f) => `${x.id}:${f}`;
  function celda(x, f, props = {}) {
    const ro = !puedeEditar;
    if (f === 'item' || f === 'detalle') {
      const t = el('textarea', { class: `pro-cel pro-cel-${f}`, rows: 1, 'data-f': f, 'data-k': k(x, f), placeholder: f === 'item' ? 'Nuevo ítem' : 'Detalle, medidas o color', 'aria-label': f === 'item' ? 'Ítem' : 'Detalle', readonly: ro, ...props });
      t.value = x[f] ?? ''; t.defaultValue = t.value;
      return t;
    }
    if (f === 'estado') {
      return el('select', { class: `pro-estado e-${x.estado}`, 'data-f': f, 'data-k': k(x, f), 'aria-label': 'Estado', disabled: ro },
        ESTADOS.map(([v, t]) => el('option', { value: v, selected: v === x.estado }, t)));
    }
    const valor = f === 'cantidad' || f === 'precio' ? fmtNum(x[f], f) : x[f] ?? '';
    return el('input', { class: `pro-cel${f === 'cantidad' || f === 'precio' ? ' n' : ''}${f === 'precio' && !tienePrecio(x) ? ' sin' : ''}`, 'data-f': f, 'data-k': k(x, f),
      value: valor, readonly: ro, inputmode: f === 'cantidad' ? 'decimal' : f === 'precio' ? 'numeric' : null, list: props.list ?? null,
      placeholder: f === 'precio' ? 'Por cotizar' : f === 'tienda' ? '-' : null, 'aria-label': props.label ?? f });
  }

  function fila(x) {
    const em = estadoModelo(x, mp);
    const m3 = m3dDe(x, mp);
    const img = imagen(x.img);
    const acciones = el('div', { class: 'pro-acc-in' },
      m3 ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver en 3D', 'aria-label': 'Ver en 3D', onclick: () => { seleccionar(x.id); if (!panelVisible()) ventana3d(ctx, x.item || 'Vista 3D', { modeloId: d.modelo.id, m3d: m3 }); } }, icono('caja', { tam: 16 })) : null,
      el('button', { type: 'button', class: 'boton-icono', title: 'Ficha completa (link, imagen, código, nota)', 'aria-label': 'Ficha completa', onclick: () => ficha(x) }, icono('editar', { tam: 16 })),
      puedeCrear ? el('button', { type: 'button', class: 'boton-icono', title: 'Duplicar fila', 'aria-label': 'Duplicar fila', onclick: () => duplicar(x) }, icono('copiar', { tam: 16 })) : null,
      puedeEliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar fila', 'aria-label': 'Eliminar fila', onclick: () => borrar(x) }, icono('basura', { tam: 16 })) : null);
    return el('tr', { class: `pro-fila${x.id === sel ? ' sel' : ''}${NO_SUMA.has(x.estado) ? ' off' : ''}`, 'data-id': x.id },
      el('td', {}, puedeEditar ? el('span', { class: 'pro-asa', draggable: 'true', title: 'Arrastra para mover la fila' }, puntos()) : null),
      el('td', {},
        el('div', { class: 'pro-it' }, img ? el('img', { class: 'pro-mini', src: img, alt: '', loading: 'lazy', onerror: (ev) => ev.target.remove() }) : null, celda(x, 'item')),
        celda(x, 'detalle'),
        x.nota ? el('div', { class: `pro-nota${alerta(x) ? ' alerta' : ''}` }, x.nota) : null,
        chipModelo(em && !em.presente ? em : null, puedeEditar ? (c) => { cambiar(x, { cantidad: c }); avisar('Cantidad actualizada desde el modelo'); } : null)),
      el('td', {}, celda(x, 'cantidad', { label: 'Cantidad' })),
      el('td', {}, celda(x, 'unidad', { list: 'pro-unidades', label: 'Unidad' })),
      el('td', {}, celda(x, 'precio', { label: 'Precio unitario con IVA' })),
      el('td', { class: 'num pro-st' }, tienePrecio(x) ? clp(subtotal(x)) : el('span', { class: 'texto-suave' }, '-')),
      el('td', {}, el('div', { class: 'pro-prov' }, celda(x, 'tienda', { list: 'pro-tiendas', label: 'Proveedor' }),
        x.url ? el('button', { type: 'button', class: 'pro-lk', title: esArchivo(x.url) ? 'Abrir archivo' : 'Abrir link', 'aria-label': 'Abrir link', onclick: () => abrirLink(ctx, x.url).catch((e) => avisar(e.message, 'error')) }, icono(esArchivo(x.url) ? 'documento' : 'enlace', { tam: 14 })) : null)),
      el('td', {}, celda(x, 'estado')),
      el('td', { class: 'pro-acc' }, acciones));
  }

  const COLS = () => el('colgroup', {}, ['26px', null, '64px', '58px', '96px', '96px', '132px', '118px', '118px'].map((w) => el('col', { style: w ? `width:${w}` : null })));
  const CAB = () => el('thead', {}, el('tr', {}, ['', 'Ítem y detalle', 'Cant.', 'Unidad', 'P. unitario', 'Subtotal', 'Proveedor', 'Estado', '']
    .map((t, i) => el('th', { class: [2, 4, 5].includes(i) ? 'num' : null }, t))));
  const kpi = (t, v, pend = false) => el('div', { class: 'pro-kpi' }, el('span', {}, t), el('b', { class: pend ? 'pend' : null }, v));
  const boton3d = (z, g, filas) => (d.modelo && filas.some((x) => x.clave || x.modelo)
    ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico pro-3d', title: g ? 'Ver el área en 3D' : 'Ver la zona en 3D',
      onclick: (ev) => { ev.stopPropagation(); ventana3d(ctx, g ? `${g} · ${z}` : z, { modeloId: d.modelo.id, inv: d.inventario, filas: vigentes(filas), alElegir: (x) => seleccionar(x.id) }); } }, icono('caja', { tam: 14 }), '3D')
    : null);
  const meta = (l) => `${l.length} ${l.length === 1 ? 'partida' : 'partidas'}${sinPrecioN(l) ? ` · ${sinPrecioN(l)} sin precio` : ''}`;
  const titulo = (clase, valor, attrs) => {
    const i = el('input', { class: `pro-cel ${clase}`, value: valor, readonly: !puedeEditar, ...attrs });
    i.defaultValue = valor;
    return i;
  };
  const plegador = (clave, nodo) => {
    nodo.addEventListener('click', (ev) => { if (ev.target.closest('button, input, select, a')) return; pl.alternar(clave); refrescar(); });
    nodo.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === nodo) { ev.preventDefault(); pl.alternar(clave); refrescar(); } });
    return nodo;
  };
  let visibles = [];

  function dibujar() {
    visibles = [];
    const q = filtro.texto.trim().toLowerCase();
    const filtrando = !!(q || filtro.pend);
    const todas = ordenadas().filter((x) => !filtro.zona || x.zona === filtro.zona);
    const ps = todas.filter((x) => (!filtro.pend || (!NO_SUMA.has(x.estado) && !tienePrecio(x)))
      && (!q || [x.item, x.detalle, x.tienda, x.sku, x.nota, x.grupo, x.material].join(' ').toLowerCase().includes(q)));
    const total = suma(todas);
    const zonas = filtro.zona ? [filtro.zona] : zonasDe(d.proyecto, d.partidas);
    const p = d.proyecto;
    const opcionesModelo = [['-', 'Sin modelo'], ...d.modelos.map((m) => [m.id, `${m.nombre}${m.fecha ? ` · ${m.fecha}` : ''}`])];
    const modeloSel = el('select', { class: 'pro-cel pro-cel-inv', 'aria-label': 'Modelo SketchUp de este proyecto', disabled: !puedeEditar },
      opcionesModelo.map(([v, t]) => el('option', { value: v, selected: v === (d.modelo?.id ?? '-') }, t)));
    modeloSel.addEventListener('change', () => ligarModelo(modeloSel.value));
    const nombre = titulo('pro-cel-h1', p.nombre, { 'data-k': 'p:nombre', 'aria-label': 'Nombre del proyecto' });
    nombre.addEventListener('change', () => { const v = nombre.value.trim(); if (!v) { nombre.value = p.nombre; return; } guardarProyecto(ctx, p, { nombre: v }).then(() => ctx.refrescar()).catch(fallo); });
    const cliente = titulo('pro-cel-cli', p.cliente ?? '', { 'data-k': 'p:cliente', placeholder: '-', 'aria-label': 'Cliente' });
    cliente.addEventListener('change', () => guardarProyecto(ctx, p, { cliente: cliente.value.trim() }).catch(fallo));

    const partes = [
      el('div', { class: 'pro-hoja-cab' },
        el('div', { class: 'pro-crece' }, nombre,
          el('div', { class: 'texto-suave texto-chico' }, `${filtro.zona || `${zonas.length} ${zonas.length === 1 ? 'zona' : 'zonas'}`} · ${todas.length} partidas`)),
        el('div', { class: 'pro-meta' },
          el('label', {}, 'Cliente ', cliente),
          el('label', {}, 'Modelo SketchUp ', modeloSel),
          el('div', {}, `${hoyLargo()} · Precios con IVA incluido`))),
      el('div', { class: 'pro-kpis' }, kpi('Total con precio', clp(total)), kpi('Neto (sin IVA)', clp(neto(total))), kpi('IVA 19 %', clp(total - neto(total))),
        kpi('Partidas sin precio', `${sinPrecioN(todas)} de ${vigentes(todas).length}`, sinPrecioN(todas) > 0)),
      puedeEditar ? el('p', { class: 'pro-ayuda' }, 'Escribe directo en las celdas. Enter baja a la fila siguiente y Esc deshace lo que escribías. Puedes pegar filas copiadas de Excel en la columna Ítem (ítem, detalle, cantidad, unidad, precio, proveedor) y arrastrar una fila por sus puntos para moverla a otra área.') : null,
    ];

    for (const z of zonas) {
      const tz = todas.filter((x) => x.zona === z);
      const fzs = ps.filter((x) => x.zona === z);
      if (filtrando && !fzs.length) continue;
      const kz = `pz:${p.id}:${z}`; visibles.push(kz);
      const ab = filtrando || pl.abierto(kz);
      const tzNombre = titulo('pro-cel-z', z, { 'data-k': `z:${z}`, 'aria-label': 'Nombre de la zona' });
      tzNombre.addEventListener('change', () => renombrarZona(z, tzNombre.value.trim(), tzNombre));
      const cab = plegador(kz, el('div', { class: 'pro-hz-h', role: 'button', tabindex: 0, 'aria-expanded': String(ab) },
        icono('derecha', { tam: 14, clase: 'icono pro-chev' }), tzNombre, el('span', { class: 'pro-meta-l' }, meta(tz)), boton3d(z, '', tz), el('span', { class: 'pro-tot' }, clp(suma(tz)))));
      const sec = el('section', { class: `pro-hz${ab ? ' abierta' : ''}` }, cab);
      if (ab) {
        let gs = ordenGrupos([...new Set(tz.map(gDe))]);
        if (filtrando) gs = gs.filter((g) => fzs.some((x) => gDe(x) === g));
        if (!gs.length) gs = ['General'];
        for (const g of gs) {
          const tg = tz.filter((x) => gDe(x) === g); const fg = fzs.filter((x) => gDe(x) === g);
          const kg = `pg:${p.id}:${z}:${g}`; visibles.push(kg);
          const abg = filtrando || pl.abierto(kg);
          const gNombre = titulo('pro-cel-g', g, { 'data-k': `g:${z}:${g}`, 'aria-label': 'Nombre del área' });
          gNombre.addEventListener('change', () => renombrarGrupo(z, g, gNombre.value.trim(), gNombre));
          const gcab = plegador(kg, el('div', { class: 'pro-hg-h', role: 'button', tabindex: 0, 'aria-expanded': String(abg) },
            icono('derecha', { tam: 14, clase: 'icono pro-chev' }), gNombre, el('span', { class: 'pro-meta-l' }, meta(tg)), boton3d(z, g, tg), el('span', { class: 'pro-tot' }, clp(suma(tg)))));
          const area = el('div', { class: `pro-hg${abg ? ' abierta' : ''}` }, gcab);
          if (abg) {
            area.append(el('div', { class: 'tabla-contenedor pro-tbl' }, el('table', { class: 'pro-tab' }, COLS(), CAB(),
              el('tbody', {}, fg.map(fila),
                puedeCrear ? el('tr', { class: 'pro-add', 'data-zona': z, 'data-grupo': g }, el('td'), el('td', { colspan: 8 },
                  boton('Agregar fila', { icono: 'mas', class: 'boton boton-secundario boton-chico pro-boton-add', onclick: () => nuevaFila(z, g) }))) : null))));
          }
          sec.append(area);
        }
        if (puedeCrear) sec.append(el('div', { class: 'pro-hz-pie' }, boton('Agregar área', { icono: 'mas', class: 'boton boton-secundario boton-chico pro-boton-add', onclick: () => pedirNombre('Área nueva', 'Nombre del área (por ejemplo "Muro TV")', (n) => nuevaFila(z, n)) })));
      }
      partes.push(sec);
    }
    if (filtrando && !ps.length) partes.push(el('div', { class: 'pro-vacio' }, icono('buscar', { tam: 26 }), 'Ninguna partida coincide con el filtro.'));
    if (puedeCrear) partes.push(el('div', { class: 'pro-hz-pie fin' }, boton('Agregar zona', { icono: 'mas', class: 'boton boton-secundario pro-boton-add', onclick: () => pedirNombre('Zona nueva', 'Nombre de la zona', async (n) => {
      if (!d.proyecto.zonas.includes(n)) await guardarProyecto(ctx, d.proyecto, { zonas: [...d.proyecto.zonas, n] });
      filtro.zona = ''; nuevaFila(n, 'General');
    }) })));
    hoja.replaceChildren(...partes);
    hoja.querySelectorAll('textarea.pro-cel').forEach(crecer);
    if (sel && !d.partidas.some((x) => x.id === sel)) sel = null;
    pintarPanel();
  }

  const crecer = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
  // Vuelve a dibujar sin perder la celda en que está el cursor
  function refrescar() {
    requestAnimationFrame(() => {
      const a = document.activeElement;
      const clave = a?.dataset?.k ?? null;
      const pos = clave && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
      const sy = window.scrollY;
      dibujar();
      if (clave) {
        const b = hoja.querySelector(`[data-k="${CSS.escape(clave)}"]`);
        if (b) { b.focus({ preventScroll: true }); if (pos && b.setSelectionRange) { try { b.setSelectionRange(...pos); } catch { /* select */ } } }
      }
      window.scrollTo(0, sy);
    });
  }
  const enfocar = (clave) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const e = hoja.querySelector(`[data-k="${CSS.escape(clave)}"]`); if (e) { e.focus(); e.scrollIntoView({ block: 'nearest' }); }
  }));

  // ---------------------------------------------------------------- Acciones
  function pedirNombre(tituloF, etiqueta, alListo) {
    abrirFormulario({ titulo: tituloF, textoGuardar: 'Crear', campos: [{ id: 'n', etiqueta, requerido: true }], alGuardar: async (v) => { const n = v.n.trim(); if (n) await alListo(n); } });
  }
  function ultimoOrdenDe(z, g) {
    const l = ordenadas().filter((y) => y.zona === z && gDe(y) === g);
    return l.at(-1)?.orden ?? null;
  }
  function siguienteOrden(orden) {
    const l = ordenadas(); const i = l.findIndex((y) => y.orden === orden);
    return i >= 0 ? l[i + 1]?.orden ?? null : null;
  }
  async function crearFila(z, g, tras = null, datos = {}) {
    const antes = tras ? tras.orden : ultimoOrdenDe(z, g) ?? d.partidas.reduce((m, y) => Math.max(m, y.orden), 0);
    const despues = antes == null ? null : siguienteOrden(antes);
    const [x] = await insertarPartidas(ctx, [{ proyecto_id: d.proyecto.id, zona: z, grupo: g === 'General' ? '' : g, unidad: 'un', cantidad: 1, estado: 'por_cotizar', fuente: 'usuario', orden: ordenEntre(antes, despues), ...datos }]);
    d.partidas.push(x);
    if (!d.proyecto.zonas.includes(z)) await guardarProyecto(ctx, d.proyecto, { zonas: [...d.proyecto.zonas, z] });
    return x;
  }
  async function nuevaFila(z, g) {
    try {
      const x = await crearFila(z, g);
      pl.poner(`pz:${d.proyecto.id}:${z}`, true); pl.poner(`pg:${d.proyecto.id}:${z}:${g}`, true);
      filtro.texto = ''; buscador.value = '';
      if (filtro.zona && filtro.zona !== z) { filtro.zona = ''; zonaSel.value = ''; }
      sel = x.id; dibujar(); enfocar(k(x, 'item'));
    } catch (e) { avisar(e.message, 'error'); }
  }
  async function duplicar(x) {
    const { id, created_at, created_by, updated_at, deleted_at, empresa_id, orden, ...resto } = x;
    try {
      const c = await crearFila(x.zona, gDe(x), x, { ...resto, item: `${x.item} (copia)` });
      sel = c.id; dibujar(); avisar('Partida duplicada');
    } catch (e) { avisar(e.message, 'error'); }
  }
  let tDeshacer = null;
  async function borrar(x) {
    try { await guardarPartida(ctx, x, { deleted_at: new Date().toISOString() }); } catch (e) { avisar(e.message, 'error'); return; }
    d.partidas = d.partidas.filter((y) => y !== x);
    if (sel === x.id) sel = null;
    dibujar();
    deshacer.replaceChildren(el('span', {}, `Se eliminó "${x.item || 'fila sin nombre'}"`),
      boton('Deshacer', { class: 'boton boton-secundario boton-chico', onclick: async () => {
        deshacer.hidden = true; clearTimeout(tDeshacer);
        try { await guardarPartida(ctx, x, { deleted_at: null }); d.partidas.push(x); dibujar(); avisar('Fila recuperada'); } catch (e) { avisar(e.message, 'error'); }
      } }));
    deshacer.hidden = false;
    clearTimeout(tDeshacer); tDeshacer = setTimeout(() => { deshacer.hidden = true; }, 8000);
  }
  async function renombrarZona(viejo, nuevo, entrada) {
    const p = d.proyecto;
    if (!nuevo || nuevo === viejo) { entrada.value = viejo; return; }
    if (zonasDe(p, d.partidas).includes(nuevo) && !window.confirm(`Ya existe la zona "${nuevo}". ¿Juntar "${viejo}" con ella?`)) { entrada.value = viejo; return; }
    try {
      const { error } = await ctx.api.from('pro_partidas').update({ zona: nuevo }).eq('proyecto_id', p.id).eq('zona', viejo).is('deleted_at', null);
      if (error) throw new Error(error.message);
      d.partidas.forEach((x) => { if (x.zona === viejo) x.zona = nuevo; });
      await guardarProyecto(ctx, p, { zonas: [...new Set([...p.zonas.map((z) => (z === viejo ? nuevo : z)), nuevo])] });
      if (pl.abierto(`pz:${p.id}:${viejo}`)) pl.poner(`pz:${p.id}:${nuevo}`, true);
      if (filtro.zona === viejo) filtro.zona = '';
      refrescar(); avisar('Zona renombrada');
    } catch (e) { fallo(e); }
  }
  async function renombrarGrupo(z, viejo, nuevo, entrada) {
    if (!nuevo || nuevo === viejo) { entrada.value = viejo; return; }
    const de = d.partidas.filter((x) => x.zona === z && gDe(x) === viejo);
    try {
      const { error } = await ctx.api.from('pro_partidas').update({ grupo: nuevo === 'General' ? '' : nuevo }).in('id', de.map((x) => x.id));
      if (error) throw new Error(error.message);
      de.forEach((x) => { x.grupo = nuevo === 'General' ? '' : nuevo; });
      if (pl.abierto(`pg:${d.proyecto.id}:${z}:${viejo}`)) pl.poner(`pg:${d.proyecto.id}:${z}:${nuevo}`, true);
      refrescar(); avisar('Área renombrada');
    } catch (e) { fallo(e); }
  }
  async function ligarModelo(v) {
    try {
      await guardarProyecto(ctx, d.proyecto, v === '-' ? { modelo_id: null, sin_modelo: true } : { modelo_id: v, sin_modelo: false });
      d.modelo = modeloDe(d.proyecto, d.modelos);
      d.inventario = d.modelo ? await cargarInventario(ctx, d.modelo).catch(() => null) : null;
      mp = mapasInv(d.inventario);
      dibujar();
      avisar(v === '-' ? 'Proyecto sin modelo ligado' : 'Modelo ligado: las cantidades y el 3D salen de ese modelo');
    } catch (e) { fallo(e); }
  }
  function ficha(x) {
    fichaPartida(ctx, d, x, { alGuardar: async () => { imagen = await urlsImagenes(ctx, d.partidas); dibujar(); } });
  }

  // ---------------------------------------------------------------- Edición en las celdas
  hoja.addEventListener('input', (ev) => { if (ev.target.matches('textarea.pro-cel')) crecer(ev.target); });
  hoja.addEventListener('change', (ev) => {
    const e = ev.target; const f = e.dataset.f; if (!f) return;
    const x = d.partidas.find((y) => y.id === e.closest('tr[data-id]')?.dataset.id); if (!x) return;
    if (f === 'cantidad' || f === 'precio') {
      const v = leerNum(e.value, f);
      if (v === undefined) { avisar('Escribe un número mayor o igual a 0.', 'error'); e.value = fmtNum(x[f], f); return; }
      const c = { [f]: f === 'precio' && v != null ? Math.round(v) : v };
      if (f === 'precio' && v) c.fecha_precio = hoyISO();
      cambiar(x, c);
    } else if (f === 'estado') cambiar(x, { estado: e.value });
    else cambiar(x, { [f]: e.value.trim() });
  });
  hoja.addEventListener('keydown', (ev) => {
    const e = ev.target;
    if (!e.classList?.contains('pro-cel')) return;
    if (ev.key === 'Escape') { e.value = e.defaultValue; e.blur(); return; }
    if (ev.key === 'Enter' && !e.dataset.f) { ev.preventDefault(); e.blur(); return; }   // nombres de zona, área y proyecto
    if (!e.dataset.f) return;
    const sinLista = e.tagName === 'INPUT' && !e.getAttribute('list');
    const paso = ev.key === 'Enter' ? (ev.shiftKey ? -1 : 1) : sinLista && ev.key === 'ArrowDown' ? 1 : sinLista && ev.key === 'ArrowUp' ? -1 : 0;
    if (!paso) return;
    ev.preventDefault();
    const filas = [...hoja.querySelectorAll('tr.pro-fila')];
    const otro = filas[filas.indexOf(e.closest('tr')) + paso]?.querySelector(`[data-f="${e.dataset.f}"]`);
    if (otro) { otro.focus(); otro.select?.(); } else e.blur();   // al salir de la celda se guarda (change)
  });
  // Enter guarda con 'change' antes de mover el foco; evita guardar dos veces el mismo valor
  hoja.addEventListener('change', (ev) => { ev.target.defaultValue = ev.target.value; }, true);
  hoja.addEventListener('focusin', (ev) => { const tr = ev.target.closest?.('tr.pro-fila'); if (tr) seleccionar(tr.dataset.id); });
  hoja.addEventListener('click', (ev) => { const tr = ev.target.closest('tr.pro-fila'); if (tr && !ev.target.closest('a, button')) seleccionar(tr.dataset.id); });

  // Pegar varias filas desde Excel en Ítem (columnas: ítem, detalle, cantidad, unidad, precio, proveedor)
  hoja.addEventListener('paste', async (ev) => {
    const e = ev.target;
    if (e.dataset?.f !== 'item' || !puedeCrear) return;
    const txt = ev.clipboardData?.getData('text') || '';
    const lineas = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (lineas.length < 2 && !txt.includes('\t')) return;
    ev.preventDefault();
    const x0 = d.partidas.find((y) => y.id === e.closest('tr').dataset.id); if (!x0) return;
    const campos = ['item', 'detalle', 'cantidad', 'unidad', 'precio', 'tienda'];
    const leer = (l) => {
      const c = l.split('\t'); const o = {};
      campos.forEach((f, i) => {
        const v = (c[i] ?? '').trim(); if (!v) return;
        if (f === 'cantidad' || f === 'precio') { const n = leerNum(v, f); if (n !== undefined) o[f] = f === 'precio' && n != null ? Math.round(n) : n; } else o[f] = v;
      });
      if (o.precio > 0) o.fecha_precio = hoyISO();
      return o;
    };
    try {
      let ultimo = x0;
      for (const [i, l] of lineas.entries()) {
        const datos = leer(l);
        if (i === 0 && !x0.item) { await guardarPartida(ctx, x0, datos); continue; }
        ultimo = await crearFila(x0.zona, gDe(x0), ultimo, datos);
      }
      dibujar(); avisar(`${lineas.length} ${lineas.length === 1 ? 'fila pegada' : 'filas pegadas'}`);
    } catch (er) { fallo(er); }
  });

  // Arrastrar filas por sus puntos, dentro del área o a otra área (también sobre "Agregar fila")
  let arrastrando = null;
  const limpiar = () => hoja.querySelectorAll('.drop-antes, .drop-despues').forEach((r) => r.classList.remove('drop-antes', 'drop-despues'));
  hoja.addEventListener('dragstart', (ev) => {
    const a = ev.target.closest?.('.pro-asa'); if (!a) return;
    const tr = a.closest('tr.pro-fila'); arrastrando = tr.dataset.id;
    ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', arrastrando);
    try { ev.dataTransfer.setDragImage(tr, 16, 16); } catch { /* sin imagen */ }
    tr.classList.add('arrastrando');
  });
  hoja.addEventListener('dragover', (ev) => {
    if (!arrastrando) return;
    const tr = ev.target.closest?.('tr.pro-fila, tr.pro-add'); if (!tr) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'move';
    limpiar();
    const r = tr.getBoundingClientRect();
    tr.classList.add(tr.classList.contains('pro-add') || ev.clientY < r.top + r.height / 2 ? 'drop-antes' : 'drop-despues');
  });
  hoja.addEventListener('drop', async (ev) => {
    if (!arrastrando) return;
    ev.preventDefault();
    const tr = ev.target.closest?.('tr.pro-fila, tr.pro-add');
    const antes = tr?.classList.contains('drop-antes');
    const id = arrastrando; arrastrando = null; limpiar();
    if (!tr || tr.dataset.id === id) { dibujar(); return; }
    const x = d.partidas.find((y) => y.id === id); if (!x) return;
    const resto = ordenadas().filter((y) => y !== x);
    let zona; let grupo; let orden;
    if (tr.classList.contains('pro-add')) {
      zona = tr.dataset.zona; grupo = tr.dataset.grupo;
      const delArea = resto.filter((y) => y.zona === zona && gDe(y) === grupo);
      const ult = delArea.at(-1);
      const sig = ult ? resto[resto.indexOf(ult) + 1] : null;
      orden = ordenEntre(ult?.orden ?? resto.at(-1)?.orden ?? null, ult ? sig?.orden ?? null : null);
    } else {
      const t = d.partidas.find((y) => y.id === tr.dataset.id);
      zona = t.zona; grupo = gDe(t);
      const j = resto.indexOf(t);
      orden = antes ? ordenEntre(resto[j - 1]?.orden ?? null, t.orden) : ordenEntre(t.orden, resto[j + 1]?.orden ?? null);
    }
    await cambiar(x, { zona, grupo: grupo === 'General' ? '' : grupo, orden });
    // Si el orden quedó muy junto a otro, se renumera el proyecto
    const l = ordenadas();
    if (l.some((y, i) => i && Math.abs(y.orden - l[i - 1].orden) < 1e-6)) await renumerar(ctx, l).catch(fallo);
    avisar('Fila movida');
  });
  hoja.addEventListener('dragend', () => { arrastrando = null; limpiar(); hoja.querySelectorAll('.arrastrando').forEach((r) => r.classList.remove('arrastrando')); });

  // ---------------------------------------------------------------- Panel lateral: 3D, imagen y datos de la fila
  const pMsg = el('div', { class: 'pro-v3-msg' }, 'Selecciona una fila');
  const pImg = el('img', { class: 'pro-pv-img', alt: '', hidden: true });
  const pVisor = el('div', { class: 'pro-pv' }, pImg, pMsg);
  const pMed = el('span', { class: 'pro-v3-med texto-suave' });
  let vp = null; let panelId = null; let tok = 0;
  const pPie = el('div', { class: 'pro-pv-pie', hidden: true }, pMed,
    ['iso', 'frente', 'lado', 'arriba'].map((m, i) => boton(['3D', 'Frente', 'Lado', 'Arriba'][i], { class: 'boton boton-secundario boton-chico', onclick: () => camara(vp, m) })),
    boton('Ampliar', { class: 'boton boton-secundario boton-chico', title: 'Ver en grande', onclick: () => { const x = d.partidas.find((y) => y.id === sel); if (x) ventana3d(ctx, x.item, { modeloId: d.modelo.id, m3d: m3dDe(x, mp) }); } }));
  const pInfo = el('div', { class: 'pro-pv-info' });
  panel.append(pVisor, pPie, pInfo);

  function seleccionar(id) {
    if (sel === id) return;
    sel = id;
    hoja.querySelectorAll('tr.pro-fila').forEach((r) => r.classList.toggle('sel', r.dataset.id === id));
    pintarPanel();
  }
  function pintarPanel() {
    const x = sel && d.partidas.find((y) => y.id === sel);
    if (!x) { pInfo.replaceChildren(el('p', { class: 'texto-suave texto-chico' }, 'Haz clic en una fila para ver aquí su mueble en 3D, su imagen y su link.')); mostrar3d(null, null); return; }
    const em = estadoModelo(x, mp);
    const dato = (t, v) => (v ? [el('dt', {}, t), el('dd', {}, v)] : []);
    pInfo.replaceChildren(el('h4', {}, x.item || 'Nuevo ítem'), x.detalle ? el('div', { class: 'texto-suave texto-chico' }, x.detalle) : null,
      el('dl', { class: 'pro-pv-dl' },
        dato('Zona', x.zona), dato('Área', gDe(x)),
        dato('Cantidad', `${fmtNum(x.cantidad, 'cantidad')} ${x.unidad || ''}${em?.cant !== undefined ? ` (modelo: ${em.cant})` : ''}`),
        dato('Subtotal', tienePrecio(x) ? clp(subtotal(x)) : 'Por cotizar'), dato('Estado', NOMBRE_ESTADO[x.estado]),
        dato('Código', x.sku), dato('Precio al', fechaCL(x.fecha_precio)), dato('Nota', x.nota)),
      el('div', { class: 'pro-pv-acc' },
        x.url ? boton(esArchivo(x.url) ? 'Abrir archivo' : 'Abrir link', { icono: esArchivo(x.url) ? 'documento' : 'enlace', class: 'boton boton-secundario boton-chico', onclick: () => abrirLink(ctx, x.url).catch((e) => avisar(e.message, 'error')) }) : null,
        boton('Ficha completa', { icono: 'editar', class: 'boton boton-secundario boton-chico', onclick: () => ficha(x) })));
    mostrar3d(m3dDe(x, mp), x);
  }
  async function mostrar3d(id, x) {
    const t = ++tok;
    pPie.hidden = !id;
    const lienzo = (on) => { if (vp) vp.renderer.domElement.style.display = on ? 'block' : 'none'; };
    if (!id || !panelVisible()) {
      lienzo(false);
      const img = x && imagen(x.img);
      if (img) { pImg.src = img; pImg.hidden = false; pMsg.hidden = true; } else {
        pImg.hidden = true; pMsg.hidden = false;
        pMsg.textContent = x ? (id ? 'Usa el botón 3D de la fila para verlo.' : 'Esta fila no tiene 3D ni imagen. Para ligarla a un mueble del modelo, agrégala desde la vista Modelo SketchUp.') : 'Selecciona una fila';
      }
      return;
    }
    pImg.hidden = true;
    if (id === panelId && vp?.obj) { lienzo(true); pMsg.hidden = true; return; }
    lienzo(false); pMsg.hidden = false; pMsg.textContent = 'Cargando 3D…';
    try { await asegurarThree(); } catch { if (t === tok) pMsg.textContent = 'No se pudo cargar el visor 3D (usa internet solo para eso).'; return; }
    const datos = (await cargarMallas(ctx, d.modelo.id, [id]).catch(() => new Map())).get(id);
    if (t !== tok) return;
    if (!datos) { pMsg.textContent = 'Este mueble aún no tiene su archivo 3D: sube de nuevo la exportación con la carpeta de mallas.'; return; }
    if (!vp || !vp.renderer.domElement.isConnected) vp = crearVisor(pVisor);
    lienzo(true);
    const tex = await texturasPara(ctx, d.modelo.id, [datos]).catch(() => new Map());
    if (t !== tok) return;
    try { pMed.textContent = ponerMueble(vp, datos, true, tex); } catch { pMsg.textContent = 'No se pudo leer el 3D de este mueble.'; lienzo(false); return; }
    panelId = id; pMsg.hidden = true;
  }

  // ---------------------------------------------------------------- Barra de herramientas
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar en el proyecto', 'aria-label': 'Buscar en el proyecto', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; dibujar(); });
  const zonaSel = el('select', { class: 'campo campo-filtro', 'aria-label': 'Zona' }, el('option', { value: '' }, 'Todas las zonas'),
    zonasDe(d.proyecto, d.partidas).map((z) => el('option', { value: z, selected: z === filtro.zona }, z)));
  zonaSel.addEventListener('change', () => { filtro.zona = zonaSel.value; dibujar(); });
  const pend = el('input', { type: 'checkbox', checked: filtro.pend });
  pend.addEventListener('change', () => { filtro.pend = pend.checked; dibujar(); });
  const todo = (abrir) => () => {
    if (abrir) { dibujar(); visibles.forEach((c) => pl.poner(c, true)); dibujar(); }   // dos pasadas: también lo de dentro
    visibles.forEach((c) => pl.poner(c, abrir)); dibujar();
  };
  const herramientas = el('div', { class: 'listado-acciones pro-herr' },
    el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), zonaSel,
    el('label', { class: 'casilla' }, pend, 'Solo sin precio'),
    boton('Desplegar todo', { onclick: todo(true) }), boton('Plegar todo', { onclick: todo(false) }),
    ctx.puede('proyectos', 'eliminar') ? boton('Eliminar proyecto', { icono: 'basura', title: 'Eliminar este proyecto', onclick: async () => {
      if (!window.confirm(`¿Eliminar el proyecto "${d.proyecto.nombre}" con sus ${d.partidas.length} partidas? Deja de verse en ISgestión.`)) return;
      try { await guardarProyecto(ctx, d.proyecto, { deleted_at: new Date().toISOString() }); guardarActual(ctx, null); avisar('Proyecto eliminado'); location.hash = ctx.ruta('proyectos.hoja'); }
      catch (e) { avisar(e.message, 'error'); }
    } }) : null,
    ctx.puede('proyectos', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: async (ev) => {
      const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
      try { await excelProyecto(ctx, d); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
    } }) : null);

  const datalists = [el('datalist', { id: 'pro-unidades' }, UNIDADES.map((u) => el('option', { value: u }))),
    el('datalist', { id: 'pro-tiendas' }, [...new Set(d.partidas.map((x) => x.tienda).filter(Boolean))].sort().map((t) => el('option', { value: t })))];

  dibujar();
  return el('section', { class: 'listado pro' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Proyectos')),
    selectorProyecto(ctx, d, 'proyectos.hoja'),
    herramientas, cuerpo, deshacer, datalists);
}

function puntos() {
  const SVG = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 10 16'); s.setAttribute('width', '10'); s.setAttribute('height', '16'); s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
  for (const [cx, cy] of [[3, 3.5], [7, 3.5], [3, 8], [7, 8], [3, 12.5], [7, 12.5]]) {
    const c = document.createElementNS(SVG, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '1.3'); s.append(c);
  }
  return s;
}
