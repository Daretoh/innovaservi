// Carga lo necesario para calcular pagos de la empresa activa en un rango.
import { calcular, sueldoDelMes, semanaEnMes } from './calculo.js?v=64a4e9f';
import { sumarDias, rangoMes, lunesDe } from '../../core/ui/formato.js?v=64a4e9f';

export const nombreCompleto = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');

export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  const [vinculos, condiciones, cargos, config] = await Promise.all([
    ctx.api.from('persona_empresa').select('id, persona_id, estado, tipo_vinculo, cargo, personas(id, rut, nombres, apellido_paterno, apellido_materno)')
      .eq('empresa_id', e).is('deleted_at', null),
    ctx.api.from('remu_condiciones').select('*').eq('empresa_id', e),
    ctx.api.from('remu_cargos').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('remu_config').select('*').eq('empresa_id', e).maybeSingle(),
  ]);
  for (const r of [vinculos, condiciones, cargos, config]) if (r.error) throw r.error;
  const porVinculo = new Map(condiciones.data.map((c) => [c.vinculo_id, c]));
  // Un vínculo por persona (el activo primero)
  const vistos = new Map();
  for (const v of [...vinculos.data].sort((a, b) => (a.estado === 'activo' ? -1 : 1) - (b.estado === 'activo' ? -1 : 1))) {
    if (!vistos.has(v.persona_id)) vistos.set(v.persona_id, { ...v, condicion: porVinculo.get(v.id) ?? null });
  }
  // Socios de la empresa (remu_condiciones.socio): fuera de los pagos; Condiciones los muestra en `todos`
  const todos = [...vistos.values()];
  return {
    vinculos: todos.filter((v) => !v.condicion?.socio),
    todos,
    cargos: new Map(cargos.data.map((c) => [c.id, c])),
    listaCargos: cargos.data,
    config: config.data ?? { valor_vuelta: 0, valor_hora: 0, horas_trato: 8 },
  };
}

// Calcula el rango [desde, hasta]. itemsDesde/itemsHasta: rango de lunes de los extras que cuentan.
// itemsMes ('aaaa-mm'): pago mensual, los extras y descuentos son del mes.
export async function calcularRango(ctx, base, { desde, hasta, itemsDesde = desde, itemsHasta = desde, incluirFijosSinActividad = false, filtroItems = null, itemsMes = null }) {
  const e = ctx.empresa.id;
  const [horas, items, ajustes, feriados, flota] = await Promise.all([
    ctx.api.from('asis_horas').select('persona_id, fecha, entrada, salida, faena, vueltas').eq('empresa_id', e)
      .is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta).limit(10000),
    // Aguinaldo y anticipo (clase) van aparte: los suma resumenMes
    itemsMes ? ctx.api.from('remu_items').select('*').eq('empresa_id', e).eq('mes', itemsMes).is('clase', null)
      : ctx.api.from('remu_items').select('*').eq('empresa_id', e).gte('semana', itemsDesde).lte('semana', itemsHasta).is('clase', null),
    ctx.api.from('remu_ajustes').select('*').eq('empresa_id', e).gte('fecha', desde).lte('fecha', hasta),
    ctx.api.from('remu_feriados').select('fecha, nombre').eq('empresa_id', e).gte('fecha', desde).lte('fecha', hasta),
    ctx.api.rpc('remu_vueltas_flota', { p_empresa: e, p_desde: desde, p_hasta: hasta }),
  ]);
  for (const r of [horas, items, ajustes, feriados, flota]) if (r.error) throw r.error;
  const R = calcular({
    desde, hasta, vinculos: base.vinculos, cargos: base.cargos, config: base.config,
    horas: horas.data, items: filtroItems ? items.data.filter(filtroItems) : items.data, ajustes: ajustes.data, vueltasFlota: flota.data,
    feriados: new Set(feriados.data.map((f) => f.fecha)), incluirFijosSinActividad,
  });
  R.feriados = new Map(feriados.data.map((f) => [f.fecha, f.nombre]));
  return R;
}

export const semanaDe = (lunes) => ({ desde: lunes, hasta: sumarDias(lunes, 6) });

