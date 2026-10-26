-- ============================================================
-- Notificaciones push (Web Push) para InnovaGestión.
-- Qué avisa:
--   · Tarea asignada (responsable o 2do responsable nuevo)
--   · Avisos de Tareas: menciones con @ y botón "Recordar" (tareas_avisos)
--   · Resumen diario 08:00 (Chile): tareas vencidas o que vencen hoy, a cada responsable
--   · Resumen diario 08:00: documentación por vencer (30, 15, 7, 1 y 0 días, y el día después de vencer)
--     a los dueños y a quien tenga el apartado Alertas
-- Cómo funciona: los disparadores dejan el mensaje en push_salida; un ping (pg_net) despierta la
-- Edge Function "push", que lo envía a todos los dispositivos suscritos de esa persona.
-- Las claves VAPID las genera la propia Edge Function y quedan en push_config (solo service_role).
-- Idempotente.
-- ============================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Claves y estado (sin políticas: solo la Edge Function con service_role lo lee)
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_jwk jsonb,                 -- par de claves exportado (privada incluida)
  ultimo_diario date,
  updated_at timestamptz default now()
);
alter table public.push_config enable row level security;

-- Dispositivos suscritos (uno por navegador/celular)
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  created_at timestamptz default now(),
  ultimo_ok timestamptz
);
create index if not exists push_suscripciones_email_idx on public.push_suscripciones (lower(email));
alter table public.push_suscripciones enable row level security;
drop policy if exists push_sus_propias on public.push_suscripciones;
create policy push_sus_propias on public.push_suscripciones for all to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')))
  with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- Cola de salida
create table if not exists public.push_salida (
  id bigserial primary key,
  email text not null,
  titulo text not null,
  cuerpo text default '',
  url text default './',
  etiqueta text,                   -- tag: reemplaza la notificación anterior con la misma etiqueta
  created_at timestamptz default now(),
  enviado_at timestamptz,
  intentos int default 0,
  resultado text
);
create index if not exists push_salida_pend_idx on public.push_salida (id) where enviado_at is null;
alter table public.push_salida enable row level security;
-- Cada uno ve sus avisos y puede mandarse una prueba a sí mismo
drop policy if exists push_salida_propias_sel on public.push_salida;
create policy push_salida_propias_sel on public.push_salida for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists push_salida_prueba on public.push_salida;
create policy push_salida_prueba on public.push_salida for insert to authenticated
  with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')) and etiqueta = 'prueba');

-- Ping a la Edge Function (una vez por sentencia; la función procesa toda la cola pendiente)
create or replace function public.push_ping() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  begin
    perform net.http_post(
      url := 'https://oabtbzrfgwadnooexdwd.supabase.co/functions/v1/push',
      body := '{"accion":"enviar"}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb);
  exception when others then
    raise warning 'push_ping: %', sqlerrm;   -- el aviso queda en la cola; se envía con el próximo ping
  end;
  return null;
end $$;
drop trigger if exists push_salida_ping on public.push_salida;
create trigger push_salida_ping after insert on public.push_salida
  for each statement execute function public.push_ping();

-- Encolar (uso interno de los disparadores)
create or replace function public.push_encolar(p_email text, p_titulo text, p_cuerpo text, p_url text, p_etiqueta text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_salida (email, titulo, cuerpo, url, etiqueta)
  select lower(trim(p_email)), left(p_titulo, 120), left(coalesce(p_cuerpo,''), 300), coalesce(p_url,'./'), p_etiqueta
  where coalesce(trim(p_email),'') <> '';
$$;
revoke execute on function public.push_encolar(text,text,text,text,text) from public, anon, authenticated;

create or replace function public.push_nombre(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(p.nombre),'') from public.permisos p where lower(p.email) = lower(p_email) limit 1),
    (select initcap(split_part(t.nombre,' ',1)) from public.trabajadores t where lower(t.email) = lower(p_email) limit 1),
    initcap(replace(split_part(split_part(coalesce(p_email,''),'@',1),'.',1),'_',' ')));
$$;

