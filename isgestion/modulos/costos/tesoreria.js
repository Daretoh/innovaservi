// Datos comunes del flujo de caja y el balance: saldos de las cuentas, por cobrar y por pagar, deudas y ajustes.
import { hoyISO, sumarDias } from '../../core/ui/formato.js?v=e4cf9a2';

// Último saldo de cada cuenta activa
export async function cargarCuentas(ctx) {
  const e = ctx.empresa.id;
  const [cu, sa] = await Promise.all([
    ctx.api.from('fin_cuentas').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('fin_saldos').select('cuenta_id, fecha, saldo').eq('empresa_id', e).order('fecha', { ascending: false }),
  ]);
  if (cu.error) throw cu.error;
  const ultimo = new Map();
  for (const s of sa.data ?? []) if (!ultimo.has(s.cuenta_id)) ultimo.set(s.cuenta_id, s);
  return cu.data.map((c) => ({ ...c, ultimo: ultimo.get(c.id) ?? null }));
}

// Por cobrar y por pagar con la fecha en que se espera el movimiento
export async function cargarPendientes(ctx) {
  const e = ctx.empresa.id;
  const [regs, prov, res] = await Promise.all([
    ctx.api.from('fin_registros').select('id, tipo, fecha, vence, concepto, total, tercero_id, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).is('deleted_at', null).neq('estado_pago', 'pagado'),
    ctx.api.from('fin_proveedores').select('tercero_id, plazo_dias').eq('empresa_id', e),
    ctx.puede('resultados', 'ver') ? ctx.api.rpc('res_pendientes', { p_empresa: e }) : Promise.resolve({ data: [] }),
  ]);
  if (regs.error) throw regs.error;
  const plazo = new Map((prov.data ?? []).map((p) => [p.tercero_id, p.plazo_dias]));
  const items = (regs.data ?? []).map((r) => ({
    lado: r.tipo === 'ingreso' ? 'cobrar' : 'pagar', fecha: r.vence ?? sumarDias(r.fecha, r.tipo === 'ingreso' ? 30 : plazo.get(r.tercero_id) ?? 0),
    descripcion: [r.concepto, r.terceros?.nombre_fantasia || r.terceros?.razon_social].filter(Boolean).join(' · '), monto: Number(r.total), origen: 'costos',
  }));
  // Cobros de otros módulos (taller, cierres, cuentas): 30 días desde su fecha
  for (const p of res.data ?? []) if (p.origen !== 'costos' && p.lado === 'cobrar') items.push({ lado: 'cobrar', fecha: sumarDias(p.fecha, 30), descripcion: p.descripcion, monto: Number(p.monto), origen: p.origen });
  return items;
}

export async function cargarDeudas(ctx) {
  const { data, error } = await ctx.api.from('fin_deudas').select('*').eq('empresa_id', ctx.empresa.id).order('acreedor');
  if (error) throw error;
  return data;
}

export async function cargarConfig(ctx) {
  const { data } = await ctx.api.from('fin_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle();
  return data ?? { empresa_id: ctx.empresa.id, sueldos_mes: 0, dia_sueldos: 30, nuevo: true };
}

// Fecha del día "dia" en el mes de una fecha (si el mes es más corto, su último día)
export function diaDelMes(iso, dia) {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${iso.slice(0, 7)}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

export const lunesDe = (iso) => { const d = new Date(`${iso}T12:00`); const n = (d.getDay() + 6) % 7; return sumarDias(iso, -n); };
export const hoy = () => hoyISO();
