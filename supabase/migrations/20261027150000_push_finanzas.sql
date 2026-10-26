-- ============================================================
-- Aviso diario de pagos y cobros (Finanzas) por notificación push. Solo Cristopher y Enzo.
-- Usa lo que ya guarda Finanzas, sin tablas nuevas:
--   · Cuotas de deudas (fin_deudas: día de pago de cada mes): avisa 3 días antes, el día anterior y el mismo día.
--   · Gastos por pagar (fin_registros tipo gasto, sin fecha de pago, con vence): vencen en 3 días, mañana, hoy o ya vencidos.
--   · Ingresos por cobrar (fin_registros tipo ingreso, sin fecha de pago, con vence): vencidos.
-- Lo vencido se repite cada día hasta que se marque pagado/cobrado en Finanzas.
-- Corre cada hora (pg_cron) y actúa una vez al día desde las 08:00 de Chile. Requiere 20261026000000_push.sql.
-- ============================================================
alter table public.push_config add column if not exists ultimo_finanzas date;

create or replace function public.push_finanzas(forzar boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare ahora timestamp := now() at time zone 'America/Santiago'; hoy date := ahora::date;
        lineas text[] := '{}'; n_pagar int := 0; n_venc int := 0; n_cobrar int := 0; r record; dest text; n int := 0;
begin
  if not forzar then
    if extract(hour from ahora) < 8 then return 0; end if;
    if exists (select 1 from public.push_config where id = 1 and ultimo_finanzas = hoy) then return 0; end if;
  end if;
  insert into public.push_config (id, ultimo_finanzas) values (1, hoy)
    on conflict (id) do update set ultimo_finanzas = excluded.ultimo_finanzas, updated_at = now();

  -- 1) Cuotas de deudas: próxima fecha de pago según el día del mes (si el mes es más corto, el último día)
  for r in
    select d.acreedor, d.cuota, f.fecha, f.fecha - hoy dias
      from public.fin_deudas d
      cross join lateral (
        select least(make_date(extract(year from m)::int, extract(month from m)::int, 1) + (d.dia - 1),
                     (date_trunc('month', m) + interval '1 month - 1 day')::date) fecha
          from (select case when d.dia >= extract(day from hoy) then date_trunc('month', hoy)
                            else date_trunc('month', hoy) + interval '1 month' end m) mm) f
     where d.activo and d.dia is not null and d.cuota > 0 and (d.hasta is null or f.fecha <= d.hasta)
       and f.fecha - hoy in (0, 1, 3)
     order by f.fecha
  loop
    lineas := lineas || (case r.dias when 0 then 'Hoy' when 1 then 'Mañana' else 'En 3 días' end
               || ': cuota ' || r.acreedor || ' $' || replace(to_char(r.cuota, 'FM999,999,999'), ',', '.'));
    n_pagar := n_pagar + 1;
  end loop;

  -- 2) Gastos por pagar que vencen pronto
  for r in
    select coalesce(nullif(trim(tercero), ''), concepto, 'Gasto') que, total, vence, vence - hoy dias
      from public.fin_registros
     where deleted_at is null and tipo = 'gasto' and fecha_pago is null and vence is not null and vence - hoy in (0, 1, 3)
     order by vence
  loop
    lineas := lineas || (case r.dias when 0 then 'Hoy' when 1 then 'Mañana' else 'En 3 días' end
               || ': pagar ' || r.que || ' $' || replace(to_char(r.total, 'FM999,999,999'), ',', '.'));
    n_pagar := n_pagar + 1;
  end loop;

  -- 3) Gastos por pagar ya vencidos (resumen)
  select count(*), coalesce(sum(total), 0) into n_venc, n
    from public.fin_registros
   where deleted_at is null and tipo = 'gasto' and fecha_pago is null and vence is not null and vence < hoy;
  if n_venc > 0 then
    lineas := lineas || (n_venc || ' por pagar vencido' || case when n_venc > 1 then 's' else '' end
               || ' ($' || replace(to_char(n, 'FM999,999,999'), ',', '.') || ')');
  end if;

  -- 4) Por cobrar vencido (resumen)
  select count(*), coalesce(sum(total), 0) into n_cobrar, n
    from public.fin_registros
   where deleted_at is null and tipo = 'ingreso' and fecha_pago is null and vence is not null and vence < hoy;
  if n_cobrar > 0 then
    lineas := lineas || (n_cobrar || ' por cobrar vencido' || case when n_cobrar > 1 then 's' else '' end
               || ' ($' || replace(to_char(n, 'FM999,999,999'), ',', '.') || ')');
  end if;

  if coalesce(array_length(lineas, 1), 0) = 0 then return 0; end if;

  n := 0;
  foreach dest in array array['cristopher.ruiz@innovaservi.com', 'enzo.castro@innovaservi.com'] loop
    perform public.push_encolar(dest,
      'Pagos y cobros' || case when n_pagar > 0 then ': ' || n_pagar || ' por pagar pronto' else '' end,
      array_to_string(lineas, ' · '), './', 'diario-finanzas');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.push_finanzas(boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('push-finanzas') where exists (select 1 from cron.job where jobname = 'push-finanzas');
  perform cron.schedule('push-finanzas', '7 * * * *', 'select public.push_finanzas()');
end $$;
