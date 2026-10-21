-- ============================================================
-- Archivos privados — Paso 2 (opcional, recomendado): quitar de las tablas los
-- enlaces firmados a 10 años de las cédulas.
--
-- Hasta ahora, al crear un trabajador desde la ficha de ingreso, la app guardaba en
-- rrhh_docs.url / url2 y trabajadores.docs una URL firmada de cédulas con vencimiento
-- de ~10 años (createSignedUrl(path, 315360000)). Quien tenga ese texto abre la cédula
-- sin sesión. Este script cambia esas URLs por la referencia sin token
--   .../storage/v1/object/authenticated/cedulas/<ruta>
-- que la app nueva firma por 1 hora al abrirla. (Al 21-10-2026: 21 en rrhh_docs, 9 en trabajadores.docs.)
--
-- IMPORTANTE: esto NO invalida los tokens viejos; solo los saca de las tablas. Para
-- invalidarlos hay que mover esos archivos a otra ruta o rotar el secreto JWT (ver README).
-- Requiere la app nueva publicada (la vieja no sabe abrir el formato "authenticated").
-- Respaldo: guarda los valores anteriores en respaldo.cedula_urls (esquema no expuesto por la API).
-- Deshacer: 2-cedulas-enlaces-deshacer.sql
-- ============================================================
begin;

create schema if not exists respaldo;
revoke all on schema respaldo from public, anon, authenticated;
create table if not exists respaldo.cedula_urls (
  tabla text not null, fila_id text not null, columna text not null, valor text,
  respaldado_at timestamptz not null default now()
);

-- rrhh_docs.url / url2
insert into respaldo.cedula_urls (tabla, fila_id, columna, valor)
  select 'rrhh_docs', id::text, 'url', url from public.rrhh_docs where url ~ '/object/sign/cedulas/';
insert into respaldo.cedula_urls (tabla, fila_id, columna, valor)
  select 'rrhh_docs', id::text, 'url2', url2 from public.rrhh_docs where url2 ~ '/object/sign/cedulas/';
update public.rrhh_docs
   set url = regexp_replace(url, '/object/sign/cedulas/([^?]+)\?token=[^&#]*(&[^#]*)?', '/object/authenticated/cedulas/\1')
 where url ~ '/object/sign/cedulas/';
update public.rrhh_docs
   set url2 = regexp_replace(url2, '/object/sign/cedulas/([^?]+)\?token=[^&#]*(&[^#]*)?', '/object/authenticated/cedulas/\1')
 where url2 ~ '/object/sign/cedulas/';

-- trabajadores.docs (jsonb: [{url, nombre, tipo, fecha}, ...])
insert into respaldo.cedula_urls (tabla, fila_id, columna, valor)
  select 'trabajadores', id::text, 'docs', docs::text from public.trabajadores where docs::text ~ '/object/sign/cedulas/';
update public.trabajadores
   set docs = regexp_replace(docs::text, '/object/sign/cedulas/([^?"]+)\?token=[^"&#]*(&[^"#]*)?', '/object/authenticated/cedulas/\1', 'g')::jsonb
 where docs::text ~ '/object/sign/cedulas/';

commit;

-- Verificación: todo en 0
select (select count(*) from public.rrhh_docs where coalesce(url,'')||coalesce(url2,'') ~ '/object/sign/cedulas/') rrhh_con_token,
       (select count(*) from public.trabajadores where docs::text ~ '/object/sign/cedulas/') trab_con_token,
       (select count(*) from respaldo.cedula_urls) respaldados;
