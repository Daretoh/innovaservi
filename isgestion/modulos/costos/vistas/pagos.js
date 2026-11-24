// Proveedores y cuentas (antes "Pagos"; 2026-11-24, pedido de Enzo: muchos proveedores, pero solo a unos pocos hay que
// hacerles seguimiento). Arriba, lo que hay que hacer: pagos por validar y facturas que faltan. Después, los proveedores
// con seguimiento (modalidad "cuenta" o "mensual" en Todos los proveedores, o con compras hechas por su cuenta), cada uno
// con su saldo en palabras: le debemos, pagado de más (falta su factura) o al día. Su tarjeta abre la cuenta del
// proveedor (costos.cuenta), donde se registra el pago con su comprobante. Al final, los demás proveedores con algo
// por pagar. El listado de todos los pagos registrados queda plegado.
import { el } from '../../../core/ui/dom.js?v=9dd99fc';
import { icono } from '../../../core/ui/iconos.js?v=9dd99fc';
import { listado, boton } from '../../../core/ui/tabla.js?v=9dd99fc';
import { abrirFormulario } from '../../../core/ui/modal.js?v=9dd99fc';
import { avisar } from '../../../core/ui/aviso.js?v=9dd99fc';
import { urlFirmada } from '../../../core/adjuntos.js?v=9dd99fc';
import { dinero, fechaLarga, hoyISO, rangoMes, moverMes, nombreMes, diaLocal } from '../../../core/ui/formato.js?v=9dd99fc';
import { nombreTercero, nombreMedio } from '../datos.js?v=9dd99fc';

