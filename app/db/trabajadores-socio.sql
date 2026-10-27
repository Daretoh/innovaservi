-- Socios de la empresa: no aparecen en Remuneraciones (pago semanal ni asistencia mensual). No cambia sus horas ni otros módulos.
-- (Ya aplicado en Supabase el 2026-10-27: Cristopher Ruiz y Jorge Enrique Castro Vega.) Se marca/desmarca en la ficha del trabajador.
alter table public.trabajadores add column if not exists socio boolean not null default false;
notify pgrst, 'reload schema';
