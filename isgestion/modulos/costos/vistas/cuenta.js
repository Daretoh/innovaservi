// Cuenta corriente con un contratista (2026-10-28; ej.: desabolladura y pintura): lo que cobra por sus trabajos, menos
// las compras que la empresa hizo por su cuenta (se pagan al local y se le descuentan) y los abonos que se le pagan.
// Resumen por mes y saldo acumulado, como la planilla "Resumen D&P". Se abre desde Pagos (sin opción nueva en el menú).
// Ruta: #/costos.cuenta?t=<tercero>
import { el } from '../../../core/ui/dom.js?v=14ad9ff';
import { icono } from '../../../core/ui/iconos.js?v=14ad9ff';
import { boton } from '../../../core/ui/tabla.js?v=14ad9ff';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14ad9ff';
import { avisar } from '../../../core/ui/aviso.js?v=14ad9ff';
import { subirArchivo } from '../../../core/adjuntos.js?v=14ad9ff';
import { dinero, fechaLarga, hoyISO, nombreMes } from '../../../core/ui/formato.js?v=14ad9ff';
import { nombreTercero, MEDIOS } from '../datos.js?v=14ad9ff';

const TIPO = { trabajo: ['Trabajo', 'chip-ok'], compra: ['Compra a su cuenta', 'chip-prox'], abono: ['Abono', 'chip-pend'] };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const t = ctx.params.t;
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.pagos') }, icono('volver', { tam: 16 }), 'Pagos');
  const [{ data: ter }, mov] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, rut').eq('id', t).maybeSingle(),
    ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: t }),
  ]);
  if (!ter) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Contratista no encontrado'));
  if (mov.error) throw mov.error;
  const movs = mov.data ?? [];
  const suma = (k, l = movs) => l.filter((m) => m.tipo === k).reduce((s, m) => s + Number(m.monto), 0);
  const saldo = suma('trabajo') - suma('compra') - suma('abono');

  // Resumen por mes con saldo acumulado
  const meses = [...new Set(movs.map((m) => m.fecha.slice(0, 7)))].sort();
  let acumulado = 0;
  const resumen = meses.map((m) => {
    const l = movs.filter((x) => x.fecha.startsWith(m));
    const fila = { m, trabajos: suma('trabajo', l), compras: suma('compra', l), abonos: suma('abono', l) };
    fila.neto = fila.trabajos - fila.compras - fila.abonos; acumulado += fila.neto; fila.saldo = acumulado;
    return fila;
  });

  const abono = () => abrirFormulario({
    titulo: `Abono a ${nombreTercero(ter)}`,
    mensaje: saldo > 0 ? `Saldo a pagar hoy: ${dinero(saldo)} (trabajos menos compras a su cuenta y abonos anteriores).` : 'No hay saldo pendiente: el abono queda como adelanto.',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true, valor: saldo > 0 ? String(saldo) : '' },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'notas', etiqueta: 'Detalle', valor: saldo > 0 ? 'Abono pago' : 'Adelanto pago' },
      { id: 'archivo', etiqueta: 'Comprobante (opcional)', tipo: 'file', accept: 'image/*,application/pdf' },
    ],
    textoGuardar: 'Registrar abono',
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      const ruta = x.archivo?.size ? (await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo: x.archivo, tabla: 'fin_pagos' })).ruta : null;
      const { error } = await ctx.api.from('fin_pagos').insert({ empresa_id: e, fecha: x.fecha, monto, medio: x.medio, tercero_id: t, archivo: ruta, notas: x.notas.trim() || null,
        estado: ctx.puede('costos', 'aprobar') ? 'validado' : 'por_validar' });
      if (error) throw new Error(error.message);
      avisar(ctx.puede('costos', 'aprobar') ? 'Abono registrado.' : 'Abono registrado: queda por validar en Pagos.'); ctx.refrescar();
    },
  });
  // Al dejar la cuenta al día, sus trabajos dejan de figurar "por pagar" (el saldo no cambia)
  const alDia = () => abrirFormulario({
    titulo: 'Dejar los trabajos como pagados',
    mensaje: `Los ${movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').length} trabajos por pagar quedan pagados hoy (se pagaron con abonos y descuentos de compras). Úsalo cuando el saldo quedó en cero. El saldo de la cuenta no cambia.`,
    campos: [], textoGuardar: 'Dejar al día',
    alGuardar: async () => {
      const ids = movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').map((m) => m.id);
      if (!ids.length) return;
      const { error } = await ctx.api.from('fin_registros').update({ estado_pago: 'pagado', fecha_pago: hoyISO(), medio_pago: 'otro' }).in('id', ids);
      if (error) throw new Error(error.message);
      avisar('Trabajos al día.'); ctx.refrescar();
    },
  });
  const excel = () => import('../../../core/excel.js?v=14ad9ff').then(({ nuevoExcel }) => nuevoExcel(ctx, { titulo: `Cuenta de ${nombreTercero(ter)}`, subtitulo: `Saldo ${saldo >= 0 ? 'a pagarle' : 'a favor de la empresa'}: ${dinero(Math.abs(saldo))}` }))
    .then(async (x) => {
      x.tabla({ titulo: 'Resumen mensual', columnas: ['Mes', { t: 'Trabajos', tipo: 'dinero' }, { t: 'Compras a su cuenta', tipo: 'dinero' }, { t: 'Abonos', tipo: 'dinero' }, { t: 'Neto del mes', tipo: 'dinero' }, { t: 'Saldo', tipo: 'dinero' }],
        filas: resumen.map((r) => [nombreMes(r.m), r.trabajos, r.compras, r.abonos, r.neto, r.saldo]) });
      for (const k of ['trabajo', 'compra', 'abono']) {
        x.tabla({ titulo: { trabajo: 'Trabajos', compra: 'Compras por su cuenta', abono: 'Abonos' }[k], columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Detalle', 'Patente', { t: 'Monto', tipo: 'dinero' }],
          filas: movs.filter((m) => m.tipo === k).map((m) => [m.fecha, m.concepto, m.patente ?? '', Number(m.monto)]), total: ['Total', '', '', suma(k)] });
      }
      await x.guardar(`cuenta-${nombreTercero(ter)}-${hoyISO()}`);
    }).catch((err) => avisar(err.message, 'error'));

  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const fila = (m) => el(m.tipo === 'abono' ? 'div' : 'a', { class: 'doc-fila', ...(m.tipo === 'abono' ? {} : { href: ctx.ruta('costos.registro', { id: m.id }) }) },
    el('span', { class: `chip ${TIPO[m.tipo][1]}` }, TIPO[m.tipo][0]),
    el('span', { class: 'doc-nombre' }, el('strong', {}, m.concepto), el('span', { class: 'texto-suave texto-chico' }, [fechaLarga(m.fecha), m.patente,
      m.tipo === 'trabajo' && m.estado !== 'pagado' ? 'por pagar' : null, m.tipo === 'abono' && m.estado === 'por_validar' ? 'por validar' : null].filter(Boolean).join(' · '))),
    el('strong', { class: m.tipo === 'trabajo' ? '' : 'texto-suave' }, `${m.tipo === 'trabajo' ? '' : '−'}${dinero(m.monto)}`));

  const acciones = [];
  if (ctx.puede('costos', 'exportar') && movs.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: excel }));
  if (ctx.puede('costos', 'editar') && movs.some((m) => m.tipo === 'trabajo' && m.estado !== 'pagado')) acciones.push(boton('Dejar al día', { icono: 'check', onclick: alDia }));
  if (ctx.puede('costos', 'crear')) acciones.push(boton('Registrar abono', { icono: 'mas', tipo: 'primario', onclick: abono }));
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `Cuenta de ${nombreTercero(ter)}`), el('p', { class: 'texto-suave' }, 'Lo que cobra por sus trabajos, menos las compras hechas por su cuenta y los abonos.')),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Trabajos', suma('trabajo'), `${movs.filter((m) => m.tipo === 'trabajo').length} trabajos`),
      tarjeta('Compras por su cuenta', suma('compra'), 'se le descuentan'),
      tarjeta('Abonos', suma('abono'), 'pagados'),
      tarjeta(saldo >= 0 ? 'Saldo a pagarle' : 'Saldo a favor de la empresa', Math.abs(saldo), 'trabajos − compras − abonos', saldo > 0 ? 'fin-alerta' : '')),
    resumen.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Resumen mensual'),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Mes', 'Trabajos', 'Compras', 'Abonos', 'Neto del mes', 'Saldo'].map((h) => el('th', {}, h)))),
        el('tbody', {}, resumen.map((r) => el('tr', {}, el('td', {}, nombreMes(r.m)), el('td', {}, dinero(r.trabajos)), el('td', {}, r.compras ? `−${dinero(r.compras)}` : '—'),
          el('td', {}, r.abonos ? `−${dinero(r.abonos)}` : '—'), el('td', {}, dinero(r.neto)), el('td', {}, el('strong', {}, dinero(r.saldo))))))))) : null,
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Movimientos'),
      movs.length ? [...movs].reverse().map(fila) : el('p', { class: 'texto-suave' }, 'Sin movimientos. Los trabajos se registran desde la orden del taller (Costos con la patente → Trabajo de un tercero) o como gasto con este proveedor; las compras, marcando "por cuenta de" en el gasto o al leer la boleta.')),
    el('p', { class: 'texto-suave texto-chico' }, 'Las compras por su cuenta se pagan al local como cualquier gasto, pero no son costo de la empresa: no entran al Estado de resultados ni a la utilidad por orden.'));
}
