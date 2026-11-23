// Remates: oportunidades (inmuebles, vehículos, maquinaria y otros) con fecha del remate, ubicación (distancia al centro),
// mínimo, precio de mercado estimado, descuento y puntaje. Se ordena tocando el título de cada columna. Vista en lista o
// en mapa. Filtros por tipo, comuna (por defecto la primera comuna de interés), estado y región; las pasadas y
// descartadas se ocultan salvo que se pidan.
// Ruta: #/remates.lista
import { el } from '../../../core/ui/dom.js?v=f6c1abb';
import { icono } from '../../../core/ui/iconos.js?v=f6c1abb';
import { boton } from '../../../core/ui/tabla.js?v=f6c1abb';
import { abrirFormulario } from '../../../core/ui/modal.js?v=f6c1abb';
import { avisar } from '../../../core/ui/aviso.js?v=f6c1abb';
import { dinero } from '../../../core/ui/formato.js?v=f6c1abb';
import { exportarExcel } from '../../../core/excel.js?v=f6c1abb';
import {
  TIPOS, ORIGENES, ESTADOS, OBJETIVOS, REGIONES, SUBTIPOS, nombreDe, cargarOportunidades, calcular, puntaje, pct,
  chipPuntaje, chipEstado, diasHasta, fechaRemate, cargarEstilos, contexto, distanciaKm, chipDistancia, km, cercania, mapa,
} from '../datos.js?v=f6c1abb';
import { marcaEmpresa } from '../../grupo/empresas.js?v=f6c1abb';

// Se mantiene al refrescar; comuna = null hasta la primera vez (toma la primera comuna de interés de la configuración)
const filtro = { tipo: '', estado: '', region: '', comuna: null, texto: '', todas: false, orden: 'fecha', dir: 1, modo: 'lista' };
const CERRADAS = ['descartada', 'perdida'];
const ORDEN_ESTADO = Object.fromEntries(ESTADOS.map(([v], i) => [v, i]));

// Columnas: título, clave de orden y cómo comparar (los vacíos van siempre al final)
const COLUMNAS = [
  { t: 'Fecha del remate', k: 'fecha', v: (o) => o.fecha_remate && Date.parse(o.fecha_remate), ayuda: 'Día y hora de la subasta. La garantía (vale vista) se entrega antes: según las bases, el día anterior o hasta una hora antes.' },
  { t: 'Oportunidad', k: 'titulo', v: (o) => o.titulo.toLowerCase() },
  { t: 'Ubicación', k: 'distancia', v: (o) => o._km, ayuda: 'Distancia en línea recta al centro de referencia' },
  { t: 'Mínimo', k: 'minimo', v: (o) => o.minimo, num: true },
  { t: 'Mercado (est.)', k: 'mercado', v: (o) => o.precio_mercado, num: true },
  { t: 'Descuento', k: 'descuento', v: (o) => o._c.descuento, num: true, dir: -1 },
  { t: 'Puntaje', k: 'puntaje', v: (o) => o._p.valor, dir: -1 },
  { t: 'Estado', k: 'estado', v: (o) => ORDEN_ESTADO[o.estado] },
];

