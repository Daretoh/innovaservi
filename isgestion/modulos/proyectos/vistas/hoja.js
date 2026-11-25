// Proyectos → Proyecto: la hoja del proyecto. Se ve como el resumen formal (cabecera, indicadores, zonas y áreas con
// totales) y se edita como planilla: se escribe en las celdas, Enter baja, Esc deshace, se pega desde Excel en Ítem
// y se arrastra una fila por sus puntos a otra área. En pantallas anchas, panel lateral con el 3D del mueble.
// Ruta: #/proyectos.hoja?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=bd56179';
import { icono } from '../../../core/ui/iconos.js?v=bd56179';
import { boton } from '../../../core/ui/tabla.js?v=bd56179';
import { abrirFormulario } from '../../../core/ui/modal.js?v=bd56179';
import { avisar } from '../../../core/ui/aviso.js?v=bd56179';
import {
  ESTADOS, NOMBRE_ESTADO, NO_SUMA, UNIDADES, clp, subtotal, suma, sinPrecioN, vigentes, tienePrecio, gDe, alerta, esArchivo, neto,
  ordenGrupos, zonasDe, leerNum, fmtNum, hoyISO, fechaCL, hoyLargo, plegado, cargarTodo, cargarEstilos, selectorProyecto, sinProyectos,
  guardarPartida, guardarProyecto, insertarPartidas, ordenEntre, renumerar, mapasInv, estadoModelo, m3dDe, chipModelo, modeloDe,
  cargarInventario, abrirLink, urlsImagenes, fichaPartida, guardarActual, instanciasDe, queEsDe,
  insertarReferencia, guardarReferencia, usarReferencia,
} from '../datos.js?v=bd56179';
import { ventana3d, asegurarThree, cargarMallas, crearVisor, ponerMueble, camara, texturasPara, vistaModelo } from '../visor3d.js?v=bd56179';
import { excelProyecto } from '../exportar.js?v=bd56179';

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
  // ¿La fila está ligada a piezas que el 3D del modelo puede mostrar? (clave exacta, ~| o conjunto)
  const conModelo3d = () => !!(d.modelo && d.inventario && (d.inventario.escena?.length || d.inventario.items.some((it) => (it.m3d && it.pos?.length) || it.cajas?.length)));
  const ligadaAlModelo = (x) => conModelo3d() && (instanciasDe(x, d.inventario).length > 0 || !!estadoModelo(x, mp)?.presente);

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
      m3 ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver en 3D', 'aria-label': 'Ver en 3D', onclick: () => { seleccionar(x.id); if (!panelVisible()) ventana3d(ctx, x.item || 'Vista 3D', { modeloId: d.modelo.id, m3d: m3 }); } }, icono('caja', { tam: 16 }))
        : ligadaAlModelo(x) ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver dónde va en el modelo', 'aria-label': 'Ver dónde va en el modelo', onclick: () => { seleccionar(x.id); if (!panelVisible()) ventana3d(ctx, x.item || 'Vista 3D', { modeloId: d.modelo.id, inv: d.inventario, foco: x }); } }, icono('caja', { tam: 16 })) : null,
      el('button', { type: 'button', class: 'boton-icono', title: 'Ficha completa (link, imagen, código, nota)', 'aria-label': 'Ficha completa', onclick: () => ficha(x) }, icono('editar', { tam: 16 })),
      conRefs() ? el('button', { type: 'button', class: 'boton-icono', title: 'Referencias de precio (comparar cotizaciones)', 'aria-label': 'Referencias de precio', onclick: () => verReferencias(x) }, icono('dinero', { tam: 16 })) : null,
      puedeCrear ? el('button', { type: 'button', class: 'boton-icono', title: 'Duplicar fila', 'aria-label': 'Duplicar fila', onclick: () => duplicar(x) }, icono('copiar', { tam: 16 })) : null,
      puedeEliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar fila', 'aria-label': 'Eliminar fila', onclick: () => borrar(x) }, icono('basura', { tam: 16 })) : null);
    return el('tr', { class: `pro-fila${x.id === sel ? ' sel' : ''}${NO_SUMA.has(x.estado) ? ' off' : ''}`, 'data-id': x.id },
      el('td', {}, puedeEditar ? el('span', { class: 'pro-asa', draggable: 'true', title: 'Arrastra para mover la fila' }, puntos()) : null),
      el('td', {},
        el('div', { class: 'pro-it' }, img ? el('img', { class: 'pro-mini', src: img, alt: '', loading: 'lazy', onerror: (ev) => ev.target.remove() }) : null, celda(x, 'item')),
        celda(x, 'detalle'),
        x.nota ? el('div', { class: `pro-nota${alerta(x) ? ' alerta' : ''}` }, x.nota) : null,
        chipModelo(em && !em.presente ? em : null, puedeEditar ? (c) => { cambiar(x, { cantidad: c }); avisar('Cantidad actualizada desde el modelo'); } : null),
        chipRefs(x)),
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

  // ---------------------------------------------------------------- Referencias de precio (Proyectos 004)
  // Varias cotizaciones por partida para compararlas sin llenar la hoja: la fila muestra solo un chip ("3 ref. · desde
  // $X") y el detalle va en el panel (o en una ventana en pantallas angostas). "Usar" deja una vigente y copia su
  // precio, tienda, fecha y link a la partida. Sin la migración (d.referencias null) no aparece nada de esto.
  const conRefs = () => Array.isArray(d.referencias);
  const refsDe = (x) => (d.referencias ?? []).filter((r) => r.partida_id === x.id)
    .sort((a, b) => Number(a.precio) - Number(b.precio) || String(b.fecha).localeCompare(String(a.fecha)));
  function chipRefs(x) {
    const l = refsDe(x); if (!l.length) return null;
    return el('button', { type: 'button', class: 'pro-ref-chip', title: 'Ver y comparar las referencias de precio', onclick: () => verReferencias(x) },
      icono('lista', { tam: 12 }), `${l.length} ref. · desde ${clp(l[0].precio)}`);
  }
  function verReferencias(x) {
    seleccionar(x.id);
    if (panelVisible()) {
      requestAnimationFrame(() => panel.querySelector('.pro-refs')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      return;
    }
    const cuerpoDlg = el('div', { class: 'pro-refs-dlg-cuerpo' });
    const dlg = el('dialog', { class: 'modal pro-refs-dlg', 'aria-label': 'Referencias de precio' },
      el('header', { class: 'modal-cabecera' }, el('h2', {}, x.item || 'Referencias de precio'),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => { dlg.close(); dlg.remove(); } }, icono('cerrar'))),
      cuerpoDlg);
    const pintar = () => cuerpoDlg.replaceChildren(bloqueRefs(x, pintar));
    pintar();
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }
  function formRef(x, r, alListo) {
    const tiendas = [...new Set([...(d.referencias ?? []).map((y) => y.tienda), ...d.partidas.map((y) => y.tienda)].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    abrirFormulario({
      titulo: r ? 'Editar referencia' : 'Nueva referencia de precio',
      campos: [
        { id: 'tienda', etiqueta: 'Tienda o proveedor', requerido: true, valor: r?.tienda ?? '', sugerencias: tiendas },
        { id: 'precio', etiqueta: 'Precio unitario (con IVA)', requerido: true, valor: r ? fmtNum(r.precio, 'precio') : '', ayuda: `Precio de una unidad (${x.unidad || 'un'}), igual que en la hoja.` },
        { id: 'url', etiqueta: 'Link', valor: r?.url ?? '', ayuda: 'https://…' },
        { id: 'fecha', etiqueta: 'Fecha de la cotización', tipo: 'date', valor: r?.fecha ?? hoyISO() },
        { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', filas: 2, valor: r?.nota ?? '', ayuda: 'Despacho, stock, marca, formato…' },
        r ? null : { id: 'usar', etiqueta: 'Precio de la partida', opciones: [['si', 'Usar este precio en la partida'], ['no', 'Solo guardar para comparar']], valor: tienePrecio(x) ? 'no' : 'si' },
      ].filter(Boolean),
      alGuardar: async (v) => {
        const precio = leerNum(v.precio, 'precio');
        if (precio == null) throw new Error('Escribe el precio: un número mayor o igual a 0.');
        const url = (v.url || '').trim();
        if (url && !/^https?:\/\//i.test(url)) throw new Error('El link debe empezar con https://');
        const datos = { tienda: v.tienda.trim(), precio: Math.round(precio), url: url || null, fecha: v.fecha || hoyISO(), nota: (v.nota || '').trim() || null };
        let ref;
        if (r) ref = await guardarReferencia(ctx, r, datos);
        else { ref = await insertarReferencia(ctx, { partida_id: x.id, ...datos }); d.referencias.push(ref); }
        // Nueva con "Usar", o la que ya estaba en uso y se corrigió: la partida queda con sus datos
        if (v.usar === 'si' || r?.vigente) {
          Object.assign(x, await usarReferencia(ctx, ref));
          refsDe(x).forEach((y) => { y.vigente = y.id === ref.id; });
        }
        avisar(r ? 'Referencia guardada' : 'Referencia agregada');
        alListo();
      },
    });
  }
  function bloqueRefs(x, alCambiar) {
    const l = refsDe(x);
    const cambio = () => { dibujar(); alCambiar?.(); };   // dibujar() vuelve a pintar también el panel
    const min = l.length ? Number(l[0].precio) : null; const max = l.length ? Number(l.at(-1).precio) : null;
    const enUso = l.find((r) => r.vigente);
    const usar = async (r) => {
      try {
        Object.assign(x, await usarReferencia(ctx, r));
        l.forEach((y) => { y.vigente = y === r; });
        avisar(`La partida queda con el precio de ${r.tienda || 'esa referencia'}`);
        cambio();
      } catch (e) { avisar(e.message, 'error'); }
    };
    const quitar = async (r) => {
      if (!window.confirm(`¿Eliminar la referencia de ${r.tienda || 'esta tienda'}?${r.vigente ? ' La partida conserva su precio.' : ''}`)) return;
      try {
        await guardarReferencia(ctx, r, { deleted_at: new Date().toISOString() });
        d.referencias = d.referencias.filter((y) => y !== r);
        avisar('Referencia eliminada'); cambio();
      } catch (e) { avisar(e.message, 'error'); }
    };
    const filaRef = (r) => {
      const p = Number(r.precio);
      const dif = min && p > min ? Math.round((p / min - 1) * 100) : 0;
      return el('li', { class: `pro-ref${r.vigente ? ' en-uso' : ''}` },
        el('div', { class: 'pro-ref-l1' },
          el('b', { class: 'pro-ref-tienda' }, r.tienda || 'Sin tienda'),
          r.vigente ? el('span', { class: 'chip chip-ok' }, 'En uso') : null,
          el('span', { class: 'pro-ref-precio' }, clp(p))),
        el('div', { class: 'pro-ref-l2 texto-suave' },
          [fechaCL(r.fecha), l.length > 1 ? (dif ? `+${dif} % sobre la más barata` : 'La más barata') : null].filter(Boolean).join(' · ')),
        r.nota ? el('div', { class: 'pro-ref-nota' }, r.nota) : null,
        el('div', { class: 'pro-ref-acc' },
          r.url ? el('button', { type: 'button', class: 'boton-icono', title: 'Abrir link', 'aria-label': 'Abrir link', onclick: () => abrirLink(ctx, r.url).catch((e) => avisar(e.message, 'error')) }, icono('enlace', { tam: 15 })) : null,
          puedeEditar ? el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': 'Editar referencia', onclick: () => formRef(x, r, cambio) }, icono('editar', { tam: 15 })) : null,
          puedeEliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar referencia', onclick: () => quitar(r) }, icono('basura', { tam: 15 })) : null,
          puedeEditar && !r.vigente ? boton('Usar', { class: 'boton boton-secundario boton-chico', title: 'Pasar este precio, tienda y link a la partida', onclick: () => usar(r) }) : null));
    };
    const ahorro = enUso && min != null && Number(enUso.precio) > min ? (Number(enUso.precio) - min) * (Number(x.cantidad) || 0) : 0;
    return el('section', { class: 'pro-refs' },
      el('div', { class: 'pro-refs-cab' },
        el('b', {}, 'Referencias de precio'), l.length ? el('span', { class: 'texto-suave texto-chico' }, String(l.length)) : null,
        puedeCrear ? boton('Agregar', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => formRef(x, null, cambio) }) : null),
      l.length ? el('ul', { class: 'pro-refs-lista' }, l.map(filaRef))
        : el('p', { class: 'texto-suave texto-chico pro-refs-vacio' }, 'Anota cotizaciones de distintas tiendas para compararlas. La que elijas pasa a la partida y suma en el total.'),
      l.length > 1 ? el('p', { class: 'texto-suave texto-chico pro-refs-res' },
        `Entre la más barata y la más cara hay ${clp(max - min)} de diferencia por unidad (${Math.round((max / (min || 1) - 1) * 100)} %).`,
        ahorro > 0 ? el('b', {}, ` Con la más barata ahorras ${clp(ahorro)} en esta partida.`) : null) : null);
  }

  // ---------------------------------------------------------------- Panel lateral: 3D, imagen y datos de la fila
  // Fila de un mueble: el mueble solo ("Objeto"). Fila ligada a piezas del modelo (clave o conjunto): el modelo completo
  // con sus piezas resaltadas ("En el modelo"), para ver dónde va. Con las dos, se elige arriba del pie (se recuerda).
  const pMsg = el('div', { class: 'pro-v3-msg' }, 'Selecciona una fila');
  const pImg = el('img', { class: 'pro-pv-img', alt: '', hidden: true });
  const pVisor = el('div', { class: 'pro-pv' }, pImg, pMsg);
  const pMed = el('span', { class: 'pro-v3-med texto-suave' });
  let vp = null; let panelId = null; let tok = 0;
  let vm = null; let vmModelo = null; let cargaVm = null;   // el modelo completo del panel (se arma una vez)
  let modoPanel = 'objeto'; let vistaPanel = null;
  const activo = () => (vistaPanel === 'modelo' ? vm?.visor : vp);
  const bModo = (m, t) => el('button', { type: 'button', 'data-m': m, 'aria-pressed': 'false', onclick: () => { modoPanel = m; pintarPanel(); } }, t);
  const pModo = el('div', { class: 'segmento pro-pv-modo', role: 'group', 'aria-label': 'Qué mostrar en el 3D' }, bModo('objeto', 'Objeto'), bModo('modelo', 'En el modelo'));
  const pPieza = boton('La pieza', { icono: 'buscar', class: 'boton boton-secundario boton-chico', title: 'Volver a acercar la cámara a la pieza', onclick: () => vm?.encuadrar() });
  const pPie = el('div', { class: 'pro-pv-pie', hidden: true }, pModo, pMed, pPieza,
    ['iso', 'frente', 'lado', 'arriba'].map((m, i) => boton(['3D', 'Frente', 'Lado', 'Arriba'][i], { class: 'boton boton-secundario boton-chico', onclick: () => camara(activo(), m) })),
    boton('Ampliar', { class: 'boton boton-secundario boton-chico', title: 'Ver en grande', onclick: () => {
      const x = d.partidas.find((y) => y.id === sel); if (!x) return;
      if (vistaPanel === 'modelo') ventana3d(ctx, x.item || 'Vista 3D', { modeloId: d.modelo.id, inv: d.inventario, foco: x });
      else ventana3d(ctx, x.item, { modeloId: d.modelo.id, m3d: m3dDe(x, mp) });
    } }));
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
    if (!x) { pInfo.replaceChildren(el('p', { class: 'texto-suave texto-chico' }, 'Haz clic en una fila para ver aquí su 3D (o dónde va en el modelo), su imagen y su link.')); mostrar3d(null); return; }
    const em = estadoModelo(x, mp);
    const dato = (t, v) => (v ? [el('dt', {}, t), el('dd', {}, v)] : []);
    const qe = queEsDe(x);
    pInfo.replaceChildren(el('h4', {}, x.item || 'Nuevo ítem'), x.detalle ? el('div', { class: 'texto-suave texto-chico' }, x.detalle) : null,
      qe ? el('div', { class: 'pro-quees' }, el('b', {}, 'Qué es'), el('p', {}, qe)) : null,
      el('dl', { class: 'pro-pv-dl' },
        dato('Zona', x.zona), dato('Área', gDe(x)),
        dato('Cantidad', `${fmtNum(x.cantidad, 'cantidad')} ${x.unidad || ''}${em?.cant !== undefined ? ` (modelo: ${em.cant})` : ''}`),
        dato('Subtotal', tienePrecio(x) ? clp(subtotal(x)) : 'Por cotizar'), dato('Estado', NOMBRE_ESTADO[x.estado]),
        dato('Código', x.sku), dato('Precio al', fechaCL(x.fecha_precio)), dato('Nota', x.nota)),
      conRefs() ? bloqueRefs(x) : null,
      el('div', { class: 'pro-pv-acc' },
        x.url ? boton(esArchivo(x.url) ? 'Abrir archivo' : 'Abrir link', { icono: esArchivo(x.url) ? 'documento' : 'enlace', class: 'boton boton-secundario boton-chico', onclick: () => abrirLink(ctx, x.url).catch((e) => avisar(e.message, 'error')) }) : null,
        boton('Ficha completa', { icono: 'editar', class: 'boton boton-secundario boton-chico', onclick: () => ficha(x) })));
    mostrar3d(x);
  }
  // Muestra un lienzo (el del mueble o el del modelo) y pausa el otro
  function lienzos(cual) {
    if (vp) { vp.renderer.domElement.style.display = cual === 'objeto' ? 'block' : 'none'; vp.pausado = cual !== 'objeto'; }
    if (vm?.visor) { vm.visor.renderer.domElement.style.display = cual === 'modelo' ? 'block' : 'none'; vm.visor.pausado = cual !== 'modelo'; }
  }
  async function mostrar3d(x) {
    const t = ++tok;
    const id = x ? m3dDe(x, mp) : null;
    const enModelo = !!x && ligadaAlModelo(x);
    const vista = id && (!enModelo || modoPanel === 'objeto') ? 'objeto' : enModelo ? 'modelo' : null;
    vistaPanel = vista;
    pPie.hidden = !vista;
    pModo.style.display = id && enModelo ? '' : 'none';
    pModo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === vista)));
    pPieza.style.display = vista === 'modelo' ? '' : 'none';
    if (!vista || !panelVisible()) {
      lienzos(null);
      const img = x && imagen(x.img);
      if (img) { pImg.src = img; pImg.hidden = false; pMsg.hidden = true; } else {
        pImg.hidden = true; pMsg.hidden = false;
        pMsg.textContent = x ? (vista ? 'Usa el botón 3D de la fila para verlo.' : 'Esta fila no tiene 3D ni imagen. Para ligarla al modelo, agrégala desde la vista Modelo SketchUp.') : 'Selecciona una fila';
      }
      return;
    }
    pImg.hidden = true;
    if (vista === 'modelo') { await mostrarEnModelo(x, t); return; }
    if (id === panelId && vp?.obj) { lienzos('objeto'); pMsg.hidden = true; return; }
    lienzos(null); pMsg.hidden = false; pMsg.textContent = 'Cargando 3D…';
    try { await asegurarThree(); } catch { if (t === tok) pMsg.textContent = 'No se pudo cargar el visor 3D (usa internet solo para eso).'; return; }
    const datos = (await cargarMallas(ctx, d.modelo.id, [id]).catch(() => new Map())).get(id);
    if (t !== tok) return;
    if (!datos) { pMsg.textContent = 'Este mueble aún no tiene su archivo 3D: sube de nuevo la exportación con la carpeta de mallas.'; return; }
    if (!vp || !vp.renderer.domElement.isConnected) vp = crearVisor(pVisor);
    lienzos('objeto');
    const tex = await texturasPara(ctx, d.modelo.id, [datos]).catch(() => new Map());
    if (t !== tok) return;
    try { pMed.textContent = ponerMueble(vp, datos, true, tex); } catch { pMsg.textContent = 'No se pudo leer el 3D de este mueble.'; lienzos(null); return; }
    panelId = id; pMsg.hidden = true;
  }
  // El modelo completo con las piezas de la fila resaltadas y el resto atenuado
  async function mostrarEnModelo(x, t) {
    if (vmModelo !== d.modelo.id || !cargaVm) {
      vm?.visor?.renderer.domElement.remove();   // otro modelo ligado: el lienzo anterior se suelta solo
      vm = null; vmModelo = d.modelo.id;
      cargaVm = vistaModelo(ctx, pVisor, { modeloId: d.modelo.id, inv: d.inventario, alProgreso: (txt) => { if (vistaPanel === 'modelo') pMsg.textContent = txt; } });
    }
    if (!vm) {
      lienzos(null); pMsg.hidden = false; pMsg.textContent = 'Cargando el modelo…'; pMed.textContent = '';
      try { vm = await cargaVm; } catch (e) {
        cargaVm = null;
        if (t === tok) pMsg.textContent = `No se pudo mostrar el modelo en 3D: ${e.message}`;
        return;
      }
      if (vm.sinPosiciones) { if (t === tok) pMsg.textContent = 'Para ubicar piezas, vuelve a enviar el modelo desde SketchUp: ahora guarda dónde está cada objeto.'; return; }
      if (t !== tok) { if (vistaPanel !== 'modelo') lienzos(vistaPanel); return; }
    }
    if (vm.sinPosiciones) { pMsg.hidden = false; pMsg.textContent = 'Para ubicar piezas, vuelve a enviar el modelo desde SketchUp: ahora guarda dónde está cada objeto.'; return; }
    lienzos('modelo');
    const n = vm.resaltar(x);
    pMsg.hidden = !!n;
    if (!n) pMsg.textContent = 'Esta partida no se encontró en el 3D del modelo.';
    pMed.textContent = n ? `${n} ${n === 1 ? 'pieza' : 'piezas'} en el modelo` : '';
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
