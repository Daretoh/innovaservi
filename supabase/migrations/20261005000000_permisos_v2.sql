-- ============================================================
-- Accesos v2: permisos por apartado + acción, roles editables, historial
-- Correr UNA vez en Supabase → SQL Editor. Es aditivo: los 3 dueños siguen pudiendo todo.
--
-- Formato de permisos.secciones (v2):
--   { "_v":2,
--     "_meta": { "activo":true, "vence":"2026-12-31"|null, "nota":"..." },
--     "multimedia": { "n":"editar", "a": { "ver":true, "subir":true, "ordenar":false, "eliminar":false } },
--     ... }
-- ============================================================

-- ¿El usuario logueado puede hacer 'modulo.accion'? (ej: puede('informe.generar'))
create or replace function public.puede(accion text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    lower(coalesce(auth.jwt()->>'email','')) = any (array['enzo.castro@innovaservi.com','jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com'])
    or exists (
      select 1 from public.permisos p
      where lower(p.email) = lower(coalesce(auth.jwt()->>'email',''))
        and coalesce((p.secciones->'_meta'->>'activo')::boolean, true)
        and (nullif(p.secciones->'_meta'->>'vence','') is null or (p.secciones->'_meta'->>'vence')::date >= current_date)
        and ((p.rol = 'admin' and split_part(accion,'.',1) <> 'accesos')
             or coalesce((p.secciones -> split_part(accion,'.',1) -> 'a' ->> split_part(accion,'.',2))::boolean, false))
    );
$$;
grant execute on function public.puede(text) to authenticated;

-- Roles editables (plantillas de permisos)
create table if not exists public.roles_perm (
  clave text primary key,
  nombre text not null,
  descripcion text,
  perm jsonb not null default '{}'::jsonb,
  orden int default 100,
  updated_at timestamptz default now()
);
alter table public.roles_perm enable row level security;
drop policy if exists roles_perm_sel on public.roles_perm;
create policy roles_perm_sel on public.roles_perm for select to authenticated using (true);
drop policy if exists roles_perm_wr on public.roles_perm;
create policy roles_perm_wr on public.roles_perm for all to authenticated
  using (public.puede('accesos.gestionar')) with check (public.puede('accesos.gestionar'));

-- Historial de cambios de accesos (solo se inserta; no se edita ni borra)
create table if not exists public.permisos_log (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  actor text,
  objetivo text,
  accion text,
  detalle jsonb
);
alter table public.permisos_log enable row level security;
drop policy if exists permisos_log_sel on public.permisos_log;
create policy permisos_log_sel on public.permisos_log for select to authenticated using (public.puede('accesos.gestionar'));
drop policy if exists permisos_log_ins on public.permisos_log;
create policy permisos_log_ins on public.permisos_log for insert to authenticated
  with check (public.puede('accesos.gestionar') and actor = lower(auth.jwt()->>'email'));

-- Accesos: Enzo o quien tenga 'accesos.gestionar'
drop policy if exists permisos_wr on public.permisos;
create policy permisos_wr on public.permisos for all to authenticated
  using (lower(auth.jwt()->>'email') = 'enzo.castro@innovaservi.com' or public.puede('accesos.gestionar'))
  with check (lower(auth.jwt()->>'email') = 'enzo.castro@innovaservi.com' or public.puede('accesos.gestionar'));

-- Eliminar informes/registros: dueños o 'informe.eliminar'
drop policy if exists registros_del on public.registros;
create policy registros_del on public.registros for delete to authenticated using (public.puede('informe.eliminar'));
