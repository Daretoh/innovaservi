-- ============================================================
-- Archivos privados — Paso 1: bucket "reportes" deja de ser público
-- Proyecto: oabtbzrfgwadnooexdwd (InnovaGestión).  NO correr sin el VB de Enzo.
-- Correr DESPUÉS de publicar la app nueva (rama seguridad-archivos-privados),
-- porque la app vieja abre las fotos con la URL pública y dejarían de verse.
-- Deshacer: 1-deshacer.sql
-- ============================================================
begin;

-- 1) El bucket ya no entrega archivos por /object/public/... (hay que pedir URL firmada)
update storage.buckets set public = false where id = 'reportes';

-- 2) Leer (y por lo tanto firmar URLs) solo con sesión.  Antes: reportes_files_read para "public".
drop policy if exists reportes_files_read on storage.objects;
drop policy if exists reportes_auth_read on storage.objects;
create policy reportes_auth_read on storage.objects
  for select to authenticated
  using (bucket_id = 'reportes');

-- 3) Link público de la cuadrilla (checklist con token, sin sesión): puede leer/firmar SOLO
--    sus propias fotos, en checklist/<sha256(token)>/ — la misma regla que ya usa para subir
--    (checklist_link_insert). Si el link se desactiva, el hash deja de ser válido.
drop policy if exists checklist_link_read on storage.objects;
create policy checklist_link_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'reportes'
    and (storage.foldername(name))[1] = 'checklist'
    and public.prep_token_hash_valido((storage.foldername(name))[2])
  );

commit;

-- Verificación (debe decir public = false y mostrar las 2 políticas nuevas):
select id, public from storage.buckets where id = 'reportes';
select policyname, cmd, roles from pg_policies
 where schemaname = 'storage' and policyname in ('reportes_auth_read','checklist_link_read','reportes_files_read');

-- ------------------------------------------------------------
-- OPCIONAL (decidir con Enzo, no incluido arriba):
-- a) Cédulas: hoy cualquier usuario con sesión puede leer el bucket "cedulas".
--    Se podría limitar a quien tenga permiso de RRHH, p. ej.:
--      drop policy if exists cedulas_auth_read on storage.objects;
--      create policy cedulas_auth_read on storage.objects for select to authenticated
--        using (bucket_id = 'cedulas' and public.puede('<modulo>.<accion>'));
--    Falta definir qué permiso (la app hoy no tiene uno específico de "ver cédulas").
-- b) cedulas_anon_insert deja subir a "cedulas" sin sesión directo a Storage. La ficha
--    de ingreso ya sube por la Edge Function subir-cedula (rol de servicio), así que
--    se podría quitar "anon" de esa política. Probar la ficha antes y después.
-- ------------------------------------------------------------
