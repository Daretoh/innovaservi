# Archivos privados (Storage + R2)

Objetivo: que ningún archivo (fotos de faenas, informes PDF, cédulas, documentos de RRHH,
comprobantes, firmas) se abra sin sesión. Cada archivo se ve con un **enlace firmado de 1 hora**.

## Cómo funciona

- Las tablas **siguen guardando la misma URL de siempre** (`pub-….r2.dev/<key>` o
  `…/storage/v1/object/public/reportes/<ruta>`). No hay que migrar datos.
- La app (`app/index.html`, bloque `ARCH`) reconoce esas URLs al **mostrarlas** (`<img>`, `<a>`,
  `<video>`, `img.src = …`), al **abrirlas** (`window.open`) y al **descargarlas** (`fetch`, PDF/Excel)
  y las cambia por una firmada:
  - Supabase Storage → `createSignedUrls` (requiere sesión).
  - R2 → Worker `POST /firmar` (requiere sesión) → `GET /<key>?exp&sig`.
- Si no se puede firmar, usa la URL original (por eso publicar la app primero no rompe nada).
- Cédulas: la app ya no guarda enlaces firmados a 10 años; guarda
  `…/object/authenticated/cedulas/<ruta>` (no abre nada por sí solo) y firma al abrir.
- Link de la cuadrilla (`checklist/`): sigue sin sesión; ve solo sus fotos con la política
  `checklist_link_read` (misma regla que `checklist_link_insert`).
- Ficha de ingreso (`ficha/`): sin cambios (sube por la Edge Function `subir-cedula`).

## Orden para publicar (cada paso con VB de Enzo, y cada uno se puede deshacer)

| # | Paso | Si algo falla |
|---|---|---|
| 0 | Worker: agregar `FIRMA_SECRET` y `GET_PUBLICO=1`, desplegar `app/edge/r2-worker/worker.js` | Rollback del Worker en Cloudflare |
| 1 | Publicar la app (merge de `seguridad-archivos-privados` a `master`). **Solo después del 0**: el Worker viejo trataría `POST /firmar` como una subida y dejaría archivos basura en R2 | Revertir el merge |
| 2 | Probar 1–2 días (ver «Cómo probar») | — |
| 3 | Correr `1-aplicar.sql` (bucket `reportes` privado + políticas) | `1-deshacer.sql` |
| 4 | Cloudflare: desactivar `R2.dev subdomain` del bucket y borrar `GET_PUBLICO` del Worker | Volver a activarlos |
| 5 | (Opcional) `2-cedulas-enlaces-aplicar.sql` | `2-cedulas-enlaces-deshacer.sql` |

## Cómo probar (después del paso 1, en innovaservi.cl/app)

1. Con sesión, abrir un informe con fotos, Costos, RRHH (documentos y cédula), Vehículos,
   Empresa (procedimientos), Salidas médicas, Accidentes. Todo debe verse igual que antes.
2. DevTools → Network: las imágenes deben venir de `polished-dawn-d751…workers.dev/…?exp=…&sig=…`
   (R2) o `…/storage/v1/object/sign/…?token=…` (Supabase), **no** de `pub-….r2.dev`.
3. Generar un PDF de informe: las fotos deben salir (no en blanco).
4. Abrir el link de la cuadrilla de un checklist en una ventana privada: subir y ver una foto.
5. Llenar una ficha de ingreso de prueba con cédula (ventana privada) y abrir la cédula desde RRHH.
6. Después del paso 3/4: abrir una URL guardada (`pub-….r2.dev/…` o `…/object/public/reportes/…`)
   en una ventana privada → debe dar error (400/403/404).

## Qué se rompería si algo falla

- **Paso 3 sin la app nueva** (o celulares con la PWA vieja en caché): no se ven fotos de
  Supabase (faena_media, comprobantes de vehículos, fotos antiguas de registros). Se arregla
  recargando la app (el Service Worker se actualiza solo) o con `1-deshacer.sql`.
- **Paso 4 con Worker viejo o sin `FIRMA_SECRET`**: no se ven archivos de R2 (RRHH, empresa,
  PDF de informes, fotos de costos, firmas). Arreglo: volver a activar el subdominio r2.dev.
- **Enlaces de `pub-….r2.dev` o de `/object/public/reportes/` copiados y enviados por fuera**
  (WhatsApp, correo) dejan de abrir en el paso 3/4. La app hoy no genera ese tipo de enlace
  para clientes (el PDF se descarga y se envía como archivo), pero si alguien los copió a mano, caducan.
- Una pestaña abierta por más de 1 hora: las imágenes ya cargadas siguen; al volver a pintar
  o hacer clic, la app pide una firma nueva sola.
