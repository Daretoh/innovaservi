-- Costos (beta): boletas y facturas de compras leídas con el lector (foto, timbre SII o XML).
-- Mientras está en beta solo lo ven y cargan Enzo, Jorge y Cristopher (costos_beta()).
create or replace function public.costos_beta() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = any (array[
    'enzo.castro@innovaservi.com','enzo.castro@innovaservi.cl',
    'jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com']);
$$;
grant execute on function public.costos_beta() to authenticated;

create table if not exists public.costos_docs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  subido_por text not null default lower(coalesce(auth.jwt()->>'email','')),   -- quién lo cargó (lo pone la base, no el navegador)
  evento_id uuid references public.eventos(id) on delete set null,             -- faena asignada
  faena text default '',                                                       -- nombre de la faena al momento de cargar
  tipo_dte int,                -- 33 factura, 39 boleta, 61 nota de crédito…
  folio text,
  fecha date,
  rut_emisor text,
  razon_social text default '',
  neto bigint, iva bigint, exento bigint, otros bigint, total bigint,
  centro_costo text default '',
  categoria text default '',
  observaciones text default '',
  origen text default 'manual',   -- timbre | xml | ocr | manual
  items jsonb default '[]'::jsonb,
  fotos jsonb default '[]'::jsonb  -- [{url, nombre}]
);
alter table public.costos_docs enable row level security;
drop policy if exists costos_docs_beta on public.costos_docs;
create policy costos_docs_beta on public.costos_docs for all to authenticated
  using (public.costos_beta()) with check (public.costos_beta());
create index if not exists costos_docs_fecha_idx on public.costos_docs (fecha desc);
create index if not exists costos_docs_evento_idx on public.costos_docs (evento_id);
-- Un mismo documento (emisor + tipo + folio) no se puede cargar dos veces
create unique index if not exists costos_docs_unico on public.costos_docs (rut_emisor, tipo_dte, folio)
  where rut_emisor is not null and tipo_dte is not null and folio is not null and folio <> '';

-- El usuario que sube lo fija la base (no se puede falsear desde el navegador ni cambiar después)
create or replace function public.costos_docs_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.subido_por := lower(coalesce(auth.jwt()->>'email',''));
  else new.subido_por := old.subido_por; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists costos_docs_autor on public.costos_docs;
create trigger costos_docs_autor before insert or update on public.costos_docs
  for each row execute function public.costos_docs_autor();

-- Las funciones no se exponen a usuarios sin sesión
revoke execute on function public.costos_beta() from public, anon;
grant execute on function public.costos_beta() to authenticated;
revoke execute on function public.costos_docs_autor() from public, anon, authenticated;
