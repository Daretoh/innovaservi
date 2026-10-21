-- ============================================================
-- Archivos privados — DESHACER Paso 1: vuelve el bucket "reportes" a como estaba
-- (público, con lectura para "public"). Úsalo si después de aplicar algo dejó de verse.
-- ============================================================
begin;

update storage.buckets set public = true where id = 'reportes';

drop policy if exists reportes_auth_read on storage.objects;
drop policy if exists checklist_link_read on storage.objects;
drop policy if exists reportes_files_read on storage.objects;
create policy reportes_files_read on storage.objects
  for select to public
  using (bucket_id = 'reportes');

commit;

select id, public from storage.buckets where id = 'reportes';
