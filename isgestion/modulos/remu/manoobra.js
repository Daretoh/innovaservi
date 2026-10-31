// Costos de mano de obra (como "Costos · Mano de obra" de InnovaGestión). Mismo cálculo que Remuneraciones, mes a
// mes (el total del mes cuadra con el Resumen o el Pago mensual y con el Estado de resultados), repartido en un
// "libro" de movimientos { fecha, faena, cliente, persona, componente, monto, minutos }:
//  · horas del día (tr) → a cada faena del día según sus horas (o el monto contable por faena, si se ajustó así);
//  · vueltas del Registro de horas (vu) → a su faena;
//  · sueldo base de los fijos (su), vueltas del chofer en Vehículos, extras y bono por autos (ex) y descuentos (de)
//    → según las horas de la persona en el mes; si no trabajó horas, a "Sin faena asignada" en los días del mes.
// Mes en curso: el sueldo base se cuenta devengado a hoy (días transcurridos del mes). Sin leyes sociales.
import { hoyISO, rangoMes, moverMes, sumarDias, lunesDe } from '../../core/ui/formato.js?v=0e371c2';
import { resumenMes } from './datos.js?v=0e371c2';

export const COMPONENTES = [
  ['tr', 'Horas trabajadas', 'tratos y valor hora'],
  ['su', 'Sueldos base', 'fijos con contrato'],
  ['vu', 'Vueltas', 'traslados de personal'],
  ['ex', 'Extras', 'bonos y adicionales'],
];
export const SIN_FAENA = 'Sin faena asignada';
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Cliente de una faena "Cliente · Sitio · Título" (como la escribe Planificación)
export const clienteDe = (fa) => (fa ? fa.split(' · ')[0].trim() : '');

// Meses del período (mes, trimestre o año) que contiene ref, y los del período anterior
export function periodo(per, ref) {
  const [a, m] = ref.split('-').map(Number);
  const ini = per === 'anio' ? `${a}-01` : per === 'tri' ? `${a}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}` : ref;
  const n = per === 'anio' ? 12 : per === 'tri' ? 3 : 1;
  const meses = Array.from({ length: n }, (_, i) => moverMes(ini, i));
  const prev = Array.from({ length: n }, (_, i) => moverMes(ini, i - n));
  const etiqueta = (ms) => {
    const [y, mm] = ms[0].split('-').map(Number);
    return n === 12 ? String(y) : n === 3 ? `T${Math.floor((mm - 1) / 3) + 1} ${y}` : `${MESES[mm - 1]} ${y}`;
  };
  return {
    per, meses, prev, n,
    ini: rangoMes(meses[0]).desde, fin: rangoMes(meses[n - 1]).hasta,
    pini: rangoMes(prev[0]).desde, pfin: rangoMes(prev[n - 1]).hasta,
    etiqueta: etiqueta(meses) + (n === 3 ? ` · ${MES3[+meses[0].slice(5) - 1]}–${MES3[+meses[2].slice(5) - 1]}` : ''),
    etiquetaPrev: etiqueta(prev),
  };
}

// Filas del mes con el mismo cálculo del total mensual (datos.resumenMes)
const filasMes = async (ctx, base, mes) => (await resumenMes(ctx, base, mes)).filas;

// Libro de un mes
export async function libroMes(ctx, base, mes) {
  const hoy = hoyISO();
  const { desde, hasta } = rangoMes(mes);
  if (desde > hoy) return [];
  const filas = await filasMes(ctx, base, mes);
  if (!filas.some((f) => f.detalle.length)) return [];   // mes sin registros (antes de usar el sistema): no se inventan sueldos
  const contable = !!base.config.ajuste_contable;
  const diasMes = [];
  for (let d = desde; d <= hasta && d <= hoy; d = sumarDias(d, 1)) diasMes.push(d);
  const nDias = Number(hasta.slice(8));
  const devengo = diasMes.length / nDias;
  const out = [];

  for (const f of filas) {
    const pid = f.vinculo.persona_id;
    const push = (fecha, faena, c, monto, min = 0) => { if (monto || min) out.push({ fecha, faena, cliente: clienteDe(faena), pid, c, m: monto, min }); };
    const celdas = []; let minTot = 0; let vuAsignado = 0;
    for (const d of f.detalle) {
      const monto = contable ? d.contable : d.real;
      const totF = d.faenas.reduce((s, x) => s + x.min, 0);
      d.faenas.forEach((x) => {
        const min = totF ? (x.min * d.min) / totF : 0;   // horas sin solapes, por faena
        const parte = d.porFaena ? (contable ? x.contable : x.real) : totF ? (monto * x.min) / totF : monto / d.faenas.length;
        push(d.fecha, x.faena, 'tr', parte, min);
        if (min > 0) { celdas.push({ fecha: d.fecha, faena: x.faena, min }); minTot += min; }
      });
      if (!d.faenas.length && monto) push(d.fecha, '', 'tr', monto);
      // Vueltas del Registro de horas, a su faena
      const vu = new Map();
      for (const r of d.registros) if (r.vueltas) { const k = String(r.faena ?? '').trim(); vu.set(k, (vu.get(k) ?? 0) + r.vueltas); }
      for (const [fa, n] of vu) { push(d.fecha, fa, 'vu', n * f.vv); vuAsignado += n * f.vv; }
    }
    const repartir = (c, monto) => {
      if (!monto) return;
      if (minTot > 0) for (const x of celdas) push(x.fecha, x.faena, c, (monto * x.min) / minTot);
      else if (diasMes.length) for (const fecha of diasMes) push(fecha, '', c, monto / diasMes.length);
    };
    repartir('su', (f.sueldo || 0) * devengo);
    repartir('vu', f.montoVueltas - vuAsignado);   // vueltas del chofer (Vehículos)
    repartir('ex', f.extra + (f.bonoAutos || 0) + (f.aguinaldo || 0));   // el anticipo no es costo: ya es parte del sueldo
    repartir('de', -f.descuento);
  }
  return out;
}

// Libro del período y del anterior (en paralelo)
export async function libroPeriodo(ctx, base, P) {
  const meses = [...P.prev, ...P.meses];
  const libros = await Promise.all(meses.map((m) => libroMes(ctx, base, m)));
  return libros.flat();
}

// Suma de movimientos
export function sumar(rows) {
  const s = { m: 0, bruto: 0, min: 0, c: { tr: 0, su: 0, vu: 0, ex: 0, de: 0 }, dias: new Set(), pids: new Set(), faenas: new Set(), clientes: new Set() };
  for (const r of rows) {
    s.m += r.m; s.c[r.c] += r.m; if (r.c !== 'de') s.bruto += r.m; s.min += r.min;
    if (r.min > 0) { s.dias.add(r.fecha); s.pids.add(r.pid); if (r.faena) { s.faenas.add(r.faena); s.clientes.add(r.cliente); } }
  }
  return { ...s, nDias: s.dias.size, nPer: s.pids.size, nFae: s.faenas.size, nCli: s.clientes.size, ph: s.min ? s.m / (s.min / 60) : 0 };
}

export function agrupar(rows, clave) {
  const g = new Map();
  for (const r of rows) { const k = clave(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g].map(([k, rs]) => ({ k, rows: rs, ...sumar(rs) }));
}
