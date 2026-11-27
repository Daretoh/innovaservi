// Abonos y cobro de una cotización sin orden de trabajo (Cotizaciones 013, 2026-11-25, pedido de Enzo): venta de
// equipamiento sin instalación. Varios abonos y un cobro final, cada uno con su documento: boleta de la TUU (traída
// del SII), factura de la TUU (queda en Facturas como factura del abono) o una foto o PDF. Un abono no reemplaza al
// anterior. Si la venta tiene factura, el cobro final es el pago de esa factura (Facturas); los abonos se suman.
// Con orden de trabajo se cobra en la orden (y si la cotización pasa a orden, la base lleva sus abonos allá).
import { el } from '../../core/ui/dom.js';
import { icono } from '../../core/ui/iconos.js';
import { boton } from '../../core/ui/tabla.js';
import { abrirFormulario } from '../../core/ui/modal.js';
import { avisar } from '../../core/ui/aviso.js';
import { dinero, fechaLarga, hoyISO, sumarDias } from '../../core/ui/formato.js';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js';
import { llamarDte, estadoDte, ofrecerPdf } from '../../core/dte.js';

export const MEDIOS_PAGO = [['debito', 'Débito'], ['credito', 'Crédito'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['cheque', 'Cheque'], ['otro', 'Otro']];
const nombreMedio = Object.fromEntries(MEDIOS_PAGO);
const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const limpio = (r) => String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

export async function cargarPagos(ctx, cotizacionId) {
  const { data, error } = await ctx.api.from('cot_pagos').select('*').eq('cotizacion_id', cotizacionId).is('deleted_at', null).order('fecha').order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Sube la foto o el PDF del documento de un pago
async function adjuntar(ctx, pagoId, archivo) {
  const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'cotizaciones', archivo, tabla: 'cot_pagos', registroId: pagoId, tipos: ARCHIVOS });
  const { error } = await ctx.api.from('cot_pagos').update({ boleta_ruta: ruta, boleta_nombre: archivo.name.slice(0, 200) }).eq('id', pagoId);
  if (error) throw new Error(error.message);
}

// Elegir del SII una boleta (39) o factura (33) que emitió la TUU, sin usar. alElegir(doc) hace lo demás.
// Busca desde unos días antes de la fecha del pago; las ya usadas se dicen y no se pueden elegir.
export async function elegirDeTuu(ctx, { tipo = 39, total = null, rut = null, fecha = hoyISO(), titulo, mensaje, textoGuardar, alElegir }) {
  const est = await estadoDte(ctx);
  if (!est.conectado) { avisar(`OpenFactura no está conectado: ${est.error ?? 'falta la clave de la empresa'}`, 'error'); return; }
  const factura = tipo === 33;
  const nombre = factura ? 'factura' : 'boleta';
  let lista = [];
  const texto = (b) => `N° ${b.folio} · ${fechaLarga(b.fecha)}${b.hora ? ` ${b.hora}` : ''} · ${dinero(b.total)}${b.razon ? ` · ${b.razon}` : ''}`;
  const buscar = async ({ valores, opciones, poner, estado }) => {
    const desde = valores.desde; const hasta = valores.hasta || desde;
    if (!desde) return;
    if (hasta < desde) { estado('"Hasta" es anterior a "Desde".', 'error'); return; }
    estado(`Buscando ${nombre}s en el SII…`);
    try {
      const r = await llamarDte(ctx, 'boletas', { desde, hasta, tipo });
      const coincide = (b) => total != null && b.total === total && (!factura || !rut || limpio(b.rut) === limpio(rut));
      lista = r.boletas.filter((b) => !b.uso && !b.registrada).sort((a, b) => Number(coincide(b)) - Number(coincide(a)) || `${b.fecha}${b.hora}`.localeCompare(`${a.fecha}${a.hora}`));
      const usadas = r.boletas.filter((b) => b.uso || b.registrada);
      opciones('doc', [['', lista.length ? 'Elegir…' : `No hay ${nombre}s libres en esas fechas`], ...lista.map((b) => [b.token, `${texto(b)}${coincide(b) ? ' · mismo monto' : ''}`])]);
      const igual = lista.filter(coincide);
      if (igual.length === 1) poner('doc', igual[0].token);
      estado(`${lista.length} sin usar${usadas.length ? ` · ${usadas.length} ya usadas: ${usadas.slice(0, 4).map((b) => `N° ${b.folio} (en ${b.uso ?? 'Facturas'})`).join(', ')}${usadas.length > 4 ? '…' : ''}` : ''}.${r.completo ? '' : ' (Solo las primeras 300: acorta el rango.)'}`, 'ok');
    } catch (err) { estado(err.message, 'error'); }
  };
  abrirFormulario({
    titulo, mensaje: est.prueba ? 'Ambiente de pruebas de OpenFactura: se ven documentos de la empresa de pruebas de Haulmer y no se guarda nada.' : mensaje,
    campos: [
      { id: 'desde', etiqueta: 'Desde', tipo: 'date', requerido: true, valor: sumarDias(fecha, -3), alCambiar: buscar },
      { id: 'hasta', etiqueta: 'Hasta', tipo: 'date', requerido: true, valor: hoyISO(), alCambiar: buscar },
      { id: 'doc', etiqueta: factura ? 'Factura' : 'Boleta', requerido: true, opciones: [['', 'Buscando…']] },
    ],
    textoGuardar: est.prueba ? 'Ver el PDF (prueba)' : textoGuardar ?? 'Guardar',
    alGuardar: async (v) => {
      const d = lista.find((b) => b.token === v.doc);
      if (!d) throw new Error(`Elige la ${nombre}.`);
      await alElegir(d, est.prueba);
    },
  });
  setTimeout(() => document.getElementById('f-desde')?.dispatchEvent(new Event('change')), 0);
}

