-- Ediciones del informe de trabajo guardadas sin confirmar (botón "Guardar" del informe).
-- {responsable, fecha, lugar, trabajo:[...], obs}
alter table public.registros add column if not exists informe jsonb;
