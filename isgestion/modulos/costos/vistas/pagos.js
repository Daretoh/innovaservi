// Pagos: comprobantes de pago por validar, validados y rechazados. Validar (permiso costos.aprobar) deja pagados los
// documentos que cubre por completo. Aviso "Falta factura" para proveedores de factura mensual: pagos o compras del
// mes sin una factura de ese proveedor. Cuentas con contratistas (2026-10-28): saldo de cada tercero con cuenta corriente
// (trabajos − compras hechas por su cuenta − abonos); la tarjeta abre su cuenta (costos.cuenta).
import { el } from '../../../core/ui/dom.js?v=6f62ff2';
import { icono } from '../../../core/ui/iconos.js?v=6f62ff2';
import { listado, boton } from '../../../core/ui/tabla.js?v=6f62ff2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6f62ff2';
import { avisar } from '../../../core/ui/aviso.js?v=6f62ff2';
import { urlFirmada } from '../../../core/adjuntos.js?v=6f62ff2';
import { dinero, fechaLarga, hoyISO, rangoMes, moverMes, nombreMes, diaLocal } from '../../../core/ui/formato.js?v=6f62ff2';
import { nombreTercero, nombreMedio } from '../datos.js?v=6f62ff2';
import { comprobante } from './subir.js?v=6f62ff2';

