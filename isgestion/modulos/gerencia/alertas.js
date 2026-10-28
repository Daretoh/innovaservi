// Alertas para el Panel de gerencia: lo que requiere atención en cada módulo que el usuario puede ver.
// Cada alerta: { modulo, texto, cantidad, nivel ('venc' | 'prox'), ruta }. Si una consulta falla, se omite.
import { hoyISO, sumarDias } from '../../core/ui/formato.js?v=b8da9fc';

const DIAS_AVISO = 30;

// Último registro por clave (manda el último, como en Flota y Acreditación)
function ultimos(filas, clave, orden = 'fecha') {
  const m = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!m.has(k) || String(f[orden]) > String(m.get(k)[orden])) m.set(k, f);
  }
  return [...m.values()];
}
const contar = (filas, hoy) => {
  const lim = sumarDias(hoy, DIAS_AVISO);
  return { vencidos: filas.filter((f) => f.vence < hoy).length, porVencer: filas.filter((f) => f.vence >= hoy && f.vence <= lim).length };
};

export async function cargarAlertas(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const hace = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
  const alertas = [];
  const agregar = (modulo, texto, cantidad, nivel, ruta) => { if (cantidad > 0) alertas.push({ modulo, texto, cantidad, nivel, ruta }); };
  const tareas = [];
  const si = (modulo, fn) => { if (ctx.puede(modulo, 'ver')) tareas.push(fn().catch(() => {})); };

  si('flota', async () => {
    const { data } = await ctx.api.from('flo_registros').select('vehiculo_id, categoria, fecha, vence').eq('empresa_id', e).is('deleted_at', null).not('vence', 'is', null);
    const c = contar(ultimos(data ?? [], (r) => `${r.vehiculo_id}|${r.categoria}`), hoy);
    agregar('Flota', 'documentos de vehículos vencidos (permiso, revisión, SOAP o seguro)', c.vencidos, 'venc', ctx.ruta('flota.lista'));
    agregar('Flota', `documentos de vehículos que vencen en ${DIAS_AVISO} días`, c.porVencer, 'prox', ctx.ruta('flota.lista'));
    const [m, v] = await Promise.all([
      ctx.api.from('flo_mantenciones').select('*').eq('empresa_id', e).eq('activo', true),
      ctx.api.from('flo_vehiculos').select('id, km').eq('empresa_id', e).is('deleted_at', null),
    ]);
    const { estadoMantencion } = await import('../flota/datos.js?v=b8da9fc');
    const km = new Map((v.data ?? []).map((x) => [x.id, x.km]));
    const est = (m.data ?? []).filter((x) => km.has(x.vehiculo_id)).map((x) => estadoMantencion(x, km.get(x.vehiculo_id)).k);
    agregar('Flota', 'mantenciones programadas vencidas', est.filter((k) => k === 'venc').length, 'venc', ctx.ruta('flota.lista'));
    agregar('Flota', 'mantenciones programadas próximas', est.filter((k) => k === 'prox').length, 'prox', ctx.ruta('flota.lista'));
  });
  si('acreditacion', async () => {
    const { data } = await ctx.api.from('acr_documentos').select('tipo_id, titular, fecha, vence').eq('empresa_id', e).is('deleted_at', null).not('vence', 'is', null);
    const c = contar(ultimos(data ?? [], (r) => `${r.tipo_id}|${r.titular ?? ''}`), hoy);
    agregar('Acreditación', 'documentos de empresa vencidos', c.vencidos, 'venc', ctx.ruta('acreditacion.documentos'));
    agregar('Acreditación', `documentos de empresa que vencen en ${DIAS_AVISO} días`, c.porVencer, 'prox', ctx.ruta('acreditacion.documentos'));
  });
  si('sst', async () => {
    const { data } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(fecha, created_at, version, archivo)').eq('empresa_id', e).eq('activo', true);
    const { estadoDocumento } = await import('../sst/vistas/documentos.js?v=b8da9fc');
    const est = (data ?? []).map((d) => estadoDocumento(d).k);
    agregar('Prevención SST', 'documentos preventivos con revisión vencida', est.filter((k) => k === 'venc').length, 'venc', ctx.ruta('sst.documentos'));
    agregar('Prevención SST', 'documentos preventivos por revisar en 30 días', est.filter((k) => k === 'prox').length, 'prox', ctx.ruta('sst.documentos'));
  });
  si('rrhh', async () => {
    const { data } = await ctx.api.from('rrhh_documentos').select('persona_id, tipo_slug, fecha, vence').is('deleted_at', null).not('vence', 'is', null);
    const c = contar(ultimos(data ?? [], (r) => `${r.persona_id}|${r.tipo_slug}`), hoy);
    agregar('RRHH', 'documentos de trabajadores vencidos', c.vencidos, 'venc', ctx.ruta('rrhh.documentos'));
    agregar('RRHH', `documentos de trabajadores que vencen en ${DIAS_AVISO} días`, c.porVencer, 'prox', ctx.ruta('rrhh.documentos'));
    // Contratos a plazo fijo: vencidos o que vencen en 30 días
    const { data: con } = await ctx.api.from('persona_empresa').select('contrato_vence').eq('empresa_id', e).eq('estado', 'activo').is('deleted_at', null).eq('contrato_indefinido', false).not('contrato_vence', 'is', null);
    const en30 = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv');
    agregar('RRHH', 'contratos a plazo fijo vencidos', (con ?? []).filter((x) => x.contrato_vence < hoy).length, 'venc', ctx.ruta('rrhh.trabajadores'));
    agregar('RRHH', 'contratos que vencen en 30 días', (con ?? []).filter((x) => x.contrato_vence >= hoy && x.contrato_vence <= en30).length, 'prox', ctx.ruta('rrhh.trabajadores'));
    // Asignados a faenas de los próximos 14 días con documentos vencidos o pendientes (necesita ver Faenas)
    const { asignadosConPendientes, DIAS_PROXIMAS } = await import('../rrhh/proximas.js?v=b8da9fc');
    const asig = await asignadosConPendientes(ctx);
    if (asig) {
      agregar('RRHH', `asignados a faenas de los próximos ${DIAS_PROXIMAS} días con documentos vencidos`, asig.filter((x) => x.venc.length).length, 'venc', ctx.ruta('rrhh.proximas'));
      agregar('RRHH', `asignados a faenas de los próximos ${DIAS_PROXIMAS} días con documentos pendientes`, asig.filter((x) => !x.venc.length).length, 'prox', ctx.ruta('rrhh.proximas'));
    }
  });
  si('inventario', async () => {
    const [p, s] = await Promise.all([
      ctx.api.from('inv_productos').select('id, stock_min').eq('empresa_id', e).eq('activo', true).is('deleted_at', null).gt('stock_min', 0),
      ctx.api.from('inv_stock').select('producto_id, cantidad').eq('empresa_id', e),
    ]);
    const stock = new Map();
    for (const x of s.data ?? []) stock.set(x.producto_id, (stock.get(x.producto_id) ?? 0) + Number(x.cantidad));
    agregar('Inventario', 'productos bajo el stock mínimo', (p.data ?? []).filter((x) => (stock.get(x.id) ?? 0) < Number(x.stock_min)).length, 'prox', ctx.ruta('inventario.stock'));
  });
  si('costos', async () => {
    const [g, r, h] = await Promise.all([
      ctx.api.from('fin_registros').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('tipo', 'gasto').neq('estado_pago', 'pagado').is('deleted_at', null).lt('fecha', sumarDias(hoy, -30)),
      ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).eq('activo', true),
      ctx.api.from('fin_registros').select('recurrente_id').eq('empresa_id', e).eq('periodo', mes).is('deleted_at', null),
    ]);
    agregar('Costos y gastos', 'gastos por pagar con más de 30 días', g.count ?? 0, 'venc', ctx.ruta('costos.registros'));
    const { tocaEnMes } = await import('../costos/datos.js?v=b8da9fc');
    const ya = new Set((h.data ?? []).map((x) => x.recurrente_id));
    agregar('Costos y gastos', `gastos recurrentes de este mes sin generar`, (r.data ?? []).filter((x) => tocaEnMes(x, mes) && !ya.has(x.id)).length, 'prox', ctx.ruta('costos.recurrentes'));
  });
  si('cierres', async () => {
    const [c, b] = await Promise.all([
      ctx.api.from('cie_cierres').select('id', { count: 'exact', head: true }).eq('empresa_id', e).in('estado', ['emitido', 'oc', 'facturado']).lt('emitido_at', hace(30)),
      ctx.api.from('cie_cierres').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('estado', 'borrador').lt('mes', mes),
    ]);
    agregar('Cierres', 'cierres emitidos hace más de 30 días sin cobrar', c.count ?? 0, 'venc', ctx.ruta('cierres.mensuales'));
    agregar('Cierres', 'cierres de meses anteriores sin emitir', b.count ?? 0, 'prox', ctx.ruta('cierres.mensuales'));
  });
  si('taller', async () => {
    const { count } = await ctx.api.from('tal_ordenes').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('cobrado', false)
      .in('estado', ['terminado', 'entregado']).eq('tipo_venta', 'normal').lt('termino_at', hace(7));
    agregar('Taller', 'órdenes terminadas hace más de 7 días sin cobrar (incluye las de cierre o cuenta)', count ?? 0, 'prox', ctx.ruta('taller.cobros'));
  });
  si('cotizaciones', async () => {
    const { count } = await ctx.api.from('cot_cotizaciones').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('estado', 'enviada').is('deleted_at', null).lt('enviada_at', hace(7));
    agregar('Cotizaciones', 'cotizaciones enviadas hace más de 7 días sin respuesta', count ?? 0, 'prox', ctx.ruta('cotizaciones.lista'));
  });
  si('asistencia', async () => {
    const { count } = await ctx.api.from('asis_marcas').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('tipo', 'entrada')
      .is('horas_id', null).is('anulada_at', null).lt('ts', hace(0.5)).gt('ts', hace(14));
    agregar('Asistencia', 'entradas sin salida (marcaje en tablet)', count ?? 0, 'prox', ctx.ruta('asistencia.marcajes'));
  });

  si('tareas', async () => {
    const { count } = await ctx.api.from('tar_tareas').select('id', { count: 'exact', head: true }).eq('empresa_id', e).neq('estado', 'hecha').is('deleted_at', null).lt('fecha', hoy);
    agregar('Tareas', 'tareas vencidas sin hacer', count ?? 0, 'venc', ctx.ruta('tareas.lista'));
  });

  await Promise.all(tareas);
  return alertas.sort((a, b) => (a.nivel === 'venc' ? 0 : 1) - (b.nivel === 'venc' ? 0 : 1) || a.modulo.localeCompare(b.modulo, 'es'));
}
