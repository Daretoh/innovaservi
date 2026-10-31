// Datos y reglas compartidas de Flota.
import { hoyISO } from '../../core/ui/formato.js?v=5909720';

// [clave, nombre, ¿tiene vencimiento?]
export const CATEGORIAS = [
  ['permiso_circulacion', 'Permiso de circulación', true],
  ['revision_tecnica', 'Revisión técnica', true],
  ['soap', 'SOAP', true],
  ['seguro', 'Seguro', true],
  ['mantencion', 'Mantención', false],
  ['reparacion', 'Reparación', false],
  ['combustible', 'Combustible', false],
  ['arriendo', 'Arriendo', false],
  ['multa', 'Multa', false],
  ['peaje', 'Peaje', false],
  ['otro', 'Otro', false],
];
export const nombreCat = Object.fromEntries(CATEGORIAS.map(([k, n]) => [k, n]));
export const CON_VENCE = CATEGORIAS.filter((c) => c[2]).map((c) => c[0]);
export const TIPOS = [['vehiculo', 'Vehículo'], ['maquinaria', 'Maquinaria'], ['equipo', 'Equipo']];
export const ESTADOS = [['activo', 'Activo'], ['taller', 'En taller'], ['inactivo', 'Inactivo']];
export const DIAS_AVISO = 30;

export const etiquetaVehiculo = (v) => `${v.nombre}${v.patente ? ` · ${v.patente}` : ''}`;
export const normalizarPatente = (t) => (t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
const dias = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 86400000);

// Vencimientos de un vehículo: por categoría manda el último registro con vencimiento
export function vencimientos(registros) {
  return CON_VENCE.map((cat) => {
    const ult = registros.filter((r) => r.categoria === cat && r.vence).sort((a, b) => b.vence.localeCompare(a.vence))[0];
    if (!ult) return { cat, k: 'sin' };
    const n = dias(ult.vence);
    return { cat, k: n < 0 ? 'venc' : n <= DIAS_AVISO ? 'prox' : 'ok', n, vence: ult.vence, registro: ult };
  });
}
export const alertas = (registros) => vencimientos(registros).filter((v) => v.k === 'venc' || v.k === 'prox');
export const textoVence = (v) => (v.k === 'venc' ? `Vencido: ${nombreCat[v.cat]}` : `${nombreCat[v.cat]}: vence en ${v.n} ${v.n === 1 ? 'día' : 'días'}`);

// Vehículos (sin eliminados) con sus registros
export async function cargarFlota(ctx, { desde = null } = {}) {
  let q = ctx.api.from('flo_registros').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null);
  if (desde) q = q.or(`fecha.gte.${desde},vence.not.is.null`);
  const [v, r] = await Promise.all([
    ctx.api.from('flo_vehiculos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('nombre'),
    q.limit(5000),
  ]);
  if (v.error) throw v.error;
  if (r.error) throw r.error;
  return v.data.map((x) => ({ ...x, registros: r.data.filter((g) => g.vehiculo_id === x.id) }));
}

// ---- Mantenciones programadas: próxima por km y/o meses desde la última realizada
const KM_AVISO = 1000;
export function estadoMantencion(m, kmActual) {
  const proxKm = m.cada_km && m.ultimo_km != null ? m.ultimo_km + m.cada_km : null;
  let proxFecha = null;
  if (m.cada_meses && m.ultima_fecha) {
    const d = new Date(`${m.ultima_fecha}T12:00`); d.setMonth(d.getMonth() + m.cada_meses);
    proxFecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (proxKm == null && proxFecha == null) return { k: 'sin', proxKm, proxFecha, texto: 'Registra la primera para calcular la próxima' };
  const faltaKm = proxKm != null && kmActual != null ? proxKm - kmActual : null;
  const faltaDias = proxFecha ? dias(proxFecha) : null;
  const venc = (faltaKm != null && faltaKm <= 0) || (faltaDias != null && faltaDias < 0);
  const prox = (faltaKm != null && faltaKm <= KM_AVISO) || (faltaDias != null && faltaDias <= DIAS_AVISO);
  const partes = [proxKm != null ? `a los ${proxKm.toLocaleString('es-CL')} km${faltaKm != null ? ` (${faltaKm <= 0 ? `pasada por ${(-faltaKm).toLocaleString('es-CL')}` : `faltan ${faltaKm.toLocaleString('es-CL')}`} km)` : ''}` : null,
    proxFecha ? `el ${proxFecha.split('-').reverse().join('-')}${faltaDias != null ? ` (${faltaDias < 0 ? `hace ${-faltaDias} d` : `en ${faltaDias} d`})` : ''}` : null].filter(Boolean);
  return { k: venc ? 'venc' : prox ? 'prox' : 'ok', proxKm, proxFecha, texto: `Próxima ${partes.join(' o ')}` };
}
