// Para Taller: si una orden se cobra en un cierre mensual o en una cuenta corriente (no se cobra sola).
// Devuelve { texto, ruta, enlace } o null. Requiere permiso de ver Cierres.
import { nombreMesLargo, numeroTexto, nombreEstado } from './datos.js?v=6f62ff2';

export async function cobroExterno(ctx, o) {
  if (!ctx.puede('cierres', 'ver')) return null;
  const [lin, cli, grp] = await Promise.all([
    ctx.api.from('cie_lineas').select('cie_cierres(id, mes, numero, estado)').eq('orden_id', o.id).eq('excluida', false).maybeSingle(),
    o.tercero_id ? ctx.api.from('cie_clientes').select('id').eq('empresa_id', o.empresa_id).eq('tercero_id', o.tercero_id).eq('activo', true).maybeSingle() : Promise.resolve({ data: null }),
    ctx.api.from('cot_grupos').select('cotizacion_id').eq('orden_id', o.id),
  ]);
  const c = lin.data?.cie_cierres;
  if (c) {
    return { texto: `Se cobra en el cierre de ${nombreMesLargo(c.mes)}${c.numero ? ` (N° ${numeroTexto(c.numero)})` : ''}, ${nombreEstado[c.estado].toLowerCase()}.`, ruta: ctx.ruta('cierres.cierre', { id: c.id }), enlace: 'Ver cierre' };
  }
  const cots = (grp.data ?? []).map((g) => g.cotizacion_id);
  if (cots.length) {
    const { data: cc } = await ctx.api.from('cie_cuenta_cotizaciones').select('cie_cuentas(id, nombre)').in('cotizacion_id', cots).limit(1).maybeSingle();
    if (cc?.cie_cuentas) return { texto: `Se cobra con los abonos de la cuenta corriente "${cc.cie_cuentas.nombre}".`, ruta: ctx.ruta('cierres.cuenta', { id: cc.cie_cuentas.id }), enlace: 'Ver cuenta' };
  }
  if (cli.data) return { texto: 'El cliente tiene cierre mensual: esta orden se cobra en el cierre del mes.', ruta: ctx.ruta('cierres.mensuales'), enlace: 'Cierres mensuales' };
  return null;
}
