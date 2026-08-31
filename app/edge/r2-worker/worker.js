// ============================================================
//  InnovaServi — Puente de subida a Cloudflare R2
//  Cloudflare Worker. Recibe el archivo, valida que la sesión de Supabase
//  (InnovaServi) sea válida, y lo guarda en el bucket R2. Devuelve la "key".
//  Los archivos se LEEN por la URL pública del bucket (pub-....r2.dev).
//
//  Configurar en Cloudflare (Settings del Worker):
//    - Binding R2:  Variable name = BUCKET   ->  tu bucket de InnovaServi
//    - Variable    SUPABASE_URL   = https://oabtbzrfgwadnooexdwd.supabase.co
//    - Variable    SUPABASE_ANON  = sb_publishable_Uz01bxGvGArhB-h4KOvbqA_WtQg1zer
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-filename, x-folder",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

    // 1) validar sesión de Supabase (solo usuarios logueados pueden subir)
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sin sesión" }, 401);
    try {
      const u = await fetch((env.SUPABASE_URL || "").replace(/\/+$/, "") + "/auth/v1/user", {
        headers: { "Authorization": auth, "apikey": env.SUPABASE_ANON || "" },
      });
      if (!u.ok) return json({ error: "Sesión inválida" }, 401);
    } catch (e) {
      return json({ error: "No se pudo validar la sesión" }, 401);
    }

    // 2) armar la ruta y guardar en R2
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
