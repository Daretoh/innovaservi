// Cotizaciones: listado con filtro por estado y búsqueda; nueva cotización. Cada fila dice quién la creó y quién la
// editó por última vez (como el OS; updated_by lo pone la base).
import { el } from '../../../core/ui/dom.js?v=7f39998';
import { listado, boton } from '../../../core/ui/tabla.js?v=7f39998';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7f39998';
import { dinero, fechaLarga, fechaCorta, hoyISO, diaLocal, nombrePropio } from '../../../core/ui/formato.js?v=7f39998';
import { avance } from '../../taller/seguimiento.js?v=7f39998';
import { ESTADOS, nombreEstado, CHIP_ESTADO, SELECT_COT, totales, numeroTexto, nombreTercero, verPatente, siguienteNumero, cargarConfig, datosCliente } from '../datos.js?v=7f39998';

const filtro = { estado: 'todas', buscar: '' };

export default async function vista(ctx) {
  let q = ctx.api.from('cot_cotizaciones').select(SELECT_COT).eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('numero', { ascending: false }).limit(500);
  if (filtro.estado !== 'todas') q = q.eq('estado', filtro.estado);
  const [{ data, error }, us] = await Promise.all([q, ctx.api.rpc('cot_usuarios', { p_empresa: ctx.empresa.id })]);
  if (error) throw error;
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  // N° de la cotización de la que nace (copiada o dividida); si no está en la página, se busca
  const numeroDe = new Map(data.map((c) => [c.id, numeroTexto(c.numero)]));
  const faltan = [...new Set(data.map((c) => c.origen_id).filter((id) => id && !numeroDe.has(id)))];
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
        extra.avance(c) != null ? el('span', { class: `texto-chico cot-lista-avance ${extra.avance(c) >= 75 ? 'estado-ok' : extra.avance(c) >= 40 ? 'estado-prox' : 'estado-venc'}`, title: 'Avance de los trabajos en el taller (órdenes ligadas)' }, el('br'), `Taller ${extra.avance(c)}%`) : null,
        extra.gastos(c).n ? el('span', { class: 'texto-chico cot-lista-gastos', title: 'Costos cargados en Costos y gastos con la patente (interno)' }, el('br'), `Costos ${dinero(extra.gastos(c).t)} (${extra.gastos(c).n})`) : null) },
      { titulo: 'Estado', valor: (c) => el('span', { class: `chip ${CHIP_ESTADO[c.estado]}` }, nombreEstado[c.estado]) },
      { titulo: 'Total', valor: (c) => el('strong', {}, dinero(c.t.total)) },
      { titulo: 'Registro', valor: (c) => el('span', { class: 'texto-chico texto-suave' },
        c.created_by ? `Creó ${quien.get(c.created_by) ?? '—'}` : '',
        c.updated_by && (c.updated_by !== c.created_by || diaLocal(c.updated_at) !== diaLocal(c.created_at)) ? el('br') : null,
        c.updated_by && (c.updated_by !== c.created_by || diaLocal(c.updated_at) !== diaLocal(c.created_at)) ? `Editó ${quien.get(c.updated_by) ?? '—'} · ${fechaCorta(diaLocal(c.updated_at))}` : null) },
    ],
  });
  if (filas.length) {
    const suma = (est) => filas.filter((c) => c.estado === est).reduce((s, c) => s + c.t.total, 0);
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

// Como la lista del OS (2026-11-02): avance de los trabajos en el taller (órdenes ligadas a los vehículos) y costos
// cargados en Costos y gastos con la patente: los de la visita si el vehículo tiene orden (ligados a ella o entre el
// ingreso y la entrega); si no, todos los de la patente. Solo con permiso de ver Taller / Costos.
async function avanceYGastos(ctx, cots) {
  const grupos = cots.flatMap((c) => c.cot_grupos);
  const idsOrden = [...new Set(grupos.map((g) => g.orden_id).filter(Boolean))];
  const patentes = [...new Set(grupos.map((g) => g.patente).filter(Boolean))];
  const [ords, gas] = await Promise.all([
    ctx.puede('taller', 'ver') && idsOrden.length
      ? ctx.api.from('tal_ordenes').select('id, estado, tareas, ingreso_at, fecha_cita, created_at, entregado_at').in('id', idsOrden) : { data: [] },
    ctx.puede('costos', 'ver') && patentes.length
      ? ctx.api.from('fin_registros').select('patente, fecha, total, orden_id').eq('empresa_id', ctx.empresa.id).eq('tipo', 'gasto').is('deleted_at', null).is('a_cuenta_de', null).in('patente', patentes) : { data: [] },
  ]);
  const orden = new Map((ords.data ?? []).map((o) => [o.id, o]));
  const porPatente = new Map();
  for (const r of gas.data ?? []) { if (!porPatente.has(r.patente)) porPatente.set(r.patente, []); porPatente.get(r.patente).push(r); }
  const deGrupo = (g) => {
    const lista = porPatente.get(g.patente) ?? [];
    const o = orden.get(g.orden_id);
    if (!o) return lista;
    const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at); const hasta = diaLocal(o.entregado_at) || hoyISO();
    return lista.filter((r) => r.orden_id === o.id || (r.fecha >= desde && r.fecha <= hasta));
  };
  return {
    avance: (c) => {
      const os = c.cot_grupos.map((g) => orden.get(g.orden_id)).filter((o) => o && o.estado !== 'anulada');
      return os.length ? Math.round(os.reduce((s, o) => s + avance(o), 0) / os.length) : null;
    },
    gastos: (c) => {
      const l = c.cot_grupos.flatMap(deGrupo);
      return { n: l.length, t: l.reduce((s, r) => s + Number(r.total || 0), 0) };
    },
  };
}