// Boleta de la TUU para un pago ya registrado
const boletaTuu = (ctx, c, p, alCambiar) => elegirDeTuu(ctx, {
  tipo: 39, total: p.monto, fecha: p.fecha, titulo: `Boleta de la TUU · ${p.tipo === 'saldo' ? 'cobro' : 'abono'} de ${dinero(p.monto)}`,
  mensaje: 'Elige la boleta que emitió la TUU por este pago. Su PDF queda en el pago de la cotización.', textoGuardar: 'Guardar boleta',
  alElegir: async (d) => {
    const r = await llamarDte(ctx, 'ligar_boleta', { cot_pago_id: p.id, token: d.token });
    ofrecerPdf(r.pdf, { titulo: `Boleta N° ${r.folio}`, texto: r.prueba ? 'Ambiente de pruebas: no se guardó.' : 'Quedó en el pago de la cotización.' });
    if (r.aviso) avisar(r.aviso, 'error'); else if (!r.prueba) avisar(`Boleta N° ${r.folio} guardada.`);
    alCambiar?.();
  },
});

// Factura de la TUU para un abono ya registrado: queda en Facturas como factura del abono
const facturaTuu = (ctx, c, p, alCambiar) => elegirDeTuu(ctx, {
  tipo: 33, total: p.monto, rut: c.cliente_rut, fecha: p.fecha, titulo: `Factura de la TUU · abono de ${dinero(p.monto)}`,
  mensaje: 'Elige la factura que emitió la TUU por este abono. Queda en Facturas (pagada, como factura del abono) y su PDF en el abono.', textoGuardar: 'Registrar factura',
  alElegir: async (d) => {
    const r = await llamarDte(ctx, 'registrar_emitida', { token: d.token, abono: { cot_pago_id: p.id }, tercero_id: c.tercero_id ?? null });
    if (r.prueba) { ofrecerPdf(r.pdf, { titulo: `Factura N° ${r.folio}`, texto: 'Ambiente de pruebas: no se registró.' }); return; }
    if (r.aviso) avisar(r.aviso, 'error'); else avisar(`Factura N° ${r.folio} registrada como factura del abono.`);
    alCambiar?.();
  },
});

