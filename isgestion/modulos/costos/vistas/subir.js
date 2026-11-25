// Formularios para cargar en Costos (antes la pantalla "Subir documentos"; ahora todo entra por la Bandeja):
// - Gasto sin ningún papel → registro sin documento, no declarable, pagado.
// - Comprobante de pago (transferencia, depósito…) → fin_pagos "por validar"; se abre desde la ficha del proveedor.
import { el } from '../../../core/ui/dom.js?v=db2b2b7';
import { abrirFormulario } from '../../../core/ui/modal.js?v=db2b2b7';
import { avisar } from '../../../core/ui/aviso.js?v=db2b2b7';
import { subirArchivo, eliminarArchivo } from '../../../core/adjuntos.js?v=db2b2b7';
import { dinero, hoyISO, fechaLarga, sumarDias } from '../../../core/ui/formato.js?v=db2b2b7';
import { cargarBase, nombreTercero, MEDIOS } from '../datos.js?v=db2b2b7';
import { leerConIA, iaDisponible, numIA, fechaIA, medioIA, textoModelo } from '../../../core/lector-ia.js?v=db2b2b7';

// Lee con IA al elegir la foto (como InnovaGestión) y llena el formulario con aplicar(datos, poner)
export const leerAlElegir = (ctx, modo, aplicar) => async ({ archivos, estado, poner, opciones }) => {
  if (!archivos?.length || !iaDisponible()) return;
  estado('Leyendo el documento con IA…');
  try {
    const r = await leerConIA(ctx.api, { empresaId: ctx.empresa.id, modo, archivos });
    const nota = aplicar(r.datos ?? {}, poner, opciones);
    estado(`${textoModelo(r)}. Revisa antes de guardar.${nota ? ` ${nota}` : ''}${r.datos?.observaciones ? ` ${r.datos.observaciones}` : ''}`, 'ok');
  } catch (err) { estado(`${err.message}. Completa los datos a mano.`, 'mal'); }
};

// La pantalla "Subir" se juntó con la Bandeja (2026-11-24, pedido de Enzo): todo se sube ahí. La ruta queda para
// los enlaces antiguos y lleva a la Bandeja.
export default async function vista(ctx) {
  location.replace(ctx.ruta('costos.bandeja'));
  return el('p', { class: 'texto-suave' }, 'Abriendo la Bandeja…');
}

// ---- Gasto sin documento
export async function sinDocumento(ctx) {
  const e = ctx.empresa.id;
  const base = await cargarBase(ctx);
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
      ...(ctx.config?.centros ? [{ id: 'centro_id', etiqueta: 'Centro de costo', opciones: [['', 'Sin centro'], ...base.centros.filter((c) => c.activo).map((c) => [c.id, c.nombre])] }] : []),
      ...(faenas.length ? [{ id: 'faena_id', etiqueta: 'Faena', opciones: [['', 'Sin faena'], ...faenas.map((f) => [f.id, `${fechaLarga(f.fecha_inicio)} · ${f.titulo}`])] }] : []),
      { id: 'patente', etiqueta: 'Patente (opcional)' },
      { id: 'medio', etiqueta: 'Medio de pago', opciones: MEDIOS, valor: 'efectivo' },
      { id: 'foto', etiqueta: 'Foto del papel (opcional: la IA lo lee y llena los datos)', tipo: 'file', accept: 'image/*,application/pdf',
        alCambiar: leerAlElegir(ctx, 'sindoc', (d, poner) => {
          poner('fecha', fechaIA(d.fecha)); poner('total', numIA(d.monto)); poner('a_quien', d.a_quien); poner('concepto', d.detalle);
          const c = d.tipo_gasto && cats.find((x) => x.nombre.toLowerCase().includes(String(d.tipo_gasto).toLowerCase())); if (c) poner('categoria_id', c.id);
          return numIA(d.monto) == null ? 'No se leyó el monto.' : '';
        }) },
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
      avisar('Gasto registrado.'); if (location.hash === ctx.ruta('costos.registros')) ctx.refrescar(); else location.hash = ctx.ruta('costos.registros');
    },
  });
}

// ---- Comprobante de pago: elige el proveedor y las facturas que cubre
export async function comprobante(ctx, { terceroId = '' } = {}) {
  const e = ctx.empresa.id;
  const [ter, porPagar] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, tipo, rut').eq('empresa_id', e).is('deleted_at', null).order('razon_social'),
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
      { id: 'archivo', etiqueta: 'Comprobante (foto o PDF; la IA lo lee y llena los datos)', tipo: 'file', accept: 'image/*,application/pdf', requerido: true,
        alCambiar: leerAlElegir(ctx, 'pago', (d, poner) => {
          poner('fecha', fechaIA(d.fecha)); poner('monto', numIA(d.monto)); poner('medio', medioIA(d.medio));
          const rn = (x) => String(x ?? '').replace(/[^\dkK]/g, '').toUpperCase();
          const t = d.rut_destinatario ? (ter.data ?? []).find((x) => rn(x.rut) === rn(d.rut_destinatario)) : null;
          if (t) { poner('tercero_id', t.id); const l = document.querySelector('dialog[open] .checks-lista'); if (l) pintarChecks(l, opcionesDe(t.id)); }
          const extra = [d.banco ? `Banco ${d.banco}` : '', d.operacion ? `Op. N° ${d.operacion}` : '', d.glosa || ''].filter(Boolean).join(' · ');
          if (extra) poner('notas', extra);
          return t ? `Proveedor reconocido: ${nombreTercero(t)}.` : d.destinatario ? `Destinatario: ${d.destinatario} (elige el proveedor).` : '';
        }) },
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
      avisar('Pago registrado: queda por validar.'); if (terceroId) ctx.refrescar(); else location.hash = ctx.ruta('costos.pagos');
    },
  });
}

function pintarChecks(lista, opciones) {
  lista.replaceChildren(...(opciones.length ? opciones.map(([v, t]) => el('label', { class: 'casilla' }, el('input', { type: 'checkbox', name: 'registros', value: v }), t))
    : [el('span', { class: 'texto-suave texto-chico' }, 'Este proveedor no tiene documentos por pagar.')]));
}
