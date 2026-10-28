// Subir documentos (como Finanzas de InnovaGestión): 4 tipos.
// 1. Boleta, factura o ticket de compra (incluye peajes y estacionamientos) → lector (lee el timbre o el texto).
// 2. Gasto sin ningún papel → registro sin documento, no declarable, pagado.
// 3. Comprobante de pago (transferencia, depósito…) → fin_pagos "por validar"; cubre facturas por pagar del proveedor.
// 4. Factura emitida (a un cliente) → ingreso por cobrar.
import { el } from '../../../core/ui/dom.js?v=a4abe71';
import { icono } from '../../../core/ui/iconos.js?v=a4abe71';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a4abe71';
import { avisar } from '../../../core/ui/aviso.js?v=a4abe71';
import { subirArchivo, eliminarArchivo } from '../../../core/adjuntos.js?v=a4abe71';
import { dinero, hoyISO, fechaLarga, sumarDias } from '../../../core/ui/formato.js?v=a4abe71';
import { cargarBase, nombreTercero, MEDIOS } from '../datos.js?v=a4abe71';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const puede = ctx.puede('costos', 'crear');
  const tarjeta = (ic, titulo, texto, accion) => el('button', { type: 'button', class: 'ficha subir-tipo', disabled: !puede, onclick: accion },
    el('span', { class: 'subir-icono' }, icono(ic, { tam: 26 })), el('strong', {}, titulo), el('span', { class: 'texto-suave texto-chico' }, texto));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Subir documentos')),
    el('p', { class: 'texto-suave' }, 'Elige qué vas a subir. Sin documento no hay reembolso ni pago: la boleta va a la bandeja "Por cargar" antes de 48 horas.'),
    el('div', { class: 'subir-tipos' },
      tarjeta('camara', 'Boleta, factura o ticket de compra', 'Incluye tickets de peaje y estacionamiento. Se lee el timbre del documento; la boleta queda pagada y la factura por pagar.', () => { location.hash = ctx.ruta('costos.lector'); }),
      tarjeta('dinero', 'Gasto sin ningún papel', 'Solo cuando no hay boleta, factura ni ticket (ej.: propina, feria). No es gasto declarable.', () => sinDocumento(ctx)),
      tarjeta('check', 'Comprobante de pago', 'Transferencia, depósito o pago con tarjeta a un proveedor. Queda por validar; al validarlo, las facturas que cubre quedan pagadas.', () => comprobante(ctx)),
      tarjeta('documento', 'Factura emitida', 'Factura a un cliente: queda como ingreso por cobrar.', () => { location.hash = ctx.ruta('costos.registro', { tipo: 'ingreso' }); })),
    el('p', { class: 'texto-suave texto-chico' }, 'Los comprobantes subidos se revisan en ', el('a', { href: ctx.ruta('costos.pagos') }, 'Pagos'), '.'));

  // ---- Gasto sin documento
  async function sinDocumento(ctxx) {
    const base = await cargarBase(ctxx);
    const cats = base.categorias.filter((c) => c.activo && c.clase !== 'ingreso' && c.clase !== 'inventario');
    const faenas = ctx.puede('ope', 'ver') ? (await ctx.api.from('ope_faenas').select('id, titulo, fecha_inicio').eq('empresa_id', e).is('deleted_at', null).neq('estado', 'cancelada')
      .gte('fecha_fin', sumarDias(hoyISO(), -60)).lte('fecha_inicio', sumarDias(hoyISO(), 14)).order('fecha_inicio', { ascending: false })).data ?? [] : [];
    abrirFormulario({
      titulo: 'Gasto sin documento',
      mensaje: 'Úsalo solo si no hay boleta, factura ni ticket. Queda pagado y marcado como no declarable.',
      campos: [
        { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
        { id: 'total', etiqueta: 'Monto', tipo: 'number', requerido: true },
        { id: 'a_quien', etiqueta: 'A quién se le pagó', ayuda: 'Ej.: estacionamiento en la calle, maestro, feria.' },
        { id: 'concepto', etiqueta: 'Detalle', requerido: true },
        { id: 'categoria_id', etiqueta: 'Categoría', opciones: cats.map((c) => [c.id, c.nombre]), requerido: true },
        { id: 'centro_id', etiqueta: 'Centro de costo', opciones: [['', 'Sin centro'], ...base.centros.filter((c) => c.activo).map((c) => [c.id, c.nombre])] },
        ...(faenas.length ? [{ id: 'faena_id', etiqueta: 'Faena', opciones: [['', 'Sin faena'], ...faenas.map((f) => [f.id, `${fechaLarga(f.fecha_inicio)} · ${f.titulo}`])] }] : []),
        { id: 'patente', etiqueta: 'Patente (opcional)' },
        { id: 'medio', etiqueta: 'Medio de pago', opciones: MEDIOS, valor: 'efectivo' },
        { id: 'foto', etiqueta: 'Foto de respaldo (opcional)', tipo: 'file', accept: 'image/*,application/pdf' },
      ],
      textoGuardar: 'Registrar gasto',
      alGuardar: async (x) => {
        const total = Math.round(Number(x.total));
        if (!(total > 0)) throw new Error('El monto debe ser mayor a cero.');
        let ruta = null;
        if (x.foto?.size) ruta = (await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo: x.foto, tabla: 'fin_registros' })).ruta;
        const { error } = await ctx.api.from('fin_registros').insert({
          empresa_id: e, tipo: 'gasto', fecha: x.fecha, concepto: [x.concepto.trim(), x.a_quien.trim()].filter(Boolean).join(' · '), categoria_id: x.categoria_id,
          centro_id: x.centro_id || null, faena_id: x.faena_id || null, patente: x.patente.trim() || null, doc_tipo: 'sin', total, declarable: false,
          estado_pago: 'pagado', fecha_pago: x.fecha, medio_pago: x.medio, archivo: ruta,
        });
        if (error) { if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
        avisar('Gasto registrado.'); location.hash = ctx.ruta('costos.registros');
      },
    });
  }
}

