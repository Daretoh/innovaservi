// Flujo de caja de 8 semanas (como Finanzas de InnovaGestión): saldo de hoy en bancos y caja + cobros esperados −
// pagos comprometidos (facturas por pagar, cuotas de deudas, gastos fijos aún no generados y sueldos estimados).
// Lo atrasado (vencido) cae en la primera semana. Solo con costos.aprobar.
import { el } from '../../../core/ui/dom.js?v=99f3bd0';
import { icono } from '../../../core/ui/iconos.js?v=99f3bd0';
import { boton } from '../../../core/ui/tabla.js?v=99f3bd0';
import { abrirFormulario } from '../../../core/ui/modal.js?v=99f3bd0';
import { avisar } from '../../../core/ui/aviso.js?v=99f3bd0';
import { dinero, fechaCorta, fechaLarga } from '../../../core/ui/formato.js?v=99f3bd0';
import { calcularFlujo } from '../tesoreria.js?v=99f3bd0';

const SEMANAS = 8;

export default async function vista(ctx) {
  if (!ctx.puede('costos', 'aprobar')) return sinPermiso();
  const e = ctx.empresa.id;
  const { caja, saldoHoy, sinSaldo, semanas, minimo, cfg } = await calcularFlujo(ctx, SEMANAS);

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
    el('p', { class: 'texto-suave texto-chico' }, 'Cobros: lo por cobrar en su vencimiento (o 30 días después de su fecha). Pagos: facturas por pagar en su vencimiento (plazo del proveedor), cuotas de deudas, pagos de cada mes y sueldos estimados (Ajustes). Lo vencido cae en esta semana.'));
}

const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
  el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);

export function sinPermiso() {
  return el('section', { class: 'listado' }, el('h1', {}, 'Sin acceso'),
    el('p', { class: 'texto-suave' }, 'Caja, flujo y balance los ve quien tiene el permiso "aprobar" en Costos.'));
}
