// Por cobrar (órdenes terminadas sin cobrar y otros ingresos pendientes) y por pagar (gastos pendientes).
// Montos totales, con IVA: es lo que se cobra o se paga.
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=b8da9fc';

export default async function vista(ctx) {
  const { data, error } = await ctx.api.rpc('res_pendientes', { p_empresa: ctx.empresa.id });
  if (error) throw new Error(error.message);
  const hoy = hoyISO();
  const dias = (f) => (f ? Math.round((new Date(`${hoy}T12:00`) - new Date(`${f}T12:00`)) / 864e5) : null);
  const cobrar = data.filter((x) => x.lado === 'cobrar').sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
  const pagar = data.filter((x) => x.lado === 'pagar').sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
  const suma = (l) => l.reduce((s, x) => s + Number(x.monto), 0);
  const tc = suma(cobrar), tp = suma(pagar);

  const enlace = (x) => {
    if (x.origen === 'taller' && ctx.puede('taller', 'ver')) return el('a', { href: ctx.ruta('taller.orden', { id: x.ref_id }) }, el('strong', {}, `Orden N° ${x.numero}`));
    if (x.origen === 'costos' && ctx.puede('costos', 'ver')) return el('a', { href: ctx.ruta('costos.registro', { id: x.ref_id }) }, el('strong', {}, x.descripcion.split(' · ')[0]));
    if (x.origen === 'cierre' && ctx.puede('cierres', 'ver')) return el('a', { href: ctx.ruta('cierres.cierre', { id: x.ref_id }) }, el('strong', {}, x.descripcion.split(' · ')[0]));
    if (x.origen === 'cuenta' && ctx.puede('cierres', 'ver')) return el('a', { href: ctx.ruta('cierres.cuenta', { id: x.ref_id }) }, el('strong', {}, x.descripcion.split(' · ').slice(0, -1).join(' · ')));
    return el('strong', {}, x.origen === 'taller' ? `Orden N° ${x.numero}` : x.descripcion.split(' · ')[0]);
  };
  const fila = (x) => {
    const d = dias(x.fecha);
    // La cuenta trae "nombre · cliente" (el nombre puede tener ·): el cliente es el último tramo
    const resto = x.origen === 'taller' ? x.descripcion : x.origen === 'cuenta' ? `cuenta corriente · ${x.descripcion.split(' · ').at(-1)}` : x.descripcion.split(' · ').slice(1).join(' · ');
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, enlace(x),
        el('span', { class: 'texto-suave texto-chico' }, [resto, x.fecha ? fechaLarga(x.fecha) : null, d > 0 ? `hace ${d} ${d === 1 ? 'día' : 'días'}` : null].filter(Boolean).join(' · '))),
      d > 30 ? el('span', { class: 'chip chip-venc' }, '+30 días') : null,
      el('strong', {}, dinero(x.monto)));
  };
  const bloque = (titulo, lista, total, vacio) => el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, titulo), el('strong', {}, dinero(total))),
    lista.length ? lista.map(fila) : el('p', { class: 'texto-suave' }, vacio));

  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), el('span', { class: 'texto-suave texto-chico' }, nota));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Por cobrar y por pagar')),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Por cobrar', tc, `${cobrar.length} pendientes`),
      tarjeta('Por pagar', tp, `${pagar.length} pendientes`, tp ? 'fin-alerta' : ''),
      tarjeta('Diferencia', tc - tp, tc >= tp ? 'a favor' : 'en contra', tc - tp < 0 ? 'fin-alerta' : 'fin-bien')),
    el('div', { class: 'plan-editor' },
      bloque('Por cobrar', cobrar, tc, 'No hay nada por cobrar.'),
      bloque('Por pagar', pagar, tp, 'No hay nada por pagar.')),
    el('p', { class: 'texto-suave texto-chico' }, 'Montos totales (con IVA). Por cobrar: órdenes terminadas o entregadas sin cobrar (saldo después del abono), cierres mensuales emitidos sin cobrar, saldo de cuentas corrientes abiertas y otros ingresos pendientes. Por pagar: gastos pendientes de Costos y gastos.'));
}
