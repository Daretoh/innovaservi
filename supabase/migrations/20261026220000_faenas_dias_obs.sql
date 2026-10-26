-- Calendario: días a elección, observaciones de faena, tareas con checkbox y unir faenas duplicadas.
-- (Aplicado en Supabase como migraciones faenas_dias_obs_tareas y eventos_unir, 26-10-2026)

-- Días a elección: si dias tiene fechas, la faena ocurre solo esos días (fecha = primero, fecha_fin = último).
alter table public.eventos add column if not exists dias date[];

-- Observaciones de faena (reemplazan a la descripción)
create table if not exists public.faena_obs (
  id bigserial primary key,
  evento_id uuid not null references public.eventos(id) on delete cascade,
  fecha date,
  texto text not null,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists faena_obs_evento_idx on public.faena_obs(evento_id);
alter table public.faena_obs enable row level security;
drop policy if exists faena_obs_sel on public.faena_obs;
create policy faena_obs_sel on public.faena_obs for select to authenticated using ((select public.ig_activo()));
drop policy if exists faena_obs_ins on public.faena_obs;
create policy faena_obs_ins on public.faena_obs for insert to authenticated
  with check ((select public.ig_algun(1, 'calendario', 'planificacion')) and lower(coalesce(autor,'')) = lower(coalesce(auth.jwt() ->> 'email','')));
drop policy if exists faena_obs_upd on public.faena_obs;
create policy faena_obs_upd on public.faena_obs for update to authenticated
  using ((select public.ig_algun(2, 'calendario', 'planificacion')) or lower(coalesce(autor,'')) = lower(coalesce(auth.jwt() ->> 'email','')))
  with check ((select public.ig_algun(2, 'calendario', 'planificacion')) or lower(coalesce(autor,'')) = lower(coalesce(auth.jwt() ->> 'email','')));
drop policy if exists faena_obs_del on public.faena_obs;
create policy faena_obs_del on public.faena_obs for delete to authenticated
  using ((select public.ig_algun(2, 'calendario', 'planificacion')) or lower(coalesce(autor,'')) = lower(coalesce(auth.jwt() ->> 'email','')));

-- Tareas: quien solo ve el Calendario o Planificación puede marcar y agregar tareas (nada más de la faena).
create or replace function public.evento_tareas_set(p_id uuid, p_tareas jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.ig_algun(1, 'calendario', 'planificacion') then raise exception 'Sin permiso'; end if;
  if jsonb_typeof(coalesce(p_tareas,'[]'::jsonb)) <> 'array' then raise exception 'Tareas inválidas'; end if;
  update public.eventos set tareas = coalesce(p_tareas,'[]'::jsonb) where id = p_id;
end $$;
revoke all on function public.evento_tareas_set(uuid, jsonb) from public, anon;
grant execute on function public.evento_tareas_set(uuid, jsonb) to authenticated;

-- Nivel del usuario en un módulo (para que el Calendario sepa si edita o solo ve)
grant execute on function public.ig_nivel(text) to authenticated;

-- La descripción antigua pasa a ser la primera observación de cada faena
insert into public.faena_obs (evento_id, fecha, texto, autor, created_at)
select e.id, e.fecha, trim(e.descripcion), 'descripción (calendario)', coalesce(e.created_at, now())
from public.eventos e
where coalesce(trim(e.descripcion),'') <> ''
  and not exists (select 1 from public.faena_obs o where o.evento_id = e.id);

-- Días de una faena (lista elegida o rango continuo)
create or replace function public.evento_dias(e public.eventos) returns date[] language sql immutable set search_path to 'public' as $$
  select case when e.dias is not null and cardinality(e.dias) > 0 then e.dias
    else array(select d::date from generate_series(e.fecha, greatest(coalesce(e.fecha_fin, e.fecha), e.fecha), interval '1 day') d) end;
$$;

-- Etiqueta de texto de la faena (igual a faLabel de la app): "Cliente · sitio — título"
create or replace function public.evento_label(e public.eventos) returns text language sql immutable set search_path to 'public' as $$
  select case when x.emp <> '' and t <> '' then x.emp || ' — ' || t else coalesce(nullif(x.emp,''), nullif(t,''), 'Faena') end
  from (select trim(coalesce(e.ubicacion,'')) || case when trim(coalesce(e.sitio,'')) <> '' then ' · ' || trim(e.sitio) else '' end emp,
               trim(coalesce(e.titulo,'')) t) x;
$$;

-- Une la faena p_orig dentro de p_dest: junta los días y traspasa planificación, informes, horas, boletas, fotos y observaciones.
create or replace function public.eventos_unir(p_dest uuid, p_orig uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare d public.eventos; o public.eventos; ds date[]; lbl_d text; lbl_o text; n_plan int := 0; n_plan_x int := 0;
begin
  if not public.ig_algun(2, 'calendario', 'planificacion') then raise exception 'Sin permiso'; end if;
  if p_dest = p_orig then raise exception 'Es la misma faena'; end if;
  select * into d from public.eventos where id = p_dest for update;
  select * into o from public.eventos where id = p_orig for update;
  if d.id is null or o.id is null then raise exception 'Faena no encontrada'; end if;
  ds := array(select distinct x from unnest(public.evento_dias(d) || public.evento_dias(o)) x order by x);
  lbl_d := public.evento_label(d); lbl_o := public.evento_label(o);
  update public.eventos set
    fecha = ds[1],
    fecha_fin = case when ds[cardinality(ds)] > ds[1] then ds[cardinality(ds)] else null end,
    -- si los días quedan seguidos, vuelve a ser un rango normal
    dias = case when ds[cardinality(ds)] - ds[1] + 1 = cardinality(ds) then null else ds end,
    tareas = coalesce(d.tareas,'[]'::jsonb) || coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(o.tareas,'[]'::jsonb)) x
      where not exists (select 1 from jsonb_array_elements(coalesce(d.tareas,'[]'::jsonb)) y
        where lower(trim(coalesce(y->>'t', y #>> '{}'))) = lower(trim(coalesce(x->>'t', x #>> '{}'))))), '[]'::jsonb),
    descripcion = coalesce(nullif(d.descripcion,''), o.descripcion),
    hora = coalesce(nullif(d.hora,''), o.hora),
    dotacion = coalesce(d.dotacion, o.dotacion),
    personas_nec = coalesce(d.personas_nec, o.personas_nec),
    serie_id = null
  where id = p_dest;
  -- planificación por día: si ambas tienen plan el mismo día, se queda el de la faena destino
  update public.faena_plan p set evento_id = p_dest where p.evento_id = p_orig
    and not exists (select 1 from public.faena_plan q where q.evento_id = p_dest and q.fecha is not distinct from p.fecha);
  get diagnostics n_plan = row_count;
  delete from public.faena_plan where evento_id = p_orig; get diagnostics n_plan_x = row_count;
  update public.registros set evento_id = p_dest where evento_id = p_orig;
  update public.registros set faenas = (select jsonb_agg(case when x->>'id' = p_orig::text then jsonb_set(x, '{id}', to_jsonb(p_dest::text)) else x end) from jsonb_array_elements(faenas) x)
    where faenas @> jsonb_build_array(jsonb_build_object('id', p_orig::text));
  update public.reportes set evento_id = p_dest where evento_id = p_orig;
  update public.costos_docs set evento_id = p_dest where evento_id = p_orig;
  update public.faena_media set faena_id = p_dest::text where faena_id = p_orig::text;
  update public.faena_obs set evento_id = p_dest where evento_id = p_orig;
  update public.horas set evento_id = p_dest where evento_id = p_orig;
  -- si el nombre era distinto, los costos por texto pasan al nombre de la faena que queda
  if lbl_o <> lbl_d then
    update public.horas set faena = lbl_d where faena = lbl_o and evento_id = p_dest;
    update public.costos_docs set faena = lbl_d where faena = lbl_o and evento_id = p_dest;
    update public.fin_registros set faena = lbl_d where faena = lbl_o and not exists (select 1 from public.eventos e where e.id <> p_orig and e.id <> p_dest and public.evento_label(e) = lbl_o);
    update public.remu_ajuste_faena set faena = lbl_d where faena = lbl_o and not exists (select 1 from public.eventos e where e.id <> p_orig and e.id <> p_dest and public.evento_label(e) = lbl_o);
  end if;
  delete from public.eventos where id = p_orig;
  return jsonb_build_object('dias', cardinality(ds), 'plan_movidos', n_plan, 'plan_descartados', n_plan_x);
end $$;
revoke all on function public.eventos_unir(uuid, uuid) from public, anon;
grant execute on function public.eventos_unir(uuid, uuid) to authenticated;
