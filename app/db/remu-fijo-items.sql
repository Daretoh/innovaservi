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
