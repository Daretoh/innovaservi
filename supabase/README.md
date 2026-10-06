# Base de datos (Supabase) — migraciones versionadas

El objetivo es que **todo cambio de base de datos quede escrito en el repo** (como código),
en vez de aplicarse suelto a mano en el panel de Supabase. Así son rastreables y reproducibles.

## Qué hay aquí

- `migrations/` — los cambios de esquema, en orden por fecha (`AAAAMMDDHHMMSS_nombre.sql`).
  - `20260101000000_baseline_schema.sql` — foto del esquema actual (ya aplicado en producción).
  - `20261005000000_permisos_v2.sql` — permisos v2 (ya aplicado).

> Los `.sql` originales siguen en `app/db/` por compatibilidad; la carpeta `supabase/migrations/`
> es la fuente de verdad de aquí en adelante.

## Cómo agregar un cambio nuevo

1. Instala la CLI de Supabase una vez: https://supabase.com/docs/guides/cli
2. Crea el archivo de migración:
   ```bash
   supabase migration new nombre_del_cambio
   ```
   Escribe el SQL **idempotente** (usa `if not exists`, `add column if not exists`, etc.).
3. Pruébalo y aplícalo a producción (revisado, desde tu equipo):
   ```bash
   supabase link --project-ref oabtbzrfgwadnooexdwd
   supabase db push
   ```

## (Opcional, más adelante) Aplicar por CI

Se puede automatizar `supabase db push` con un workflow de GitHub Actions, pero necesita
guardar en **Settings → Secrets → Actions** del repo:

- `SUPABASE_ACCESS_TOKEN` (token personal de la CLI)
- `SUPABASE_DB_PASSWORD` (contraseña de la base)

No se dejó activado para no tocar la base en producción sin querer. Cuando quieras, se arma.
