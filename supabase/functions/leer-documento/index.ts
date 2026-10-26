// Lee una boleta o factura con IA (Gemini) y devuelve sus datos en JSON.
// Solo para quien tiene acceso a Finanzas (fin_carga()). La clave va como secreto GEMINI_API_KEY
// (Supabase → Edge Functions → Secrets); nunca en el navegador. Modelo: GEMINI_MODEL (opcional).
// Entrada: { images: [{ mime: 'image/jpeg', data: '<base64>' }] } — 1 a 4 fotos del MISMO documento.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
const PROMPT = [
  'Eres el lector de documentos tributarios de una empresa chilena (INNOVACION Y SERVICIOS SPA, RUT 77.647.955-1, es el RECEPTOR: nunca es el emisor).',
  'Las imágenes son fotos de UN solo documento (boleta, factura, nota de crédito, guía o comprobante de peaje/estacionamiento), a veces en varias partes.',
  'Lee solo lo que se ve. Si un dato no aparece o no se lee con seguridad, ponlo en null y dilo en "observaciones". No inventes ni calcules el folio, el RUT ni la fecha.',
  'Montos en pesos chilenos como enteros, sin puntos. "neto" e "iva" tal como están impresos; si es boleta y solo dice "el IVA de esta boleta es $X", iva = X y neto = total - X.',
  '"otros" = exento + impuestos específicos (combustible IEF, etc.), puede ser negativo. tipo: 33 factura, 34 factura exenta, 39 boleta, 41 boleta exenta, 61 nota de crédito, 52 guía, 0 comprobante o peaje.',
  'Responde SOLO un objeto JSON con esta forma:',
  '{"tipo":33,"folio":"123","fecha":"AAAA-MM-DD","rut":"76.123.456-7","razon":"Empresa S.A.","neto":1000,"iva":190,"otros":0,"total":1190,"items":[{"descripcion":"…","cantidad":1,"total":1190}],"medio_pago":"débito","observaciones":"…"}',
].join('\n');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL'), ANON = Deno.env.get('SUPABASE_ANON_KEY');
  const auth = req.headers.get('authorization') || '';
  if (!SUPABASE_URL || !ANON || !/^Bearer\s+\S+/.test(auth)) return json({ error: 'Sin sesión' }, 401);
  // ¿Tiene acceso a Finanzas? (misma regla que la base)
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fin_carga`, { method: 'POST', headers: { Authorization: auth, apikey: ANON, 'content-type': 'application/json' }, body: '{}' });
  if (!pr.ok || (await pr.json()) !== true) return json({ error: 'Tu cuenta no tiene acceso a Finanzas' }, 403);

  const KEY = Deno.env.get('GEMINI_API_KEY');
  if (!KEY) return json({ error: 'Falta configurar la clave de Gemini (secreto GEMINI_API_KEY en Supabase)' }, 503);
  const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';

  let body: { images?: { mime?: string; data?: string }[] };
  try { body = await req.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
  const imgs = (body.images || []).filter((x) => x && typeof x.data === 'string' && /^image\/(jpeg|png|webp)$/.test(x.mime || ''));
  if (!imgs.length) return json({ error: 'Envía al menos una foto (JPG, PNG o WebP)' }, 400);
  if (imgs.length > 4) return json({ error: 'Máximo 4 fotos por documento' }, 400);
  const bytes = imgs.reduce((s, x) => s + (x.data!.length * 3) / 4, 0);
  if (bytes > 12 * 1024 * 1024) return json({ error: 'Las fotos pesan demasiado (máx. 12 MB en total)' }, 413);

  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT }, ...imgs.map((x) => ({ inline_data: { mime_type: x.mime, data: x.data } }))] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
  const txt = await r.text();
  if (!r.ok) {
    const lim = r.status === 429;
    return json({ error: lim ? 'Se alcanzó el límite gratis de Gemini por ahora. Prueba en un rato.' : 'Gemini no respondió (' + r.status + ')', detalle: txt.slice(0, 300) }, lim ? 429 : 502);
  }
  let out: unknown = null;
  try {
    const d = JSON.parse(txt);
    const parts = d?.candidates?.[0]?.content?.parts || [];
    const s = parts.map((p: { text?: string }) => p.text || '').join('');
    const m = s.match(/\{[\s\S]*\}/);
    out = JSON.parse(m ? m[0] : s);
  } catch { return json({ error: 'La IA no devolvió datos legibles. Intenta de nuevo.' }, 502); }
  return json({ ok: true, modelo: MODEL, ms: Date.now() - t0, datos: out });
});
