# Puente R2 — InnovaServi (Cloudflare Worker)

La app usa este Worker para **subir** archivos a R2 y para **verlos** con un enlace
firmado de corta duración (1 hora). Los archivos de R2 no son públicos: sin sesión
no se pueden abrir.

| Ruta | Qué hace | Requiere |
|---|---|---|
| `POST /` | Sube un archivo (headers `x-folder`, `x-filename`) | Sesión de Supabase (`Authorization: Bearer …`) |
| `POST /firmar` | `{keys:[...], ttl}` → `{exp, urls:{key: url}}` (ttl máx. 6 h) | Sesión de Supabase |
| `GET /<key>?exp=…&sig=…` | Entrega el archivo (con CORS) si la firma es válida y no venció | Firma |

## Configuración (Worker → Settings → Variables and Secrets / Bindings)

- **R2 bucket binding**: `BUCKET` → bucket de InnovaServi.
- **Texto** `SUPABASE_URL` = `https://oabtbzrfgwadnooexdwd.supabase.co`
- **Texto** `SUPABASE_ANON` = `sb_publishable_Uz01bxGvGArhB-h4KOvbqA_WtQg1zer`
- **Secreto** `FIRMA_SECRET` = texto largo al azar (no se guarda en el repo). Para generarlo:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
  Si se cambia, los enlaces ya entregados dejan de funcionar (la app pide nuevos sola).
- **Texto** `GET_PUBLICO` = `1` **solo durante la transición**: el `GET` sin firma sigue
  funcionando como antes. Se borra al terminar (paso 4 de `supabase/storage-privado/README.md`).

## Desplegar

Workers & Pages → el Worker (`polished-dawn-d751`) → **Edit code** → pegar `worker.js` → **Deploy**.
Para volver atrás: Worker → **Deployments** → versión anterior → **Rollback**.

## Bucket

Cloudflare → **R2** → bucket → **Settings** → **Public access → R2.dev subdomain** debe quedar
**desactivado** (si queda activo, `pub-….r2.dev/<key>` sigue abriendo cualquier archivo sin sesión).
Revisar también que no haya un **Custom domain** público conectado al bucket.
