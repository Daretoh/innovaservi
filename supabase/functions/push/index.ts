// Notificaciones push (Web Push) de InnovaGestión.
//   GET  → devuelve la clave pública VAPID (la crea la primera vez y la guarda en push_config).
//   POST {accion:'enviar'} → envía lo pendiente de push_salida a los dispositivos de cada persona.
// La llama la base (pg_net) cada vez que se encola algo; sin sesión, por eso verify_jwt = false.
// No recibe mensajes de afuera: solo envía lo que ya está en la cola, así que un ping ajeno no hace daño.
// La clave privada nunca sale de aquí ni de push_config (tabla sin políticas: solo service_role).
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CONTACTO = 'mailto:enzo.castro@innovaservi.com';
// Correos que son la misma persona (se puede entrar con cualquiera de los dos): los avisos llegan a los dispositivos de ambos
const ALIAS = [['enzo.castro@innovaservi.com', 'enzo.castro@innovaservi.cl']];
function equivalentes(em: string): string[] { return ALIAS.find((g) => g.includes(em)) ?? [em]; }

let claves: { vapid: CryptoKeyPair; publica: string } | null = null;
async function cargarClaves() {
  if (claves) return claves;
  const { data } = await sb.from('push_config').select('vapid_public, vapid_jwk').eq('id', 1).maybeSingle();
  if (data?.vapid_jwk) {
    const vapid = await webpush.importVapidKeys(data.vapid_jwk as webpush.ExportedVapidKeys, { extractable: false });
    claves = { vapid, publica: data.vapid_public };
    return claves;
  }
  // Primera vez: generar y guardar (si otra instancia ganó la carrera, se usa la suya)
  const nuevas = await webpush.generateVapidKeys({ extractable: true });
  const jwk = await webpush.exportVapidKeys(nuevas);
  const publica = await webpush.exportApplicationServerKey(nuevas);
  await sb.from('push_config').upsert({ id: 1 }, { onConflict: 'id', ignoreDuplicates: true });
  await sb.from('push_config').update({ vapid_public: publica, vapid_jwk: jwk, updated_at: new Date().toISOString() }).eq('id', 1).is('vapid_jwk', null);
  const { data: d2 } = await sb.from('push_config').select('vapid_public, vapid_jwk').eq('id', 1).single();
  const vapid = await webpush.importVapidKeys(d2!.vapid_jwk as webpush.ExportedVapidKeys, { extractable: false });
  claves = { vapid, publica: d2!.vapid_public };
  return claves;
}

async function enviar() {
  const { vapid } = await cargarClaves();
  const app = await webpush.ApplicationServer.new({ contactInformation: CONTACTO, vapidKeys: vapid });
  // Toma lo pendiente de forma atómica (evita doble envío si llegan dos pings juntos)
  const { data: filas, error } = await sb.rpc('push_tomar', { lim: 200 });
  if (error) return { error: error.message };
  let ok = 0, fallos = 0, borradas = 0;
  const subsPorEmail = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>();
  for (const f of filas ?? []) {
    const em = String(f.email).toLowerCase();
    if (!subsPorEmail.has(em)) {
      const { data: s } = await sb.from('push_suscripciones').select('id, endpoint, p256dh, auth').in('email', equivalentes(em));
      subsPorEmail.set(em, s ?? []);
    }
    const subs = subsPorEmail.get(em)!;
    if (!subs.length) { await sb.from('push_salida').update({ resultado: 'sin dispositivos' }).eq('id', f.id); continue; }
    const payload = JSON.stringify({ title: f.titulo, body: f.cuerpo, url: f.url, tag: f.etiqueta || undefined });
    const res: string[] = [];
    for (const s of subs) {
      try {
        await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 86400 });
        ok++; res.push('ok');
        await sb.from('push_suscripciones').update({ ultimo_ok: new Date().toISOString() }).eq('id', s.id);
      } catch (e) {
        fallos++;
        const st = e instanceof webpush.PushMessageError ? e.response.status : 0;
        res.push(String(st || (e as Error).message));
        if (st === 404 || st === 410) { await sb.from('push_suscripciones').delete().eq('id', s.id); borradas++; }
      }
    }
    await sb.from('push_salida').update({ resultado: res.join(',').slice(0, 200) }).eq('id', f.id);
  }
  return { procesadas: (filas ?? []).length, ok, fallos, borradas };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method === 'GET') return json({ clave: (await cargarClaves()).publica });
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b?.accion === 'enviar') return json(await enviar());
      return json({ error: 'Acción no válida' }, 400);
    }
    return json({ error: 'Método no permitido' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
