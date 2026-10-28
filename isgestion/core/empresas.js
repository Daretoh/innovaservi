// Empresas del usuario y la empresa activa (se recuerda la última usada).
import { db } from './api.js?v=3a264c0';

const CLAVE = 'isg.empresa';

export async function cargarEmpresas() {
  const { data, error } = await db()
    .from('empresas')
    .select('id, rut, razon_social, nombre_fantasia, giro, direccion, telefono, email, web, color, logo_url, config')
    .order('razon_social');
  if (error) throw error;
  return data;
}

export async function cargarModulosEmpresa(empresaId) {
  const { data, error } = await db()
    .from('empresa_modulos')
    .select('modulo_id, config, pantallas_ocultas')
    .eq('empresa_id', empresaId)
    .eq('activo', true);
  if (error) throw error;
  // Config de cada módulo activo; en .ocultas, las pantallas que el equipo ocultó para esta empresa (Consola)
  const mapa = new Map(data.map((m) => [m.modulo_id, m.config]));
  mapa.ocultas = new Set(data.flatMap((m) => m.pantallas_ocultas ?? []));
  return mapa;
}

export function elegirEmpresa(empresas) {
  let guardada = null;
  try { guardada = localStorage.getItem(CLAVE); } catch { /* sin almacenamiento */ }
  return empresas.find((e) => e.id === guardada) ?? empresas[0];
}

export function recordarEmpresa(id) {
  try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento */ }
}

export function nombreEmpresa(e) {
  return e.nombre_fantasia || e.razon_social;
}
