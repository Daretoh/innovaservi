// Costos con la patente (como el OS, 2026-10-22): en la orden del taller, los gastos de Costos y gastos registrados con
// la patente del vehículo: los de esta visita (entre el ingreso y la entrega, o ligados a la orden), los de otras
// visitas y lo que queda por pagar. Cada uno abre su registro. Requiere permiso de ver Costos.
import { el } from '../../core/ui/dom.js?v=b8da9fc';
import { dinero, fechaLarga, diaLocal, hoyISO } from '../../core/ui/formato.js?v=b8da9fc';

export async function seccionCostosPatente(ctx, o, v) {
  if (!v?.patente || !ctx.puede('costos', 'ver')) return null;
  const { data, error } = await ctx.api.from('fin_registros').select('id, fecha, concepto, total, estado_pago, orden_id')
    .eq('empresa_id', ctx.empresa.id).eq('patente', v.patente).eq('tipo', 'gasto').is('deleted_at', null).order('fecha', { ascending: false });
  if (error || !data?.length) return null;
  const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at);
  const hasta = diaLocal(o.entregado_at) || hoyISO();
  const estaVisita = (r) => r.orden_id === o.id || (r.fecha >= desde && r.fecha <= hasta);
  const visita = data.filter(estaVisita); const otras = data.filter((r) => !estaVisita(r));
  const suma = (l) => l.reduce((s, r) => s + Number(r.total || 0), 0);
  const porPagar = suma(data.filter((r) => r.estado_pago !== 'pagado'));
  const fila = (r) => el('a', { class: 'doc-fila', href: ctx.ruta('costos.registro', { id: r.id }) },
    el('span', { class: 'doc-nombre' }, el('strong', {}, r.concepto), el('span', { class: 'texto-suave texto-chico' }, fechaLarga(r.fecha))),
    el('span', {}, dinero(r.total), r.estado_pago !== 'pagado' ? el('span', { class: 'chip chip-prox', style: 'margin-left:6px' }, 'Por pagar') : null));
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Costos con la patente'),
    el('div', { class: 'cobro-resumen' },
      el('div', {}, el('span', {}, 'Esta visita'), el('strong', {}, dinero(suma(visita)))),
      otras.length ? el('div', {}, el('span', {}, 'Otras visitas'), el('span', {}, dinero(suma(otras)))) : null,
      porPagar ? el('div', {}, el('span', {}, 'Por pagar'), el('span', { class: 'pct-mal' }, dinero(porPagar))) : null),
    visita.map(fila),
    otras.length ? el('details', {}, el('summary', { class: 'texto-suave' }, `Otras visitas (${otras.length})`), otras.map(fila)) : null);
}
