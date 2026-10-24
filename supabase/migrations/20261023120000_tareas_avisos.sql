-- Tareas etapa 2: avisos por persona (bandeja). tipo: mencion (@ en una observación) | recordatorio (botón Recordar).
create table if not exists public.tareas_avisos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  email text not null,          -- a quién le llega
  tipo text not null default 'mencion',
  autor text,
  texto text default '',
  created_at timestamptz default now(),
  leido_at timestamptz
);
alter table public.tareas_avisos enable row level security;
drop policy if exists tareas_avisos_equipo on public.tareas_avisos;
create policy tareas_avisos_equipo on public.tareas_avisos for all to authenticated using (true) with check (true);
create index if not exists tareas_avisos_email_idx on public.tareas_avisos (lower(email), created_at desc);
