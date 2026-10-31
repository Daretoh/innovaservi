// Cobros del taller: órdenes por cobrar (en proceso, terminadas o entregadas) y cobradas del mes.
// Arriba, tarjetas de resumen; las pendientes muestran su antigüedad (desde el término) y un acceso a cobrar.
import { el } from '../../../core/ui/dom.js?v=fb81a8b';
import { icono } from '../../../core/ui/iconos.js?v=fb81a8b';
import { listado } from '../../../core/ui/tabla.js?v=fb81a8b';
import { dinero, fechaLarga, nombreMes, moverMes, rangoMes, diaLocal } from '../../../core/ui/formato.js?v=fb81a8b';

const DIAS_ATRASO = 7;   // desde el término: más que esto se marca en rojo
import { SELECT_ORDEN, verPatente, nombreVehiculo, nombreTercero, totales, TIPOS_VENTA } from '../datos.js?v=fb81a8b';

const estado = { tab: 'pendientes', mes: new Date().toISOString().slice(0, 7) };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  let q = ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('empresa_id', ctx.empresa.id).neq('estado', 'anulada');
  q = estado.tab === 'pendientes'
    ? q.eq('cobrado', false).in('estado', ['proceso', 'terminado', 'entregado']).order('numero')
    : q.eq('cobrado', true).gte('cobrado_at', `${desde}T00:00:00`).lte('cobrado_at', `${hasta}T23:59:59`).order('cobrado_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  // Órdenes que se cobran en un cierre mensual o una cuenta corriente (módulo Cierres): no se cobran solas
  const externas = estado.tab === 'pendientes' && ctx.puede('cierres', 'ver') ? await ordenesExternas(ctx, data) : new Map();
  // Las de un cierre ya cobrado no se muestran: se cobraron en el cierre
  const filas = data.filter((o) => externas.get(o.id) !== 'cobrada').map((o) => ({ ...o, t: totales(o, o.tal_orden_servicios), externa: externas.get(o.id) ?? null }));
  const suma = (k) => filas.filter((f) => !f.externa).reduce((s, f) => s + f.t[k], 0);
  // Días desde que se terminó (o desde que empezó, si sigue en proceso)
  const dias = (o) => { const ts = o.termino_at ?? o.inicio_at ?? o.ingreso_at; return ts ? Math.floor((Date.now() - new Date(ts)) / 864e5) : null; };
  const antig = (o) => { const d = dias(o); return d == null ? '' : el('span', { class: `chip ${o.estado === 'proceso' ? 'chip-pend' : d > DIAS_ATRASO ? 'chip-venc' : d > 2 ? 'chip-prox' : 'chip-ok'}` }, o.estado === 'proceso' ? 'En proceso' : d === 0 ? 'Hoy' : `${d} ${d === 1 ? 'día' : 'días'}`); };

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Cobros' },
    [['pendientes', 'Por cobrar'], ['cobrados', 'Cobrados']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.tab === k), onclick: () => { estado.tab = k; ctx.refrescar(); } }, n)));
  const acciones = [segmento];
  if (estado.tab === 'cobrados') {
    acciones.push(el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); ctx.refrescar(); } }, icono('volver')),
      el('strong', {}, nombreMes(estado.mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); ctx.refrescar(); } }, icono('derecha'))));
  }

  const lista = listado({
    titulo: 'Cobros',
    filas,
    acciones,
    vacio: estado.tab === 'pendientes' ? 'No hay cobros pendientes.' : 'Sin cobros en el mes.',
    columnas: [
      { titulo: 'N°', valor: (o) => el('a', { href: ctx.ruta('taller.orden', { id: o.id }) }, `N° ${o.numero}`) },
      { titulo: 'Vehículo', valor: (o) => el('span', { class: 'cobro-vehiculo' }, el('span', { class: 'tal-placa' }, verPatente(o.tal_vehiculos?.patente) || 'S/P'), nombreVehiculo(o.tal_vehiculos)) },
      { titulo: 'Cliente', valor: (o) => nombreTercero(o.terceros) },
      { titulo: estado.tab === 'pendientes' ? 'Antigüedad' : 'Cobrado', valor: (o) => (estado.tab === 'pendientes' ? antig(o) : fechaLarga(diaLocal(o.cobrado_at))) },
      { titulo: 'Documento', valor: (o) => (o.tipo_venta !== 'normal' ? TIPOS_VENTA.find((x) => x[0] === o.tipo_venta)[1] : o.doc_tipo === 'factura' ? 'Factura' : 'Boleta') },
      { titulo: 'Total', valor: (o) => dinero(o.t.total) },
      { titulo: estado.tab === 'pendientes' ? 'Saldo' : 'Ingreso', valor: (o) => (o.externa ? el('span', { class: 'chip chip-pend' }, o.externa) : el('strong', {}, dinero(estado.tab === 'pendientes' ? o.t.saldo : o.t.ingreso))) },
      ...(estado.tab === 'pendientes' && ctx.puede('taller', 'editar') ? [{ titulo: '', valor: (o) => (o.externa ? '' : el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('taller.orden', { id: o.id, ir: 'cobro' }) }, 'Cobrar', icono('derecha', { tam: 14 }))) }] : []),
    ],
  });
  if (filas.length) {
    const tarjeta = (titulo, valor, sub, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null);
    const propias = filas.filter((f) => !f.externa);
    const atrasadas = propias.filter((o) => o.estado !== 'proceso' && dias(o) > DIAS_ATRASO);
    lista.insertBefore(el('div', { class: 'fin-tarjetas' },
      estado.tab === 'pendientes'
        ? [tarjeta('Saldo por cobrar', dinero(suma('saldo')), `${propias.length} ${propias.length === 1 ? 'orden' : 'órdenes'}`),
          tarjeta(`Atrasadas (más de ${DIAS_ATRASO} días)`, String(atrasadas.length), atrasadas.length ? dinero(atrasadas.reduce((x, o) => x + o.t.saldo, 0)) : 'Ninguna', atrasadas.length ? 'fin-alerta' : ''),
          tarjeta('Abonos recibidos', dinero(suma('abono')), 'anticipos de órdenes sin cobrar'),
          filas.length > propias.length ? tarjeta('En cierre o cuenta corriente', String(filas.length - propias.length), 'se cobran fuera del taller') : null]
        : [tarjeta(`Ingreso de ${nombreMes(estado.mes)}`, dinero(suma('ingreso')), `${filas.length} ${filas.length === 1 ? 'orden cobrada' : 'órdenes cobradas'}`),
          tarjeta('IVA', dinero(suma('iva'))),
          tarjeta('Ticket promedio', dinero(filas.length ? Math.round(suma('total') / filas.length) : 0), 'total por orden')]), lista.children[1]);
  }
  return lista;
}