// Pago mensual (IS Performance): cálculo del mes con extras y descuentos del mes, sueldo base de los fijos
// y bono por autos (valor × autos trabajados en el mes, con tope por persona si hay, a cada persona que trabajó al
// menos un día y no está excluida). Devuelve { R, filas (con sueldo, bonoAutos, sinBono, totalMes), autos, valorAuto, total }.
export async function pagoMensual(ctx, base, mes) {
  const { desde, hasta } = rangoMes(mes);
  const valorAuto = Number(base.config.bono_auto || 0);
  const tope = Number(base.config.bono_auto_tope || 0);   // 0 = sin tope (Performance: $50.000)
  const [R, autos, sinBono] = await Promise.all([
    calcularRango(ctx, base, { desde, hasta, incluirFijosSinActividad: true, itemsMes: mes }),
    valorAuto ? ctx.api.rpc('remu_autos_mes', { p_empresa: ctx.empresa.id, p_mes: mes }) : Promise.resolve({ data: [] }),
    ctx.api.from('remu_sin_bono').select('persona_id').eq('empresa_id', ctx.empresa.id).eq('mes', mes),
  ]);
  if (autos.error) throw new Error(autos.error.message);
  const excluidos = new Set((sinBono.data ?? []).map((x) => x.persona_id));
  const nAutos = (autos.data ?? []).length;
  const filas = R.filas.map((f) => {
    const sueldo = sueldoDelMes(f, mes);
    const sin = excluidos.has(f.vinculo.persona_id);
    // Art. 22 (sin control de jornada) no registra horas: cuenta como que trabajó el mes.
    const trabajo = f.dias > 0 || !!f.condicion?.art22;
    const bonoAutos = valorAuto && trabajo && !sin ? (tope ? Math.min(nAutos * valorAuto, tope) : nAutos * valorAuto) : 0;
    return { ...f, sueldo, sinBono: sin, bonoAutos, totalMes: f.total + sueldo + bonoAutos, realMes: f.real + sueldo + bonoAutos };
  });
  return { R, filas, autos: autos.data ?? [], valorAuto, tope, total: filas.reduce((s, f) => s + f.totalMes, 0) };
}

// Aguinaldo y anticipo del mes (solo personal fijo): persona → { aguinaldo, anticipo, items }
export async function fijosDelMes(ctx, mes) {
  const { data, error } = await ctx.api.from('remu_items').select('*').eq('empresa_id', ctx.empresa.id).eq('mes', mes).not('clase', 'is', null).order('created_at');
  if (error) throw error;
  const m = new Map();
  for (const it of data) {
    const o = m.get(it.persona_id) ?? { aguinaldo: 0, anticipo: 0, items: [] };
    o[it.clase] += it.monto; o.items.push(it); m.set(it.persona_id, o);
  }
  return m;
}

// Resumen del mes con el mismo cálculo para empresas de pago semanal o mensual: filas con sueldo base, bono por
// autos (mensual), aguinaldo y anticipo; totalMes = costo del mes (pagos + sueldo + bono + aguinaldo) y
// aPagar = totalMes − anticipo (el anticipo ya se pagó: no cambia el costo). Lo usan el Resumen mensual, el Estado
// de resultados (totalMes) y Costos de mano de obra.
export async function resumenMes(ctx, base, mes) {
  const [P, fijos] = await Promise.all([
    base.config.periodo === 'mensual' ? pagoMensual(ctx, base, mes) : (async () => {
      const { desde, hasta } = rangoMes(mes);
      const R = await calcularRango(ctx, base, {
        desde, hasta, incluirFijosSinActividad: true,
        itemsDesde: lunesDe(sumarDias(desde, -6)), itemsHasta: hasta,
        filtroItems: (it) => semanaEnMes(it.semana, mes),
      });
      return { R, autos: [], valorAuto: 0, tope: 0, filas: R.filas.map((f) => { const sueldo = sueldoDelMes(f, mes); return { ...f, sueldo, bonoAutos: 0, totalMes: f.total + sueldo, realMes: f.real + sueldo }; }) };
    })(),
    fijosDelMes(ctx, mes),
  ]);
  const filas = P.filas.map((f) => {
    const x = fijos.get(f.vinculo.persona_id) ?? { aguinaldo: 0, anticipo: 0, items: [] };
    return { ...f, aguinaldo: x.aguinaldo, anticipo: x.anticipo, itemsFijos: x.items,
      totalMes: f.totalMes + x.aguinaldo, realMes: f.realMes + x.aguinaldo, aPagar: f.totalMes + x.aguinaldo - x.anticipo };
  });
  return { ...P, filas, total: filas.reduce((s, f) => s + f.totalMes, 0) };
}

// Total (costo) del mes: lo usa el Estado de resultados.
export async function totalMes(ctx, base, mes) {
  return (await resumenMes(ctx, base, mes)).total;
}
