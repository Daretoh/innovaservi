// Cliente Supabase de la organización activa. Versión fija desde CDN (08 Seguridad §5).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { configurarArchivos } from './adjuntos.js?v=faa3077';

let cliente = null;
let organizacion = null;

export async function iniciarApi() {
  const resp = await fetch(new URL('./config/tenants.json?v=faa3077', import.meta.url));
  const { organizaciones } = await resp.json();
  const host = location.hostname;
  const entrada = Object.entries(organizaciones).find(([, o]) => o.dominios.includes(host));
  if (!entrada) throw new Error(`No hay organización configurada para ${host}`);
  const [id, conf] = entrada;
  if (!conf.supabaseUrl || !conf.supabaseAnonKey) {
    throw new Error(`Falta la URL o la clave pública de Supabase para "${id}" en core/config/tenants.json`);
  }
  organizacion = { id, nombre: conf.nombre };
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
export const urlApp = (ruta = '') => new URL(ruta, `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`).href;

export function organizacionActiva() {
  return organizacion;
}
