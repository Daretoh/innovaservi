// Seguimiento de una cotización enviada (005, 2026-10-30): OC del cliente → factura → cobro, con número, fecha y
// archivo. Pensado para Guillermo Morales (una cotización por vehículo, una OC por cotización), sirve para cualquiera.
// Al registrar la OC la cotización queda aceptada. La factura y el cobro van en el registro de facturas (007, facturas.js),
// que los copia en la cotización; al cobrar, las órdenes del taller ligadas quedan cobradas.
import { el } from '../../core/ui/dom.js?v=163dc56rf';
import { icono } from '../../core/ui/iconos.js?v=163dc56rf';
import { boton } from '../../core/ui/tabla.js?v=163dc56rf';
import { abrirFormulario } from '../../core/ui/modal.js?v=163dc56rf';
import { avisar } from '../../core/ui/aviso.js?v=163dc56rf';
import { dinero, fechaLarga, hoyISO } from '../../core/ui/formato.js?v=163dc56rf';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=163dc56rf';
import { formFactura, formPago, anularPago, eliminarFactura } from './facturas.js?v=163dc56rf';

export const MEDIOS = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque'], ['debito', 'Débito'], ['credito', 'Crédito'], ['otro', 'Otro']];
const nombreMedio = Object.fromEntries(MEDIOS);
const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];

// Etapa de una cotización enviada o aceptada: sin OC → con OC → facturada → cobrada
export const ETAPAS = [['sin_oc', 'Sin OC', 'chip-pend'], ['oc', 'OC sin facturar', 'chip-prox'], ['facturada', 'Facturada por cobrar', 'chip-venc'], ['cobrada', 'Cobrada', 'chip-ok']];
export function etapa(c) {
  if (c.cobro_fecha) return 'cobrada';
  if (c.factura_numero) return 'facturada';
  if (c.oc_fecha || c.oc_numero) return 'oc';
  return 'sin_oc';
}
export const chipEtapa = (c) => { const [, n, chip] = ETAPAS.find(([k]) => k === etapa(c)); return el('span', { class: `chip ${chip}` }, n); };

export const verArchivo = (ctx, ruta, texto) => (ruta ? boton(texto, { icono: 'ojo', onclick: async () => {
  try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); }
} }) : null);

