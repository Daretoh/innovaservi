// Estado de resultados: arma las líneas por mes con lo que entrega la base (res_resumen) y agrega
// Personal desde Remuneraciones (cálculo en el navegador, el mismo del Resumen mensual).
import { rangoMes, moverMes, hoyISO } from '../../core/ui/formato.js?v=66a811d';

export const GRUPOS = [['ingreso', 'Ingresos'], ['costo', 'Costo de lo vendido'], ['gasto', 'Gastos de operación'], ['personal', 'Personal']];

// Meses entre dos 'aaaa-mm' (inclusive)
export function mesesEntre(desde, hasta) {
  const r = [];
  for (let m = desde; m <= hasta; m = moverMes(m, 1)) r.push(m);
  return r;
}

// ¿La empresa tiene Remuneraciones activo? (aunque el usuario no tenga permiso para verlo)
async function remuActivo(ctx) {
  const { data } = await ctx.api.from('empresa_modulos').select('modulo_id').eq('empresa_id', ctx.empresa.id).eq('modulo_id', 'remu').maybeSingle();
  return !!data;
}

// Devuelve { meses, lineas: Map(grupo → Map(concepto → Map(mes → monto))), totales: Map(mes → {...}), avisoPersonal }
export async function cargarEstado(ctx, meses) {
  const desde = rangoMes(meses[0]).desde;
  const hasta = rangoMes(meses[meses.length - 1]).hasta;
  const [{ data, error }, conRemu] = await Promise.all([
    ctx.api.rpc('res_resumen', { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta }),
    remuActivo(ctx),
  ]);
  if (error) throw new Error(error.message);
  const lineas = new Map(GRUPOS.map(([g]) => [g, new Map()]));
  const sumar = (grupo, concepto, mes, monto) => {
    const c = lineas.get(grupo);
    if (!c.has(concepto)) c.set(concepto, new Map());
    c.get(concepto).set(mes, (c.get(concepto).get(mes) ?? 0) + Number(monto));
  };
  for (const f of data) sumar(f.grupo, f.concepto, f.mes, f.monto);

  // Personal desde Remuneraciones
  let avisoPersonal = null;
  if (conRemu && ctx.puede('remu', 'ver')) {
    const { cargarBase, totalMes } = await import('../remu/datos.js?v=66a811d');
    const base = await cargarBase(ctx);
    const hoy = hoyISO().slice(0, 7);
    const totales = await Promise.all(meses.map((m) => (m > hoy ? 0 : totalMes(ctx, base, m))));
    meses.forEach((m, i) => { if (totales[i]) sumar('personal', 'Remuneraciones', m, totales[i]); });
  } else if (conRemu) {
    avisoPersonal = 'Personal no incluye Remuneraciones: tu rol no tiene acceso a ese módulo.';
  }

  const totales = new Map(meses.map((m) => {
    const g = (grupo) => [...lineas.get(grupo).values()].reduce((s, porMes) => s + (porMes.get(m) ?? 0), 0);
    const ingresos = g('ingreso'), costo = g('costo'), gastos = g('gasto'), personal = g('personal');
    const margen = ingresos - costo;
    const resultado = margen - gastos - personal;
    return [m, { ingresos, costo, margen, gastos, personal, resultado }];
  }));
  return { meses, lineas, totales, avisoPersonal };
}

// Suma de los totales de varios meses
export function sumarTotales(est, meses = est.meses) {
  const t = { ingresos: 0, costo: 0, margen: 0, gastos: 0, personal: 0, resultado: 0 };
  for (const m of meses) for (const k of Object.keys(t)) t[k] += est.totales.get(m)?.[k] ?? 0;
  return t;
}

// Punto de equilibrio: gastos de operación + personal / margen de contribución (%)
export function puntoEquilibrio(t) {
  if (t.ingresos <= 0 || t.margen <= 0) return null;
  return Math.round((t.gastos + t.personal) / (t.margen / t.ingresos));
}

export const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
