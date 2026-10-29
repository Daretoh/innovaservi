// Datos y reglas comunes de Tareas (v2, como InnovaGestión).
import { hoyISO, diaLocal } from '../../core/ui/formato.js?v=08113ef';

export const PRIORIDADES = [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']];
export const NIVELES = PRIORIDADES.map(([k]) => k);
export const nombrePrioridad = Object.fromEntries(PRIORIDADES);
export const ESTADOS = [['pendiente', 'Pendiente'], ['en_proceso', 'En proceso'], ['hecha', 'Terminada']];
export const nombreEstado = Object.fromEntries(ESTADOS);
export const CHIP_ESTADO = { pendiente: 'chip-pend', en_proceso: 'chip-prox', hecha: 'chip-ok' };
export const REPETIR = [['no', 'No se repite'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes']];

const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
export const diasHasta = (fecha) => diasEntre(hoyISO(), fecha);
export const diasAbierta = (t) => diasEntre(diaLocal(t.created_at), hoyISO());

// Prioridad "inteligente": sube sola si la tarea lleva días sin movimiento o está por vencer.
//  - sin movimiento 7 días → un nivel; 14 días → dos niveles
//  - vence en 7 días o menos → un nivel; en 2 días, hoy o vencida → Alta
export function prioridad(t) {
  const base = Math.max(0, NIVELES.indexOf(t.prioridad));
  if (t.estado === 'hecha') return { p: t.prioridad, sube: false, por: '' };
  let p = base; let por = '';
  const mov = [t.updated_at, t.prio_desde, t.created_at].filter(Boolean).sort().pop();
  const quieta = mov ? diasEntre(diaLocal(mov), hoyISO()) : 0;
  const pasos = quieta >= 14 ? 2 : quieta >= 7 ? 1 : 0;
  if (pasos && Math.min(2, base + pasos) > base) { p = Math.min(2, base + pasos); por = `Lleva ${quieta} días sin movimiento`; }
  if (t.fecha) {
    const dn = diasHasta(t.fecha);
    const v = dn <= 2 ? 2 : dn <= 7 ? Math.min(2, base + 1) : -1;
    if (v > p) { p = v; por = dn < 0 ? 'Vencida' : dn === 0 ? 'Vence hoy' : `Vence en ${dn} día${dn > 1 ? 's' : ''}`; }
  }
  return { p: NIVELES[p], sube: p > base, por };
}

// Orden: abiertas por prioridad efectiva, luego vencimiento
export const ordenar = (lista) => [...lista].sort((a, b) =>
  (a.estado === 'hecha') - (b.estado === 'hecha')
  || NIVELES.indexOf(prioridad(b).p) - NIVELES.indexOf(prioridad(a).p)
  || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'));

// Menciones: "@Nombre Apellido" de los usuarios que aparecen en el texto
export function mencionados(texto, usuarios) {
  const t = ` ${texto.toLowerCase()}`;
  return usuarios.filter((u) => t.includes(`@${u.nombre.toLowerCase()}`));
}