export default async function vista(ctx) {
  cargarEstilos();
  const base = contexto(ctx);
  const { cfg, ctxE } = base;
  const varias = base.gs.length > 1;
  const ops = (await cargarOportunidades(ctx, base.gs)).map((o) => ({ ...o, _c: calcular(o, cfg), _p: puntaje(o, cfg), _d: diasHasta(o.fecha_remate), _km: distanciaKm(o, cfg) }));
  const abrir = (o) => { location.hash = ctx.ruta('remates.ficha', { id: o.id }); };

  const cuerpo = el('tbody');
  const cabecera = el('tr');
  const contador = el('span', { class: 'texto-suave' });
  const zonaTabla = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla rem-tabla' }, el('thead', {}, cabecera), cuerpo));
  const zonaMapa = el('div', { class: 'rem-mapa-grande' });

  const visibles = () => {
    const q = filtro.texto.trim().toLowerCase();
    const l = ops.filter((o) => (!filtro.tipo || o.tipo === filtro.tipo)
      && (!filtro.estado || o.estado === filtro.estado)
      && (!filtro.region || o.region === filtro.region)
      && (!filtro.comuna || o.comuna === filtro.comuna)
      && (filtro.todas || filtro.estado || (!CERRADAS.includes(o.estado) && !(o._d != null && o._d < 0 && o.estado === 'nueva')))
      && (!q || [o.titulo, o.subtipo, o.comuna, o.direccion, o.tribunal, o.rol_causa, o.fuente, o.patente, o.notas].filter(Boolean).join(' ').toLowerCase().includes(q)));
    const col = COLUMNAS.find((c) => c.k === filtro.orden) ?? COLUMNAS[0];
    l.sort((a, b) => {
      const x = col.v(a); const y = col.v(b);
      const vx = x == null || Number.isNaN(x); const vy = y == null || Number.isNaN(y);
      if (vx || vy) return vx - vy;
      return (x < y ? -1 : x > y ? 1 : 0) * filtro.dir;
    });
    return l;
  };

  function pintarCabecera() {
    cabecera.replaceChildren(...COLUMNAS.map((c) => {
      const activa = filtro.orden === c.k;
      const b = el('button', { type: 'button', class: `rem-orden ${activa ? 'activa' : ''}`, title: c.ayuda ?? `Ordenar por ${c.t.toLowerCase()}`,
        onclick: () => { if (activa) filtro.dir = -filtro.dir; else { filtro.orden = c.k; filtro.dir = c.dir ?? 1; } pintar(); } },
      c.t, activa ? icono(filtro.dir > 0 ? 'arriba' : 'abajo', { tam: 12 }) : el('span', { class: 'rem-orden-vacio' }));
      return el('th', { class: c.num ? 'num' : null, 'aria-sort': activa ? (filtro.dir > 0 ? 'ascending' : 'descending') : 'none' }, b);
    }));
  }

  function pintar() {
    const l = visibles();
    contador.textContent = `${l.length} de ${ops.length}`;
    pintarCabecera();
    cuerpo.replaceChildren(...(l.length ? l.map((o) => el('tr', { class: `fila-enlace ${o._d != null && o._d < 0 ? 'rem-pasada' : ''}`, title: 'Abrir', onclick: () => abrir(o) },
      el('td', {}, el('div', {}, fechaRemate(o.fecha_remate)), o._d != null && o._d >= 0
        ? el('span', { class: `texto-chico ${o._d <= 7 ? 'rem-pronto' : 'texto-suave'}` }, o._d === 0 ? 'Hoy' : `En ${o._d} ${o._d === 1 ? 'día' : 'días'}`)
        : o._d != null ? el('span', { class: 'texto-chico texto-suave' }, 'Ya pasó') : null),
      el('td', {}, el('strong', {}, o.titulo),
        el('div', { class: 'texto-chico texto-suave' }, [o.subtipo || nombreDe(TIPOS, o.tipo), [o.comuna, o.region].filter(Boolean).join(', '), nombreDe(ORIGENES, o.origen)].filter(Boolean).join(' · ')),
        o.cargado_por === 'agente' && o.estado === 'nueva' ? el('span', { class: 'chip chip-pend rem-agente', title: 'La trajo un agente de búsqueda; falta revisarla' }, 'Agente') : null,
        varias && base.de(o.empresa_id) ? el('div', { class: 'texto-chico' }, marcaEmpresa(base.de(o.empresa_id).empresa)) : null),
      el('td', {}, chipDistancia(o._km, cfg.centro_nombre)),
      el('td', { class: 'num' }, o.minimo != null ? dinero(o.minimo) : '—',
        o._c.enPresupuesto === false ? el('div', { class: 'texto-chico rem-sobre' }, 'Sobre el presupuesto') : null),
      el('td', { class: 'num' }, o.precio_mercado != null ? dinero(o.precio_mercado) : el('span', { class: 'texto-suave' }, 'Falta')),
      el('td', { class: 'num' }, o._c.descuento != null ? el('span', { class: o._c.descuento >= 0.2 ? 'rem-bueno' : o._c.descuento < 0 ? 'rem-sobre' : '' }, pct(o._c.descuento)) : '—'),
      el('td', {}, chipPuntaje(o._p.valor)),
      el('td', {}, chipEstado(o.estado))))
      : [el('tr', {}, el('td', { colspan: COLUMNAS.length, class: 'tabla-vacia' }, icono('martillo', { tam: 28 }),
        ops.length ? 'Nada coincide con el filtro.' : 'Aún no hay oportunidades. Agrega una o espera a los agentes de búsqueda.'))]));
    if (filtro.modo === 'mapa') pintarMapa(l);
    zonaTabla.hidden = filtro.modo !== 'lista';
    zonaMapa.parentElement && (zonaMapa.parentElement.hidden = filtro.modo !== 'mapa');
  }

  // ---- Mapa: los visibles con ubicación, color según qué tan céntrico; tocar abre el resumen
  let mapaActual = null;
  async function pintarMapa(l) {
    const con = l.filter((o) => o._km != null);
    sinUbicar.textContent = l.length - con.length ? `${l.length - con.length} sin ubicación (no están en el mapa)` : '';
    mapaActual?.mapa.remove(); mapaActual = null;
    zonaMapa.replaceChildren();
    const nodo = el('div', { class: 'rem-mapa-lienzo' });
    zonaMapa.append(nodo);
    const color = (o) => ({ 'chip-ok': '--ok', 'chip-prox': '--prox' }[cercania(o._km)[1]] ?? '--texto-suave');
    try {
      mapaActual = await mapa(nodo, con.map((o) => {
        const pop = el('div', { class: 'rem-popup' }, el('strong', {}, o.titulo), el('div', {}, `${fechaRemate(o.fecha_remate)} · mínimo ${o.minimo != null ? dinero(o.minimo) : '—'}`),
          el('div', {}, `${km(o._km)} del centro · puntaje ${o._p.valor}`), el('a', { href: ctx.ruta('remates.ficha', { id: o.id }) }, 'Abrir'));
        return { lat: Number(o.lat), lng: Number(o.lng), color: color(o), titulo: o.titulo, html: pop };
      }), cfg);
    } catch (e) { zonaMapa.replaceChildren(el('p', { class: 'texto-error' }, e.message)); }
  }
  const sinUbicar = el('span', { class: 'texto-chico texto-suave' });

  // ---- Indicadores
  const activas = ops.filter((o) => !CERRADAS.includes(o.estado));
  const prox = activas.filter((o) => o._d != null && o._d >= 0 && o._d <= 30).sort((a, b) => a._d - b._d);
  const tarjeta = (titulo, valor, detalle, accion) => el('button', { type: 'button', class: 'rem-ind', onclick: accion },
    el('span', { class: 'texto-chico texto-suave' }, titulo), el('strong', {}, valor), el('span', { class: 'texto-chico texto-suave' }, detalle));
  const indicadores = el('div', { class: 'rem-indicadores' },
    tarjeta('Próximos 30 días', String(prox.length), prox.length ? `El primero: ${fechaRemate(prox[0].fecha_remate)}` : 'Sin remates cerca', () => { Object.assign(filtro, { estado: '', orden: 'fecha', dir: 1 }); sincronizar(); }),
    tarjeta('Por revisar', String(ops.filter((o) => o.estado === 'nueva').length), 'Nuevas, de personas o agentes', () => { filtro.estado = 'nueva'; sincronizar(); }),
    tarjeta('Interesan', String(ops.filter((o) => ['interesa', 'postulada'].includes(o.estado)).length), 'Interesan o postuladas', () => { filtro.estado = 'interesa'; sincronizar(); }),
    tarjeta('Mejor puntaje', activas.length ? String(Math.max(...activas.map((o) => o._p.valor))) : '—', 'Entre las activas', () => { Object.assign(filtro, { estado: '', orden: 'puntaje', dir: -1 }); sincronizar(); }));

  // ---- Filtros
  const segmento = el('div', { class: 'segmento rem-segmento', role: 'group', 'aria-label': 'Tipo' },
    [['', 'Todo'], ...TIPOS].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(filtro.tipo === v), onclick: () => { filtro.tipo = v; sincronizar(); } }, t)));
  const modo = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver como' },
    [['lista', 'Lista', 'lista'], ['mapa', 'Mapa', 'enlace']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(filtro.modo === v),
      onclick: (ev) => { filtro.modo = v; for (const b of modo.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); pintar(); } }, t)));
  const selEstado = el('select', { class: 'campo campo-filtro', 'aria-label': 'Estado', onchange: (ev) => { filtro.estado = ev.target.value; pintar(); } },
    el('option', { value: '' }, 'Activas'), ESTADOS.map(([v, t]) => el('option', { value: v }, t)));
  const regionesUsadas = [...new Set(ops.map((o) => o.region).filter(Boolean))].sort();
  const selRegion = el('select', { class: 'campo campo-filtro', 'aria-label': 'Región', onchange: (ev) => { filtro.region = ev.target.value; pintar(); } },
    el('option', { value: '' }, 'Todas las regiones'), regionesUsadas.map((r) => el('option', { value: r }, r)));
  const comunasUsadas = [...new Set(ops.map((o) => o.comuna).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (filtro.comuna === null) {
    const porDefecto = String(cfg.comunas ?? '').split(',')[0]?.trim() ?? '';
    filtro.comuna = comunasUsadas.find((c) => c.toLowerCase() === porDefecto.toLowerCase()) ?? '';
  }
  const selComuna = el('select', { class: 'campo campo-filtro', 'aria-label': 'Comuna', onchange: (ev) => { filtro.comuna = ev.target.value; pintar(); } },
    el('option', { value: '' }, 'Todas las comunas'), comunasUsadas.map((c) => el('option', { value: c }, `${c} (${ops.filter((o) => o.comuna === c && !CERRADAS.includes(o.estado)).length})`)));
  const todas = el('label', { class: 'casilla' }, Object.assign(el('input', { type: 'checkbox' }), { checked: filtro.todas, onchange: (ev) => { filtro.todas = ev.target.checked; pintar(); } }), 'Ver pasadas y descartadas');
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar dirección, comuna, rol, patente…', 'aria-label': 'Buscar', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; pintar(); });
  function sincronizar() {
    for (const b of segmento.children) b.setAttribute('aria-pressed', String(b.textContent === (nombreDe(TIPOS, filtro.tipo) || 'Todo')));
    selEstado.value = filtro.estado; selRegion.value = filtro.region; selComuna.value = filtro.comuna ?? '';
    pintar();
  }

  // ---- Acciones
  const acciones = [];
  if (ctxE?.puede('remates', 'exportar') && ops.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => excel(ctxE, visibles(), cfg).catch((e) => avisar(e.message, 'error')) }));
  if (ctxE?.puede('remates', 'crear')) acciones.push(boton('Nueva oportunidad', { icono: 'mas', tipo: 'primario', onclick: () => nueva(ctxE, cfg) }));

  const contenedorMapa = el('div', { hidden: true }, sinUbicar, zonaMapa);
  const vistaNodo = el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, icono('martillo', { tam: 22 }), ' Remates'),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('p', { class: 'texto-suave texto-chico rem-aviso' }, `Prueba. El puntaje y el descuento son orientativos (gastos de compra estimados: ${cfg.gastos_inmueble} % en inmuebles y ${cfg.gastos_otros} % en vehículos y maquinaria; presupuesto ${dinero(cfg.tope_normal)} o ${dinero(cfg.tope_grande)} si es grande). La ubicación se mide en línea recta a ${cfg.centro_nombre}; si solo se conoce el sector, es aproximada. La decisión de postular es tuya, con las bases, los certificados y un abogado.`),
    indicadores,
    el('div', { class: 'rem-barra' }, segmento, modo),
    el('div', { class: 'listado-acciones rem-filtros' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), selComuna, selEstado, selRegion, todas, contador),
    zonaTabla,
    contenedorMapa);
  sincronizar();
  return vistaNodo;
}

