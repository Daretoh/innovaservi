-- ============================================================
-- Finanzas (beta: solo Enzo): registros de ingresos y gastos, gastos fijos (recurrentes),
-- cuentas y saldos, deudas, préstamos entre empresas del grupo y cierres de mes.
-- Mismos nombres que ISgestión (fin_*) para migrar copiando. Idempotente.
--
-- Estados de un registro: pendiente (cargado, falta revisar) -> listo (revisado: categoría y centro)
-- -> pagado. "Por pagar / por cobrar" = sin fecha_pago (una boleta del lector ya viene pagada,
-- aunque siga Pendiente de revisar).
-- Gastos fijos: fin_generar_mes() crea el registro del mes con el monto de ese momento;
-- un cambio de monto no toca los meses ya generados. Corre solo el día 1 (pg_cron) y al abrir Finanzas.
-- ============================================================

create or replace function public.fin_beta() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = any (array['enzo.castro@innovaservi.com','enzo.castro@innovaservi.cl']);
$$;
revoke execute on function public.fin_beta() from public, anon;
grant execute on function public.fin_beta() to authenticated;

create or replace function public.fin_email() returns text
language sql stable set search_path = public as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- Categorías (clase = línea del Estado de resultados)
create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  clase text not null check (clase in ('ingreso','costo_directo','operacion','administracion','financiero')),
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Centros de costo (líneas de servicio + Flota + Administración). La faena va aparte, como texto.
create table if not exists public.fin_centros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Gastos fijos / recurrentes
create table if not exists public.fin_recurrentes (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (length(trim(concepto)) > 0),
  categoria_id uuid not null references public.fin_categorias,
  centro_id uuid references public.fin_centros,
  proveedor text,
  proveedor_rut text,
  monto int not null check (monto >= 0),                       -- total del documento (con IVA si es factura)
  ciclo text not null default 'mensual' check (ciclo in ('mensual','semestral','anual')),
  dia int check (dia between 1 and 31),                        -- día de pago
  mes_pago int check (mes_pago between 1 and 12),              -- anual: ese mes; semestral: ese mes y 6 después
  doc_tipo text not null default 'factura' check (doc_tipo in ('factura','boleta','otro','sin')),
  desde text not null default to_char(now() at time zone 'America/Santiago','YYYY-MM') check (desde ~ '^\d{4}-\d{2}$'),
  hasta text check (hasta ~ '^\d{4}-\d{2}$'),
  notas text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text default public.fin_email(),
  check (ciclo = 'mensual' or mes_pago is not null),
  check (hasta is null or hasta >= desde)
);

-- Cuentas (banco, tarjeta, caja) y sus saldos por fecha (los anota Cristopher / Enzo)
create table if not exists public.fin_cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo text not null default 'banco' check (tipo in ('banco','tarjeta','caja','otro')),
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.fin_saldos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.fin_cuentas on delete cascade,
  fecha date not null default current_date,
  saldo bigint not null,                                       -- tarjeta: lo adeudado (positivo)
  created_at timestamptz not null default now(),
  created_by text default public.fin_email(),
  unique (cuenta_id, fecha)
);

-- Registros: gastos e ingresos
create table if not exists public.fin_registros (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('gasto','ingreso')),
  fecha date not null default current_date,
  concepto text not null check (length(trim(concepto)) > 0),
  categoria_id uuid references public.fin_categorias,
  centro_id uuid references public.fin_centros,
  faena text,                                                  -- igual que costos_docs.faena / horas.faena
  tercero text,                                                -- proveedor (gasto) o cliente (ingreso)
  tercero_rut text,
  doc_tipo text not null default 'sin' check (doc_tipo in ('factura','boleta','guia','nota_credito','otro','sin')),
  doc_numero text,
  neto bigint not null default 0,
  iva bigint not null default 0,
  exento bigint not null default 0,
  total bigint not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','listo','pagado')),
  vence date,
  fecha_pago date,
  cuenta_id uuid references public.fin_cuentas on delete set null,
  recurrente_id uuid references public.fin_recurrentes on delete set null,
  periodo text check (periodo ~ '^\d{4}-\d{2}$'),
  costos_doc_id uuid unique,                                   -- documento del lector (costos_docs)
  notas text,
  created_at timestamptz not null default now(),
  created_by text default public.fin_email(),
  updated_at timestamptz,
  updated_by text,
  deleted_at timestamptz,
  check (neto + iva + exento = total),
  check (estado <> 'pagado' or fecha_pago is not null),
  check (estado = 'pendiente' or (categoria_id is not null and centro_id is not null)),
  check (recurrente_id is null or periodo is not null)
);
create index if not exists fin_registros_fecha_idx on public.fin_registros (fecha desc) where deleted_at is null;
create index if not exists fin_registros_porpagar_idx on public.fin_registros (tipo, vence) where deleted_at is null and fecha_pago is null;
create unique index if not exists fin_registros_recurrente_mes on public.fin_registros (recurrente_id, periodo) where deleted_at is null;