// Formulario de un pago nuevo: abono o cobro final (saldo). total = total con IVA de la cotización.
export function formPagoCot(ctx, c, { tipo = 'abono', total = 0, pagos = [], conFactura = false, alCambiar } = {}) {
  const abonado = pagos.filter((p) => p.tipo === 'abono').reduce((s, p) => s + Number(p.monto), 0);
  const saldo = Math.max(0, total - abonado);
  const docs = tipo === 'saldo'
    ? [['tuu', 'Boleta de la TUU (traerla del SII)'], ['archivo', 'Foto o PDF del comprobante'], ['', 'Sin documento por ahora']]
    : [['tuu', 'Boleta de la TUU (traerla del SII)'], ['fac', 'Factura de la TUU (traerla del SII)'], ['archivo', 'Foto o PDF del comprobante'], ['', 'Sin documento por ahora']];
  abrirFormulario({
    titulo: tipo === 'saldo' ? 'Cobrar con boleta' : 'Registrar abono',
    mensaje: tipo === 'saldo'
      ? `Pago final de la venta${abonado ? ` (ya se abonaron ${dinero(abonado)})` : ''}: la cotización queda cobrada.`
      : `Anticipo del cliente. Cada abono queda aparte con su documento${abonado ? ` (ya se abonaron ${dinero(abonado)})` : ''}.${conFactura ? ' El cobro final se registra en la factura de la venta.' : ''}`,
    campos: [
      { id: 'monto', etiqueta: 'Monto ($, total)', tipo: 'number', requerido: true, valor: tipo === 'saldo' && saldo ? String(saldo) : '' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS_PAGO, valor: 'debito' },
      { id: 'doc', etiqueta: 'Documento', opciones: docs, valor: 'tuu' },
      { id: 'archivo', etiqueta: 'Foto o PDF (si elegiste "Foto o PDF")', tipo: 'file', accept: ARCHIVOS.join(','), multiple: false },
      { id: 'nota', etiqueta: 'Nota (opcional)', valor: '' },
    ],
    textoGuardar: tipo === 'saldo' ? 'Registrar cobro' : 'Registrar abono',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto.');
      if (v.doc === 'archivo' && !v.archivo?.size) throw new Error('Elige la foto o el PDF.');
      const id = crypto.randomUUID();
      const { error } = await ctx.api.from('cot_pagos').insert({ id, empresa_id: ctx.empresa.id, cotizacion_id: c.id, tipo, fecha: v.fecha, monto, medio: v.medio || null, nota: v.nota?.trim() || null });
      if (error) throw new Error(error.message);
      const p = { id, tipo, fecha: v.fecha, monto };
      if (v.doc === 'archivo') {
        try { await adjuntar(ctx, id, v.archivo); } catch (e) { avisar(`El pago quedó registrado, pero el archivo no se subió: ${e.message}`, 'error'); }
      }
      avisar(tipo === 'saldo' ? 'Cobro registrado: la cotización quedó cobrada.' : 'Abono registrado.');
      alCambiar?.();
      if (v.doc === 'tuu') setTimeout(() => boletaTuu(ctx, c, p, alCambiar), 0);
      if (v.doc === 'fac') setTimeout(() => facturaTuu(ctx, c, p, alCambiar), 0);
    },
  });
}