function nueva(ctx, cfg) {
  abrirFormulario({
    titulo: 'Nueva oportunidad',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS, valor: 'inmueble', alCambiar: ({ valor, opciones }) => opciones('subtipo', [['', '—'], ...(SUBTIPOS[valor] ?? []).map((s) => [s, s])]) },
      { id: 'subtipo', etiqueta: 'Qué es', opciones: [['', '—'], ...SUBTIPOS.inmueble.map((s) => [s, s])] },
      { id: 'titulo', etiqueta: 'Título', requerido: true, ayuda: 'Ej.: Sitio 600 m² en Alerce, Camioneta Hilux 2019, Pontón y 12 balsas-jaula' },
      { id: 'origen', etiqueta: 'De dónde sale', opciones: ORIGENES, valor: 'judicial' },
      { id: 'url', etiqueta: 'Enlace del aviso (opcional)', tipo: 'url' },
      { id: 'region', etiqueta: 'Región', opciones: [['', '—'], ...REGIONES.map((r) => [r, r])], valor: String(cfg.regiones ?? '').split(',')[0]?.trim() || '' },
      { id: 'comuna', etiqueta: 'Comuna', valor: String(cfg.comunas ?? '').split(',')[0]?.trim() || '' },
      { id: 'fecha_remate', etiqueta: 'Fecha y hora del remate', tipo: 'datetime-local' },
      { id: 'minimo', etiqueta: 'Mínimo ($)', tipo: 'number' },
      { id: 'objetivo', etiqueta: 'Para qué', opciones: OBJETIVOS, valor: 'ambos' },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const fila = {
        empresa_id: ctx.empresa.id, tipo: v.tipo, subtipo: v.subtipo || null, titulo: v.titulo.trim(), origen: v.origen, url: v.url || null,
        region: v.region || null, comuna: v.comuna?.trim() || null, fecha_remate: v.fecha_remate ? new Date(v.fecha_remate).toISOString() : null,
        minimo: v.minimo ? Number(v.minimo) : null, objetivo: v.objetivo,
      };
      const { data, error } = await ctx.api.from('rem_oportunidades').insert(fila).select('id').single();
      if (error) throw new Error(error.message);
      avisar('Oportunidad creada.');
      location.hash = ctx.ruta('remates.ficha', { id: data.id });
    },
  });
}

