// Flujo de caja de 8 semanas (como Finanzas de InnovaGestión): saldo de hoy en bancos y caja + cobros esperados −
// pagos comprometidos (facturas por pagar, cuotas de deudas, gastos fijos aún no generados y sueldos estimados).
// Lo atrasado (vencido) cae en la primera semana. Solo con costos.aprobar.
import { el } from '../../../core/ui/dom.js?v=5909720';
import { icono } from '../../../core/ui/iconos.js?v=5909720';
import { boton } from '../../../core/ui/tabla.js?v=5909720';
import { abrirFormulario } from '../../../core/ui/modal.js?v=5909720';
import { avisar } from '../../../core/ui/aviso.js?v=5909720';
import { dinero, fechaCorta, fechaLarga, sumarDias, moverMes } from '../../../core/ui/formato.js?v=5909720';
import { tocaEnMes, fechaEnMes } from '../datos.js?v=5909720';
import { cargarCuentas, cargarPendientes, cargarDeudas, cargarConfig, diaDelMes, lunesDe, hoy } from '../tesoreria.js?v=5909720';

const SEMANAS = 8;

export default async function vista(ctx) {
  if (!ctx.puede('costos', 'aprobar')) return sinPermiso();
  const e = ctx.empresa.id;
  const h = hoy();
  const inicio = lunesDe(h);
  const fin = sumarDias(inicio, SEMANAS * 7 - 1);
  const [cuentas, pend, deudas, cfg, rec, hechos] = await Promise.all([
    cargarCuentas(ctx), cargarPendientes(ctx), cargarDeudas(ctx), cargarConfig(ctx),
    ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).eq('activo', true),
    ctx.api.from('fin_registros').select('recurrente_id, periodo').eq('empresa_id', e).not('recurrente_id', 'is', null).is('deleted_at', null).gte('periodo', h.slice(0, 7)),
  ]);
  const caja = cuentas.filter((c) => c.activo && c.tipo !== 'tarjeta');
  const saldoHoy = caja.reduce((s, c) => s + Number(c.ultimo?.saldo ?? 0), 0);
  const sinSaldo = caja.filter((c) => !c.ultimo);

  // Movimientos esperados
  const movs = [];
  const agregar = (fecha, lado, descripcion, monto, tipo) => { if (monto > 0 && fecha <= fin) movs.push({ fecha: fecha < inicio ? inicio : fecha, atrasado: fecha < h, lado, descripcion, monto, tipo }); };
  for (const p of pend) agregar(p.fecha, p.lado === 'cobrar' ? 'entra' : 'sale', p.descripcion, p.monto, p.lado === 'cobrar' ? 'Por cobrar' : 'Por pagar');
  const meses = [h.slice(0, 7), moverMes(h.slice(0, 7), 1), moverMes(h.slice(0, 7), 2)];
  for (const d of deudas.filter((x) => x.activo && x.cuota > 0 && x.dia)) {
    for (const m of meses) { const f = diaDelMes(`${m}-01`, d.dia); if (f >= h && (!d.hasta || f <= d.hasta)) agregar(f, 'sale', `Cuota ${d.acreedor}`, Number(d.cuota), 'Deuda'); }
  }
  const tc = (rec.data ?? []).some((r) => r.moneda === 'USD') ? await import('../../../core/economia.js?v=5909720').then((m) => m.dolarDelDia()).catch(() => null) : null;
  const ya = new Set((hechos.data ?? []).map((x) => `${x.recurrente_id}|${x.periodo}`));
  for (const r of rec.data ?? []) {
    for (const m of meses) if (tocaEnMes(r, m) && !ya.has(`${r.id}|${m}`)) agregar(fechaEnMes(m, r.dia), 'sale', r.moneda === 'USD' ? `${r.concepto} (US$ ${r.monto})` : r.concepto, Math.round(r.moneda === 'USD' ? Number(r.monto) * (tc ?? 0) : Number(r.monto)), 'Gasto fijo');
  }
  if (cfg.sueldos_mes > 0) for (const m of meses) { const f = diaDelMes(`${m}-01`, cfg.dia_sueldos); if (f >= h) agregar(f, 'sale', 'Sueldos (estimado)', Number(cfg.sueldos_mes), 'Sueldos'); }

  // Semanas
  let saldo = saldoHoy;
  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const desde = sumarDias(inicio, i * 7); const hasta = sumarDias(desde, 6);
    const lista = movs.filter((m) => m.fecha >= desde && m.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const entra = lista.filter((m) => m.lado === 'entra').reduce((s, m) => s + m.monto, 0);
    const sale = lista.filter((m) => m.lado === 'sale').reduce((s, m) => s + m.monto, 0);
    saldo += entra - sale;
    return { desde, hasta, lista, entra, sale, saldo };
  });
  const minimo = Math.min(...semanas.map((s) => s.saldo));

  const ajustes = () => abrirFormulario({
    titulo: 'Ajustes del flujo de caja',
    campos: [
      { id: 'sueldos', etiqueta: 'Sueldos del mes (estimado, líquido a pagar)', tipo: 'number', valor: cfg.sueldos_mes },
      { id: 'dia', etiqueta: 'Día de pago de sueldos', tipo: 'number', valor: cfg.dia_sueldos },
    ],
    alGuardar: async (x) => {
      const fila = { sueldos_mes: Math.max(0, Math.round(Number(x.sueldos) || 0)), dia_sueldos: Math.min(31, Math.max(1, Math.round(Number(x.dia) || 30))) };
      const r = cfg.nuevo ? await ctx.api.from('fin_config').insert({ empresa_id: e, ...fila }) : await ctx.api.from('fin_config').update(fila).eq('empresa_id', e);
      if (r.error) throw new Error(r.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });

  const filaSemana = (s, i) => {
    const det = el('details', { class: 'flujo-semana' },
      el('summary', {},
        el('span', {}, el('strong', {}, i === 0 ? 'Esta semana' : `Semana ${i + 1}`), el('span', { class: 'texto-suave texto-chico' }, ` ${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}`)),
        el('span', { class: 'flujo-entra' }, s.entra ? `+${dinero(s.entra)}` : '—'),
        el('span', { class: 'flujo-sale' }, s.sale ? `−${dinero(s.sale)}` : '—'),
        el('strong', { class: s.saldo < 0 ? 'texto-error' : '' }, dinero(s.saldo))),
      s.lista.length ? el('div', { class: 'flujo-detalle' }, s.lista.map((m) => el('div', { class: 'flujo-mov' },
        el('span', { class: 'texto-chico texto-suave' }, m.atrasado ? 'Atrasado' : fechaLarga(m.fecha)),
        el('span', {}, m.descripcion, el('span', { class: 'texto-suave texto-chico' }, ` · ${m.tipo}`)),
        el('strong', { class: m.lado === 'entra' ? 'flujo-entra' : 'flujo-sale' }, `${m.lado === 'entra' ? '+' : '−'}${dinero(m.monto)}`))))
        : el('p', { class: 'texto-suave texto-chico' }, 'Sin movimientos esperados.'));
    return det;
  };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Flujo de caja'),
      el('div', { class: 'listado-acciones' }, boton('Ajustes', { icono: 'ajustes', onclick: ajustes }), boton('Anotar saldos', { icono: 'dinero', onclick: () => { location.hash = ctx.ruta('costos.balance'); } }))),
    sinSaldo.length || !caja.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      caja.length ? `Falta el saldo de: ${sinSaldo.map((c) => c.nombre).join(', ')}. Anótalo en Balance.` : 'Agrega tus cuentas (banco, caja) y su saldo en Balance para partir del saldo real.') : null,
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Saldo hoy', dinero(saldoHoy), 'bancos y caja'),
      tarjeta('Entra en 8 semanas', dinero(semanas.reduce((s, x) => s + x.entra, 0)), 'cobros esperados'),
      tarjeta('Sale en 8 semanas', dinero(semanas.reduce((s, x) => s + x.sale, 0)), 'pagos comprometidos'),
      tarjeta('Saldo más bajo', dinero(minimo), minimo < 0 ? 'falta caja: revisa cobros y pagos' : 'en las 8 semanas', minimo < 0 ? 'fin-alerta' : '')),
    el('div', { class: 'ficha doc-grupo flujo' },
      el('div', { class: 'flujo-cab texto-chico texto-suave' }, el('span', {}, 'Semana'), el('span', {}, 'Entra'), el('span', {}, 'Sale'), el('span', {}, 'Saldo')),
      semanas.map(filaSemana)),
    el('p', { class: 'texto-suave texto-chico' }, 'Cobros: lo por cobrar en su vencimiento (o 30 días después de su fecha). Pagos: facturas por pagar en su vencimiento (plazo del proveedor), cuotas de deudas, gastos fijos aún no generados y sueldos estimados (Ajustes). Lo vencido cae en esta semana.'));
}

const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
  el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);

export function sinPermiso() {
  return el('section', { class: 'listado' }, el('h1', {}, 'Sin acceso'),
    el('p', { class: 'texto-suave' }, 'Caja, flujo y balance los ve quien tiene el permiso "aprobar" en Costos.'));
}