// ---- Comprobante de pago: elige el proveedor y las facturas que cubre
export async function comprobante(ctx, { terceroId = '' } = {}) {
  const e = ctx.empresa.id;
  const [ter, porPagar] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).order('razon_social'),
    ctx.api.from('fin_registros').select('id, fecha, concepto, total, doc_tipo, doc_numero, tercero_id, vence').eq('empresa_id', e).eq('tipo', 'gasto')
      .neq('estado_pago', 'pagado').is('deleted_at', null).order('fecha'),
  ]);
  const proveedores = (ter.data ?? []).filter((t) => t.tipo?.includes('proveedor') || (porPagar.data ?? []).some((r) => r.tercero_id === t.id));
  const etiqueta = (r) => `${fechaLarga(r.fecha)} · ${r.concepto}${r.doc_numero ? ` · N° ${r.doc_numero}` : ''} · ${dinero(r.total)}`;
  const opcionesDe = (t) => (porPagar.data ?? []).filter((r) => !t || r.tercero_id === t).map((r) => [r.id, etiqueta(r)]);
  abrirFormulario({
    titulo: 'Comprobante de pago',
    mensaje: 'Queda por validar. Al validarlo, las facturas marcadas que queden cubiertas pasan a pagadas.',
    campos: [
      { id: 'tercero_id', etiqueta: 'Proveedor', opciones: [['', 'Elige el proveedor (o déjalo sin proveedor)'], ...proveedores.map((t) => [t.id, nombreTercero(t)])], valor: terceroId,
        alCambiar: ({ valor, opciones }) => { const l = document.querySelector('dialog[open] .checks-lista'); if (l) pintarChecks(l, opcionesDe(valor)); void opciones; } },
      { id: 'fecha', etiqueta: 'Fecha del pago', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto pagado', tipo: 'number', requerido: true },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'registros', etiqueta: 'Facturas o documentos que paga', tipo: 'checks', opciones: opcionesDe(terceroId) },
      { id: 'archivo', etiqueta: 'Comprobante (foto o PDF)', tipo: 'file', accept: 'image/*,application/pdf', requerido: true },
      { id: 'notas', etiqueta: 'Notas (banco, N° de operación)', tipo: 'textarea' },
    ],
    textoGuardar: 'Subir comprobante',
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      if (!x.archivo?.size) throw new Error('Adjunta el comprobante.');
      const ruta = (await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo: x.archivo, tabla: 'fin_pagos' })).ruta;
      const { data: p, error } = await ctx.api.from('fin_pagos').insert({
        empresa_id: e, fecha: x.fecha, monto, medio: x.medio, tercero_id: x.tercero_id || null, archivo: ruta, notas: x.notas.trim() || null,
      }).select('id').single();
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      // Reparte el monto entre los documentos marcados, del más antiguo al más nuevo
      let resto = monto;
      const filas = [];
      for (const r of (porPagar.data ?? []).filter((y) => x.registros.includes(y.id))) {
        if (resto <= 0) break;
        const m = Math.min(resto, r.total); resto -= m;
        filas.push({ pago_id: p.id, registro_id: r.id, empresa_id: e, monto: m });
      }
      if (filas.length) {
        const { error: e2 } = await ctx.api.from('fin_pago_registros').insert(filas);
        if (e2) throw new Error(`El comprobante quedó subido, pero no se pudo ligar a los documentos: ${e2.message}`);
      }
      avisar('Comprobante subido: queda por validar.'); location.hash = ctx.ruta('costos.pagos');
    },
  });
}

function pintarChecks(lista, opciones) {
  lista.replaceChildren(...(opciones.length ? opciones.map(([v, t]) => el('label', { class: 'casilla' }, el('input', { type: 'checkbox', name: 'registros', value: v }), t))
    : [el('span', { class: 'texto-suave texto-chico' }, 'Este proveedor no tiene documentos por pagar.')]));
}
