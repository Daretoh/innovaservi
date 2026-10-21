// Sube la cédula (foto/PDF) de la ficha pública al bucket privado 'cedulas'
// usando el rol de servicio (server-side), sin depender del rol anónimo en Storage.
// Sin sesión: por eso NUNCA sobrescribe (x-upsert: false). La ficha arma una carpeta
// nueva en cada envío (ingreso/<nombre>-<rut>-<marca de tiempo>), así que no choca.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-path',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const path = (req.headers.get('x-path') || '').replace(/\\/g, '/').replace(/[^a-zA-Z0-9._/-]/g, '_');
  const ct = req.headers.get('content-type') || 'application/octet-stream';
  if (!/^ingreso\/[^/]+\/(frente|reverso|antecedentes)\.[a-zA-Z0-9]{1,10}$/.test(path) || path.includes('..')) return json({ error: 'Ruta inválida' }, 400);
  if (!/^(image\/|application\/pdf)/.test(ct)) return json({ error: 'Solo imágenes o PDF' }, 415);

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0) return json({ error: 'Archivo vacío' }, 400);
  if (buf.byteLength > 10 * 1024 * 1024) return json({ error: 'La cédula supera 10 MB' }, 413);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !KEY) return json({ error: 'Sin credenciales de servicio' }, 500);

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/cedulas/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'content-type': ct, 'x-upsert': 'false' },
    body: buf,
  });
  if (!up.ok) {
    const t = await up.text();
    if (up.status === 409 || /already exists|Duplicate/i.test(t)) return json({ error: 'Ese archivo ya existe' }, 409);
    return json({ error: 'No se pudo guardar: ' + t }, 502);
  }
  return json({ ok: true, path }, 200);
});
