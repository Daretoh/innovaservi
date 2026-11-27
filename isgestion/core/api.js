// Cliente Supabase de la organización activa. Versión fija desde CDN (08 Seguridad §5).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { configurarArchivos } from './adjuntos.js?v=5ec3c84';

let cliente = null;
let organizacion = null;

export async function iniciarApi() {
  const resp = await fetch(new URL('./config/tenants.json?v=5ec3c84', import.meta.url));
  const { organizaciones } = await resp.json();
  const host = location.hostname;
  const entrada = Object.entries(organizaciones).find(([, o]) => o.dominios.includes(host));
  if (!entrada) throw new Error(`No hay organización configurada para ${host}`);
  const [id, conf] = entrada;
  if (!conf.supabaseUrl || !conf.supabaseAnonKey) {
    throw new Error(`Falta la URL o la clave pública de Supabase para "${id}" en core/config/tenants.json`);
  }
  organizacion = { id, nombre: conf.nombre, appUrl: conf.appUrl ?? null };
  cliente = createClient(conf.supabaseUrl, conf.supabaseAnonKey);
  globalThis.__isgCliente = cliente;
  globalThis.__isgOrganizacion = organizacion;
  configurarArchivos(conf.archivosUrl);   // Worker de R2 (si no hay, Supabase Storage)
  return { cliente, organizacion };
}

export function db() {
  // Ya no se recarga la página sola (2026-11-26, reclamos: sacaba a la gente de lo que hacía). Cada versión publicada
  // queda en v/<commit>/ y no se mezclan; si igual se cargara otra copia de este archivo, usa el cliente ya iniciado.
  cliente ??= globalThis.__isgCliente ?? null;
  if (!cliente && globalThis.__isgApiIniciada) throw new Error('Hay una versión nueva de ISgestión: toca Actualizar.');   // app abierta antes del cambio
  if (!cliente) throw new Error('La API no está iniciada');
  return cliente;
}

// Dirección base de la app (funciona en la raíz del dominio o en una carpeta, ej. innovaservi.cl/isgestion/):
// urlApp('ficha/?t=x') → https://dominio/<carpeta>/ficha/?t=x
// En local (localhost) usa la dirección publicada (appUrl de tenants.json): estos enlaces se envían a otras personas
// (invitaciones, fichas, checklist) y desde localhost no les abren (2026-10-30).
const esLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);
export const urlApp = (ruta = '') => new URL(ruta, esLocal() && organizacion?.appUrl ? organizacion.appUrl
  : `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`).href;

export function organizacionActiva() {
  return organizacion ?? globalThis.__isgOrganizacion ?? null;
}