-- Tarea asignada
create or replace function public.push_tarea_asignada() returns trigger
language plpgsql security definer set search_path = public as $$
declare yo text := lower(coalesce(auth.jwt()->>'email', new.autor, ''));
        url text := './?ir=tarea&id=' || new.id;
        v text := case when new.vence is not null then ' · vence ' || to_char(new.vence,'DD-MM') else '' end;
begin
  if new.estado = 'hecha' then return null; end if;
  begin
  if lower(coalesce(new.asignado_email,'')) <> '' and lower(new.asignado_email) <> yo
     and (tg_op = 'INSERT' or lower(coalesce(old.asignado_email,'')) <> lower(new.asignado_email)) then
    perform public.push_encolar(new.asignado_email, 'Nueva tarea para ti', public.push_nombre(yo) || ' te asignó: ' || new.titulo || v, url, 'tarea-' || new.id);
  end if;
  if lower(coalesce(new.responsable2_email,'')) <> '' and lower(new.responsable2_email) <> yo
     and lower(new.responsable2_email) <> lower(coalesce(new.asignado_email,''))
     and (tg_op = 'INSERT' or lower(coalesce(old.responsable2_email,'')) <> lower(new.responsable2_email)) then
    perform public.push_encolar(new.responsable2_email, 'Eres 2do responsable', public.push_nombre(yo) || ' te sumó a: ' || new.titulo || v, url, 'tarea-' || new.id);
  end if;
  exception when others then
    raise warning 'push_tarea_asignada: %', sqlerrm;   -- la tarea se guarda igual
  end;
  return null;
end $$;
drop trigger if exists tareas_push on public.tareas;
create trigger tareas_push after insert or update of asignado_email, responsable2_email on public.tareas
  for each row execute function public.push_tarea_asignada();

-- Avisos de Tareas (menciones y recordatorios)
create or replace function public.push_tarea_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; quien text;
begin
  if lower(new.email) = lower(coalesce(new.autor,'')) then return null; end if;
  begin
  select titulo into t from public.tareas where id = new.tarea_id;
  quien := public.push_nombre(new.autor);
  perform public.push_encolar(new.email,
    case when new.tipo = 'recordatorio' then quien || ' te recordó una tarea' else quien || ' te mencionó' end,
    coalesce(t.titulo,'Tarea') || case when new.tipo <> 'recordatorio' and coalesce(new.texto,'') <> '' then ' — ' || new.texto else '' end,
    './?ir=tarea&id=' || new.tarea_id, 'aviso-' || new.id);
  exception when others then
    raise warning 'push_tarea_aviso: %', sqlerrm;   -- el aviso de la bandeja se guarda igual
  end;
  return null;
end $$;
drop trigger if exists tareas_avisos_push on public.tareas_avisos;
create trigger tareas_avisos_push after insert on public.tareas_avisos
  for each row execute function public.push_tarea_aviso();

