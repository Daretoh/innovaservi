// Cliente Supabase de la organización activa. Versión fija desde CDN (08 Seguridad §5).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { configurarArchivos } from './adjuntos.js?v=462b5ff';

let cliente = null;
let organizacion = null;

export async function iniciarApi() {
  const resp = await fetch(new URL('./config/tenants.json?v=462b5ff', import.meta.url));
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
  configurarArchivos(conf.archivosUrl);   // Worker de R2 (si no hay, Supabase Storage)
  return { cliente, organizacion };
}

export function db() {
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
  return organizacion;
}
