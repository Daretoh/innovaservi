-- Aguinaldo y anticipo del mes, solo para trabajadores con contrato fijo (vista Asistencia mensual).
-- aguinaldo: se suma al total del mes. anticipo: ya pagado, se resta de "A pagar" (no del costo del mes).
-- (Ya aplicado en Supabase el 2026-10-27; se deja como registro. Seguro de re-ejecutar.)
create table if not exists public.remu_fijo_items (
  id            bigserial primary key,
  trabajador_id bigint not null references public.trabajadores(id) on delete cascade,
  mes           date not null,
  clase         text not null check (clase in ('aguinaldo','anticipo')),
  concepto      text,
  monto         numeric not null default 0 check (monto >= 0),
  autor         text,
  created_at    timestamptz not null default now()
);
create index if not exists remu_fijo_items_mes_idx on public.remu_fijo_items (mes);
alter table public.remu_fijo_items enable row level security;
drop policy if exists seg_remu_fijo_sel on public.remu_fijo_items;
drop policy if exists seg_remu_fijo_wr on public.remu_fijo_items;
create policy seg_remu_fijo_sel on public.remu_fijo_items for select to authenticated using ((select ig_algun(1, variadic array['remu','costos'])));
create policy seg_remu_fijo_wr  on public.remu_fijo_items for all    to authenticated using ((select ig_algun(2, variadic array['remu']))) with check ((select ig_algun(2, variadic array['remu'])));
notify pgrst, 'reload schema';

-- 2026-10-31: pasa a ser "movimientos del mes" para cualquier trabajador (fijo o spot, Innova o IS Performance por RUT).
-- Ya pagado (resta de "A pagar"): anticipo, adelanto, quincena · Suma al total: bono, aguinaldo · Resta del total: descuento.
-- (Ya aplicado en Supabase.)
alter table public.remu_fijo_items alter column trabajador_id drop not null;
alter table public.remu_fijo_items add column if not exists rut text;
alter table public.remu_fijo_items add column if not exists empresa text not null default 'innova';
-- checks: clase in ('aguinaldo','bono','anticipo','adelanto','quincena','descuento'), monto >= 0,
--         (trabajador_id is not null or rut is not null), empresa in ('innova','is')
