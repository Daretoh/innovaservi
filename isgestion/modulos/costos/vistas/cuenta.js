// Cuenta corriente con un proveedor (2026-10-28; ej.: desabolladura y pintura, o colaciones que se pagan antes y se
// facturan a fin de mes, 2026-11-03): sus facturas o trabajos, menos
// las compras que la empresa hizo por su cuenta (se pagan al local y se le descuentan) y los abonos que se le pagan.
// Pestañas: Resumen mensual (solo lectura, como la planilla "Resumen D&P": por mes sus trabajos, compras y pagos con
// saldo acumulado) y Movimientos (registrar pago, dejar al día). Se abre desde Pagos (sin opción nueva en el menú).
// Ruta: #/costos.cuenta?t=<tercero>
import { el } from '../../../core/ui/dom.js?v=6098579';
import { icono } from '../../../core/ui/iconos.js?v=6098579';
import { boton } from '../../../core/ui/tabla.js?v=6098579';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6098579';
import { avisar } from '../../../core/ui/aviso.js?v=6098579';
import { subirArchivo } from '../../../core/adjuntos.js?v=6098579';
import { dinero, fechaLarga, hoyISO, nombreMes } from '../../../core/ui/formato.js?v=6098579';
import { nombreTercero, MEDIOS } from '../datos.js?v=6098579';

