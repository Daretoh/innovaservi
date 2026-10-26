// Lee una boleta o factura con IA (Gemini) y devuelve sus datos en JSON.
// Solo para quien tiene acceso a Finanzas (fin_carga()). La clave va como secreto GEMINI_API_KEY
// (Supabase → Edge Functions → Secrets); nunca en el navegador. Modelo: GEMINI_MODEL (opcional).
// Entrada: { modo, images: [{ mime: 'image/jpeg', data: '<base64>' }] } — 1 a 4 fotos del MISMO documento.
// modo: compra (boleta o factura de un proveedor) · venta (factura que emite Innova) · pago (comprobante de transferencia o pago) · sindoc (vale, ticket o papel sin documento tributario).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
const COMUN = 'Eres el lector de documentos de una empresa chilena (INNOVACION Y SERVICIOS SPA, RUT 77.647.955-1). Las imágenes son fotos de UN solo documento, a veces en varias partes. Lee solo lo que se ve: si un dato no aparece o no se lee con seguridad, ponlo en null y dilo en "observaciones". No inventes. Montos en pesos chilenos como enteros, sin puntos. Fechas AAAA-MM-DD. Responde SOLO un objeto JSON.';
const PROMPTS: Record<string, string> = {
  venta: COMUN + ' Es una factura o boleta EMITIDA por Innova: "razon" y "rut" son del CLIENTE (receptor, campo Señor(es)), nunca de Innova. Forma: {"tipo":33,"folio":"123","fecha":"AAAA-MM-DD","rut":"76.123.456-7","razon":"Cliente S.A.","neto":1000,"iva":190,"otros":0,"total":1190,"items":[{"descripcion":"…","cantidad":1,"total":1000}],"observaciones":"…"} (tipo: 33 factura, 34 exenta, 39 boleta, 61 nota de crédito).',
  pago: COMUN + ' Es un COMPROBANTE DE PAGO (transferencia, depósito, voucher de tarjeta o recibo). Forma: {"fecha":"AAAA-MM-DD","monto":10000,"medio":"transferencia|efectivo|debito|credito|cheque|otro","destinatario":"nombre de quien recibe el pago","rut_destinatario":"76.123.456-7","banco":"…","operacion":"N° de operación","glosa":"mensaje o asunto","observaciones":"…"}.',
  sindoc: COMUN + ' Es un papel SIN documento tributario (vale, ticket, recibo simple, cuenta de luz o agua, peaje sin boleta). Forma: {"fecha":"AAAA-MM-DD","monto":10000,"a_quien":"a quién se le pagó","detalle":"qué se pagó, corto","tipo_gasto":"Luz|Agua|Arriendo|Viático|Colación|Peaje|Estacionamiento|Combustible|Otro","observaciones":"…"}.',
};
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

  let body: { modo?: string; images?: { mime?: string; data?: string }[] };
  try { body = await req.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
  const imgs = (body.images || []).filter((x) => x && typeof x.data === 'string' && /^image\/(jpeg|png|webp)$/.test(x.mime || ''));
  if (!imgs.length) return json({ error: 'Envía al menos una foto (JPG, PNG o WebP)' }, 400);
  if (imgs.length > 4) return json({ error: 'Máximo 4 fotos por documento' }, 400);
  const bytes = imgs.reduce((s, x) => s + (x.data!.length * 3) / 4, 0);
  if (bytes > 12 * 1024 * 1024) return json({ error: 'Las fotos pesan demasiado (máx. 12 MB en total)' }, 413);

  const t0 = Date.now();
  const parts = [{ text: PROMPTS[body.modo || ''] || PROMPT }, ...imgs.map((x) => ({ inline_data: { mime_type: x.mime, data: x.data } }))];
  // Una llamada a un modelo. Gemini 3 piensa a fondo por defecto (más de 2 min con fotos): leer un documento no lo necesita.
  // Cada intento tiene un tope de 40 s, para responder antes de que la plataforma corte la función (150 s).
  async function llamar(modelo: string, conThinking: boolean): Promise<{ status: number; txt: string }> {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 40000);
    try {
      const gc: Record<string, unknown> = { responseMimeType: 'application/json', temperature: 0 };
      if (conThinking) gc.thinkingConfig = { thinkingLevel: Deno.env.get('GEMINI_THINKING') || 'low' };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY! },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: gc }),
      });
      return { status: r.status, txt: await r.text() };
    } catch (_e) { return { status: 504, txt: 'tiempo agotado' }; } finally { clearTimeout(timer); }
  }
  // Respaldo cuando el modelo está saturado (503/429/504): otros modelos Flash que acepte la clave, del más nuevo al más antiguo
  async function respaldos(): Promise<string[]> {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': KEY! } });
      const d = await r.json();
      return (d.models || [])
        .filter((m: { name: string; supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        // solo los Flash estables (gemini-2.5-flash, gemini-3-flash-lite…): los "preview"/"omni" no tienen cuota gratis
        .filter((n: string) => n !== MODEL && /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n))
        .sort((a: string, b: string) => b.localeCompare(a, undefined, { numeric: true }))
        .slice(0, 3);
    } catch { return []; }
  }
  let usado = MODEL, res = await llamar(MODEL, true);
  if (res.status === 400 && /thinking/i.test(res.txt)) res = await llamar(MODEL, false);   // modelo sin nivel de razonamiento
  console.log('gemini', MODEL, res.status, Date.now() - t0, 'ms', imgs.length, 'fotos');
  if ([429, 500, 503, 504].includes(res.status)) {
    for (const alt of await respaldos()) {
      if (Date.now() - t0 > 95000) break;
      let r2 = await llamar(alt, true);
      if (r2.status === 400 && /thinking/i.test(r2.txt)) r2 = await llamar(alt, false);
      console.log('gemini respaldo', alt, r2.status, Date.now() - t0, 'ms');
      if (r2.status === 200) { res = r2; usado = alt; break; }
    }
  }
  const txt = res.txt;
  if (res.status !== 200) {
    console.log('gemini error', txt.slice(0, 400));
    const msg = res.status === 429 ? 'Se alcanzó el límite gratis de Gemini por ahora. Prueba en un rato.'
      : res.status === 503 ? 'Gemini está saturado en este momento. Prueba en un rato o completa a mano.'
      : res.status === 504 ? 'Gemini se demoró demasiado. Intenta de nuevo o completa a mano.'
      : 'Gemini no respondió (' + res.status + ')';
    return json({ error: msg, detalle: txt.slice(0, 300) }, res.status === 429 ? 429 : 502);
  }
  let out: unknown = null;
  try {
    const d = JSON.parse(txt);
    const parts = d?.candidates?.[0]?.content?.parts || [];
    const s = parts.map((p: { text?: string }) => p.text || '').join('');
    const m = s.match(/\{[\s\S]*\}/);
    out = JSON.parse(m ? m[0] : s);
  } catch { return json({ error: 'La IA no devolvió datos legibles. Intenta de nuevo.' }, 502); }
  return json({ ok: true, modelo: usado, ms: Date.now() - t0, datos: out });
});
