// Costos → Estadísticas (2026-11-16, pedido de Enzo): tablero de gastos e ingresos de un período.
// Arriba: tipo (gastos, ingresos o todo), período y "Filtros" (plegado). Indicadores: total, declarado (factura a nuestro
// RUT, Costos 012), respaldo no tributario y sin documento. Tablero: por mes, por respaldo, por categoría, proveedores,
// faenas y patentes; tocar una barra filtra todo y lleva al Detalle, que siempre está visible con cada registro (buscar,
// "mostrar más", enlace al registro). Excel con resumen y registros. Las compras por cuenta de un tercero (a_cuenta_de)
// no son gasto de la empresa: se excluyen salvo que se pidan en Filtros.
import { el } from '../../../core/ui/dom.js?v=625a797';
import { icono } from '../../../core/ui/iconos.js?v=625a797';
import { boton } from '../../../core/ui/tabla.js?v=625a797';
import { avisar } from '../../../core/ui/aviso.js?v=625a797';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=625a797';
import { cargarBase, nombreTercero, DOCS, nombreDoc, nombreClase, estadosDe } from '../datos.js?v=625a797';

const hoy = hoyISO();
const SIN = '(sin)';   // clave de "sin proveedor", "sin faena"…: distinta de '' (= todos)
// Respaldo (Costos 012): factura a nuestro RUT (declarado), respaldo no tributario (boleta, ticket, guía, otro) o nada
const respaldo = (r) => (r.declarable ? 'factura' : r.doc_tipo === 'sin' ? 'sin' : 'otro');
const RESPALDOS = [['factura', 'Declarado (factura a nuestro RUT)'], ['otro', 'No tributario (boleta, ticket, otro)'], ['sin', 'Sin documento']];
const nombreRespaldo = Object.fromEntries(RESPALDOS);
const CHIP_RESPALDO = { factura: 'chip-ok', otro: 'chip-prox', sin: 'chip-venc' };
const CORTO_RESPALDO = { factura: 'Declarado', otro: 'No tributario', sin: 'Sin documento' };
const VACIO = { mes: '', respaldo: '', doc: '', categoria: '', clase: '', faena: '', tercero: '', patente: '', pago: '' };