const filtro = { estado: 'por_validar' };
const ESTADOS = [['por_validar', 'Por validar'], ['validado', 'Validados'], ['rechazado', 'Rechazados']];
const CHIP = { por_validar: 'chip-prox', validado: 'chip-ok', rechazado: 'chip-venc' };
const TIPO = {
  contratista: ['Contratista', 'Cobra sus trabajos y le descontamos las compras hechas por su cuenta.'],
  adelantado: ['Pagamos antes, factura después', 'Se le paga por transferencia y la factura llega después (p. ej. a fin de mes).'],
  mensual: ['Factura una vez al mes', 'Junta las compras del mes en una factura.'],
  cuenta: ['Cuenta corriente', 'Se le va pagando por partes.'],
};

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const mes = hoyISO().slice(0, 7);
  const { desde } = rangoMes(moverMes(mes, -1));
  const [pagos, nPor, us, provs, delMes, conCompras, porPagar] = await Promise.all([
    ctx.api.from('fin_pagos').select('*, terceros(razon_social, nombre_fantasia), fin_pago_registros(monto, fin_registros(id, concepto, doc_numero, total, estado_pago))')
      .eq('empresa_id', e).is('deleted_at', null).eq('estado', filtro.estado).order('fecha', { ascending: false }).limit(200),
    ctx.api.from('fin_pagos').select('id', { count: 'exact', head: true }).eq('empresa_id', e).is('deleted_at', null).eq('estado', 'por_validar'),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e }),
    ctx.api.from('fin_proveedores').select('tercero_id, modalidad, terceros(razon_social, nombre_fantasia)').eq('empresa_id', e).in('modalidad', ['mensual', 'cuenta']),
    ctx.api.from('fin_registros').select('tercero_id, fecha, doc_tipo, total').eq('empresa_id', e).eq('tipo', 'gasto').is('deleted_at', null).gte('fecha', desde),
    ctx.api.from('fin_registros').select('a_cuenta_de, cuenta:terceros!fin_registros_a_cuenta_de_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).not('a_cuenta_de', 'is', null).is('deleted_at', null).limit(1000),
    ctx.api.from('fin_registros').select('tercero_id, total, fecha, vence, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).eq('tipo', 'gasto')
      .neq('estado_pago', 'pagado').is('a_cuenta_de', null).not('tercero_id', 'is', null).is('deleted_at', null).limit(2000),
  ]);
  if (pagos.error) throw pagos.error;
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  const aprueba = ctx.puede('costos', 'aprobar');

  // Proveedores con seguimiento: modalidad cuenta o mensual, o con compras hechas por su cuenta
  const seguidos = new Map();
  for (const p of provs.data ?? []) seguidos.set(p.tercero_id, { t: p.terceros, modalidad: p.modalidad });
  for (const c of conCompras.data ?? []) if (!seguidos.has(c.a_cuenta_de)) seguidos.set(c.a_cuenta_de, { t: c.cuenta, modalidad: 'cuenta' });
  const cuentas = await Promise.all([...seguidos].map(async ([id, x]) => {
    const { data: m } = await ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: id });
    const s = (k) => (m ?? []).filter((y) => y.tipo === k).reduce((a, y) => a + Number(y.monto), 0);
    const cobro = s('trabajo'), compras = s('compra'), pagado = s('abono');
    const tipo = x.modalidad === 'mensual' ? 'mensual' : compras > 0 ? 'contratista' : cobro === 0 && pagado > 0 ? 'adelantado' : 'cuenta';
    const ultimo = (m ?? []).reduce((a, y) => (y.fecha > a ? y.fecha : a), '');
    return { id, t: x.t, tipo, cobro, compras, pagado, saldo: cobro - compras - pagado, ultimo };
  }));
  cuentas.sort((a, b) => (Math.abs(b.saldo) - Math.abs(a.saldo)) || nombreTercero(a.t).localeCompare(nombreTercero(b.t)));

  // Falta factura: proveedores mensuales con compras del mes anterior o de este sin una factura en ese mes
  const faltan = [];
  for (const p of (provs.data ?? []).filter((x) => x.modalidad === 'mensual')) {
    for (const m of [moverMes(mes, -1), mes]) {
      const regs = (delMes.data ?? []).filter((r) => r.tercero_id === p.tercero_id && r.fecha.startsWith(m));
      if (regs.some((r) => r.doc_tipo !== 'factura') && !regs.some((r) => r.doc_tipo === 'factura')) {
        faltan.push(`${nombreTercero(p.terceros)} · ${nombreMes(m)} (${dinero(regs.filter((r) => r.doc_tipo !== 'factura').reduce((s, r) => s + r.total, 0))} sin factura)`);
      }
    }
  }
  for (const c of cuentas.filter((x) => x.tipo === 'adelantado' && x.saldo < 0)) faltan.push(`${nombreTercero(c.t)} (pagado ${dinero(-c.saldo)} sin factura)`);

  // Los demás proveedores con algo por pagar (se pagan compra a compra)
  const otros = new Map();
  for (const r of porPagar.data ?? []) {
    if (seguidos.has(r.tercero_id)) continue;
    const o = otros.get(r.tercero_id) ?? { id: r.tercero_id, t: r.terceros, total: 0, n: 0, vence: null };
    o.total += Number(r.total); o.n += 1;
    const v = r.vence ?? r.fecha; if (!o.vence || v < o.vence) o.vence = v;
    otros.set(r.tercero_id, o);
  }
  const otrosLista = [...otros.values()].sort((a, b) => b.total - a.total);

  // ---- Pagos registrados (validar, rechazar)
  const cambiar = (p, estado, motivo = null) => ctx.api.from('fin_pagos').update({ estado, motivo_rechazo: motivo }).eq('id', p.id);
  const validar = async (p) => {
    const { error } = await cambiar(p, 'validado');
    if (error) { avisar(error.message, 'error'); return; }
    avisar('Pago validado: los documentos que cubre quedaron pagados.'); ctx.refrescar();
  };
  const rechazar = (p) => abrirFormulario({
    titulo: 'Rechazar pago', campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, tipo: 'textarea' }], textoGuardar: 'Rechazar',
    alGuardar: async (x) => { const { error } = await cambiar(p, 'rechazado', x.motivo.trim()); if (error) throw new Error(error.message); avisar('Rechazado.'); ctx.refrescar(); },
  });
  const volver = async (p) => { const { error } = await cambiar(p, 'por_validar'); if (error) avisar(error.message, 'error'); else ctx.refrescar(); };
  const eliminar = (p) => abrirFormulario({
    titulo: 'Eliminar pago', mensaje: `${dinero(p.monto)} del ${fechaLarga(p.fecha)}. Si estaba validado, los documentos que cubría vuelven a por pagar.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { const { error } = await ctx.api.from('fin_pagos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw new Error(error.message); ctx.refrescar(); },
  });
  const ver = async (ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    ESTADOS.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(filtro.estado === k), onclick: () => { filtro.estado = k; ctx.refrescar(); } },
      k === 'por_validar' && nPor.count ? `${n} (${nPor.count})` : n)));
  const listaPagos = listado({
    titulo: 'Pagos registrados',
    filas: pagos.data,
    acciones: [segmento],
    vacio: filtro.estado === 'por_validar' ? 'No hay pagos por validar.' : 'Sin pagos.',
    columnas: [
      { titulo: 'Fecha', valor: (p) => fechaLarga(p.fecha) },
      { titulo: 'Proveedor', valor: (p) => el('div', {}, p.tercero_id ? el('a', { href: ctx.ruta('costos.cuenta', { t: p.tercero_id }) }, el('strong', {}, nombreTercero(p.terceros))) : el('strong', {}, 'Sin proveedor'),
        p.notas ? el('div', { class: 'texto-suave texto-chico' }, p.notas) : null) },
      { titulo: 'Paga', valor: (p) => (p.fin_pago_registros.length
        ? el('div', { class: 'texto-chico' }, p.fin_pago_registros.map((l) => el('div', {}, el('a', { href: ctx.ruta('costos.registro', { id: l.fin_registros.id }) }, l.fin_registros.concepto),
          l.fin_registros.doc_numero ? ` N° ${l.fin_registros.doc_numero}` : '', ` · ${dinero(l.monto)}`, l.fin_registros.estado_pago === 'pagado' ? el('span', { class: 'chip chip-ok', style: 'margin-left:4px' }, 'pagado') : null)))
        : el('span', { class: 'texto-suave texto-chico' }, 'A su cuenta')) },
      { titulo: 'Monto', valor: (p) => el('div', {}, el('strong', {}, dinero(p.monto)), el('div', { class: 'texto-suave texto-chico' }, nombreMedio[p.medio])) },
      { titulo: 'Estado', valor: (p) => el('div', {}, el('span', { class: `chip ${CHIP[p.estado]}` }, ESTADOS.find((x) => x[0] === p.estado)[1].replace(/s$/, '')),
        p.estado === 'validado' && p.validado_por ? el('div', { class: 'texto-suave texto-chico' }, `${quien.get(p.validado_por) ?? ''} · ${fechaLarga(diaLocal(p.validado_at))}`) : null,
        p.motivo_rechazo ? el('div', { class: 'texto-error texto-chico' }, p.motivo_rechazo) : null) },
      { titulo: 'Lo registró', valor: (p) => el('span', { class: 'texto-chico texto-suave' }, quien.get(p.created_by) ?? '—', el('br'), fechaLarga(diaLocal(p.created_at))) },
      { titulo: '', valor: (p) => el('div', { class: 'acciones-fila' },
        p.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver comprobante', 'aria-label': 'Ver comprobante', onclick: () => ver(p.archivo) }, icono('ojo', { tam: 16 })) : null,
        aprueba && p.estado === 'por_validar' ? boton('Validar', { icono: 'check', tipo: 'primario', onclick: () => validar(p) }) : null,
        aprueba && p.estado === 'por_validar' ? boton('Rechazar', { onclick: () => rechazar(p) }) : null,
        aprueba && p.estado !== 'por_validar' ? boton('Volver a por validar', { onclick: () => volver(p) }) : null,
        ctx.puede('costos', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar pago', onclick: () => eliminar(p) }, icono('basura', { tam: 16 })) : null) },
    ],
  });
  listaPagos.classList.add('prov-pagos');
  const plegado = el('details', { class: 'ficha doc-grupo prov-detalle', open: filtro.estado !== 'por_validar' || (nPor.count ?? 0) > 0 ? true : null },
    el('summary', {}, el('strong', {}, 'Pagos registrados'), nPor.count ? el('span', { class: 'chip chip-prox', style: 'margin-left:8px' }, `${nPor.count} por validar`) : el('span', { class: 'texto-suave texto-chico' }, ' · transferencias y comprobantes de todos los proveedores')),
    listaPagos);

  // ---- Tarjeta de un proveedor con seguimiento
  const tarjeta = (c) => {
    const [tipo, explica] = TIPO[c.tipo];
    const estado = c.saldo > 0 ? ['Le debemos', dinero(c.saldo), 'fin-alerta']
      : c.saldo < 0 ? [c.tipo === 'contratista' ? 'Le pagamos de más' : 'Pagado, falta su factura', dinero(-c.saldo), 'fin-alerta']
        : ['Al día', dinero(0), 'fin-bien'];
    const partes = [c.cobro ? `${c.tipo === 'contratista' ? 'Cobró' : 'Facturó'} ${dinero(c.cobro)}` : 'Sin facturas', c.compras ? `descontado ${dinero(c.compras)}` : null, `pagado ${dinero(c.pagado)}`].filter(Boolean);
    return el('a', { class: `ficha doc-grupo prov-tarjeta tarjeta-enlace ${estado[2]}`, href: ctx.ruta('costos.cuenta', { t: c.id }), title: explica },
      el('div', { class: 'prov-cab' }, el('strong', {}, nombreTercero(c.t)), el('span', { class: 'chip' }, tipo)),
      el('span', { class: 'texto-suave texto-chico' }, estado[0]), el('strong', { class: 'prov-saldo' }, estado[1]),
      el('span', { class: 'texto-chico texto-suave' }, partes.join(' · ')),
      c.ultimo ? el('span', { class: 'texto-chico texto-suave' }, `Último movimiento: ${fechaLarga(c.ultimo)}`) : null);
  };

  const pendientes = [
    nPor.count ? el('div', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      el('div', {}, el('strong', {}, `${nPor.count} ${nPor.count === 1 ? 'pago por validar' : 'pagos por validar'}`),
        el('div', { class: 'texto-chico' }, aprueba ? 'Revisa el comprobante y valídalo abajo, en Pagos registrados.' : 'Los valida quien tiene el permiso "aprobar" en Costos.'))) : null,
    faltan.length ? el('div', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      el('div', {}, el('strong', {}, 'Falta factura'), el('div', { class: 'texto-chico' }, faltan.join(' · ')))) : null,
  ].filter(Boolean);

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Proveedores y cuentas'),
        el('p', { class: 'texto-suave' }, 'Los proveedores a los que hay que hacerle seguimiento. Abre uno para ver su detalle y registrar un pago con su comprobante.')),
      el('div', { class: 'listado-acciones' }, el('a', { class: 'boton boton-secundario', href: ctx.ruta('costos.proveedores') }, icono('ajustes', { tam: 16 }), 'Todos los proveedores'))),
    ...pendientes,
    el('h2', { class: 'prov-titulo' }, 'Con seguimiento'),
    cuentas.length ? el('div', { class: 'prov-tarjetas' }, cuentas.map(tarjeta))
      : el('p', { class: 'texto-suave' }, 'Ningún proveedor tiene seguimiento. En "Todos los proveedores" marca a los que se les paga antes, a fin de mes o que llevan cuenta (contratistas).'),
    otrosLista.length ? el('details', { class: 'ficha doc-grupo prov-detalle' },
      el('summary', {}, el('strong', {}, `Otros proveedores con algo por pagar (${otrosLista.length})`), el('span', { class: 'texto-suave texto-chico' }, ` · ${dinero(otrosLista.reduce((s, o) => s + o.total, 0))} en total, se pagan compra a compra`)),
      el('div', { class: 'prov-otros' }, otrosLista.map((o) => el('a', { class: 'prov-otro', href: ctx.ruta('costos.cuenta', { t: o.id }) },
        el('span', {}, nombreTercero(o.t)), el('span', { class: 'texto-suave texto-chico' }, `${o.n} ${o.n === 1 ? 'documento' : 'documentos'} · desde ${fechaLarga(o.vence)}`), el('strong', {}, dinero(o.total)))))) : null,
    plegado);
}
