-- ============================================================
-- Reuniones: seguimiento de acuerdos y puntos abiertos por reunión fija.
-- Lunes · Equipo (L), Miércoles · Prevención (P), Viernes · Taller ISP (T); se pueden agregar otras.
-- Idempotente: se puede correr más de una vez.
--
-- Estados de un punto: en_curso (🟡) · hecho (🟢) · atrasado (🔴).
-- reuniones_refrescar() pasa a 🔴 lo vencido; si lleva 14 días o más en 🔴, la app lo marca "Escalar".
-- Cada cambio de estado o plazo queda en reunion_puntos_log (trigger), con usuario y fecha.
-- ============================================================

-- ¿Puede ver / editar el módulo? Dueños siempre; el resto según Accesos (permisos.secciones.reuniones).
create or replace function public.reuniones_acceso(editar boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select
    lower(coalesce(auth.jwt()->>'email','')) = any (array['enzo.castro@innovaservi.com','enzo.castro@innovaservi.cl','jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com'])
    or exists (
      select 1 from public.permisos p
      where lower(p.email) = lower(coalesce(auth.jwt()->>'email',''))
        and coalesce((p.secciones->'_meta'->>'activo')::boolean, true)
        and (nullif(p.secciones->'_meta'->>'vence','') is null or (p.secciones->'_meta'->>'vence')::date >= current_date)
        and (p.rol = 'admin'
             or (case when editar
                   then coalesce((p.secciones->'reuniones'->'a'->>'editar')::boolean, false)
                        or coalesce(p.secciones->'reuniones'->>'n','') in ('editar','total')
                   else coalesce(p.secciones->'reuniones'->>'n','') in ('ver','editar','total') end))
    );
$$;
revoke execute on function public.reuniones_acceso(boolean) from public, anon;
grant execute on function public.reuniones_acceso(boolean) to authenticated;

-- Tipos de reunión (las fijas + las que se agreguen)
create table if not exists public.reuniones_tipo (
  clave text primary key,                 -- equipo | prevencion | taller | …
  nombre text not null,
  dia_semana int,                         -- 1=lun … 7=dom (null = sin día fijo)
  prefijo text not null,                  -- L, P, T… (los puntos quedan L1, L2…)
  participantes jsonb not null default '[]'::jsonb,   -- [{nombre, email?}]
  dueno text,                             -- dueño del seguimiento (nombre)
  color text default '#2b3a7a',
  orden int default 100,
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- Actas
create table if not exists public.reuniones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references public.reuniones_tipo(clave) on update cascade,
  fecha date not null default current_date,
  asistentes jsonb not null default '[]'::jsonb,      -- [nombre]
  notas text default '',
  autor text,
  created_at timestamptz default now()
);
create index if not exists reuniones_tipo_fecha_idx on public.reuniones (tipo, fecha desc);

-- Puntos / acuerdos
create table if not exists public.reunion_puntos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references public.reuniones_tipo(clave) on update cascade,
  numero int,                                         -- correlativo por tipo (lo pone el trigger)
  descripcion text not null,
  responsable text not null,                          -- nombre (puede ser "Yocelyn y Luisa")
  responsable_email text,
  desde date not null default current_date,
  plazo date not null,
  estado text not null default 'en_curso' check (estado in ('en_curso','hecho','atrasado')),
  motivo text default '',                             -- motivo del atraso / comentario vigente
  atrasado_desde date,
  reunion_origen uuid references public.reuniones(id) on delete set null,
  cerrado_at timestamptz,
  autor text,
  created_at timestamptz default now(),
  -- Contexto del último cambio (lo usa el trigger para el historial)
  ult_reunion uuid,
  ult_comentario text
);
create unique index if not exists reunion_puntos_num_uq on public.reunion_puntos (tipo, numero);
create index if not exists reunion_puntos_estado_idx on public.reunion_puntos (estado);

-- Historial (solo se inserta)
create table if not exists public.reunion_puntos_log (
  id bigserial primary key,
  punto_id uuid not null references public.reunion_puntos(id) on delete cascade,
  reunion_id uuid references public.reuniones(id) on delete set null,
  fecha timestamptz not null default now(),
  usuario text,
  estado_ant text,
  estado_nuevo text,
  plazo_ant date,
  plazo_nuevo date,
  comentario text
);
create index if not exists reunion_puntos_log_punto_idx on public.reunion_puntos_log (punto_id, fecha);

