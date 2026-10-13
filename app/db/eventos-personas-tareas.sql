-- Calendario: al crear un trabajo se indican personas necesarias y una lista de tareas.
-- Planificación usa personas_nec como valor por defecto (si el día no tiene uno propio) y muestra las tareas.
alter table public.eventos add column if not exists personas_nec integer;
alter table public.eventos add column if not exists tareas jsonb not null default '[]'::jsonb;