// Pasos con botones para el editor (cotización enviada o aceptada). total = total con IVA de la cotización.
export function pasosSeguimiento(ctx, c, total) {
  const editar = ctx.puede('cotizaciones', 'editar') && ['enviada', 'aceptada'].includes(c.estado);
  const guardar = async (cambios, aviso) => {
    const { error } = await ctx.api.from('cot_cotizaciones').update(cambios).eq('id', c.id);
    if (error) throw new Error(error.message);
    avisar(aviso); ctx.refrescar();
  };
  const subir = async (archivo) => (archivo?.size ? (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'cotizaciones', archivo, tabla: 'cot_cotizaciones', registroId: c.id, tipos: ARCHIVOS })).ruta : null);

  // Factura y pago: en el registro de facturas (007); la base los copia en la cotización
  const factura = async () => {
    const { data, error } = await ctx.api.from('cot_facturas').select('*').eq('cotizacion_id', c.id).is('deleted_at', null).maybeSingle();
    if (error) { avisar(error.message, 'error'); return null; }
    return data;
  };
  const conFactura = (accion) => async () => { const f = await factura(); if (f) accion(ctx, f, { alGuardar: () => ctx.refrescar() }); else avisar('No se encontró la factura.', 'error'); };
  const facturar = async () => {
    const f = await factura();
    const { data: t } = c.tercero_id ? await ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('id', c.tercero_id) : { data: [] };
    formFactura(ctx, { f, cotizacion: c, clientes: t ?? [], alGuardar: () => ctx.refrescar() });
  };

  // La OC se registra en la cotización
  const doc = () => abrirFormulario({
    titulo: 'Orden de compra del cliente',
    mensaje: c.estado === 'enviada' ? 'Con la OC la cotización queda aceptada.' : null,
    campos: [
      { id: 'numero', etiqueta: 'N° de OC', valor: c.oc_numero ?? '' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: c.oc_fecha ?? hoyISO() },
      { id: 'archivo', etiqueta: `${c.oc_archivo ? 'Reemplazar archivo' : 'Archivo'} (PDF o imagen, opcional)`, tipo: 'file', accept: ARCHIVOS.join(','), multiple: false },
    ],
    alGuardar: async (v) => {
      const ruta = await subir(v.archivo);
      const cambios = { oc_numero: v.numero.trim() || null, oc_fecha: v.fecha };
      if (ruta) cambios.oc_archivo = ruta;
      if (c.estado === 'enviada') Object.assign(cambios, { estado: 'aceptada', respondida_at: new Date().toISOString() });
      await guardar(cambios, 'OC registrada.');
    },
  });
  const quitarOc = () => abrirFormulario({
    titulo: 'Quitar la OC', mensaje: 'Se borran el número, la fecha y el archivo de la OC.', campos: [], textoGuardar: 'Quitar',
    alGuardar: () => guardar({ oc_numero: null, oc_fecha: null, oc_archivo: null }, 'Listo.'),
  });

  const e = etapa(c);
  const paso = (n, hecho, activo, titulo, cuerpo, botones) => el('div', { class: `cie-paso${hecho ? ' cie-hecho' : activo ? ' cie-activo' : ''}` },
    el('div', { class: 'cie-paso-cab' }, el('span', { class: 'cie-paso-n' }, hecho ? icono('check', { tam: 14 }) : String(n)), el('strong', {}, titulo)),
    el('div', { class: 'texto-chico' }, cuerpo), el('div', { class: 'cie-paso-acc' }, botones.filter(Boolean)));
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Seguimiento'),
    el('div', { class: 'cie-pasos' },
      paso(1, !!(c.oc_fecha || c.oc_numero), e === 'sin_oc', 'Orden de compra',
        c.oc_fecha || c.oc_numero ? [c.oc_numero ? `N° ${c.oc_numero}` : null, c.oc_fecha ? fechaLarga(c.oc_fecha) : 'sin fecha', c.oc_archivo ? null : 'sin archivo'].filter(Boolean).join(' · ') : 'Registra la OC cuando el cliente la envíe.',
        [editar && !c.cobro_fecha ? boton(c.oc_fecha || c.oc_numero ? 'Cambiar' : 'Registrar OC', { tipo: e === 'sin_oc' ? 'primario' : 'secundario', onclick: doc }) : null,
          verArchivo(ctx, c.oc_archivo, 'Ver OC'), editar && (c.oc_fecha || c.oc_numero) && !c.factura_numero ? boton('Quitar', { onclick: quitarOc }) : null]),
      paso(2, !!c.factura_numero, e === 'oc', 'Factura',
        c.factura_numero ? `N° ${c.factura_numero} · ${fechaLarga(c.factura_fecha)}` : 'Factura emitida por la OC (queda en Cotizaciones → Facturas).',
        [editar && !c.cobro_fecha ? boton(c.factura_numero ? 'Cambiar' : 'Registrar factura', { tipo: e === 'oc' ? 'primario' : 'secundario', onclick: facturar }) : null,
          verArchivo(ctx, c.factura_archivo, 'Ver factura'), editar && ctx.puede('cotizaciones', 'eliminar') && c.factura_numero && !c.cobro_fecha ? boton('Quitar', { onclick: conFactura(eliminarFactura) }) : null]),
      paso(3, !!c.cobro_fecha, e === 'facturada', 'Cobro',
        c.cobro_fecha ? `${dinero(c.cobro_monto)} · ${fechaLarga(c.cobro_fecha)} · ${nombreMedio[c.cobro_medio] ?? ''}` : c.factura_numero ? `Por cobrar: ${dinero(total)}` : 'Se cobra después de facturar.',
        [editar && !c.cobro_fecha ? (c.factura_numero ? boton('Registrar cobro', { icono: 'dinero', tipo: e === 'facturada' ? 'primario' : 'secundario', onclick: conFactura(formPago) }) : null) : null,
          editar && c.cobro_fecha ? boton('Anular cobro', { onclick: conFactura(anularPago) }) : null])));
}
