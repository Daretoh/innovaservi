-- ============================================================
-- DESHACER Paso 2: devuelve las URLs de cédulas guardadas en respaldo.cedula_urls.
-- (Solo si hiciera falta volver a la app vieja.)
-- ============================================================
begin;

update public.rrhh_docs d set url = r.valor
  from respaldo.cedula_urls r where r.tabla = 'rrhh_docs' and r.columna = 'url' and r.fila_id = d.id::text;
update public.rrhh_docs d set url2 = r.valor
  from respaldo.cedula_urls r where r.tabla = 'rrhh_docs' and r.columna = 'url2' and r.fila_id = d.id::text;
update public.trabajadores t set docs = r.valor::jsonb
  from respaldo.cedula_urls r where r.tabla = 'trabajadores' and r.columna = 'docs' and r.fila_id = t.id::text;

commit;
-- Cuando ya no haga falta:  drop table respaldo.cedula_urls;
