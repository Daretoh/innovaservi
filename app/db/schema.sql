-- ============================================================
--  InnovaServi — App de reportes y horas
--  Ejecutar UNA vez en Supabase (proyecto InnovaServi):
--  Supabase → SQL Editor → New query → pegar esto → Run.
-- ============================================================

-- 1) REPORTES (fotos/videos + datos del trabajo) ------------
create table if not exists public.reportes (
  id          bigserial primary key,
  evento_id   uuid references public.eventos(id) on delete set null,
  empresa     text,
  lugar       text,
  fecha       date not null default current_date,
  notas       text,
  autor       text,
  media       jsonb not null default '[]'::jsonb,   -- [{url,tipo,nombre}]
  created_at  timestamptz not null default now()
);
create index if not exists reportes_fecha_idx on public.reportes (fecha desc);
create index if not exists reportes_evento_idx on public.reportes (evento_id);

-- 2) HORAS (registro por trabajador, entrada/salida) --------
create table if not exists public.horas (
  id          bigserial primary key,
  evento_id   uuid references public.eventos(id) on delete set null,
  trabajador  text not null,
  empresa     text,
  lugar       text,
  fecha       date not null default current_date,
  entrada     text,          -- ej. "08:30"
  salida      text,          -- ej. "17:00"
  notas       text,
  autor       text,
  created_at  timestamptz not null default now()
);
create index if not exists horas_fecha_idx on public.horas (fecha desc);
create index if not exists horas_trab_idx on public.horas (trabajador);

-- 3) Seguridad (RLS): solo usuarios con sesión pueden usar ---
alter table public.reportes enable row level security;
alter table public.horas    enable row level security;

drop policy if exists reportes_auth_all on public.reportes;
create policy reportes_auth_all on public.reportes
  for all to authenticated using (true) with check (true);

drop policy if exists horas_auth_all on public.horas;
create policy horas_auth_all on public.horas
  for all to authenticated using (true) with check (true);

-- 2b) REGISTROS (unificado: 1 por trabajo; horas de varios + fotos) --
create table if not exists public.registros (
  id          bigserial primary key,
  evento_id   uuid references public.eventos(id) on delete set null,
  empresa     text,
  lugar       text,
  fecha       date not null default current_date,
  notas       text,
  horas       jsonb not null default '[]'::jsonb,   -- [{trabajador,entrada,salida}]
  media       jsonb not null default '[]'::jsonb,   -- [{url,tipo,nombre,cat,fecha}]
  autor       text,
  created_at  timestamptz not null default now()
);
create index if not exists registros_fecha_idx on public.registros (fecha desc);
create index if not exists registros_evento_idx on public.registros (evento_id);
alter table public.registros enable row level security;
-- ver / crear / actualizar: cualquier usuario con sesión (operarios adjuntan fotos = update)
drop policy if exists registros_auth_all on public.registros;
drop policy if exists registros_sel on public.registros;
drop policy if exists registros_ins on public.registros;
drop policy if exists registros_upd on public.registros;
drop policy if exists registros_del on public.registros;
create policy registros_sel on public.registros for select to authenticated using (true);
create policy registros_ins on public.registros for insert to authenticated with check (true);
create policy registros_upd on public.registros for update to authenticated using (true) with check (true);
-- ELIMINAR: solo los 3 supervisores (a nivel de base de datos)
create policy registros_del on public.registros for delete to authenticated
  using ( lower(auth.jwt() ->> 'email') in (
    'enzo.castro@innovaservi.com','jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com') );

-- 4) STORAGE: bucket público "reportes" para fotos/videos ----
insert into storage.buckets (id, name, public)
values ('reportes', 'reportes', true)
on conflict (id) do update set public = true;

-- Lectura pública (para ver las fotos por URL)
drop policy if exists reportes_files_read on storage.objects;
create policy reportes_files_read on storage.objects
  for select using (bucket_id = 'reportes');

-- Solo usuarios con sesión pueden subir / actualizar / borrar
drop policy if exists reportes_files_write on storage.objects;
create policy reportes_files_write on storage.objects
  for insert to authenticated with check (bucket_id = 'reportes');

drop policy if exists reportes_files_update on storage.objects;
create policy reportes_files_update on storage.objects
  for update to authenticated using (bucket_id = 'reportes') with check (bucket_id = 'reportes');

drop policy if exists reportes_files_delete on storage.objects;
create policy reportes_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'reportes');