// Mapa orden → "Cierre mensual" | "Cuenta corriente" para las órdenes que se cobran fuera de Taller
async function ordenesExternas(ctx, ordenes) {
  const ids = ordenes.map((o) => o.id);
  if (!ids.length) return new Map();
  const [cli, lin, grp] = await Promise.all([
    ctx.api.from('cie_clientes').select('tercero_id').eq('empresa_id', ctx.empresa.id).eq('activo', true),
    ctx.api.from('cie_lineas').select('orden_id, cie_cierres(estado)').in('orden_id', ids).eq('excluida', false),
    ctx.api.from('cot_grupos').select('orden_id, cotizacion_id').in('orden_id', ids),
  ]);
  const cots = (grp.data ?? []).map((g) => g.cotizacion_id);
  const enCuenta = cots.length ? new Set(((await ctx.api.from('cie_cuenta_cotizaciones').select('cotizacion_id').in('cotizacion_id', cots)).data ?? []).map((x) => x.cotizacion_id)) : new Set();
  const conCierre = new Set((cli.data ?? []).map((c) => c.tercero_id));
  const m = new Map();
  for (const o of ordenes) if (conCierre.has(o.tercero_id) || (lin.data ?? []).some((l) => l.orden_id === o.id)) m.set(o.id, 'Cierre mensual');
  for (const l of lin.data ?? []) if (l.cie_cierres?.estado === 'cobrado') m.set(l.orden_id, 'cobrada');
  for (const g of grp.data ?? []) if (enCuenta.has(g.cotizacion_id) && !m.has(g.orden_id)) m.set(g.orden_id, 'Cuenta corriente');
  return m;
}
