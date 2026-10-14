-- Link público del checklist de preparación (sin login).
-- Cada registro puede tener un token secreto; con él, la página /checklist/?t=TOKEN
-- ve solo el resumen (cliente, faena, fecha, cuadrilla, ítems) y solo puede marcar/desmarcar.
-- Las funciones son SECURITY DEFINER: anon NO tiene acceso directo a la tabla registros.

alter table public.registros add column if not exists prep_token text unique;

-- Resumen esencial para el link
create or replace function public.prep_publica(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cliente',    r.empresa,
    'trabajo',    r.lugar,
    'fecha',      r.fecha,
    'faena',      r.preparacion->>'faena',
    'fotos',      coalesce(r.preparacion->'fotos_carga','[]'::jsonb),
    'cuadrilla',  coalesce((select jsonb_agg(a->>'nombre') from jsonb_array_elements(coalesce(r.asignacion,'[]'::jsonb)) a where coalesce(a->>'nombre','') <> ''), '[]'::jsonb),
    'items',      coalesce((select jsonb_agg(jsonb_build_object(
                      'tipo', i->>'tipo', 'item', i->>'item', 'cantidad', i->>'cantidad',
                      'cargado', coalesce((i->>'cargado')::boolean,false),
                      'personal', coalesce((i->>'personal')::boolean,false),
                      'prenda', i->>'prenda', 'talla', i->>'talla', 'persona', i->>'persona') order by n)
                    from jsonb_array_elements(coalesce(r.preparacion->'items','[]'::jsonb)) with ordinality t(i,n)), '[]'::jsonb)
  )
  from registros r
  where p_token is not null and length(p_token) >= 20 and r.prep_token = p_token
$$;

-- Marca/desmarca ítems por posición; solo toca "cargado" y solo si el texto del ítem coincide
-- (si alguien editó la lista entretanto, no marca el ítem equivocado). Devuelve el resumen nuevo.
create or replace function public.prep_marcar(p_token text, p_idx int[], p_items text[], p_cargado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r registros%rowtype; its jsonb; k int; pos int;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into r from registros where prep_token = p_token for update;
  if not found then return null; end if;
  its := coalesce(r.preparacion->'items','[]'::jsonb);
  for k in 1 .. coalesce(array_length(p_idx,1),0) loop
    pos := p_idx[k];
    if pos >= 0 and pos < jsonb_array_length(its) and its->pos->>'item' = p_items[k] then
      its := jsonb_set(its, array[pos::text,'cargado'], to_jsonb(coalesce(p_cargado,false)));
    end if;
  end loop;
  update registros set preparacion = jsonb_set(coalesce(preparacion,'{}'::jsonb),'{items}',its) where id = r.id;
  return public.prep_publica(p_token);
end
$$;

revoke all on function public.prep_publica(text) from public;
revoke all on function public.prep_marcar(text,int[],text[],boolean) from public;
grant execute on function public.prep_publica(text) to anon, authenticated;
grant execute on function public.prep_marcar(text,int[],text[],boolean) to anon, authenticated;

-- ============================================================
-- Paso final: foto(s) de la carga general, subidas desde el link.
-- Se guardan en el bucket "reportes" bajo checklist/<sha256(token)>/… (el token no queda a la vista
-- en la URL de la foto). Anon solo puede subir ahí si ese hash corresponde a un link activo.
-- ============================================================
create or replace function public.prep_token_hash_valido(h text)
returns boolean language sql stable security definer set search_path = public as $$
  select h is not null and length(h) = 64 and exists(
    select 1 from registros where prep_token is not null and encode(sha256(convert_to(prep_token,'UTF8')),'hex') = h)
$$;
grant execute on function public.prep_token_hash_valido(text) to anon, authenticated;

drop policy if exists checklist_link_insert on storage.objects;
create policy checklist_link_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'reportes' and (storage.foldername(name))[1] = 'checklist'
              and public.prep_token_hash_valido((storage.foldername(name))[2]));

-- Agrega (o quita, con p_quitar) una foto de la carga. Solo acepta URLs de la carpeta de ese link.
create or replace function public.prep_foto(p_token text, p_url text, p_quitar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r registros%rowtype; fotos jsonb; h text;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into r from registros where prep_token = p_token for update;
  if not found then return null; end if;
  h := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if p_url is null or p_url not like 'https://oabtbzrfgwadnooexdwd.supabase.co/storage/v1/object/public/reportes/checklist/' || h || '/%' then
    raise exception 'URL no válida';
  end if;
  fotos := coalesce(r.preparacion->'fotos_carga','[]'::jsonb);
  if coalesce(p_quitar,false) then
    fotos := coalesce((select jsonb_agg(f) from jsonb_array_elements(fotos) f where f->>'url' <> p_url),'[]'::jsonb);
  elsif not exists(select 1 from jsonb_array_elements(fotos) f where f->>'url' = p_url) then
    if jsonb_array_length(fotos) >= 12 then raise exception 'Máximo 12 fotos'; end if;
    fotos := fotos || jsonb_build_array(jsonb_build_object('url',p_url,'fecha',now()));
  end if;
  update registros set preparacion = jsonb_set(coalesce(preparacion,'{}'::jsonb),'{fotos_carga}',fotos) where id = r.id;
  return public.prep_publica(p_token);
end
$$;
revoke all on function public.prep_foto(text,text,boolean) from public;
grant execute on function public.prep_foto(text,text,boolean) to anon, authenticated;