let pestana = 'resumen', tercero = null;   // vuelve al resumen al abrir otra cuenta
const TIPO = { trabajo: ['Factura o trabajo', 'chip-ok'], compra: ['Compra a su cuenta', 'chip-prox'], abono: ['Pago', 'chip-pend'] };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const t = ctx.params.t;
  if (t !== tercero) { tercero = t; pestana = 'resumen'; }
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.pagos') }, icono('volver', { tam: 16 }), 'Pagos');
  const [{ data: ter }, mov] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, rut').eq('id', t).maybeSingle(),
    ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: t }),
  ]);
  if (!ter) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Proveedor no encontrado'));
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
    titulo: `Pago a ${nombreTercero(ter)}`,
    mensaje: saldo > 0 ? `Saldo a pagar hoy: ${dinero(saldo)} (facturas o trabajos menos compras a su cuenta y pagos anteriores).` : 'No hay saldo pendiente: el pago queda a cuenta de la próxima factura.',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true, valor: saldo > 0 ? String(saldo) : '' },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'notas', etiqueta: 'Detalle', valor: saldo > 0 ? 'Pago' : 'Pago a cuenta' },
      { id: 'archivo', etiqueta: 'Comprobante (opcional)', tipo: 'file', accept: 'image/*,application/pdf' },
    ],
    textoGuardar: 'Registrar pago',
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      const ruta = x.archivo?.size ? (await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo: x.archivo, tabla: 'fin_pagos' })).ruta : null;
      const { error } = await ctx.api.from('fin_pagos').insert({ empresa_id: e, fecha: x.fecha, monto, medio: x.medio, tercero_id: t, archivo: ruta, notas: x.notas.trim() || null,
        estado: ctx.puede('costos', 'aprobar') ? 'validado' : 'por_validar' });
      if (error) throw new Error(error.message);
      avisar(ctx.puede('costos', 'aprobar') ? 'Pago registrado.' : 'Pago registrado: queda por validar en Pagos.'); ctx.refrescar();
    },
  });
  // Al dejar la cuenta al día, sus trabajos dejan de figurar "por pagar" (el saldo no cambia)
  const alDia = () => abrirFormulario({
    titulo: 'Dejar las facturas o trabajos como pagados',
    mensaje: `Los ${movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').length} facturas o trabajos por pagar quedan pagados hoy (se pagaron con los pagos registrados y descuentos de compras). Úsalo cuando el saldo quedó en cero. El saldo de la cuenta no cambia.`,
    campos: [], textoGuardar: 'Dejar al día',
    alGuardar: async () => {
      const ids = movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').map((m) => m.id);
      if (!ids.length) return;
      const { error } = await ctx.api.from('fin_registros').update({ estado_pago: 'pagado', fecha_pago: hoyISO(), medio_pago: 'otro' }).in('id', ids);
      if (error) throw new Error(error.message);
      avisar('Cuenta al día.'); ctx.refrescar();
    },
  });
  const excel = () => import('../../../core/excel.js?v=6098579').then(({ nuevoExcel }) => nuevoExcel(ctx, { titulo: `Cuenta de ${nombreTercero(ter)}`, subtitulo: `Saldo ${saldo >= 0 ? 'a pagarle' : 'a favor de la empresa'}: ${dinero(Math.abs(saldo))}` }))
    .then(async (x) => {
      x.tabla({ titulo: 'Resumen mensual', columnas: ['Mes', { t: 'Facturas o trabajos', tipo: 'dinero' }, { t: 'Compras a su cuenta', tipo: 'dinero' }, { t: 'Pagos', tipo: 'dinero' }, { t: 'Neto del mes', tipo: 'dinero' }, { t: 'Saldo', tipo: 'dinero' }],
        filas: resumen.map((r) => [nombreMes(r.m), r.trabajos, r.compras, r.abonos, r.neto, r.saldo]) });
      for (const k of ['trabajo', 'compra', 'abono']) {
        x.tabla({ titulo: { trabajo: 'Facturas o trabajos', compra: 'Compras por su cuenta', abono: 'Pagos' }[k], columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Detalle', 'Patente', { t: 'Monto', tipo: 'dinero' }],
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

  // Resumen mensual: totales por mes y el detalle de cada mes (solo lectura, sin enlaces a edición)
  const estadoDe = (m) => (m.tipo === 'trabajo' ? (m.estado === 'pagado' ? 'Pagado' : 'Por pagar') : m.estado === 'por_validar' ? 'Por validar' : 'Validado');
  const tablaDetalle = (titulo, lista, conEstado) => el('div', { class: 'cue-detalle' },
    el('h3', {}, titulo),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Detalle'), el('th', {}, 'Patente'), conEstado ? el('th', {}, 'Estado') : null, el('th', { class: 'num' }, 'Monto'))),
      el('tbody', {}, lista.map((m) => el('tr', {}, el('td', {}, fechaLarga(m.fecha)), el('td', {}, m.concepto), el('td', {}, m.patente ?? '—'),
        conEstado ? el('td', {}, estadoDe(m)) : null, el('td', { class: 'num' }, dinero(m.monto))))),
      el('tfoot', {}, el('tr', {}, el('th', { colspan: conEstado ? 4 : 3 }, `Total (${lista.length})`),
        el('th', { class: 'num' }, dinero(lista.reduce((x, m) => x + Number(m.monto), 0))))))));
  const menos = (n) => (n ? `−${dinero(n)}` : '—');
  const vistaResumen = () => (!resumen.length ? el('div', { class: 'ficha doc-grupo' }, el('p', { class: 'texto-suave' }, 'Sin movimientos.')) : [
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Resumen mensual'),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Mes'), ['Facturas o trabajos', 'Compras a su cuenta', 'Pagos', 'Neto del mes', 'Saldo acumulado'].map((h) => el('th', { class: 'num' }, h)))),
        el('tbody', {}, resumen.map((r) => el('tr', {}, el('td', {}, nombreMes(r.m)), el('td', { class: 'num' }, dinero(r.trabajos)), el('td', { class: 'num' }, menos(r.compras)),
          el('td', { class: 'num' }, menos(r.abonos)), el('td', { class: 'num' }, dinero(r.neto)), el('td', { class: 'num' }, el('strong', {}, dinero(r.saldo)))))),
        el('tfoot', {}, el('tr', {}, el('th', {}, 'Total'), el('th', { class: 'num' }, dinero(suma('trabajo'))), el('th', { class: 'num' }, menos(suma('compra'))),
          el('th', { class: 'num' }, menos(suma('abono'))), el('th', { class: 'num' }, dinero(saldo)), el('th', { class: 'num' }, dinero(saldo))))))),
    // Detalle por mes, del más reciente al más antiguo
    ...[...resumen].reverse().map((r) => {
      const de = (k) => movs.filter((x) => x.tipo === k && x.fecha.startsWith(r.m));
      return el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, nombreMes(r.m)),
        el('p', { class: 'texto-suave texto-chico' }, `Trabajos ${dinero(r.trabajos)} − compras ${dinero(r.compras)} − pagos ${dinero(r.abonos)} = ${dinero(r.neto)} · saldo acumulado ${dinero(r.saldo)}`),
        de('trabajo').length ? tablaDetalle('Facturas o trabajos', de('trabajo'), true) : null,
        de('compra').length ? tablaDetalle('Compras por su cuenta', de('compra'), false) : null,
        de('abono').length ? tablaDetalle('Pagos', de('abono'), true) : null);
    }),
  ]);
  const vistaMovimientos = () => el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Movimientos'),
    movs.length ? [...movs].reverse().map(fila) : el('p', { class: 'texto-suave' }, 'Sin movimientos. Las facturas se suben como gasto con este proveedor (Subir documentos); los pagos, con Registrar pago o como comprobante. Los trabajos de un contratista se registran desde la orden del taller (Costos con la patente → Trabajo de un tercero) o como gasto con este proveedor; las compras, marcando "por cuenta de" en el gasto o al leer la boleta.'));

  // Las acciones que modifican la cuenta solo aparecen en Movimientos; el Resumen es solo de lectura
  const acciones = [];
  if (ctx.puede('costos', 'exportar') && movs.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: excel }));
  if (pestana === 'movimientos') {
    if (ctx.puede('costos', 'editar') && movs.some((m) => m.tipo === 'trabajo' && m.estado !== 'pagado')) acciones.push(boton('Dejar al día', { icono: 'check', onclick: alDia }));
    if (ctx.puede('costos', 'crear')) acciones.push(boton('Registrar pago', { icono: 'mas', tipo: 'primario', onclick: abono }));
  }
  const barra = el('div', { class: 'pestanas', role: 'tablist' }, [['resumen', 'Resumen mensual'], ['movimientos', 'Movimientos']].map(([id, txt]) =>
    el('button', { type: 'button', role: 'tab', 'aria-selected': String(pestana === id), onclick: () => { pestana = id; ctx.refrescar(); } }, txt)));
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `Cuenta de ${nombreTercero(ter)}`), el('p', { class: 'texto-suave' }, 'Sus facturas o trabajos, menos las compras hechas por su cuenta y lo que ya se le pagó.')),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Facturas o trabajos', suma('trabajo'), `${movs.filter((m) => m.tipo === 'trabajo').length} documentos`),
      tarjeta('Compras por su cuenta', suma('compra'), 'se le descuentan'),
      tarjeta('Pagos', suma('abono'), 'transferencias y abonos'),
      tarjeta(saldo >= 0 ? 'Saldo a pagarle' : 'Pagado a cuenta (falta su factura)', Math.abs(saldo), 'facturas − compras − pagos', saldo > 0 ? 'fin-alerta' : '')),
    barra,
    pestana === 'resumen' ? vistaResumen() : vistaMovimientos(),
    el('p', { class: 'texto-suave texto-chico' }, 'Las compras por su cuenta se pagan al local como cualquier gasto, pero no son costo de la empresa: no entran al Estado de resultados ni a la utilidad por orden.'));
}