-- Trigger: número correlativo, atrasado_desde, cerrado_at e historial
create or replace function public.reunion_puntos_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if tg_op = 'INSERT' then
    if new.numero is null then
      perform pg_advisory_xact_lock(hashtext('reunion_puntos:'||new.tipo));
      select coalesce(max(numero),0)+1 into new.numero from public.reunion_puntos where tipo = new.tipo;
    end if;
    if new.estado = 'atrasado' then new.atrasado_desde := coalesce(new.atrasado_desde, hoy); end if;
    if new.estado = 'hecho' then new.cerrado_at := coalesce(new.cerrado_at, now()); end if;
    return new;
  end if;
  -- UPDATE
  if new.estado = 'atrasado' and old.estado <> 'atrasado' then new.atrasado_desde := coalesce(new.atrasado_desde, hoy);
  elsif new.estado <> 'atrasado' then new.atrasado_desde := null; end if;
  if new.estado = 'hecho' and old.estado <> 'hecho' then new.cerrado_at := now();
  elsif new.estado <> 'hecho' then new.cerrado_at := null; end if;
  return new;
end $$;

create or replace function public.reunion_puntos_log_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare quien text := case when current_setting('reuniones.sistema', true) = '1' then 'sistema'
                           else coalesce(nullif(lower(auth.jwt()->>'email'),''), 'sistema') end;
begin
  if tg_op = 'INSERT' then
    insert into public.reunion_puntos_log (punto_id, reunion_id, usuario, estado_ant, estado_nuevo, plazo_ant, plazo_nuevo, comentario)
    values (new.id, coalesce(new.ult_reunion, new.reunion_origen), quien, null, new.estado, null, new.plazo, coalesce(new.ult_comentario,'Acuerdo nuevo'));
  elsif new.estado is distinct from old.estado or new.plazo is distinct from old.plazo
        or new.ult_comentario is distinct from old.ult_comentario or new.ult_reunion is distinct from old.ult_reunion then
    insert into public.reunion_puntos_log (punto_id, reunion_id, usuario, estado_ant, estado_nuevo, plazo_ant, plazo_nuevo, comentario)
    values (new.id, new.ult_reunion, quien, old.estado, new.estado, old.plazo, new.plazo, new.ult_comentario);
  end if;
  return null;
end $$;

drop trigger if exists reunion_puntos_bi on public.reunion_puntos;
create trigger reunion_puntos_bi before insert or update on public.reunion_puntos
  for each row execute function public.reunion_puntos_trg();
drop trigger if exists reunion_puntos_ai on public.reunion_puntos;
create trigger reunion_puntos_ai after insert or update on public.reunion_puntos
  for each row execute function public.reunion_puntos_log_trg();

-- Pasa a 🔴 lo vencido (se llama al abrir el módulo o el Inicio). Devuelve cuántos cambió.
create or replace function public.reuniones_refrescar() returns int
language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Santiago')::date; n int;
begin
  if not public.reuniones_acceso(false) then return 0; end if;
  perform set_config('reuniones.sistema', '1', true);
  update public.reunion_puntos
     set estado = 'atrasado', atrasado_desde = plazo + 1, ult_reunion = null,
         ult_comentario = 'Vencido: pasa solo a atrasado'
   where estado = 'en_curso' and plazo < hoy;
  get diagnostics n = row_count;
  perform set_config('reuniones.sistema', '', true);
  return n;
end $$;
revoke execute on function public.reuniones_refrescar() from public, anon;
grant execute on function public.reuniones_refrescar() to authenticated;

-- RLS
alter table public.reuniones_tipo enable row level security;
alter table public.reuniones enable row level security;
alter table public.reunion_puntos enable row level security;
alter table public.reunion_puntos_log enable row level security;

drop policy if exists reuniones_tipo_sel on public.reuniones_tipo;
create policy reuniones_tipo_sel on public.reuniones_tipo for select to authenticated using (public.reuniones_acceso(false));
drop policy if exists reuniones_tipo_wr on public.reuniones_tipo;
create policy reuniones_tipo_wr on public.reuniones_tipo for all to authenticated
  using (public.reuniones_acceso(true)) with check (public.reuniones_acceso(true));

