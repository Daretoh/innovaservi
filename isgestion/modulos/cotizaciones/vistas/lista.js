// Cotizaciones: listado con filtro por estado y búsqueda; nueva cotización. Cada fila dice quién la creó y quién la
// editó por última vez (como el OS; updated_by lo pone la base).
import { el } from '../../../core/ui/dom.js?v=23e9550';
import { listado, boton } from '../../../core/ui/tabla.js?v=23e9550';
import { abrirFormulario } from '../../../core/ui/modal.js?v=23e9550';
import { dinero, fechaLarga, fechaCorta, hoyISO, diaLocal, nombrePropio } from '../../../core/ui/formato.js?v=23e9550';
import { avance, colorAvance } from '../../taller/seguimiento.js?v=23e9550';
import { nombreEstado as estadoOrden } from '../../taller/datos.js?v=23e9550';
import { costosDeGrupos, costoFuera, sinRepetir, yaTraidos } from '../costos-orden.js?v=23e9550';
import { ESTADOS, nombreEstado, CHIP_ESTADO, SELECT_COT, totales, costoLinea, numeroTexto, nombreTercero, verPatente, siguienteNumero, cargarConfig, datosCliente } from '../datos.js?v=23e9550';

const filtro = { estado: 'todas', buscar: '' };

export default async function vista(ctx) {
  let q = ctx.api.from('cot_cotizaciones').select(SELECT_COT).eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('numero', { ascending: false }).limit(500);
  if (filtro.estado !== 'todas') q = q.eq('estado', filtro.estado);
  const [{ data, error }, us] = await Promise.all([q, ctx.api.rpc('cot_usuarios', { p_empresa: ctx.empresa.id })]);
  if (error) throw error;
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  // N° de la cotización de la que nace (copiada o dividida); si no está en la página, se busca
  const numeroDe = new Map(data.map((c) => [c.id, numeroTexto(c.numero)]));
  const faltan = [...new Set(data.flatMap((c) => [c.origen_id, c.madre_id]).filter((id) => id && !numeroDe.has(id)))];
  // Cotización del mes (009): cuántas hijas junta; las hijas no suman (su monto está en la madre)
  const nHijas = new Map();
  for (const c of data) if (c.madre_id) nHijas.set(c.madre_id, (nHijas.get(c.madre_id) ?? 0) + 1);
  if (faltan.length) for (const o of (await ctx.api.from('cot_cotizaciones').select('id, numero').in('id', faltan)).data ?? []) numeroDe.set(o.id, numeroTexto(o.numero));
  const extra = await avanceYGastos(ctx, data);
  const b = filtro.buscar.trim().toLowerCase();
  const filas = data.map((c) => ({ ...c, t: totales(c, c.cot_grupos, c.cot_lineas) }))
    .filter((c) => !b || [String(c.numero), c.cliente_nombre, ...c.cot_grupos.map((g) => `${g.titulo ?? ''} ${g.patente ?? ''}`)].join(' ').toLowerCase().includes(b));

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    [['todas', 'Todas'], ...ESTADOS].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(filtro.estado === k), onclick: () => { filtro.estado = k; ctx.refrescar(); } }, n)));
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'N°, cliente o patente…', value: filtro.buscar, 'aria-label': 'Buscar cotización' });
  buscador.addEventListener('input', () => { filtro.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const acciones = [segmento, buscador];
  if (ctx.puede('cotizaciones', 'crear')) acciones.push(boton('Nueva cotización', { icono: 'mas', tipo: 'primario', onclick: () => nueva(ctx) }));

  const lista = listado({
    titulo: 'Cotizaciones',
    filas,
    acciones,
    vacio: 'No hay cotizaciones.',
    columnas: [
      { titulo: 'N°', valor: (c) => el('a', { href: ctx.ruta('cotizaciones.editor', { id: c.id }) }, el('strong', {}, numeroTexto(c.numero))) },
      { titulo: 'Fecha', valor: (c) => fechaLarga(c.fecha) },
      { titulo: 'Cliente', valor: (c) => c.cliente_nombre ?? '' },
      { titulo: 'Detalle', valor: (c) => el('span', {}, c.cot_grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' · ')).join(', '),
        c.origen_id ? el('span', { class: 'texto-chico texto-suave' }, el('br'), `Nace de la N° ${numeroDe.get(c.origen_id) ?? '…'}`) : null,
        c.madre_id ? el('span', { class: 'texto-chico texto-suave' }, el('br'), `Dentro de la N° ${numeroDe.get(c.madre_id) ?? '…'}: se cobra allá`) : null,
        nHijas.get(c.id) ? el('span', { class: 'texto-chico texto-suave' }, el('br'), `${c.notas?.startsWith('Cierre ') ? `${c.notas} · ` : ''}junta ${nHijas.get(c.id)} cotizaciones`) : null,
        barraTaller(extra.taller(c)),
        extra.costo(c) ? el('span', { class: 'texto-chico cot-lista-gastos', title: 'Costo interno, el mismo que se ve dentro de la cotización con su detalle.' }, `Costos ${dinero(extra.costo(c))}`) : null) },
      { titulo: 'Estado', valor: (c) => el('span', { class: `chip ${CHIP_ESTADO[c.estado]}` }, nombreEstado[c.estado]) },
      { titulo: 'Total', valor: (c) => el('strong', {}, dinero(c.t.total)) },
      { titulo: 'Registro', valor: (c) => el('span', { class: 'texto-chico texto-suave' },
        c.created_by ? `Creó ${quien.get(c.created_by) ?? '—'}` : '',
        c.updated_by && (c.updated_by !== c.created_by || diaLocal(c.updated_at) !== diaLocal(c.created_at)) ? el('br') : null,
        c.updated_by && (c.updated_by !== c.created_by || diaLocal(c.updated_at) !== diaLocal(c.created_at)) ? `Editó ${quien.get(c.updated_by) ?? '—'} · ${fechaCorta(diaLocal(c.updated_at))}` : null) },
    ],
  });
  if (filas.length) {
    const suma = (est) => filas.filter((c) => c.estado === est && !c.madre_id).reduce((s, c) => s + c.t.total, 0);
    lista.insertBefore(el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-prox' }, `Enviadas ${dinero(suma('enviada'))}`),
      el('span', { class: 'chip chip-ok' }, `Aceptadas ${dinero(suma('aceptada'))}`),
      el('span', { class: 'texto-suave' }, `${filas.length} cotizaciones`)), lista.children[1]);
  }
  return lista;
}

