// Archivos privados (08 Seguridad §3). Ruta: <empresa_id>/<modulo>/<uuid>-<nombre>. Se ven solo con URL firmada de
// corta duración. El permiso lo da puede(empresa, modulo, accion), en los archivos y en la tabla adjuntos.
// Dónde viven: en Cloudflare R2 a través del Worker cloudflare/archivos (02 Arquitectura) cuando la organización
// tiene "archivosUrl" en core/config/tenants.json; si no, en el bucket 'adjuntos' de Supabase Storage.
// Los módulos usan estas funciones o almacen(api), que tiene la misma forma que api.storage.from('adjuntos').
const BUCKET = 'adjuntos';
const MAX_BYTES = 25 * 1024 * 1024;   // igual que el límite del bucket y del Worker
let ARCHIVOS_URL = null;

// La llama core/api.js al iniciar, con la URL del Worker de la organización (o nada)
export function configurarArchivos(url) { ARCHIVOS_URL = url ? String(url).replace(/\/+$/, '') : null; }

// Cliente del Worker de R2 con la misma forma que el de Storage ({ data, error })
function clienteR2(api) {
  const pedir = async (ruta, opciones = {}) => {
    const { data: { session } } = await api.auth.getSession();
    const resp = await fetch(`${ARCHIVOS_URL}${ruta}`, { ...opciones, headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}` } });
    const cuerpo = await resp.json().catch(() => ({}));
    if (!resp.ok) return { data: null, error: { message: cuerpo.error || `Error ${resp.status} del servidor de archivos` } };
    return { data: cuerpo, error: null };
  };
  const ruta = (r) => `/${r.split('/').map(encodeURIComponent).join('/')}`;
  return {
    upload: (r, archivo, { contentType } = {}) => pedir(ruta(r), { method: 'PUT', body: archivo, headers: { 'content-type': contentType || archivo.type || 'application/octet-stream' } }),
    remove: async (rutas) => {
      for (const r of rutas) { const res = await pedir(ruta(r), { method: 'DELETE' }); if (res.error) return res; }
      return { data: rutas, error: null };
    },
    createSignedUrls: async (rutas, segundos) => {
      const res = await pedir('/firmar', { method: 'POST', body: JSON.stringify({ rutas, segundos }), headers: { 'content-type': 'application/json' } });
      if (res.error) return res;
      return { data: rutas.map((p) => ({ path: p, signedUrl: res.data.urls?.[p] ?? null, error: res.data.urls?.[p] ? null : 'Sin permiso' })), error: null };
    },
    createSignedUrl: async (r, segundos) => {
      const res = await clienteR2(api).createSignedUrls([r], segundos);
      if (res.error) return res;
      const u = res.data[0]?.signedUrl;
      return u ? { data: { signedUrl: u }, error: null } : { data: null, error: { message: 'Sin permiso para este archivo.' } };
    },
  };
}

export const almacen = (api) => (ARCHIVOS_URL ? clienteR2(api) : api.storage.from(BUCKET));

function nombreSeguro(nombre) {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80);
  return limpio || 'archivo';
}

// Sube un archivo y lo registra en la tabla adjuntos. Devuelve { id, ruta }.
// Con personaId (sin empresaId) es un archivo personal: personas/<persona>/<modulo>/…, válido en todas
// las empresas donde la persona tiene vínculo; no se registra en adjuntos (lo registra el módulo).
export async function subirArchivo(api, { empresaId = null, personaId = null, modulo, archivo, tabla = null, registroId = null, tipos = null, maxBytes = MAX_BYTES }) {
  if (!archivo) throw new Error('Elige un archivo.');
  if (archivo.size > maxBytes) throw new Error(`El archivo supera ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (tipos && !tipos.includes(archivo.type)) throw new Error('Tipo de archivo no permitido.');

  const raiz = empresaId ?? `personas/${personaId}`;
  const ruta = `${raiz}/${modulo}/${crypto.randomUUID()}-${nombreSeguro(archivo.name)}`;
  const { error: eSubir } = await almacen(api).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (eSubir) throw new Error(`No se pudo subir el archivo: ${eSubir.message}`);
  if (!empresaId) return { id: null, ruta };

  const { data, error } = await api.from('adjuntos').insert({
    empresa_id: empresaId, modulo_id: modulo, tabla, registro_id: registroId,
    nombre: archivo.name, ruta, tipo_mime: archivo.type, tamano: archivo.size,
  }).select('id').single();
  if (error) {
    await almacen(api).remove([ruta]);   // no dejar archivos sin registro
    throw new Error(`No se pudo registrar el archivo: ${error.message}`);
  }
  return { id: data.id, ruta };
}

// URL temporal para ver o descargar un archivo privado.
export async function urlFirmada(api, ruta, segundos = 120) {
  const { data, error } = await almacen(api).createSignedUrl(ruta, segundos);
  if (error) throw new Error(`No se pudo abrir el archivo: ${error.message}`);
  return data.signedUrl;
}

// Elimina el archivo y su registro.
export async function eliminarArchivo(api, ruta) {
  const { error: e1 } = await almacen(api).remove([ruta]);
  if (e1) throw new Error(`No se pudo eliminar el archivo: ${e1.message}`);
  const { error: e2 } = await api.from('adjuntos').delete().eq('ruta', ruta);
  if (e2) throw new Error(`Se eliminó el archivo, pero no su registro: ${e2.message}`);
}

// URL temporales de varias rutas a la vez: Map ruta → url (sin las que no se pueden ver)
export async function urlsFirmadas(api, rutas, segundos = 600) {
  if (!rutas.length) return new Map();
  const { data, error } = await almacen(api).createSignedUrls(rutas, segundos);
  if (error) throw new Error(`No se pudieron abrir los archivos: ${error.message}`);
  return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
