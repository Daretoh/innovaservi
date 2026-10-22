// Formatos y fechas comunes (es-CL). Las fechas se manejan como texto 'aaaa-mm-dd' para evitar líos de zona horaria.

const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const dinero = (n) => { const v = Math.round(n || 0); return v < 0 ? `-${pesos.format(-v)}` : pesos.format(v); };

// 510 → "8 h 30 min"
export function horas(min) {
  const m = Math.round(min || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
}

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const aFecha = (iso) => new Date(`${iso}T12:00:00`);
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Marca de tiempo (timestamptz) → 'aaaa-mm-dd' en la hora local (cortar el texto daría el día UTC)
export const diaLocal = (ts) => (ts ? aISO(new Date(ts)) : '');

export function sumarDias(iso, n) { const d = aFecha(iso); d.setDate(d.getDate() + n); return aISO(d); }
export function lunesDe(iso) { const d = aFecha(iso); const dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); return aISO(d); }
export const diaSemana = (iso) => (aFecha(iso).getDay() + 6) % 7;   // 0 = lunes … 6 = domingo
export const esFinde = (iso) => diaSemana(iso) >= 5;

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreDia = (iso) => DIAS[diaSemana(iso)];
export const fechaCorta = (iso) => { const d = aFecha(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
export const fechaLarga = (iso) => (iso ? aFecha(iso).toLocaleDateString('es-CL') : '');
export const nombreMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`; };
export function rangoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}`, dias: ultimo };
}
export function moverMes(mes, n) { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

// Número de semana ISO
export function numSemana(iso) {
  const d = aFecha(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const enero4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - enero4) / 86400000 - 3 + ((enero4.getDay() + 6) % 7)) / 7);
}

// 'HH:MM' o 'HH:MM:SS' → minutos del día
export const aMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const hhmm = (t) => String(t || '').slice(0, 5);
