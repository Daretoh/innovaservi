# Puente de subida a R2 — InnovaServi (pasos)

La app necesita este "Worker" para poder subir fotos y videos a tu bucket de R2.
Es lo mismo que ya tienes en IS Performance, pero para InnovaServi. Una sola vez.

## 1. Hacer el bucket público (para poder ver las fotos)
1. Cloudflare → **R2** → tu bucket de InnovaServi → pestaña **Settings**.
2. En **Public access → R2.dev subdomain** → **Allow Access**.
3. Copia la URL que aparece, tipo `https://pub-xxxxxxxx.r2.dev` → **eso es la URL pública**.

## 2. Crear el Worker (el puente)
1. Cloudflare → **Workers & Pages** → **Create** → **Worker** → ponle nombre, ej. `innovaservi-r2` → **Deploy**.
2. Entra al Worker → **Edit code** → borra todo y pega el contenido de `worker.js` (este mismo folder) → **Deploy**.
3. La URL del Worker queda tipo `https://innovaservi-r2.TUCUENTA.workers.dev` → **esa es la URL del Worker**.

## 3. Conectar el Worker con tu bucket y tu login (Settings del Worker)
Worker → **Settings** → **Variables and Secrets** / **Bindings**:
- **R2 bucket binding**: Variable name = `BUCKET` → elige tu bucket de InnovaServi.
- **Variable de texto** `SUPABASE_URL` = `https://oabtbzrfgwadnooexdwd.supabase.co`
- **Variable de texto** `SUPABASE_ANON` = `sb_publishable_Uz01bxGvGArhB-h4KOvbqA_WtQg1zer`

Guarda / **Deploy** de nuevo.

## 4. Pasarme los 2 datos
- **URL del Worker** (paso 2.3)
- **URL pública** (paso 1.3)

Con eso enchufo la app y listo. (Mientras tanto voy construyendo la app.)
