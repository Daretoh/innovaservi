-- ============================================================
--  InnovaServi — App de reportes y horas
--  Ejecutar UNA vez en Supabase (proyecto InnovaServi):
--  Supabase → SQL Editor → New query → pegar esto → Run.
-- ============================================================

-- 1) REPORTES (fotos/videos + datos del trabajo) ------------
create table if not exists public.reportes (
  id          bigserial primary key,
  evento_id   bigint references public.eventos(id) on delete set null,
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
  evento_id   bigint references public.eventos(id) on delete set null,
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