drop policy if exists reuniones_sel on public.reuniones;
create policy reuniones_sel on public.reuniones for select to authenticated using (public.reuniones_acceso(false));
drop policy if exists reuniones_wr on public.reuniones;
create policy reuniones_wr on public.reuniones for all to authenticated
  using (public.reuniones_acceso(true)) with check (public.reuniones_acceso(true));

drop policy if exists reunion_puntos_sel on public.reunion_puntos;
create policy reunion_puntos_sel on public.reunion_puntos for select to authenticated using (public.reuniones_acceso(false));
drop policy if exists reunion_puntos_wr on public.reunion_puntos;
create policy reunion_puntos_wr on public.reunion_puntos for all to authenticated
  using (public.reuniones_acceso(true)) with check (public.reuniones_acceso(true));

drop policy if exists reunion_puntos_log_sel on public.reunion_puntos_log;
create policy reunion_puntos_log_sel on public.reunion_puntos_log for select to authenticated using (public.reuniones_acceso(false));
-- (sin políticas de insert/update/delete: el historial solo lo escribe el trigger)

-- ===== Datos iniciales: reuniones fijas =====
insert into public.reuniones_tipo (clave, nombre, dia_semana, prefijo, participantes, dueno, color, orden) values
  ('equipo','Equipo',1,'L','[{"nombre":"Enzo","email":"enzo.castro@innovaservi.com"},{"nombre":"Yocelyn"},{"nombre":"Luisa","email":"luisavelasquez1801@gmail.com"}]','Enzo','#2b6cb0',1),
  ('prevencion','Prevención',3,'P','[{"nombre":"Enzo","email":"enzo.castro@innovaservi.com"},{"nombre":"Yocelyn"}]','Yocelyn','#dd6b20',2),
  ('taller','Taller ISP',5,'T','[{"nombre":"Enzo","email":"enzo.castro@innovaservi.com"},{"nombre":"Jhettro"}]','Enzo','#2f855a',3)
on conflict (clave) do nothing;

-- ===== Datos iniciales: puntos abiertos que venían de la bóveda (solo si la tabla está vacía) =====
do $$
begin
  if not exists (select 1 from public.reunion_puntos) then
    insert into public.reunion_puntos (tipo, numero, descripcion, responsable, responsable_email, desde, plazo, estado, ult_comentario, autor) values
      ('equipo',1,'Presentar el procedimiento de finanzas y control de costos y partir en IS Performance','Enzo','enzo.castro@innovaservi.com','2026-10-22','2026-10-26','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('equipo',2,'Bandejas "Por cargar" y "Cargado" en la oficina + timbre o etiqueta para el reverso','Yocelyn y Luisa',null,'2026-10-26','2026-10-27','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('equipo',3,'Cerrar gastos fijos de ISP y topes de aprobación','Enzo + Cristopher','enzo.castro@innovaservi.com','2026-10-26','2026-10-28','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('equipo',4,'Categorías y gastos fijos de ISP cargados en el sistema','Enzo','enzo.castro@innovaservi.com','2026-10-26','2026-10-30','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('equipo',5,'Boletas y facturas de octubre de ISP recolectadas','Yocelyn',null,'2026-10-26','2026-11-03','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('prevencion',1,'Diagnóstico legal de prevención de ambas empresas (Q4 2026)','Yocelyn',null,'2026-10-01','2026-10-24','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('prevencion',2,'Documentación de los activos al día (lista de faltantes)','Yocelyn',null,'2026-10-01','2026-10-10','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('prevencion',3,'Matriz IPER por servicio + HDS','Yocelyn',null,'2026-10-01','2026-11-20','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('prevencion',4,'RIOHS + Ley Karin (borrador revisado por el asesor)','Yocelyn',null,'2026-10-01','2026-11-27','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com'),
      ('prevencion',5,'Confirmar mutualidad y trabajadores con contrato por empresa','Yocelyn',null,'2026-10-01','2026-10-28','en_curso','Cargado desde la bóveda','enzo.castro@innovaservi.com');
  end if;
end $$;

-- Funciones de disparador: no se exponen por la API
revoke execute on function public.reunion_puntos_trg() from public, anon, authenticated;
revoke execute on function public.reunion_puntos_log_trg() from public, anon, authenticated;
