-- Trabajadores: contrato indefinido (sin fecha de término), para no confundirlo con un dato faltante.
-- Indefinido => contrato_vence queda vacío (la app lo limpia al guardar).
alter table public.trabajadores add column if not exists contrato_indefinido boolean not null default false;