async function excel(ctx, l, cfg) {
  await exportarExcel(ctx, {
    titulo: 'Remates', subtitulo: `${l.length} oportunidades`, nombre: 'remates',
    columnas: [{ t: 'Fecha del remate', tipo: 'texto' }, 'Tipo', 'Título', 'Región', 'Comuna', 'Dirección o sector', { t: `Km a ${cfg.centro_nombre}`, tipo: 'decimal' },
      'Origen', 'Tribunal o fuente', 'Rol', { t: 'Mínimo', tipo: 'dinero' }, { t: 'Avalúo fiscal', tipo: 'dinero' }, { t: 'Mercado (est.)', tipo: 'dinero' },
      { t: 'Costo total (est.)', tipo: 'dinero' }, { t: 'Descuento', tipo: 'pct' }, { t: 'Puntaje', tipo: 'numero' }, 'Estado', 'Enlace'],
    filas: l.map((o) => [fechaRemate(o.fecha_remate), o.subtipo || nombreDe(TIPOS, o.tipo), o.titulo, o.region ?? '', o.comuna ?? '', o.direccion ?? '',
      o._km != null ? Math.round(o._km * 10) / 10 : null, nombreDe(ORIGENES, o.origen), o.tribunal || o.fuente || '', o.rol_causa || o.rol_avaluo || '',
      o.minimo, o.avaluo_fiscal, o.precio_mercado, o._c.costo, o._c.descuento, o._p.valor, nombreDe(ESTADOS, o.estado), o.url ?? '']),
  });
}