const filtro = { estado: 'por_validar' };
const ESTADOS = [['por_validar', 'Por validar'], ['validado', 'Validados'], ['rechazado', 'Rechazados']];
const CHIP = { por_validar: 'chip-prox', validado: 'chip-ok', rechazado: 'chip-venc' };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const mes = hoyISO().slice(0, 7);
  const { desde } = rangoMes(moverMes(mes, -1));
  const [pagos, nPor, us, mensuales, delMes] = await Promise.all([
    ctx.api.from('fin_pagos').select('*, terceros(razon_social, nombre_fantasia), fin_pago_registros(monto, fin_registros(id, concepto, doc_numero, total, estado_pago))')
      .eq('empresa_id', e).is('deleted_at', null).eq('estado', filtro.estado).order('fecha', { ascending: false }).limit(200),
    ctx.api.from('fin_pagos').select('id', { count: 'exact', head: true }).eq('empresa_id', e).is('deleted_at', null).eq('estado', 'por_validar'),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e }),
    ctx.api.from('fin_proveedores').select('tercero_id, terceros(razon_social, nombre_fantasia)').eq('empresa_id', e).eq('modalidad', 'mensual'),
    ctx.api.from('fin_registros').select('tercero_id, fecha, doc_tipo, total').eq('empresa_id', e).eq('tipo', 'gasto').is('deleted_at', null).gte('fecha', desde),
  ]);
  if (pagos.error) throw pagos.error;
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  // Contratistas con cuenta corriente: modalidad "cuenta" o con compras hechas por su cuenta
  const [cuentasCfg, conCompras] = await Promise.all([
    ctx.api.from('fin_proveedores').select('tercero_id, terceros(razon_social, nombre_fantasia)').eq('empresa_id', e).eq('modalidad', 'cuenta'),
    ctx.api.from('fin_registros').select('a_cuenta_de, cuenta:terceros!fin_registros_a_cuenta_de_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).not('a_cuenta_de', 'is', null).is('deleted_at', null).limit(1000),
  ]);
  const contratistas = new Map();
  for (const c of cuentasCfg.data ?? []) contratistas.set(c.tercero_id, c.terceros);
  for (const c of conCompras.data ?? []) if (!contratistas.has(c.a_cuenta_de)) contratistas.set(c.a_cuenta_de, c.cuenta);
  const saldos = await Promise.all([...contratistas].map(async ([id, t]) => {
    const { data: m } = await ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: id });
    const s = (k) => (m ?? []).filter((x) => x.tipo === k).reduce((a, x) => a + Number(x.monto), 0);
    return { id, t, saldo: s('trabajo') - s('compra') - s('abono'), compras: s('compra') };
  }));
  const aprueba = ctx.puede('costos', 'aprobar');

  // Falta factura: proveedores mensuales con compras o pagos del mes anterior o de este, sin factura en ese mes
  const faltan = [];
  for (const p of mensuales.data ?? []) {
    for (const m of [moverMes(mes, -1), mes]) {
      const regs = (delMes.data ?? []).filter((r) => r.tercero_id === p.tercero_id && r.fecha.startsWith(m));
      if (regs.some((r) => r.doc_tipo !== 'factura') && !regs.some((r) => r.doc_tipo === 'factura')) {
        faltan.push(`${nombreTercero(p.terceros)} · ${nombreMes(m)} (${dinero(regs.filter((r) => r.doc_tipo !== 'factura').reduce((s, r) => s + r.total, 0))} sin factura)`);
      }
    }
  }

  const cambiar = (p, estado, motivo = null) => ctx.api.from('fin_pagos').update({ estado, motivo_rechazo: motivo }).eq('id', p.id);
  const validar = async (p) => {
    const { error } = await cambiar(p, 'validado');
    if (error) { avisar(error.message, 'error'); return; }
    avisar('Comprobante validado: los documentos cubiertos quedaron pagados.'); ctx.refrescar();
  };
  const rechazar = (p) => abrirFormulario({
    titulo: 'Rechazar comprobante', campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, tipo: 'textarea' }], textoGuardar: 'Rechazar',
    alGuardar: async (x) => { const { error } = await cambiar(p, 'rechazado', x.motivo.trim()); if (error) throw new Error(error.message); avisar('Rechazado.'); ctx.refrescar(); },
  });
  const volver = async (p) => { const { error } = await cambiar(p, 'por_validar'); if (error) avisar(error.message, 'error'); else ctx.refrescar(); };
  const eliminar = (p) => abrirFormulario({
    titulo: 'Eliminar comprobante', mensaje: `${dinero(p.monto)} del ${fechaLarga(p.fecha)}. Si estaba validado, los documentos que cubría vuelven a por pagar.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { const { error } = await ctx.api.from('fin_pagos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw new Error(error.message); ctx.refrescar(); },
  });
  const ver = async (ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    ESTADOS.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(filtro.estado === k), onclick: () => { filtro.estado = k; ctx.refrescar(); } },
      k === 'por_validar' && nPor.count ? `${n} (${nPor.count})` : n)));
  const acciones = [segmento];
  if (ctx.puede('costos', 'crear')) acciones.push(boton('Subir comprobante', { icono: 'mas', tipo: 'primario', onclick: () => comprobante(ctx) }));

  const lista = listado({
    titulo: 'Pagos',
    filas: pagos.data,
    acciones,
    vacio: filtro.estado === 'por_validar' ? 'No hay comprobantes por validar.' : 'Sin comprobantes.',
    columnas: [
      { titulo: 'Fecha', valor: (p) => fechaLarga(p.fecha) },
      { titulo: 'Proveedor', valor: (p) => el('div', {}, el('strong', {}, p.terceros ? nombreTercero(p.terceros) : 'Sin proveedor'), p.notas ? el('div', { class: 'texto-suave texto-chico' }, p.notas) : null) },
      { titulo: 'Paga', valor: (p) => (p.fin_pago_registros.length
        ? el('div', { class: 'texto-chico' }, p.fin_pago_registros.map((l) => el('div', {}, el('a', { href: ctx.ruta('costos.registro', { id: l.fin_registros.id }) }, l.fin_registros.concepto),
          l.fin_registros.doc_numero ? ` N° ${l.fin_registros.doc_numero}` : '', ` · ${dinero(l.monto)}`, l.fin_registros.estado_pago === 'pagado' ? el('span', { class: 'chip chip-ok', style: 'margin-left:4px' }, 'pagado') : null)))
        : el('span', { class: 'texto-suave texto-chico' }, 'Sin documentos ligados')) },
      { titulo: 'Monto', valor: (p) => el('div', {}, el('strong', {}, dinero(p.monto)), el('div', { class: 'texto-suave texto-chico' }, nombreMedio[p.medio])) },
      { titulo: 'Estado', valor: (p) => el('div', {}, el('span', { class: `chip ${CHIP[p.estado]}` }, ESTADOS.find((x) => x[0] === p.estado)[1].replace(/s$/, '')),
        p.estado === 'validado' && p.validado_por ? el('div', { class: 'texto-suave texto-chico' }, `${quien.get(p.validado_por) ?? ''} · ${fechaLarga(diaLocal(p.validado_at))}`) : null,
        p.motivo_rechazo ? el('div', { class: 'texto-error texto-chico' }, p.motivo_rechazo) : null) },
      { titulo: 'Subió', valor: (p) => el('span', { class: 'texto-chico texto-suave' }, quien.get(p.created_by) ?? '—', el('br'), fechaLarga(diaLocal(p.created_at))) },
      { titulo: '', valor: (p) => el('div', { class: 'acciones-fila' },
        p.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver comprobante', 'aria-label': 'Ver comprobante', onclick: () => ver(p.archivo) }, icono('ojo', { tam: 16 })) : null,
        aprueba && p.estado === 'por_validar' ? boton('Validar', { icono: 'check', tipo: 'primario', onclick: () => validar(p) }) : null,
        aprueba && p.estado === 'por_validar' ? boton('Rechazar', { onclick: () => rechazar(p) }) : null,
        aprueba && p.estado !== 'por_validar' ? boton('Volver a por validar', { onclick: () => volver(p) }) : null,
        ctx.puede('costos', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar comprobante', onclick: () => eliminar(p) }, icono('basura', { tam: 16 })) : null) },
    ],
  });
  if (saldos.length) {
    lista.querySelector('.listado-cabecera').after(el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Cuentas con contratistas'),
      el('div', { class: 'fin-tarjetas' }, saldos.map((c) => el('a', { class: `ficha doc-grupo fin-tarjeta tarjeta-enlace ${c.saldo > 0 ? 'fin-alerta' : ''}`, href: ctx.ruta('costos.cuenta', { t: c.id }) },
        el('span', { class: 'texto-suave texto-chico' }, nombreTercero(c.t)), el('strong', {}, dinero(Math.abs(c.saldo))),
        el('span', { class: 'texto-suave texto-chico' }, c.saldo > 0 ? 'por pagarle' : c.saldo < 0 ? 'a favor de la empresa' : 'al día'))))));
  }
  if (faltan.length) {
    lista.querySelector('.listado-cabecera').after(el('div', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      el('div', {}, el('strong', {}, 'Falta factura'), el('div', { class: 'texto-chico' }, 'Proveedores de factura mensual con compras o pagos sin factura: ', faltan.join(' · ')))));
  }
  if (!aprueba) lista.querySelector('.listado-cabecera').after(el('p', { class: 'texto-suave texto-chico' }, 'Validar o rechazar comprobantes lo hace quien tiene el permiso "aprobar" en Costos.'));
  return lista;
}
