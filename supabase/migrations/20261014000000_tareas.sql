-- Tareas asignables a personas (aparecen en Inicio como pendientes).
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text default '',
  asignado_email text,
  asignado_nombre text,
  trabajador_id text,
  prioridad text default 'normal',   -- alta | normal | baja
  estado text default 'pendiente',   -- pendiente | hecha
  vence date,
  autor text,
  created_at timestamptz default now(),
  done_at timestamptz
);
alter table public.tareas enable row level security;
drop policy if exists tareas_equipo on public.tareas;
create policy tareas_equipo on public.tareas for all to authenticated using (true) with check (true);
create index if not exists tareas_asignado_idx on public.tareas (lower(asignado_email));
create index if not exists tareas_estado_idx on public.tareas (estado);