// Nueva cotización con un primer grupo. Si no se indica el cliente (undefined), se pregunta.
export async function nueva(ctx, { tercero = undefined, grupo = null, lineas = [], ordenId = null } = {}) {
  const crear = async (t) => {
    const [numero, cfg] = await Promise.all([siguienteNumero(ctx), cargarConfig(ctx)]);
    const { data: c, error } = await ctx.api.from('cot_cotizaciones').insert({
      empresa_id: ctx.empresa.id, numero, fecha: hoyISO(), validez_dias: cfg.validez_dias, ...datosCliente(t),
    }).select('id').single();
    if (error) throw new Error(error.message);
    const { data: g, error: e2 } = await ctx.api.from('cot_grupos').insert({
      cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: 1, ...(grupo ?? {}), ...(ordenId ? { orden_id: ordenId } : {}),
    }).select('id').single();
    if (e2) throw new Error(e2.message);
    if (lineas.length) {
      const { error: e3 } = await ctx.api.from('cot_lineas').insert(lineas.map((l, i) => ({ ...l, grupo_id: g.id, cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: i + 1 })));
      if (e3) throw new Error(e3.message);
    }
    location.hash = ctx.ruta('cotizaciones.editor', { id: c.id });
  };
  if (tercero !== undefined) { await crear(tercero); return; }
  const { data: clientes } = await ctx.api.from('terceros').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social');
  abrirFormulario({
    titulo: 'Nueva cotización',
    campos: [
      { id: 'tercero_id', etiqueta: 'Cliente', opciones: [['', 'Cliente nuevo (escribirlo abajo)'], ...(clientes ?? []).map((t) => [t.id, nombreTercero(t)])] },
      { id: 'nombre', etiqueta: 'Nombre del cliente nuevo', ayuda: 'Se agrega a Clientes y proveedores. Puedes dejarlo vacío y completarlo después.' },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      let t = (clientes ?? []).find((x) => x.id === v.tercero_id) ?? null;
      if (!t && v.nombre.trim()) {
        const { data, error } = await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, razon_social: nombrePropio(v.nombre), tipo: ['cliente'] }).select('*').single();
        if (error) throw new Error(error.message);
        t = data;
      }
      await crear(t);
    },
  });
}

