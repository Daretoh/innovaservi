-- Tareas v2: estado 'en_proceso', 2do responsable, menciones y bitácora de observaciones.
-- estado: pendiente | en_proceso | hecha
alter table public.tareas add column if not exists responsable2_email text;
alter table public.tareas add column if not exists responsable2_nombre text;
alter table public.tareas add column if not exists menciones text[] default '{}';
alter table public.tareas add column if not exists prio_desde timestamptz default now();   -- desde cuándo tiene la prioridad actual (para subirla sola)
alter table public.tareas add column if not exists updated_at timestamptz default now();
update public.tareas set prio_desde = created_at where prio_desde is null or prio_desde > created_at;
create index if not exists tareas_resp2_idx on public.tareas (lower(responsable2_email));

-- Observaciones / seguimiento de cada tarea (y cambios de estado).
create table if not exists public.tareas_obs (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  autor text,
  texto text not null,
  tipo text default 'obs',   -- obs | estado
  created_at timestamptz default now()
);
alter table public.tareas_obs enable row level security;
drop policy if exists tareas_obs_equipo on public.tareas_obs;
create policy tareas_obs_equipo on public.tareas_obs for all to authenticated using (true) with check (true);
create index if not exists tareas_obs_tarea_idx on public.tareas_obs (tarea_id, created_at);

-- Equipo de Tareas: personas con el apartado 'tareas' visible en Accesos (o rol admin / su rol lo incluye).
-- security definer: cualquier usuario del equipo puede ver a quién asignar, sin leer la tabla permisos.
create or replace function public.tareas_equipo()
returns table(email text, nombre text)
language sql stable security definer set search_path = public as $$
  select lower(p.email), coalesce(nullif(p.nombre,''), p.email)
  from public.permisos p
  left join public.roles_perm r on r.clave = p.rol
  where p.rol = 'admin'
     or coalesce(p.secciones->'tareas'->>'n', '') in ('ver','editar','total')
     or (coalesce((p.secciones->>'_v')::int, 0) <> 2 and coalesce(r.perm->'tareas'->>'n', r.perm->>'tareas', '') in ('ver','editar','total'))
$$;
revoke all on function public.tareas_equipo() from public, anon;
grant execute on function public.tareas_equipo() to authenticated;