const estado = {
  periodo: 'anio', desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy,
  tipo: 'gasto', aCuenta: false, f: { ...VACIO }, filtros: false, buscar: '', ver: 50, todas: {},
};
const PERIODOS = [['mes', 'Este mes'], ['anterior', 'Mes anterior'], ['anio', 'Este año'], ['12', 'Últimos 12 meses'], ['otro', 'Elegir fechas']];
function aplicarPeriodo(p) {
  const mes = hoy.slice(0, 7);
  if (p === 'mes') Object.assign(estado, rangoMes(mes));
  else if (p === 'anterior') Object.assign(estado, rangoMes(moverMes(mes, -1)));
  else if (p === 'anio') Object.assign(estado, { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
  else if (p === '12') Object.assign(estado, { desde: `${moverMes(mes, -11)}-01`, hasta: hoy });
  estado.periodo = p;
}

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const conFaenas = ctx.puede('ope', 'ver');
  const [res, base, faenas] = await Promise.all([
    ctx.api.from('fin_registros').select('id, tipo, fecha, concepto, categoria_id, tercero_id, doc_tipo, doc_numero, total, neto, iva, patente, faena_id, estado_pago, declarable, a_cuenta_de')
      .eq('empresa_id', e).is('deleted_at', null).gte('fecha', estado.desde).lte('fecha', estado.hasta).order('fecha').limit(20000),
    cargarBase(ctx),
    conFaenas ? ctx.api.from('ope_faenas').select('id, titulo').eq('empresa_id', e) : Promise.resolve({ data: [] }),
  ]);
  if (res.error) throw res.error;
  const regs = res.data ?? [];
  const faenaDe = new Map((faenas.data ?? []).map((f) => [f.id, f.titulo]));
  const terceroDe = new Map(base.terceros.map((t) => [t.id, t]));
  const cat = (r) => base.categoriaDe.get(r.categoria_id);

  // Dimensiones: clave y nombre de cada registro (las mismas sirven de filtro)
  const DIM = {
    mes: { t: 'Mes', k: (r) => r.fecha.slice(0, 7), n: (r) => nombreMes(r.fecha.slice(0, 7)) },
    respaldo: { t: 'Respaldo', k: respaldo, n: (r) => nombreRespaldo[respaldo(r)] },
    doc: { t: 'Documento', k: (r) => r.doc_tipo, n: (r) => nombreDoc[r.doc_tipo] ?? r.doc_tipo },
    categoria: { t: 'Categoría', k: (r) => r.categoria_id, n: (r) => cat(r)?.nombre ?? 'Sin categoría' },
    clase: { t: 'Clase', k: (r) => cat(r)?.clase ?? SIN, n: (r) => nombreClase[cat(r)?.clase] ?? 'Sin clase' },
    faena: { t: 'Faena', k: (r) => r.faena_id ?? SIN, n: (r) => (r.faena_id ? faenaDe.get(r.faena_id) ?? 'Faena' : 'Sin faena (gasto general)') },
    tercero: { t: 'Proveedor', k: (r) => r.tercero_id ?? SIN, n: (r) => nombreTercero(terceroDe.get(r.tercero_id)) || 'Sin proveedor' },
    patente: { t: 'Patente', k: (r) => r.patente ?? SIN, n: (r) => r.patente ?? 'Sin patente' },
    pago: { t: 'Estado', k: (r) => r.estado_pago, n: (r) => Object.fromEntries(estadosDe(r.tipo))[r.estado_pago] ?? r.estado_pago },
  };
  const delTipo = regs.filter((r) => (!estado.tipo || r.tipo === estado.tipo) && (estado.aCuenta || !r.a_cuenta_de));
  const nombreDe = (dk, k) => { const r = delTipo.find((x) => String(DIM[dk].k(x)) === k); return r ? DIM[dk].n(r) : k; };
  const filtrar = () => delTipo.filter((r) => Object.entries(estado.f).every(([dk, v]) => v === '' || String(DIM[dk].k(r)) === v));
  const agrupar = (lista, dk) => {
    const m = new Map();
    for (const r of lista) {
      const k = String(DIM[dk].k(r));
      const g = m.get(k) ?? { k, n: DIM[dk].n(r), c: 0, neto: 0, iva: 0, total: 0 };
      g.c += 1; g.neto += r.neto || 0; g.iva += r.iva || 0; g.total += r.total || 0;
      m.set(k, g);
    }
    return [...m.values()];
  };
  const suma = (l, c = 'total') => l.reduce((s, r) => s + (r[c] || 0), 0);

  const cuerpo = el('div', { class: 'est-cuerpo' });
  let detalle = null;
  const filtrarPor = (dk, k) => { estado.f[dk] = estado.f[dk] === k ? '' : k; estado.ver = 50; pintar(); detalle?.scrollIntoView({ block: 'start' }); };

  // Barras horizontales de un grupo (tocar = filtrar)
  const barras = (dk, lista, { limite = 8, orden = 'total' } = {}) => {
    let g = agrupar(lista, dk);
    g = orden === 'clave' ? g.sort((a, b) => a.k.localeCompare(b.k)) : g.sort((a, b) => b.total - a.total);
    const todas = estado.todas[dk] || g.length <= limite + 1;
    const max = Math.max(1, ...g.map((x) => x.total));
    const tot = suma(lista);
    return el('div', { class: 'est-barras' },
      (todas ? g : g.slice(0, limite)).map((x) => el('button', { type: 'button', class: `est-fila${estado.f[dk] === x.k ? ' activa' : ''}`, onclick: () => filtrarPor(dk, x.k), title: `${x.c} registros` },
        el('span', { class: 'est-fila-nombre' }, x.n),
        el('span', { class: 'est-fila-valor' }, dinero(x.total), el('small', {}, tot ? ` ${Math.round((x.total / tot) * 100)}%` : '')),
        el('span', { class: 'est-fila-barra' }, el('i', { style: `width:${(x.total / max) * 100}%` })))),
      g.length > limite + 1 ? el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => { estado.todas[dk] = !todas; pintar(); } }, todas ? 'Ver menos' : `Ver todas (${g.length})`) : null);
  };
  const tarjeta = (titulo, ...hijos) => el('div', { class: 'ficha est-tarjeta' }, el('h3', {}, titulo), ...hijos);

  // Columnas por mes
  const porMes = (lista) => {
    const g = agrupar(lista, 'mes').sort((a, b) => a.k.localeCompare(b.k));
    const max = Math.max(1, ...g.map((x) => x.total));
    if (!g.length) return el('p', { class: 'texto-suave' }, 'Sin datos.');
    return el('div', { class: 'est-meses' }, g.map((x) => el('button', { type: 'button', class: `est-mes${estado.f.mes === x.k ? ' activa' : ''}`, title: `${x.n}: ${dinero(x.total)} · ${x.c} registros`, onclick: () => filtrarPor('mes', x.k) },
      el('span', { class: 'est-mes-valor' }, abreviar(x.total)),
      el('span', { class: 'est-mes-col' }, el('i', { style: `height:${Math.max(2, (x.total / max) * 100)}%` })),
      el('span', { class: 'est-mes-nombre' }, x.n.slice(0, 3)))));
  };

  // Respaldo: barra apilada + leyenda
  const porRespaldo = (lista) => {
    const tot = suma(lista);
    const g = new Map(agrupar(lista, 'respaldo').map((x) => [x.k, x]));
    return el('div', {},
      el('div', { class: 'est-apilada' }, RESPALDOS.map(([k]) => g.get(k) ? el('i', { class: `est-r-${k}`, style: `width:${tot ? (g.get(k).total / tot) * 100 : 0}%` }) : null)),
      el('div', { class: 'est-barras' }, RESPALDOS.map(([k, n]) => el('button', { type: 'button', class: `est-fila${estado.f.respaldo === k ? ' activa' : ''}`, onclick: () => filtrarPor('respaldo', k) },
        el('span', { class: 'est-fila-nombre', title: n }, el('i', { class: `est-punto est-r-${k}` }), CORTO_RESPALDO[k]),
        el('span', { class: 'est-fila-valor' }, dinero(g.get(k)?.total ?? 0), el('small', {}, ` ${g.get(k)?.c ?? 0} reg.`))))),
      el('p', { class: 'texto-suave texto-chico' }, `IVA crédito de las facturas: ${dinero(suma(lista.filter((r) => r.doc_tipo === 'factura'), 'iva'))}`));
  };

  const pintar = () => {
    const lista = filtrar();
    const total = suma(lista);
    panel.querySelectorAll('select[data-dk]').forEach((s) => { s.value = estado.f[s.dataset.dk]; });
    const activos = Object.entries(estado.f).filter(([, v]) => v !== '');
    const kpi = (titulo, valor, sub, clase = '') => el('div', { class: `est-kpi ${clase}` }, el('span', { class: 'ind-kpi-titulo' }, titulo), el('strong', {}, valor), el('span', { class: 'texto-suave texto-chico' }, sub));
    const pct = (n) => (total ? `${Math.round((n / total) * 100)}%` : '');
    const de = (k) => lista.filter((r) => respaldo(r) === k);
    const conPatentes = delTipo.some((r) => r.patente);
    const conFaenaDatos = conFaenas && delTipo.some((r) => r.faena_id);

    // Detalle (siempre visible)
    const q = estado.buscar.trim().toLowerCase();
    const vistos = [...lista].reverse().filter((r) => !q || `${r.concepto} ${DIM.tercero.n(r)} ${DIM.categoria.n(r)} ${r.doc_numero ?? ''} ${r.patente ?? ''}`.toLowerCase().includes(q));
    const buscar = el('input', { class: 'campo est-buscar', type: 'search', placeholder: 'Buscar concepto, proveedor, N° o patente', value: estado.buscar, 'aria-label': 'Buscar en el detalle' });
    buscar.addEventListener('input', () => { estado.buscar = buscar.value; estado.ver = 50; const pos = buscar.selectionStart; pintar(); const b = cuerpo.querySelector('.est-buscar'); b?.focus(); b?.setSelectionRange(pos, pos); });
    detalle = el('div', { class: 'ficha est-tarjeta est-detalle' },
      el('div', { class: 'est-detalle-cab' },
        el('h3', {}, 'Detalle', el('span', { class: 'texto-suave' }, ` · ${vistos.length} registros · ${dinero(suma(vistos))}`)), buscar),
      vistos.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla est-tabla-detalle' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Concepto'), el('th', {}, 'Categoría'), el('th', {}, 'Proveedor'), el('th', {}, 'Documento'), el('th', {}, 'Respaldo'), el('th', { class: 'num' }, 'Total'))),
        el('tbody', {}, vistos.slice(0, estado.ver).map((r) => el('tr', {},
          el('td', { class: 'est-nowrap' }, fechaLarga(r.fecha)),
          el('td', {}, el('a', { href: ctx.ruta('costos.registro', { id: r.id }) }, r.concepto), r.patente ? el('span', { class: 'texto-suave texto-chico' }, ` · ${r.patente}`) : null),
          el('td', {}, DIM.categoria.n(r)), el('td', {}, DIM.tercero.n(r)),
          el('td', { class: 'est-nowrap' }, `${nombreDoc[r.doc_tipo] ?? ''}${r.doc_numero ? ` ${r.doc_numero}` : ''}`),
          el('td', {}, el('span', { class: `chip ${CHIP_RESPALDO[respaldo(r)]}` }, CORTO_RESPALDO[respaldo(r)])),
          el('td', { class: 'num est-nowrap' }, el('strong', {}, dinero(r.total)))))))) : el('p', { class: 'tabla-vacia' }, 'Nada con estos filtros.'),
      vistos.length > estado.ver ? boton(`Mostrar más (${vistos.length - estado.ver} restantes)`, { onclick: () => { estado.ver += 100; pintar(); } }) : null);

    cuerpo.replaceChildren(...[
      activos.length ? el('div', { class: 'resumen-chips' }, activos.map(([dk, v]) =>
        el('button', { type: 'button', class: 'chip chip-boton chip-prox', title: 'Quitar filtro', onclick: () => { estado.f[dk] = ''; pintar(); } }, `${DIM[dk].t}: ${nombreDe(dk, v)} `, icono('cerrar', { tam: 12 }))),
        el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => { estado.f = { ...VACIO }; pintar(); } }, 'Quitar todos')) : null,
      el('div', { class: 'est-kpis' },
        kpi(estado.tipo === 'ingreso' ? 'Ingresos' : estado.tipo === 'gasto' ? 'Gastos' : 'Total', dinero(total), `${lista.length} registros`),
        kpi('Declarado', dinero(suma(de('factura'))), `factura a nuestro RUT · ${pct(suma(de('factura')))}`, 'est-k-factura'),
        kpi('No tributario', dinero(suma(de('otro'))), `boleta, ticket, otro · ${pct(suma(de('otro')))}`, 'est-k-otro'),
        kpi('Sin documento', dinero(suma(de('sin'))), `${de('sin').length} registros · ${pct(suma(de('sin')))}`, 'est-k-sin')),
      el('div', { class: 'est-tablero' },
        tarjeta('Por mes', porMes(lista)),
        tarjeta('Respaldo', porRespaldo(lista)),
        tarjeta('Por categoría', barras('categoria', lista)),
        tarjeta(estado.tipo === 'ingreso' ? 'Clientes' : 'Proveedores', barras('tercero', lista, { limite: 6 })),
        conFaenaDatos ? tarjeta('Por faena', barras('faena', lista, { limite: 6 })) : null,
        conPatentes ? tarjeta('Por patente', barras('patente', lista, { limite: 6 })) : null),
      detalle].filter(Boolean));
    return { lista, total };
  };

  // Filtros (plegados): los que no están en el tablero
  const panel = el('div', { class: 'est-panel', hidden: !estado.filtros });
  const usados = (dk) => { const m = new Map(); for (const r of delTipo) m.set(String(DIM[dk].k(r)), DIM[dk].n(r)); return [...m].sort((a, b) => a[1].localeCompare(b[1])); };
  const sel = (dk, todos, opciones = usados(dk)) => {
    const s = el('select', { class: 'campo', 'aria-label': DIM[dk].t, 'data-dk': dk }, el('option', { value: '' }, todos), opciones.map(([v, t]) => el('option', { value: v, selected: estado.f[dk] === v }, t)));
    s.addEventListener('change', () => { estado.f[dk] = s.value; pintar(); });
    return el('label', { class: 'est-campo' }, el('span', { class: 'texto-chico texto-suave' }, DIM[dk].t), s);
  };
  panel.append(
    sel('respaldo', 'Todos', RESPALDOS), sel('doc', 'Todos', DOCS), sel('categoria', 'Todas'), sel('clase', 'Todas'),
    sel('tercero', 'Todos'), ...(conFaenas ? [sel('faena', 'Todas')] : []), sel('patente', 'Todas'), sel('pago', 'Todos'),
    el('label', { class: 'casilla texto-chico est-campo-casilla' }, el('input', { type: 'checkbox', checked: estado.aCuenta, onchange: (ev) => { estado.aCuenta = ev.target.checked; ctx.refrescar(); } }), 'Incluir compras por cuenta de terceros'));
  const bFiltros = boton('Filtros', { icono: 'ajustes', 'aria-expanded': String(estado.filtros), onclick: () => { estado.filtros = !estado.filtros; panel.hidden = !estado.filtros; bFiltros.setAttribute('aria-expanded', String(estado.filtros)); } });

  const selPeriodo = el('select', { class: 'campo', 'aria-label': 'Período' }, PERIODOS.map(([v, t]) => el('option', { value: v, selected: v === estado.periodo }, t)));
  const fechas = el('span', { class: 'est-fechas', hidden: estado.periodo !== 'otro' },
    el('input', { class: 'campo', type: 'date', value: estado.desde, 'aria-label': 'Desde', onchange: (ev) => { if (ev.target.value && ev.target.value <= estado.hasta) { estado.desde = ev.target.value; ctx.refrescar(); } } }),
    el('span', { class: 'texto-suave' }, 'al'),
    el('input', { class: 'campo', type: 'date', value: estado.hasta, 'aria-label': 'Hasta', onchange: (ev) => { if (ev.target.value && ev.target.value >= estado.desde) { estado.hasta = ev.target.value; ctx.refrescar(); } } }));
  selPeriodo.addEventListener('change', () => { if (selPeriodo.value === 'otro') { estado.periodo = 'otro'; fechas.hidden = false; } else { aplicarPeriodo(selPeriodo.value); ctx.refrescar(); } });

  const excel = async (b) => {
    b.disabled = true;
    try {
      const { lista, total } = pintar();
      const { nuevoExcel } = await import('../../../core/excel.js?v=625a797');
      const x = await nuevoExcel(ctx, { titulo: 'Estadísticas de costos', subtitulo: `${fechaLarga(estado.desde)} al ${fechaLarga(estado.hasta)} · ${lista.length} registros · ${dinero(total)}` });
      const resumen = (dk, titulo) => {
        const g = agrupar(lista, dk).sort((a, c) => (dk === 'mes' ? a.k.localeCompare(c.k) : c.total - a.total));
        x.tabla({ hoja: 'Resumen', titulo, columnas: [{ t: DIM[dk].t, tipo: 'texto' }, { t: 'N°', tipo: 'numero' }, { t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }],
          filas: g.map((r) => [r.n, r.c, r.neto, r.iva, r.total]), total: ['Total', lista.length, suma(lista, 'neto'), suma(lista, 'iva'), total] });
      };
      resumen('respaldo', 'Por respaldo'); resumen('mes', 'Por mes'); resumen('categoria', 'Por categoría'); resumen('tercero', 'Por proveedor');
      x.tabla({ hoja: 'Registros', columnas: ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Proveedor o cliente', 'Documento', 'N°', 'Respaldo', ...(conFaenas ? ['Faena'] : []), 'Patente'].map((t) => ({ t, tipo: 'texto' }))
        .concat([{ t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }]),
        filas: lista.map((r) => [fechaLarga(r.fecha), r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', r.concepto, DIM.categoria.n(r), DIM.tercero.n(r), nombreDoc[r.doc_tipo] ?? r.doc_tipo, r.doc_numero ?? '',
          nombreRespaldo[respaldo(r)], ...(conFaenas ? [r.faena_id ? DIM.faena.n(r) : ''] : []), r.patente ?? '', r.neto, r.iva, r.total]) });
      await x.guardar(`estadisticas-costos-${estado.desde}-${estado.hasta}`);
    } catch (err) { avisar(err.message, 'error'); } finally { b.disabled = false; }
  };

  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Estadísticas'), el('p', { class: 'texto-suave' }, `${fechaLarga(estado.desde)} al ${fechaLarga(estado.hasta)} · toca una barra para ver su detalle`)),
      el('div', { class: 'listado-acciones' }, ctx.puede('costos', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: (ev) => excel(ev.currentTarget) }) : null)),
    el('div', { class: 'est-barra-sup' },
      el('div', { class: 'segmento', role: 'group', 'aria-label': 'Tipo' }, [['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['', 'Todo']].map(([v, t]) =>
        el('button', { type: 'button', 'aria-pressed': String(estado.tipo === v), onclick: () => { estado.tipo = v; estado.f = { ...VACIO }; ctx.refrescar(); } }, t))),
      selPeriodo, fechas, bFiltros),
    regs.length >= 20000 ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Hay muchos registros: acorta el período.') : null,
    panel, cuerpo);
}

// $1.234.567 → 1,2 M; 45.000 → 45 mil
function abreviar(n) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} mil`;
  return String(Math.round(n));
}