// Lista de abonos y cobro con sus botones. editar = puede registrar (cotización enviada o aceptada, sin orden).
// conFactura = la venta tiene factura (el cobro final va en su pago).
export function bloquePagos(ctx, c, { total, pagos, conFactura = false, alCambiar }) {
  const editar = ctx.puede('cotizaciones', 'editar') && ['enviada', 'aceptada'].includes(c.estado) && !c.madre_id;
  const saldoPago = pagos.find((p) => p.tipo === 'saldo');
  const cobrada = !!c.cobro_fecha;
  const abonado = pagos.filter((p) => p.tipo === 'abono').reduce((s, p) => s + Number(p.monto), 0);
  const ver = async (p) => { try { window.open(await urlFirmada(ctx.api, p.boleta_ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } };
  const quitar = (p) => abrirFormulario({
    titulo: p.tipo === 'saldo' ? 'Anular el cobro' : 'Quitar el abono',
    mensaje: p.tipo === 'saldo' ? `La cotización vuelve a quedar por cobrar (${dinero(p.monto)}).` : `Se quita el abono de ${dinero(p.monto)} del ${fechaLarga(p.fecha)}. Su documento queda libre para usarlo en otro pago.`,
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: '' }], textoGuardar: p.tipo === 'saldo' ? 'Anular cobro' : 'Quitar abono',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('cot_pagos').update({ deleted_at: new Date().toISOString(), nota: [p.nota, `Quitado: ${v.motivo.trim()}`].filter(Boolean).join(' · ').slice(0, 500) }).eq('id', p.id);
      if (error) throw new Error(error.message);
      avisar('Listo.'); alCambiar?.();
    },
  });
  const subirDoc = (p) => abrirFormulario({
    titulo: 'Adjuntar el comprobante', campos: [{ id: 'archivo', etiqueta: 'Foto o PDF', tipo: 'file', requerido: true, accept: ARCHIVOS.join(','), multiple: false }], textoGuardar: 'Guardar',
    alGuardar: async (v) => { await adjuntar(ctx, p.id, v.archivo); avisar('Comprobante guardado.'); alCambiar?.(); },
  });
  const fila = (p) => el('div', { class: 'cobro-boleta' },
    icono(p.boleta_ruta ? 'documento' : 'dinero', { tam: 16 }),
    el('div', { class: 'cobro-boleta-texto' },
      el('strong', {}, `${p.tipo === 'saldo' ? 'Cobro final' : 'Abono'} · ${dinero(p.monto)}`),
      el('span', { class: 'texto-chico texto-suave' }, ` ${fechaLarga(p.fecha)}${p.medio ? ` · ${nombreMedio[p.medio] ?? p.medio}` : ''}${p.nota ? ` · ${p.nota}` : ''}`),
      el('div', {}, p.boleta_ruta
        ? el('button', { type: 'button', class: 'enlace texto-chico', onclick: () => ver(p) }, p.boleta_nombre ?? 'Ver documento')
        : el('span', { class: 'texto-chico estado-error' }, 'Sin boleta ni factura'))),
    el('div', { class: 'cobro-boleta-acciones' },
      p.boleta_ruta ? boton('Ver', { icono: 'ojo', class: 'boton boton-secundario boton-chico', onclick: () => ver(p) }) : null,
      editar && !p.boleta_ruta ? boton('Boleta de la TUU', { icono: 'buscar', class: 'boton boton-secundario boton-chico', onclick: () => boletaTuu(ctx, c, p, alCambiar) }) : null,
      editar && !p.boleta_ruta && p.tipo === 'abono' && ctx.puede('cotizaciones', 'crear') ? boton('Factura de la TUU', { icono: 'buscar', class: 'boton boton-secundario boton-chico', onclick: () => facturaTuu(ctx, c, p, alCambiar) }) : null,
      editar && !p.boleta_ruta ? boton('Adjuntar', { icono: 'documento', class: 'boton boton-secundario boton-chico', onclick: () => subirDoc(p) }) : null,
      editar && !p.factura_id && (p.tipo === 'saldo' || !cobrada) ? boton(p.tipo === 'saldo' ? 'Anular cobro' : 'Quitar', { class: 'boton boton-secundario boton-chico', onclick: () => quitar(p) }) : null));
  return el('div', { class: 'cot-pagos' },
    pagos.length ? el('div', {}, pagos.map(fila)) : null,
    abonado && !cobrada ? el('p', { class: 'texto-chico' }, `Abonado ${dinero(abonado)} · saldo ${dinero(Math.max(0, total - abonado))}`) : null,
    editar && !cobrada ? el('div', { class: 'listado-acciones' },
      boton('Registrar abono', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => formPagoCot(ctx, c, { tipo: 'abono', total, pagos, conFactura, alCambiar }) }),
      !conFactura && !saldoPago ? boton('Cobrar con boleta', { icono: 'dinero', class: 'boton boton-primario boton-chico', onclick: () => formPagoCot(ctx, c, { tipo: 'saldo', total, pagos, alCambiar }) }) : null) : null);
}

// Sección Cobro para una cotización enviada o aceptada sin orden y sin seguimiento de OC (cliente sin "por cotizar")
export function seccionCobro(ctx, c, { total, pagos, conFactura = false, alCambiar }) {
  const cobrada = !!c.cobro_fecha;
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Cobro'),
    el('p', { class: 'texto-suave texto-chico' }, cobrada
      ? `Cobrada: ${dinero(c.cobro_monto)} · ${fechaLarga(c.cobro_fecha)}.`
      : `Venta sin orden de trabajo: los abonos y el cobro se registran aquí, cada uno con su boleta o factura de la TUU. Total ${dinero(total)}.`),
    bloquePagos(ctx, c, { total, pagos, conFactura, alCambiar }));
}
