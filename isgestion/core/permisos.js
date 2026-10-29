// Permisos del usuario en todas sus empresas, desde mis_permisos().
// La interfaz solo oculta; quien protege es la RLS en la base.
import { db } from './api.js?v=6f62ff2';

let porEmpresa = new Map();   // empresa_id -> Set('modulo:accion')

export async function cargarPermisos() {
  const { data, error } = await db().rpc('mis_permisos');
  if (error) throw error;
  porEmpresa = new Map();
  for (const { empresa_id, modulo_id, accion } of data) {
    if (!porEmpresa.has(empresa_id)) porEmpresa.set(empresa_id, new Set());
    porEmpresa.get(empresa_id).add(`${modulo_id}:${accion}`);
  }
}

// Devuelve puede(modulo, accion) para una empresa.
export function crearPuede(empresaId) {
  const set = porEmpresa.get(empresaId) ?? new Set();
  return (modulo, accion) => set.has(`${modulo}:${accion}`);
}
