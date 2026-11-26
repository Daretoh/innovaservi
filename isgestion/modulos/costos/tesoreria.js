// Datos comunes del flujo de caja y el balance: saldos de las cuentas, por cobrar y por pagar, deudas y ajustes.
import { hoyISO, sumarDias, moverMes } from '../../core/ui/formato.js?v=0f5585f';
import { tocaEnMes, fechaEnMes } from './datos.js?v=0f5585f';

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
    ctx.api.from('fin_proveedores').select('tercero_id, plazo_dias, modalidad, terceros(razon_social, nombre_fantasia)').eq('empresa_id', e),
    ctx.puede('resultados', 'ver') ? ctx.api.rpc('res_pendientes', { p_empresa: e }) : Promise.resolve({ data: [] }),
  ]);
  if (regs.error) throw regs.error;
  const plazo = new Map((prov.data ?? []).map((p) => [p.tercero_id, p.plazo_dias]));
  // (2026-11-24) Contratistas con cuenta corriente: sus trabajos no se pagan uno a uno; cuenta el saldo de su cuenta, hoy
  const cuentas = (prov.data ?? []).filter((p) => p.modalidad === 'cuenta');
  const conCuenta = new Set(cuentas.map((p) => p.tercero_id));
  const items = (regs.data ?? []).filter((r) => !(r.tipo === 'gasto' && conCuenta.has(r.tercero_id))).map((r) => ({
    lado: r.tipo === 'ingreso' ? 'cobrar' : 'pagar', fecha: r.vence ?? sumarDias(r.fecha, r.tipo === 'ingreso' ? 30 : plazo.get(r.tercero_id) ?? 0),
    descripcion: [r.concepto, r.terceros?.nombre_fantasia || r.terceros?.razon_social].filter(Boolean).join(' · '), monto: Number(r.total), origen: 'costos',
  }));
  const saldos = await Promise.all(cuentas.map(async (p) => {
    const { data: m } = await ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: p.tercero_id });
    const s = (k) => (m ?? []).filter((y) => y.tipo === k).reduce((a, y) => a + Number(y.monto), 0);
    return { p, saldo: s('trabajo') - s('compra') - s('abono') };
  }));
  for (const { p, saldo } of saldos) if (saldo > 0) items.push({ lado: 'pagar', fecha: hoyISO(), descripcion: `Saldo de la cuenta de ${p.terceros?.nombre_fantasia || p.terceros?.razon_social || 'contratista'}`, monto: saldo, origen: 'costos' });
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

