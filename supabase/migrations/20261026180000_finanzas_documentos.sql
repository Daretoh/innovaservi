-- ============================================================
-- Finanzas · subida de documentos (2026-10-26). Requiere 20261026120000_finanzas.sql. Idempotente.
-- Roles: carga = Yocelyn y Luisa (suben documentos y comprobantes; no ven caja, flujo ni balance)
--        revisa = Enzo y Cristopher (todo; revisan, validan pagos y cierran).
-- Comprobante de pago: se sube "por validar"; al validarlo, los gastos que quedan cubiertos pasan a pagados.
-- Proveedores con factura mensual (ej.: colaciones): los pagos sin factura quedan como "falta factura".
-- Archivos privados (R2 / Storage vía subirArchivo de la app) en fin_adjuntos; carpeta finanzas/<id>.
-- ============================================================

create or replace function public.fin_rol() returns text
language sql stable security definer set search_path = public as $$
  select case
    when lower(coalesce(auth.jwt()->>'email','')) = any (array['enzo.castro@innovaservi.com','enzo.castro@innovaservi.cl','cristopher.ruiz@innovaservi.com']) then 'revisa'
    when lower(coalesce(auth.jwt()->>'email','')) = any (array['yocelyn.mansilla@innovaservi.cl','luisavelasquez1801@gmail.com']) then 'carga'
  end;
$$;
revoke execute on function public.fin_rol() from public, anon;
grant execute on function public.fin_rol() to authenticated;

-- fin_beta() = puede todo (revisa). Las políticas de la migración anterior la usan.
create or replace function public.fin_beta() returns boolean
language sql stable security definer set search_path = public as $$ select public.fin_rol() = 'revisa' $$;
create or replace function public.fin_carga() returns boolean
language sql stable security definer set search_path = public as $$ select public.fin_rol() is not null $$;
revoke execute on function public.fin_carga() from public, anon;
grant execute on function public.fin_carga() to authenticated;

-- El lector de boletas también para Yocelyn (carga)
create or replace function public.costos_beta() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = any (array[
    'enzo.castro@innovaservi.com', 'enzo.castro@innovaservi.cl', 'jorge.castro@innovaservi.com', 'cristopher.ruiz@innovaservi.com',
    'luisavelasquez1801@gmail.com', 'yocelyn.mansilla@innovaservi.cl']);
$$;

-- ---------- Proveedores ----------
create table if not exists public.fin_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  rut text unique,
  modalidad text not null default 'por_compra' check (modalidad in ('por_compra','mensual')),   -- mensual: se paga por pedido y factura una vez al mes
  plazo_dias int not null default 30 check (plazo_dias between 0 and 180),
  contacto text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text default public.fin_email()
);

alter table public.fin_registros add column if not exists proveedor_id uuid references public.fin_proveedores on delete set null;
alter table public.fin_registros add column if not exists declarable boolean not null default true;   -- false = gasto sin documento tributario

-- ---------- Pagos (comprobantes) ----------
create table if not exists public.fin_pagos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  monto bigint not null check (monto > 0),
  medio text not null default 'transferencia' check (medio in ('transferencia','efectivo','debito','credito','cheque','otro')),
  proveedor_id uuid references public.fin_proveedores on delete set null,
  tercero text,
  cuenta_id uuid references public.fin_cuentas on delete set null,
  estado text not null default 'por_validar' check (estado in ('por_validar','validado','rechazado')),
  notas text,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  created_by text default public.fin_email(),
  validado_por text,
  validado_en timestamptz,
  deleted_at timestamptz
);
create index if not exists fin_pagos_estado_idx on public.fin_pagos (estado, fecha desc) where deleted_at is null;

create table if not exists public.fin_pago_registros (
  pago_id uuid not null references public.fin_pagos on delete cascade,
  registro_id uuid not null references public.fin_registros on delete cascade,
  monto bigint not null check (monto > 0),
  created_at timestamptz not null default now(),
  primary key (pago_id, registro_id)
);
create index if not exists fin_pago_registros_reg_idx on public.fin_pago_registros (registro_id);