// Barra de avance con el estado y la fecha: la fecha de entrega dice a qué mes corresponde el trabajo
function barraTaller(t) {
  if (!t) return null;
  return el('span', { class: 'cot-lista-taller', title: t.detalle },
    el('span', { class: 'seg-barra' }, el('i', { style: `width:${t.avance}%;background:${colorAvance(t.avance)}` })),
    el('span', { class: 'cot-lista-pct' }, `${t.avance}%`),
    el('span', { class: 'texto-chico cot-lista-estado' }, t.texto));
}

// Estado de las órdenes ligadas en una línea. Las entregadas antiguas del OS pueden no tener fecha.
function textoTaller(os) {
  const entregadas = os.filter((o) => o.estado === 'entregado');
  const fechas = entregadas.map((o) => diaLocal(o.entregado_at)).filter(Boolean).sort();
  const sinFecha = entregadas.length - fechas.length;
  if (os.length === 1) {
    const o = os[0];
    if (o.estado === 'entregado') return fechas[0] ? `Entregado ${fechaLarga(fechas[0])}` : 'Entregado · sin fecha';
    return o.estado === 'terminado' && o.termino_at ? `Terminado ${fechaLarga(diaLocal(o.termino_at))}` : estadoOrden[o.estado];
  }
  const nota = sinFecha ? ` · ${sinFecha} sin fecha` : '';
  if (entregadas.length === os.length) {
    if (!fechas.length) return `${os.length} entregados · sin fecha`;
    return `${os.length} entregados · ${fechas[0] === fechas.at(-1) ? fechaLarga(fechas[0]) : `${fechaLarga(fechas[0])} a ${fechaLarga(fechas.at(-1))}`}${nota}`;
  }
  if (entregadas.length) return `${entregadas.length} de ${os.length} entregados${fechas.length ? ` · último ${fechaLarga(fechas.at(-1))}` : ''}${nota}`;
  const cuenta = new Map();
  for (const o of os) cuenta.set(o.estado, (cuenta.get(o.estado) ?? 0) + 1);
  return [...cuenta].map(([k, n]) => `${n} ${estadoOrden[k]}`).join(', ');
}

// Avance en el taller (órdenes ligadas a los vehículos) y costos de cada vehículo, los mismos que se ven dentro de la
// cotización (costos-orden.js). Solo con permiso de ver Taller / Costos.
async function avanceYGastos(ctx, cots) {
  const grupos = cots.flatMap((c) => c.cot_grupos);
  const idsOrden = [...new Set(grupos.map((g) => g.orden_id).filter(Boolean))];
  const ords = ctx.puede('taller', 'ver') && idsOrden.length
    ? await ctx.api.from('tal_ordenes').select('id, numero, estado, tareas, ingreso_at, fecha_cita, created_at, termino_at, entregado_at').in('id', idsOrden) : { data: [] };
  const orden = new Map((ords.data ?? []).map((o) => [o.id, o]));
  const costos = await costosDeGrupos(ctx, grupos, orden);
  return {
    taller: (c) => {
      const gs = c.cot_grupos.filter((g) => orden.get(g.orden_id) && orden.get(g.orden_id).estado !== 'anulada');
      if (!gs.length) return null;
      const os = gs.map((g) => orden.get(g.orden_id));
      return {
        avance: Math.round(os.reduce((s, o) => s + avance(o), 0) / os.length),
        texto: textoTaller(os),
        detalle: gs.map((g) => { const o = orden.get(g.orden_id); return [`N° ${o.numero}`, verPatente(g.patente), estadoOrden[o.estado], o.estado === 'entregado' ? (o.entregado_at ? fechaLarga(diaLocal(o.entregado_at)) : 'sin fecha') : null].filter(Boolean).join(' · '); }).join('\n'),
      };
    },
    // El mismo costo interno del editor: lo de las líneas más los gastos que no están en ellas
    costo: (c) => {
      const vistos = new Set(); const traidos = yaTraidos(c.cot_lineas);
      const extra = c.cot_grupos.reduce((s, g) => s + costoFuera(c.cot_lineas.filter((l) => l.grupo_id === g.id), sinRepetir(costos.get(g.id) ?? [], vistos), traidos).extra, 0);
      return c.cot_lineas.reduce((s, l) => s + costoLinea(l), 0) + extra;
    },
  };
}