-- Deudas (préstamos bancarios, leasing, líneas de crédito)
create table if not exists public.fin_deudas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'prestamo' check (tipo in ('prestamo','leasing','linea','otro')),
  acreedor text not null check (length(trim(acreedor)) > 0),
  saldo bigint not null default 0,
  fecha_saldo date not null default current_date,
  cuota bigint not null default 0,
  dia int check (dia between 1 and 31),
  hasta date,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Préstamos entre empresas del grupo (no son gasto ni ingreso)
create table if not exists public.fin_prestamos_grupo (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  sentido text not null check (sentido in ('innova_a_isp','isp_a_innova')),
  monto bigint not null check (monto > 0),
  concepto text not null check (length(trim(concepto)) > 0),
  notas text,
  created_at timestamptz not null default now(),
  created_by text default public.fin_email(),
  deleted_at timestamptz
);

-- Cierres de mes: foto del Estado de resultados (incluye el personal calculado en la app)
create table if not exists public.fin_cierres (
  periodo text primary key check (periodo ~ '^\d{4}-\d{2}$'),
  resultado jsonb not null default '{}'::jsonb,
  cerrado_por text default public.fin_email(),
  cerrado_en timestamptz not null default now()
);

-- Ajustes (sueldos estimados para el flujo, etc.)
create table if not exists public.fin_config (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- RLS: solo fin_beta(). Sin borrado físico de registros ----------
do $$
declare t text;
begin
  foreach t in array array['fin_categorias','fin_centros','fin_recurrentes','fin_cuentas','fin_saldos','fin_registros','fin_deudas','fin_prestamos_grupo','fin_cierres','fin_config'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists %1$s_sel on public.%1$s', t);
    execute format('drop policy if exists %1$s_ins on public.%1$s', t);
    execute format('drop policy if exists %1$s_upd on public.%1$s', t);
    execute format('drop policy if exists %1$s_del on public.%1$s', t);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using (public.fin_beta())', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (public.fin_beta())', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (public.fin_beta()) with check (public.fin_beta())', t);
    if t not in ('fin_registros','fin_prestamos_grupo') then
      execute format('create policy %1$s_del on public.%1$s for delete to authenticated using (public.fin_beta())', t);
    end if;
    execute format('revoke all on public.%1$s from anon', t);
    execute format('revoke truncate, references, trigger on public.%1$s from authenticated', t);
  end loop;
end $$;
revoke delete on public.fin_registros, public.fin_prestamos_grupo from authenticated;

-- ---------- Triggers de fin_registros: quién editó y mes cerrado ----------
create or replace function public.fin_registros_bu() returns trigger
language plpgsql set search_path = public as $$
declare cerrado boolean;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now(); new.updated_by := public.fin_email();
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  -- Gasto revisado y ya pagado (boleta) pasa directo a Pagado
  if new.estado = 'listo' and new.fecha_pago is not null then new.estado := 'pagado'; end if;
  if new.estado = 'pagado' and new.fecha_pago is null then new.fecha_pago := current_date; end if;
  -- Mes cerrado: no se cambia (lo que llega del lector después del cierre entra igual y queda como alerta)
  if tg_op = 'INSERT' then
    select exists(select 1 from public.fin_cierres c where c.periodo = to_char(new.fecha,'YYYY-MM')) into cerrado;
    if cerrado and new.costos_doc_id is null and new.recurrente_id is null then
      raise exception 'El mes % está cerrado: anótalo en el mes siguiente o reabre el mes', to_char(new.fecha,'MM-YYYY');
    end if;
  elsif (new.total, new.neto, new.fecha, new.categoria_id, new.centro_id, new.tipo, new.deleted_at)
        is distinct from (old.total, old.neto, old.fecha, old.categoria_id, old.centro_id, old.tipo, old.deleted_at) then
    select exists(select 1 from public.fin_cierres c where c.periodo in (to_char(new.fecha,'YYYY-MM'), to_char(old.fecha,'YYYY-MM'))) into cerrado;
    if cerrado then
      raise exception 'El mes está cerrado: reabre el mes para cambiar montos, fechas o categorías';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fin_registros_bu on public.fin_registros;
create trigger fin_registros_bu before insert or update on public.fin_registros
  for each row execute function public.fin_registros_bu();

-- ---------- Generar gastos fijos del mes ----------
create or replace function public.fin_generar_mes(p_periodo text default null) returns int
language plpgsql set search_path = public as $$
declare
  per text := coalesce(p_periodo, to_char(now() at time zone 'America/Santiago','YYYY-MM'));
  y int; m int; ultimo int; n int;
begin
  if per !~ '^\d{4}-\d{2}$' then raise exception 'Periodo inválido: %', per; end if;
  if per < '2026-10' then return 0; end if;                         -- no se generan meses anteriores al inicio
  if per < to_char(now() at time zone 'America/Santiago','YYYY-MM') then return 0; end if;   -- ni meses pasados
  if exists(select 1 from fin_cierres where periodo = per) then return 0; end if;
  y := split_part(per,'-',1)::int; m := split_part(per,'-',2)::int;
  ultimo := extract(day from (make_date(y,m,1) + interval '1 month - 1 day'))::int;
  insert into fin_registros (tipo, fecha, concepto, categoria_id, centro_id, tercero, tercero_rut, doc_tipo,
                             neto, iva, exento, total, estado, vence, recurrente_id, periodo, created_by)
  select 'gasto', make_date(y, m, least(coalesce(r.dia,1), ultimo)), r.concepto, r.categoria_id, r.centro_id,
         r.proveedor, r.proveedor_rut, r.doc_tipo,
         case when r.doc_tipo = 'factura' then round(r.monto/1.19) else r.monto end,
         case when r.doc_tipo = 'factura' then r.monto - round(r.monto/1.19) else 0 end,
         0, r.monto,
         case when r.centro_id is null then 'pendiente' else 'listo' end,
         make_date(y, m, least(coalesce(r.dia,1), ultimo)), r.id, per, 'gasto fijo'
  from fin_recurrentes r
  where r.activo and r.monto > 0 and r.desde <= per and (r.hasta is null or r.hasta >= per)
    and (r.ciclo = 'mensual'
         or (r.ciclo = 'anual' and r.mes_pago = m)
         or (r.ciclo = 'semestral' and (r.mes_pago = m or ((r.mes_pago + 5) % 12) + 1 = m)))
  on conflict (recurrente_id, periodo) where deleted_at is null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fin_generar_mes(text) from public, anon;
grant execute on function public.fin_generar_mes(text) to authenticated;

-- ---------- Lector de boletas -> registro Pendiente ----------
-- Traduce los nombres viejos del lector a las categorías y centros del procedimiento
create or replace function public.fin_map_categoria(t text) returns uuid
language sql stable set search_path = public as $$
  select id from fin_categorias where lower(nombre) = lower(case lower(trim(coalesce(t,'')))
    when 'materiales' then 'Materiales e insumos' when 'materiales eléctricos' then 'Materiales e insumos'
    when 'insumos y químicos' then 'Materiales e insumos' when 'herramientas y repuestos' then 'Herramientas'
    when 'equipamiento' then 'Herramientas' when 'combustible' then 'Combustible y peajes'
    when 'transporte y peajes' then 'Combustible y peajes' when 'servicios externos' then 'Subcontratos'
    else trim(coalesce(t,'')) end) limit 1
$$;
create or replace function public.fin_map_centro(t text) returns uuid
language sql stable set search_path = public as $$
  select id from fin_centros where lower(nombre) = lower(case lower(trim(coalesce(t,'')))
    when 'administración' then 'Administración Innova' else trim(coalesce(t,'')) end) limit 1
$$;

create or replace function public.fin_desde_costos_doc() returns trigger
language plpgsql security definer set search_path = public as $$
declare tot bigint; n bigint; i bigint; dt text; f date;
begin
  if tg_op = 'DELETE' then
    update fin_registros set deleted_at = now() where costos_doc_id = old.id and deleted_at is null;
    return old;
  end if;
  tot := coalesce(new.total, 0); i := coalesce(new.iva, 0); n := coalesce(new.neto, tot - i);
  f := coalesce(new.fecha, new.created_at::date, current_date);
  dt := case new.tipo_dte when 33 then 'factura' when 34 then 'factura' when 39 then 'boleta' when 41 then 'boleta'
                          when 61 then 'nota_credito' when 52 then 'guia' else 'otro' end;
  insert into fin_registros (tipo, fecha, concepto, categoria_id, centro_id, faena, tercero, tercero_rut, doc_tipo, doc_numero,
                             neto, iva, exento, total, estado, vence, fecha_pago, costos_doc_id, notas, created_by)
  values ('gasto', f,
          coalesce(nullif(trim(coalesce(new.items->0->>'nombre', new.items->0->>'descripcion', new.items->0->>'detalle','')),''),
                   nullif(trim(coalesce(new.razon_social,'')),''), nullif(trim(coalesce(new.categoria,'')),''), 'Documento del lector'),
          fin_map_categoria(new.categoria), fin_map_centro(new.centro_costo), nullif(new.faena,''), new.razon_social, new.rut_emisor, dt, new.folio,
          n, i, tot - n - i, tot, 'pendiente',
          case when dt in ('factura','guia') then f + 30 end,       -- factura: por pagar a 30 días
          case when dt not in ('factura','guia') then f end,        -- boleta / comprobante: pagada al comprar
          new.id, nullif(new.observaciones,''), coalesce(new.subido_por, 'lector'))
  on conflict (costos_doc_id) do nothing;
  return new;
end $$;
revoke execute on function public.fin_desde_costos_doc() from public, anon, authenticated;
drop trigger if exists fin_desde_costos_doc on public.costos_docs;
create trigger fin_desde_costos_doc after insert or delete on public.costos_docs
  for each row execute function public.fin_desde_costos_doc();

-- ---------- Datos iniciales ----------
insert into public.fin_categorias (nombre, clase, orden) values
  ('Servicios','ingreso',10), ('Venta de productos','ingreso',11), ('Otros ingresos','ingreso',12),
  ('Personal de faena','costo_directo',20), ('Materiales e insumos','costo_directo',21), ('EPP','costo_directo',22),
  ('Combustible y peajes','costo_directo',23), ('Arriendo de equipos','costo_directo',24), ('Subcontratos','costo_directo',25),
  ('Flota (mantención, seguros, permisos)','operacion',30), ('Herramientas','operacion',31), ('Capacitación','operacion',32),
  ('Arriendo','administracion',40), ('Servicios básicos','administracion',41), ('Software y servicios digitales','administracion',42),
  ('Contabilidad y legal','administracion',43), ('Gestión (sueldos administrativos)','administracion',44),
  ('Intereses','financiero',50), ('Comisiones bancarias','financiero',51)
on conflict (nombre) do nothing;

insert into public.fin_centros (nombre, orden) values
  ('Apoyo frigorífico',1), ('Cámaras de frío',2), ('Estanques y riles',3), ('Obras menores',4),
  ('Instalaciones',5), ('Áreas verdes',6), ('Flota',7), ('Administración Innova',8)
on conflict (nombre) do nothing;

-- Documentos del lector que ya existen (se pasan por el mismo trigger: update sin cambios no aplica, así que se insertan aquí)
insert into public.fin_registros (tipo, fecha, concepto, categoria_id, centro_id, faena, tercero, tercero_rut, doc_tipo, doc_numero,
                                  neto, iva, exento, total, estado, vence, fecha_pago, costos_doc_id, notas, created_by)
select 'gasto', x.f,
       coalesce(nullif(trim(coalesce(d.items->0->>'nombre', d.items->0->>'descripcion', d.items->0->>'detalle','')),''),
                nullif(trim(coalesce(d.razon_social,'')),''), nullif(trim(coalesce(d.categoria,'')),''), 'Documento del lector'),
       public.fin_map_categoria(d.categoria), public.fin_map_centro(d.centro_costo),
       nullif(d.faena,''), d.razon_social, d.rut_emisor, x.dt, d.folio,
       x.n, x.i, x.tot - x.n - x.i, x.tot, 'pendiente',
       case when x.dt in ('factura','guia') then x.f + 30 end,
       case when x.dt not in ('factura','guia') then x.f end,
       d.id, nullif(d.observaciones,''), coalesce(d.subido_por,'lector')
from public.costos_docs d
cross join lateral (select coalesce(d.total,0)::bigint tot, coalesce(d.iva,0)::bigint i,
                           coalesce(d.neto, coalesce(d.total,0) - coalesce(d.iva,0))::bigint n,
                           coalesce(d.fecha, d.created_at::date) f,
                           case d.tipo_dte when 33 then 'factura' when 34 then 'factura' when 39 then 'boleta' when 41 then 'boleta'
                                           when 61 then 'nota_credito' when 52 then 'guia' else 'otro' end dt) x
on conflict (costos_doc_id) do nothing;

-- ---------- Resumen del mes (misma vista irá en ISP para la vista Grupo) ----------
-- Costo = neto si es factura (el IVA se recupera); si no, el total. El personal de faena se calcula en la app
-- desde horas y remuneraciones y queda fijo al cerrar el mes (fin_cierres.resultado->>'personal').
create or replace view public.fin_resumen_mes with (security_invoker = true) as
with r as (
  select to_char(g.fecha,'YYYY-MM') periodo, g.tipo, c.clase,
         case when g.doc_tipo in ('factura','nota_credito') then g.neto + g.exento else g.total end monto,
         g.estado, g.centro_id, g.fecha_pago
  from public.fin_registros g left join public.fin_categorias c on c.id = g.categoria_id
  where g.deleted_at is null
)
select 'INNOVASERVI'::text empresa, p.periodo,
  coalesce(sum(r.monto) filter (where r.tipo='ingreso'),0)                                   ventas,
  coalesce(sum(r.monto) filter (where r.tipo='gasto' and r.clase='costo_directo'),0)
    + coalesce((select (k.resultado->>'personal')::bigint from public.fin_cierres k where k.periodo = p.periodo),0) costo_directo,
  coalesce(sum(r.monto) filter (where r.tipo='gasto' and r.clase in ('operacion','administracion')),0) fijos,
  coalesce(sum(r.monto) filter (where r.tipo='gasto' and r.clase='financiero'),0)           financiero,
  coalesce(sum(r.monto) filter (where r.tipo='gasto' and r.clase is null),0)                sin_categoria,
  count(*) filter (where r.estado='pendiente')                                              pendientes,
  count(*) filter (where r.tipo='gasto' and r.centro_id is null)                            sin_centro,
  exists(select 1 from public.fin_cierres k where k.periodo = p.periodo)                    cerrado
from (select distinct periodo from r) p join r on r.periodo = p.periodo
group by p.periodo;
revoke all on public.fin_resumen_mes from anon;

-- ---------- pg_cron: día 1 a las 05:05 UTC (01:05/02:05 en Chile) ----------
do $$ begin
  perform cron.unschedule('fin-generar-mes') where exists (select 1 from cron.job where jobname = 'fin-generar-mes');
  perform cron.schedule('fin-generar-mes', '5 5 1 * *', 'select public.fin_generar_mes()');
exception when undefined_table or invalid_schema_name then null;
end $$;

notify pgrst, 'reload schema';