-- ---------- Adjuntos (documento, foto, comprobante) ----------
create table if not exists public.fin_adjuntos (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid references public.fin_registros on delete cascade,
  pago_id uuid references public.fin_pagos on delete cascade,
  url text not null,
  nombre text not null default 'archivo',
  tipo text not null default 'doc',
  tamano int,
  autor text default public.fin_email(),
  created_at timestamptz not null default now(),
  check ((registro_id is null) <> (pago_id is null))
);
create index if not exists fin_adjuntos_reg_idx on public.fin_adjuntos (registro_id);
create index if not exists fin_adjuntos_pago_idx on public.fin_adjuntos (pago_id);

-- ---------- Categorías nuevas (gastos sin documento) ----------
insert into public.fin_categorias (nombre, clase, orden) values
  ('Viáticos y colaciones','costo_directo',26), ('Estacionamientos','costo_directo',27)
on conflict (nombre) do nothing;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['fin_proveedores','fin_pagos','fin_pago_registros','fin_adjuntos'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;

-- Categorías y centros: los ve quien carga
drop policy if exists fin_categorias_sel_carga on public.fin_categorias;
create policy fin_categorias_sel_carga on public.fin_categorias for select to authenticated using (public.fin_carga());
drop policy if exists fin_centros_sel_carga on public.fin_centros;
create policy fin_centros_sel_carga on public.fin_centros for select to authenticated using (public.fin_carga());

-- Registros: carga ve todos, crea solo en Pendiente y corrige los suyos mientras sigan Pendientes
drop policy if exists fin_registros_sel_carga on public.fin_registros;
create policy fin_registros_sel_carga on public.fin_registros for select to authenticated using (public.fin_carga());
drop policy if exists fin_registros_ins_carga on public.fin_registros;
create policy fin_registros_ins_carga on public.fin_registros for insert to authenticated
  with check (public.fin_carga() and estado = 'pendiente' and recurrente_id is null);
drop policy if exists fin_registros_upd_carga on public.fin_registros;
create policy fin_registros_upd_carga on public.fin_registros for update to authenticated
  using (public.fin_rol() = 'carga' and estado = 'pendiente' and created_by = public.fin_email())
  with check (public.fin_rol() = 'carga' and estado = 'pendiente' and created_by = public.fin_email());

-- Proveedores: carga ve y agrega; revisa edita y borra
drop policy if exists fin_proveedores_sel on public.fin_proveedores;
create policy fin_proveedores_sel on public.fin_proveedores for select to authenticated using (public.fin_carga());
drop policy if exists fin_proveedores_ins on public.fin_proveedores;
create policy fin_proveedores_ins on public.fin_proveedores for insert to authenticated with check (public.fin_carga());
drop policy if exists fin_proveedores_upd on public.fin_proveedores;
create policy fin_proveedores_upd on public.fin_proveedores for update to authenticated using (public.fin_beta()) with check (public.fin_beta());
drop policy if exists fin_proveedores_del on public.fin_proveedores;
create policy fin_proveedores_del on public.fin_proveedores for delete to authenticated using (public.fin_beta());

-- Pagos: carga sube "por validar" y corrige los suyos; solo revisa valida o rechaza
drop policy if exists fin_pagos_sel on public.fin_pagos;
create policy fin_pagos_sel on public.fin_pagos for select to authenticated using (public.fin_carga());
drop policy if exists fin_pagos_ins on public.fin_pagos;
create policy fin_pagos_ins on public.fin_pagos for insert to authenticated
  with check (public.fin_beta() or (public.fin_carga() and estado = 'por_validar' and validado_por is null));
drop policy if exists fin_pagos_upd on public.fin_pagos;
create policy fin_pagos_upd on public.fin_pagos for update to authenticated using (public.fin_beta()) with check (public.fin_beta());
drop policy if exists fin_pagos_upd_carga on public.fin_pagos;
create policy fin_pagos_upd_carga on public.fin_pagos for update to authenticated
  using (public.fin_rol() = 'carga' and estado = 'por_validar' and created_by = public.fin_email())
  with check (public.fin_rol() = 'carga' and estado = 'por_validar' and validado_por is null and created_by = public.fin_email());
revoke delete on public.fin_pagos from authenticated;

-- Vínculos pago ↔ gasto: carga solo en sus pagos por validar
drop policy if exists fin_pago_registros_sel on public.fin_pago_registros;
create policy fin_pago_registros_sel on public.fin_pago_registros for select to authenticated using (public.fin_carga());
drop policy if exists fin_pago_registros_ins on public.fin_pago_registros;
create policy fin_pago_registros_ins on public.fin_pago_registros for insert to authenticated
  with check (public.fin_beta() or exists (select 1 from public.fin_pagos p where p.id = pago_id and p.estado = 'por_validar' and p.created_by = public.fin_email() and public.fin_carga()));
drop policy if exists fin_pago_registros_del on public.fin_pago_registros;
create policy fin_pago_registros_del on public.fin_pago_registros for delete to authenticated
  using (public.fin_beta() or exists (select 1 from public.fin_pagos p where p.id = pago_id and p.estado = 'por_validar' and p.created_by = public.fin_email() and public.fin_carga()));

-- Adjuntos: carga ve y sube; quita solo los suyos
drop policy if exists fin_adjuntos_sel on public.fin_adjuntos;
create policy fin_adjuntos_sel on public.fin_adjuntos for select to authenticated using (public.fin_carga());
drop policy if exists fin_adjuntos_ins on public.fin_adjuntos;
create policy fin_adjuntos_ins on public.fin_adjuntos for insert to authenticated with check (public.fin_carga() and autor = public.fin_email());
drop policy if exists fin_adjuntos_del on public.fin_adjuntos;
create policy fin_adjuntos_del on public.fin_adjuntos for delete to authenticated using (public.fin_beta() or (public.fin_carga() and autor = public.fin_email()));

-- ---------- Proveedor automático por RUT ----------
create or replace function public.fin_registros_proveedor() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; r text;
begin
  if new.tipo <> 'gasto' or new.proveedor_id is not null then return new; end if;
  r := nullif(upper(regexp_replace(coalesce(new.tercero_rut,''), '[^0-9kK-]', '', 'g')), '');
  if r is null then
    if nullif(trim(coalesce(new.tercero,'')),'') is not null then
      select id into pid from fin_proveedores where lower(nombre) = lower(trim(new.tercero)) limit 1;
      new.proveedor_id := pid;
    end if;
    return new;
  end if;
  select id into pid from fin_proveedores where rut = r;
  if pid is null then
    insert into fin_proveedores (nombre, rut, created_by) values (coalesce(nullif(trim(new.tercero),''), r), r, coalesce(new.created_by,'sistema'))
    on conflict (rut) do nothing returning id into pid;
    if pid is null then select id into pid from fin_proveedores where rut = r; end if;
  end if;
  new.proveedor_id := pid;
  return new;
end $$;
revoke execute on function public.fin_registros_proveedor() from public, anon, authenticated;
drop trigger if exists fin_registros_proveedor on public.fin_registros;
create trigger fin_registros_proveedor before insert or update of tercero, tercero_rut, proveedor_id on public.fin_registros
  for each row execute function public.fin_registros_proveedor();

-- ---------- Pagado según comprobantes validados ----------
create or replace function public.fin_recalc_registro(p_reg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r fin_registros; pagado bigint; ult date; cta uuid; n int;
begin
  select * into r from fin_registros where id = p_reg; if not found then return; end if;
  select count(*), coalesce(sum(l.monto) filter (where p.estado = 'validado'),0), max(p.fecha) filter (where p.estado = 'validado'),
         (array_agg(p.cuenta_id order by p.fecha desc) filter (where p.estado = 'validado' and p.cuenta_id is not null))[1]
    into n, pagado, ult, cta
  from fin_pago_registros l join fin_pagos p on p.id = l.pago_id and p.deleted_at is null
  where l.registro_id = p_reg;
  if n = 0 then return; end if;                                   -- sin comprobantes: no se toca (pago anotado a mano)
  if pagado >= abs(r.total) and r.fecha_pago is null then
    update fin_registros set fecha_pago = ult, cuenta_id = coalesce(cuenta_id, cta),
           estado = case when categoria_id is not null and centro_id is not null then 'pagado' else estado end
    where id = p_reg;
  elsif pagado < abs(r.total) and r.fecha_pago is not null then
    update fin_registros set fecha_pago = null, estado = case when estado = 'pagado' then 'listo' else estado end where id = p_reg;
  end if;
end $$;
revoke execute on function public.fin_recalc_registro(uuid) from public, anon, authenticated;

create or replace function public.fin_pagos_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'fin_pago_registros' then
    perform fin_recalc_registro(coalesce(new.registro_id, old.registro_id));
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.estado = 'validado' and old.estado <> 'validado' then
    new.validado_por := public.fin_email(); new.validado_en := now();
  end if;
  if tg_op = 'UPDATE' and new.estado <> 'validado' and old.estado = 'validado' then
    new.validado_por := null; new.validado_en := null;
  end if;
  return new;
end $$;
create or replace function public.fin_pagos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  if (new.estado, new.monto, new.fecha, new.deleted_at, new.cuenta_id) is distinct from (old.estado, old.monto, old.fecha, old.deleted_at, old.cuenta_id) then
    for x in select registro_id from fin_pago_registros where pago_id = new.id loop perform fin_recalc_registro(x.registro_id); end loop;
  end if;
  return new;
end $$;
revoke execute on function public.fin_pagos_recalc() from public, anon, authenticated;
revoke execute on function public.fin_pagos_despues() from public, anon, authenticated;
drop trigger if exists fin_pagos_bu on public.fin_pagos;
create trigger fin_pagos_bu before update on public.fin_pagos for each row execute function public.fin_pagos_recalc();
drop trigger if exists fin_pagos_au on public.fin_pagos;
create trigger fin_pagos_au after update on public.fin_pagos for each row execute function public.fin_pagos_despues();
drop trigger if exists fin_pago_registros_aiud on public.fin_pago_registros;
create trigger fin_pago_registros_aiud after insert or update or delete on public.fin_pago_registros for each row execute function public.fin_pagos_recalc();

-- ---------- Lector: las fotos del documento pasan a adjuntos ----------
create or replace function public.fin_desde_costos_doc_adj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into fin_adjuntos (registro_id, url, nombre, tipo, autor)
  select g.id, f->>'url', coalesce(nullif(f->>'nombre',''),'documento'), case when (f->>'url') ~* '\.(xml|pdf)$' then 'doc' else 'image' end, coalesce(new.subido_por,'lector')
  from fin_registros g, jsonb_array_elements(case when jsonb_typeof(new.fotos) = 'array' then new.fotos else '[]'::jsonb end) f
  where g.costos_doc_id = new.id and coalesce(f->>'url','') <> ''
    and not exists (select 1 from fin_adjuntos a where a.registro_id = g.id and a.url = f->>'url');
  return new;
end $$;
revoke execute on function public.fin_desde_costos_doc_adj() from public, anon, authenticated;
drop trigger if exists fin_desde_costos_doc_adj on public.costos_docs;
create trigger fin_desde_costos_doc_adj after insert or update of fotos on public.costos_docs
  for each row execute function public.fin_desde_costos_doc_adj();

-- ---------- Datos existentes ----------
-- Proveedores desde los registros que ya tienen RUT
update public.fin_registros set tercero_rut = tercero_rut where tipo = 'gasto' and proveedor_id is null and coalesce(tercero_rut,'') <> '';
-- Fotos de los documentos del lector que ya existen
insert into public.fin_adjuntos (registro_id, url, nombre, tipo, autor)
select g.id, f->>'url', coalesce(nullif(f->>'nombre',''),'documento'), case when (f->>'url') ~* '\.(xml|pdf)$' then 'doc' else 'image' end, coalesce(d.subido_por,'lector')
from public.costos_docs d
join public.fin_registros g on g.costos_doc_id = d.id
cross join lateral jsonb_array_elements(case when jsonb_typeof(d.fotos) = 'array' then d.fotos else '[]'::jsonb end) f
where coalesce(f->>'url','') <> '' and not exists (select 1 from public.fin_adjuntos a where a.registro_id = g.id and a.url = f->>'url');

notify pgrst, 'reload schema';
