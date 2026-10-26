-- Tareas: archivos y fotos adjuntos.
-- El archivo se sube con subirArchivo() de la app (R2, o Supabase Storage "reportes" si R2 falla), carpeta tareas/<id de la tarea>.
-- Los archivos son privados: la app firma la URL al mostrarlos (ver ARCH en app/index.html).
create table if not exists public.tareas_adjuntos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  url text not null,
  nombre text not null default 'archivo',
  tipo text not null default 'doc',      -- image | video | doc
  tamano int,                            -- bytes (ya achicada, si es foto)
  autor text,
  created_at timestamptz default now()
);
create index if not exists tareas_adjuntos_tarea_idx on public.tareas_adjuntos (tarea_id, created_at);
alter table public.tareas_adjuntos enable row level security;

-- Igual que tareas_obs: el equipo con sesión los ve y adjunta (a su nombre).
-- Borrar: quien lo subió o los dueños.
drop policy if exists tareas_adjuntos_sel on public.tareas_adjuntos;
create policy tareas_adjuntos_sel on public.tareas_adjuntos for select to authenticated using (true);
drop policy if exists tareas_adjuntos_ins on public.tareas_adjuntos;
create policy tareas_adjuntos_ins on public.tareas_adjuntos for insert to authenticated
  with check (lower(autor) = lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists tareas_adjuntos_del on public.tareas_adjuntos;
create policy tareas_adjuntos_del on public.tareas_adjuntos for delete to authenticated
  using (lower(autor) = lower(coalesce(auth.jwt()->>'email',''))
         or lower(coalesce(auth.jwt()->>'email','')) = any (array['enzo.castro@innovaservi.com','enzo.castro@innovaservi.cl','jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com']));
