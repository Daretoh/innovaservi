// ============================================================
//  InnovaServi — Puente R2 (Cloudflare Worker)
//  - POST /         : sube un archivo a R2 (exige sesión de Supabase).
//  - POST /firmar   : recibe {keys:[...]} con sesión de Supabase y devuelve
//                     una URL firmada de corta duración por cada key.
//  - GET  /<key>?exp=...&sig=... : sirve el objeto SOLO si la firma es válida
//                     y no venció (con CORS, sirve también para el PDF).
//
//  Los archivos ya NO se leen por la URL pública del bucket (pub-....r2.dev):
//  hay que desactivar "Public access → R2.dev subdomain" en Cloudflare.
//
//  Configurar en Cloudflare (Settings del Worker):
//    - Binding R2:  Variable name = BUCKET   ->  tu bucket de InnovaServi
//    - Variable    SUPABASE_URL   = https://oabtbzrfgwadnooexdwd.supabase.co
//    - Variable    SUPABASE_ANON  = sb_publishable_Uz01bxGvGArhB-h4KOvbqA_WtQg1zer
//    - Secreto     FIRMA_SECRET (o FIRMA_SECRETS) = texto largo al azar (ver README)
//    - (Transición) Variable GET_PUBLICO = 1  -> el GET sin firma sigue
//      funcionando como antes. Borrarla cuando la app nueva esté publicada.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-filename, x-folder",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const TTL_DEF = 3600;        // 1 hora
const TTL_MAX = 6 * 3600;    // tope que puede pedir la app
const MAX_KEYS = 200;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}

async function validarSesion(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const u = await fetch((env.SUPABASE_URL || "").replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { "Authorization": auth, "apikey": env.SUPABASE_ANON || "" },
    });
    return u.ok;
  } catch (e) {
    return false;
  }
}

async function hmac(secret, texto) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto)));
  let b = ""; for (const x of s) b += String.fromCharCode(x);
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function igual(a, b) {   // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// Acepta FIRMA_SECRET o FIRMA_SECRETS (en Cloudflare quedó con S).
function secreto(env) { return env.FIRMA_SECRET || env.FIRMA_SECRETS || ""; }
function limpiarKey(k) { return String(k || "").replace(/^\/+/, "").split(/[?#]/)[0]; }

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const url = new URL(request.url);

    // ---- GET: servir un objeto de R2 (solo con firma válida) ----
    if (request.method === "GET") {
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!key) return json({ ok: true, worker: "innovaservi-r2" }, 200);
      const exp = parseInt(url.searchParams.get("exp") || "0", 10);
      const sig = url.searchParams.get("sig") || "";
      let firmado = false;
      if (sig && secreto(env)) {
        const ok = igual(await hmac(secreto(env), key + "\n" + exp), sig);
        if (ok && exp > Math.floor(Date.now() / 1000)) firmado = true;
        else return json({ error: "Enlace vencido o no válido" }, 403);
      }
      if (!firmado && env.GET_PUBLICO !== "1") return json({ error: "Requiere enlace firmado" }, 403);
      try {
        const obj = await env.BUCKET.get(key);
        if (!obj) return json({ error: "No existe" }, 404);
        const h = new Headers(CORS);
        h.set("content-type", (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream");
        const resta = firmado ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 0;
        h.set("cache-control", firmado ? ("private, max-age=" + resta) : "private, max-age=0");
        h.set("x-content-type-options", "nosniff");
        if (obj.httpEtag) h.set("etag", obj.httpEtag);
        return new Response(obj.body, { headers: h });
      } catch (e) {
        return json({ error: "No se pudo leer: " + (e && e.message || e) }, 500);
      }
    }

    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

    // 1) validar sesión de Supabase (solo usuarios logueados suben o piden firmas)
    if (!(await validarSesion(request, env))) return json({ error: "Sin sesión o sesión inválida" }, 401);

    // ---- POST /firmar: URLs firmadas de corta duración ----
    if (url.pathname.replace(/\/+$/, "") === "/firmar") {
      if (!secreto(env)) return json({ error: "Falta FIRMA_SECRET en el Worker" }, 500);
      let body = null; try { body = await request.json(); } catch (_) {}
      const keys = (body && Array.isArray(body.keys) ? body.keys : []).slice(0, MAX_KEYS);
      const ttl = Math.min(TTL_MAX, Math.max(60, parseInt((body && body.ttl) || TTL_DEF, 10) || TTL_DEF));
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const base = url.origin;
      const urls = {};
      for (const k0 of keys) {
        const k = limpiarKey(k0); if (!k) continue;
        const sig = await hmac(secreto(env), k + "\n" + exp);
        urls[k0] = base + "/" + k.split("/").map(encodeURIComponent).join("/") + "?exp=" + exp + "&sig=" + sig;
      }
      return json({ ok: true, exp, urls }, 200);
    }

    // 2) subida: armar la ruta y guardar en R2
    const folder = (request.headers.get("x-folder") || "varios").replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/^\/+|\/+$/g, "");
    const fname = (request.headers.get("x-filename") || "archivo").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = folder + "/" + Date.now() + "_" + fname;
    try {
      const buf = await request.arrayBuffer(); // buffer completo = subida confiable
      await env.BUCKET.put(key, buf, {
        httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
      });
    } catch (e) {
      return json({ error: "No se pudo guardar en R2: " + (e && e.message || e) }, 500);
    }
    return json({ ok: true, key }, 200);
  },
};
