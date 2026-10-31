// Cálculo de pagos para un rango de fechas (semana o mes). Función pura: no consulta la base.
// Mismas reglas que calcRemu de InnovaGestión:
// - Valor hora = trato del cargo ÷ horas_trato (8). Sin trato: valor hora propio o el general.
// - Modo 'hora' (spot): se pagan todas las horas.
// - Modo 'fijo': fines de semana y feriados se pagan completos; los demás días solo lo que queda (Artículo 22: nada)
//   fuera del turno (inicio–fin) o lo que excede la jornada en horas. Sin jornada ni turno, todo cuenta.
// - Registros que se pisan el mismo día se unen (el tiempo repetido cuenta una vez).
// - Vueltas × valor (propio o general). Extras y descuentos por semana.
// - Ajuste contable por día: reemplaza el monto de ese día (se muestra real y contable).
import { aMin, diaSemana, sumarDias } from '../../core/ui/formato.js?v=7860387';

// Intervalos [inicio, fin] en minutos del día; si la salida es <= entrada, termina al día siguiente.
function intervalo(h) {
  const a = aMin(h.entrada); let b = aMin(h.salida);
  if (b <= a) b += 1440;
  return [a, b];
}

function unir(ivs) {
  const ord = [...ivs].sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const iv of ord) {
    const ult = out[out.length - 1];
    if (ult && iv[0] <= ult[1]) ult[1] = Math.max(ult[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
}
const suma = (ivs) => ivs.reduce((s, iv) => s + iv[1] - iv[0], 0);
const minEnVentana = (ivs, ini, fin) => ivs.reduce((s, iv) => s + Math.max(0, Math.min(iv[1], fin) - Math.max(iv[0], ini)), 0);

/**
 * @param {object} D
 *   desde, hasta: 'aaaa-mm-dd'
 *   vinculos: [{ id, persona_id, estado, tipo_vinculo, cargo, personas, condicion?: remu_condiciones }]
 *   cargos: Map(id → cargo)
 *   horas: asis_horas del rango
 *   items: remu_items que corresponden al rango
 *   ajustes: remu_ajustes del rango (faena = '' → ajuste del día; con texto → ajuste de esa faena ese día)
 *            Solo se aplican si config.ajuste_contable está encendido (opción de la empresa).
 *   feriados: Set de 'aaaa-mm-dd'
 *   vueltasFlota: vueltas que registró el chofer en el vehículo (remu_vueltas_flota): [{ persona_id, fecha, cantidad, vehiculo }]
 *            Se suman a las vueltas del día (también en días sin horas).
 *   config: { valor_vuelta, valor_hora, horas_trato }
 *   incluirFijosSinActividad: para la vista mensual (sueldo base)
 */
export function calcular(D) {
  const cfg = { valor_vuelta: 0, valor_hora: 0, horas_trato: 8, ...(D.config ?? {}) };
  const horasPorPersona = new Map();
  for (const h of D.horas) {
    if (h.fecha < D.desde || h.fecha > D.hasta) continue;
    if (!horasPorPersona.has(h.persona_id)) horasPorPersona.set(h.persona_id, []);
    horasPorPersona.get(h.persona_id).push(h);
  }
  const flotaPorPersona = new Map();   // persona → Map(fecha → [{ cantidad, vehiculo }])
  for (const x of D.vueltasFlota ?? []) {
    if (x.fecha < D.desde || x.fecha > D.hasta) continue;
    const m = flotaPorPersona.get(x.persona_id) ?? new Map();
    m.set(x.fecha, [...(m.get(x.fecha) ?? []), { cantidad: x.cantidad, vehiculo: x.vehiculo }]);
    flotaPorPersona.set(x.persona_id, m);
  }
  const items = new Map();
  for (const it of D.items) {
    const o = items.get(it.persona_id) ?? { extra: 0, descuento: 0, lista: [] };
    o[it.tipo] += it.monto; o.lista.push(it);
    items.set(it.persona_id, o);
  }
  const usarAjustes = !!cfg.ajuste_contable;
  const ajustes = new Map(usarAjustes ? D.ajustes.filter((a) => !a.faena).map((a) => [`${a.persona_id}|${a.fecha}`, a]) : []);
  const ajustesFaena = new Map(usarAjustes ? D.ajustes.filter((a) => a.faena).map((a) => [`${a.persona_id}|${a.fecha}|${a.faena}`, a]) : []);

  const filas = [];
  const porDia = {};   // fecha → { min, monto }
  let diasRepetidos = 0;

  for (const v of D.vinculos) {
    const regs = horasPorPersona.get(v.persona_id) ?? [];
    const it = items.get(v.persona_id) ?? { extra: 0, descuento: 0, lista: [] };
    const c = v.condicion ?? {};
    const modoBase = c.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora');
    // Si el contrato fijo empieza después del rango, todo el rango es spot
    const modo = modoBase === 'fijo' && c.fijo_desde && c.fijo_desde > D.hasta ? 'hora' : modoBase;
    const cargo = c.cargo_id ? D.cargos.get(c.cargo_id) : null;
    const trato = cargo?.trato || 0;
    const vh = trato ? Math.round(trato / cfg.horas_trato) : (c.valor_hora || cfg.valor_hora || 0);
    const vv = c.valor_vuelta ?? cfg.valor_vuelta ?? 0;
    const ventana = c.jornada_ini && c.jornada_fin
      ? (() => { const a = aMin(c.jornada_ini), b = aMin(c.jornada_fin); return b > a ? [a, b] : null; })() : null;
    const jornadaMin = (Number(c.jornada_horas) || 0) * 60;

    // Agrupar por día
    const dias = new Map();
    for (const h of regs) {
      if (!dias.has(h.fecha)) dias.set(h.fecha, []);
      dias.get(h.fecha).push(h);
    }
    const flota = flotaPorPersona.get(v.persona_id) ?? new Map();
    for (const fecha of flota.keys()) if (!dias.has(fecha)) dias.set(fecha, []);
    let totMin = 0; let pagoMin = 0; let real = 0; let contable = 0; let vueltas = 0; let hayAjuste = false;
    const detalle = [];
    for (const [fecha, rs] of [...dias].sort(([a], [b]) => a.localeCompare(b))) {
      const ivs = rs.map(intervalo);
      const unidos = unir(ivs);
      const min = suma(unidos);
      if (suma(ivs) > min) diasRepetidos += 1;
      const especial = diaSemana(fecha) >= 5 || D.feriados.has(fecha);
      let pmin = min;
      // Contrato fijo desde: antes de esa fecha el día se paga como spot
      const fijoHoy = modo === 'fijo' && !(c.fijo_desde && fecha < c.fijo_desde);
      if (fijoHoy && !especial) {
        // El viernes el turno puede terminar antes (salida_viernes): lo que pasa de esa hora es extra
        const v = ventana && diaSemana(fecha) === 4 && c.salida_viernes ? [ventana[0], aMin(c.salida_viernes)] : ventana;
        pmin = v ? min - minEnVentana(unidos, v[0], v[1]) : Math.max(0, min - jornadaMin);
      }
      // Artículo 22 (sin jornada): no se pagan horas extra, ni en fines de semana o feriados; solo el sueldo
      if (fijoHoy && c.art22) pmin = 0;
      const dReal = Math.round((pmin / 60) * vh);
      // Por faena (como InnovaGestión): cada faena con su monto; si el día se paga completo, sus horas × valor hora;
      // si no (fijo en día hábil), el monto del día se reparte entre las faenas según sus horas.
      const grupos = new Map();
      for (const h of rs) { const k = String(h.faena ?? '').trim(); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(h); }
      const faenas = [...grupos].map(([faena, hs]) => ({ faena, min: suma(hs.map(intervalo)), real: 0, contable: 0, ajuste: null }));
      const totF = faenas.reduce((a, x) => a + x.min, 0);
      if (pmin === min) for (const x of faenas) x.real = Math.round((x.min / 60) * vh);
      else { let resto = dReal; faenas.forEach((x, i) => { x.real = i === faenas.length - 1 ? resto : (totF ? Math.round((dReal * x.min) / totF) : 0); resto -= x.real; }); }
      for (const x of faenas) { x.ajuste = ajustesFaena.get(`${v.persona_id}|${fecha}|${x.faena}`) ?? null; x.contable = x.ajuste ? x.ajuste.monto : x.real; }
      const sumReal = faenas.reduce((a, x) => a + x.real, 0);
      const sumCont = faenas.reduce((a, x) => a + x.contable, 0);
      const aj = ajustes.get(`${v.persona_id}|${fecha}`);
      // Si el monto del día se ajustó y no cuadra con la suma por faena, manda el del día (es el que se paga)
      const ajDiaManda = !!(aj && aj.monto !== sumCont);
      const porFaena = usarAjustes && sumReal === dReal && !ajDiaManda;   // se edita por faena solo si la suma cuadra
      const dCont = porFaena ? sumCont : aj ? aj.monto : dReal;
      if (aj || faenas.some((x) => x.ajuste)) hayAjuste = true;
      const vueltasFlota = flota.get(fecha) ?? [];
      const vu = rs.reduce((s, h) => s + (h.vueltas || 0), 0) + vueltasFlota.reduce((s, x) => s + x.cantidad, 0);
      totMin += min; pagoMin += pmin; real += dReal; contable += dCont; vueltas += vu;
      detalle.push({ fecha, min, pagoMin: pmin, real: dReal, contable: dCont, ajuste: aj ?? null, ajDiaManda, porFaena, faenas, especial, feriado: D.feriados.has(fecha), vueltas: vu, vueltasFlota, registros: rs });
      const pd = porDia[fecha] ?? (porDia[fecha] = { min: 0, monto: 0 });
      pd.min += min; pd.monto += dCont;
    }

    const sinActividad = !regs.length && !flota.size && !it.extra && !it.descuento;
    if (sinActividad && !(D.incluirFijosSinActividad && modo === 'fijo' && v.estado === 'activo')) continue;

    const montoVueltas = vueltas * vv;
    const otros = montoVueltas + it.extra - it.descuento;
    filas.push({
      vinculo: v, persona: v.personas, modo, cargo, trato, vh, vv, ventana: c.jornada_ini ? `${String(c.jornada_ini).slice(0, 5)}–${String(c.jornada_fin).slice(0, 5)}` : null,
      jornadaHoras: Number(c.jornada_horas) || null, condicion: v.condicion ?? null,
      dias: detalle.filter((d) => d.min > 0).length, totMin, pagoMin,
      base: real, baseContable: contable, vueltas, montoVueltas,
      extra: it.extra, descuento: it.descuento, items: it.lista,
      real: real + otros, total: contable + otros, hayAjuste, detalle,
    });
  }

  // Spot primero, fijos al final; luego por nombre (como en InnovaGestión)
  const nom = (p) => `${p.nombres} ${p.apellido_paterno}`;
  filas.sort((a, b) => (a.modo === 'fijo') - (b.modo === 'fijo') || nom(a.persona).localeCompare(nom(b.persona)));
  return { filas, total: filas.reduce((s, f) => s + f.total, 0), porDia, diasRepetidos };
}

// Días a liquidar de un fijo en el mes (mes comercial de 30 días): 30, o desde el día en que rige hasta el 30 si
// empieza a mitad de mes (rige desde la fecha más tardía entre fijo_desde y sueldo_desde); 0 antes de que rija.
export function diasDelMes(fila, mes) {
  const c = fila.condicion;
  if (fila.modo !== 'fijo') return 0;
  const desde = [c?.fijo_desde, c?.sueldo_desde].filter(Boolean).map(String).sort().pop();
  if (desde && mes < desde.slice(0, 7)) return 0;
  if (desde && mes === desde.slice(0, 7)) return Math.max(1, 30 - Math.min(30, Number(desde.slice(8, 10))) + 1);
  return 30;
}

// Sueldo base del mes para un fijo: proporcional a los días a liquidar (sueldo ÷ 30 × días, como una liquidación).
export function sueldoDelMes(fila, mes) {
  const c = fila.condicion;
  if (fila.modo !== 'fijo' || !c?.sueldo_base) return 0;
  const dias = diasDelMes(fila, mes);
  return dias === 30 ? c.sueldo_base : Math.round(c.sueldo_base * dias / 30);
}

// Extras y descuentos de un mes: una semana cuenta en el mes que contiene su jueves (criterio ISO).
export const semanaEnMes = (lunes, mes) => sumarDias(lunes, 3).slice(0, 7) === mes;