-- Resumen diario (se llama cada hora; solo actúa una vez al día, a las 08:00 de Chile o después)
create or replace function public.push_diario(forzar boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare ahora timestamp := now() at time zone 'America/Santiago'; hoy date := ahora::date;
        n int := 0; r record; docs text; ndocs int; dest text;
begin
  if not forzar then
    if extract(hour from ahora) < 8 then return 0; end if;
    if exists (select 1 from public.push_config where id = 1 and ultimo_diario = hoy) then return 0; end if;
  end if;
  insert into public.push_config (id, ultimo_diario) values (1, hoy)
    on conflict (id) do update set ultimo_diario = excluded.ultimo_diario, updated_at = now();

  -- 1) Tareas vencidas o que vencen hoy, por responsable
  for r in
    with abiertas as (
      select id, titulo, vence, lower(asignado_email) em from public.tareas where estado <> 'hecha' and vence <= hoy and coalesce(asignado_email,'') <> ''
      union
      select id, titulo, vence, lower(responsable2_email) from public.tareas where estado <> 'hecha' and vence <= hoy and coalesce(responsable2_email,'') <> '')
    select em, count(*) filter (where vence < hoy) venc, count(*) filter (where vence = hoy) hoyn,
           string_agg(titulo, ' · ' order by vence) lista
    from abiertas group by em
  loop
    perform public.push_encolar(r.em,
      'Tareas: ' || concat_ws(' y ', case when r.venc > 0 then r.venc || ' vencida' || case when r.venc > 1 then 's' else '' end end,
                                     case when r.hoyn > 0 then r.hoyn || ' vence' || case when r.hoyn > 1 then 'n' else '' end || ' hoy' end),
      r.lista, './?ir=tareas', 'diario-tareas');
    n := n + 1;
  end loop;

  -- 2) Documentación por vencer (trabajadores activos, vehículos y empresa)
  with d as (
    select t.nombre || ' · ' || replace(coalesce(dd.tipo,'documento'),'-',' ') que, dd.vencimiento - hoy dias
      from public.rrhh_docs dd join public.trabajadores t on t.id::text = dd.trabajador_id::text
     where t.estado = 'activo' and dd.estado = 'entregado' and dd.vencimiento is not null
    union all
    select x.que, x.venc - hoy from (
      select distinct on (g.vehiculo_id, g.categoria)
             coalesce(nullif(v.patente,''), v.nombre, 'Vehículo') || ' · ' || g.categoria que, g.vencimiento venc
        from public.vehiculo_gastos g join public.vehiculos v on v.id::text = g.vehiculo_id::text
       where g.vencimiento is not null and coalesce(v.estado,'') <> 'inactivo'
       order by g.vehiculo_id, g.categoria, g.vencimiento desc) x
    union all
    select x.que, x.venc - hoy from (
      select distinct on (e.tipo, coalesce(e.titular,''))
             'Empresa · ' || coalesce(e.nombre, e.tipo) || coalesce(' · ' || e.titular, '') que, e.vencimiento venc
        from public.empresa_docs e
       order by e.tipo, coalesce(e.titular,''), coalesce(e.fecha, e.created_at::date) desc) x
     where x.venc is not null)
  select count(*), string_agg(que || case when dias < 0 then ' (venció ayer)' when dias = 0 then ' (vence hoy)' else ' (' || dias || ' días)' end, ' · ' order by dias)
    into ndocs, docs
    from d where dias in (30, 15, 7, 1, 0, -1);

  if ndocs > 0 then
    for dest in
      select lower(e) from unnest(array['enzo.castro@innovaservi.com','jorge.castro@innovaservi.com','cristopher.ruiz@innovaservi.com']) e
      union
      select lower(p.email) from public.permisos p
       where coalesce((p.secciones->'_meta'->>'activo')::boolean, true)
         and (p.rol = 'admin' or coalesce(p.secciones->'alertas'->>'n','') in ('ver','editar','total'))
    loop
      perform public.push_encolar(dest, 'Documentación por vencer (' || ndocs || ')', docs, './?ir=alertas', 'diario-docs');
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.push_diario(boolean) from public, anon, authenticated;

-- Cada hora (la función decide si ya es hora y si ya corrió hoy)
do $$
begin
  perform cron.unschedule('push-diario') where exists (select 1 from cron.job where jobname = 'push-diario');
  perform cron.schedule('push-diario', '5 * * * *', 'select public.push_diario()');
end $$;

-- Limpieza: lo enviado hace más de 60 días
do $$
begin
  perform cron.unschedule('push-limpieza') where exists (select 1 from cron.job where jobname = 'push-limpieza');
  perform cron.schedule('push-limpieza', '30 4 * * 0', $q$delete from public.push_salida where created_at < now() - interval '60 days'$q$);
end $$;

-- La Edge Function toma lo pendiente de forma atómica (dos pings juntos no envían doble)
create or replace function public.push_tomar(lim int default 200) returns setof public.push_salida
language sql security definer set search_path = public as $$
  update public.push_salida s set enviado_at = now(), intentos = s.intentos + 1
   where s.id in (select id from public.push_salida where enviado_at is null order by id limit lim for update skip locked)
  returning s.*;
$$;
revoke execute on function public.push_tomar(int) from public, anon, authenticated;
grant execute on function public.push_tomar(int) to service_role;

-- Funciones internas: nadie las llama por la API (los disparadores corren igual)
revoke execute on function public.push_nombre(text) from public, anon, authenticated;
revoke execute on function public.push_ping() from public, anon, authenticated;
revoke execute on function public.push_tarea_asignada() from public, anon, authenticated;
revoke execute on function public.push_tarea_aviso() from public, anon, authenticated;
