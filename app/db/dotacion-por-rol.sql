-- Dotación necesaria por rol: {"op": operarios, "sup": supervisores, "prev": prevencionistas}.
-- eventos.dotacion = la del trabajo (Calendario); faena_plan.dotacion = ajuste de un día en Planificación.
-- personas_nec se mantiene como el total (suma) para lo que ya lo usa.
alter table public.eventos add column if not exists dotacion jsonb;
alter table public.faena_plan add column if not exists dotacion jsonb;