// Flujo de caja de `n` semanas (lo usan Costos → Flujo de caja y Grupo → Caja del grupo): saldo de hoy en bancos y caja
// + cobros esperados − pagos comprometidos (facturas por pagar, cuotas de deudas, pagos de cada mes y sueldos estimados).
// Lo atrasado cae en la primera semana.
export async function calcularFlujo(ctx, n = 8) {
  const e = ctx.empresa.id;
  const h = hoy();
  const inicio = lunesDe(h);
  const fin = sumarDias(inicio, n * 7 - 1);
  const [cuentas, pend, deudas, cfg, rec, hechos] = await Promise.all([
    cargarCuentas(ctx), cargarPendientes(ctx), cargarDeudas(ctx), cargarConfig(ctx),
    ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).eq('activo', true),
    ctx.api.from('fin_registros').select('recurrente_id, periodo').eq('empresa_id', e).not('recurrente_id', 'is', null).is('deleted_at', null).gte('periodo', h.slice(0, 7)),
  ]);
  const caja = cuentas.filter((c) => c.activo && c.tipo !== 'tarjeta');
  const saldoHoy = caja.reduce((s, c) => s + Number(c.ultimo?.saldo ?? 0), 0);
  const sinSaldo = caja.filter((c) => !c.ultimo);

  const movs = [];
  const agregar = (fecha, lado, descripcion, monto, tipo) => { if (monto > 0 && fecha <= fin) movs.push({ fecha: fecha < inicio ? inicio : fecha, atrasado: fecha < h, lado, descripcion, monto, tipo }); };
  for (const p of pend) agregar(p.fecha, p.lado === 'cobrar' ? 'entra' : 'sale', p.descripcion, p.monto, p.lado === 'cobrar' ? 'Por cobrar' : 'Por pagar');
  const meses = [h.slice(0, 7), moverMes(h.slice(0, 7), 1), moverMes(h.slice(0, 7), 2)];
  for (const d of deudas.filter((x) => x.activo && x.cuota > 0 && x.dia)) {
    for (const m of meses) { const f = diaDelMes(`${m}-01`, d.dia); if (f >= h && (!d.hasta || f <= d.hasta)) agregar(f, 'sale', `Cuota ${d.acreedor}`, Number(d.cuota), 'Deuda'); }
  }
  const tc = (rec.data ?? []).some((r) => r.moneda === 'USD') ? await import('../../core/economia.js?v=0f5585f').then((m) => m.dolarDelDia()).catch(() => null) : null;
  const ya = new Set((hechos.data ?? []).map((x) => `${x.recurrente_id}|${x.periodo}`));
  for (const r of rec.data ?? []) {
    for (const m of meses) if (tocaEnMes(r, m) && !ya.has(`${r.id}|${m}`)) agregar(fechaEnMes(m, r.dia), 'sale', r.moneda === 'USD' ? `${r.concepto} (US$ ${r.monto})` : r.concepto, Math.round(r.moneda === 'USD' ? Number(r.monto) * (tc ?? 0) : Number(r.monto)), 'Pago de cada mes');
  }
  if (cfg.sueldos_mes > 0) for (const m of meses) { const f = diaDelMes(`${m}-01`, cfg.dia_sueldos); if (f >= h) agregar(f, 'sale', 'Sueldos (estimado)', Number(cfg.sueldos_mes), 'Sueldos'); }

  let saldo = saldoHoy;
  const semanas = Array.from({ length: n }, (_, i) => {
    const desde = sumarDias(inicio, i * 7); const hasta = sumarDias(desde, 6);
    const lista = movs.filter((m) => m.fecha >= desde && m.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const entra = lista.filter((m) => m.lado === 'entra').reduce((s, m) => s + m.monto, 0);
    const sale = lista.filter((m) => m.lado === 'sale').reduce((s, m) => s + m.monto, 0);
    saldo += entra - sale;
    return { desde, hasta, lista, entra, sale, saldo };
  });
  const masJusta = semanas.reduce((a, s) => (s.saldo < a.saldo ? s : a), semanas[0]);
  return { caja, saldoHoy, sinSaldo, semanas, minimo: masJusta.saldo, masJusta, cfg, pend, deudas, cuentas };
}

// Lo que tenemos y lo que debemos hoy (Balance de gestión y Caja del grupo)
export async function calcularBalance(ctx) {
  const [cuentas, pend, deudas, pres] = await Promise.all([cargarCuentas(ctx), cargarPendientes(ctx), cargarDeudas(ctx),
    ctx.api.from('fin_prestamos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false })]);
  const prestamos = pres.data ?? [];
  const activas = cuentas.filter((c) => c.activo);
  const saldo = (c) => Number(c.ultimo?.saldo ?? 0);
  const enCaja = activas.filter((c) => c.tipo !== 'tarjeta').reduce((s, c) => s + saldo(c), 0);
  const tarjetas = activas.filter((c) => c.tipo === 'tarjeta').reduce((s, c) => s + saldo(c), 0);
  const porCobrar = pend.filter((p) => p.lado === 'cobrar').reduce((s, p) => s + p.monto, 0);
  const porPagar = pend.filter((p) => p.lado === 'pagar').reduce((s, p) => s + p.monto, 0);
  const deuda = deudas.filter((d) => d.activo).reduce((s, d) => s + Number(d.saldo), 0);
  // Préstamos del grupo: neto por contraparte (positivo = nos deben)
  const porContraparte = new Map();
  for (const p of prestamos) porContraparte.set(p.contraparte, (porContraparte.get(p.contraparte) ?? 0) + (p.sentido === 'otorgado' ? 1 : -1) * Number(p.monto));
  const nosDeben = [...porContraparte.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const debemos = -[...porContraparte.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);
  return { cuentas, pend, deudas, prestamos, activas, saldo, enCaja, tarjetas, porCobrar, porPagar, deuda, porContraparte, nosDeben, debemos,
    activos: enCaja + porCobrar + nosDeben, pasivos: tarjetas + porPagar + deuda + debemos };
}
