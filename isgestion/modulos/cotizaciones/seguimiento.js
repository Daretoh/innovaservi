// Seguimiento de una cotización enviada (005, 2026-10-30): OC del cliente → factura → cobro, con número, fecha y
// archivo. Pensado para Guillermo Morales (una cotización por vehículo, una OC por cotización), sirve para cualquiera.
// Al registrar la OC la cotización queda aceptada; al cobrar, las órdenes del taller ligadas quedan cobradas.
import { el } from '../../core/ui/dom.js?v=64a4e9f';
import { icono } from '../../core/ui/iconos.js?v=64a4e9f';
import { boton } from '../../core/ui/tabla.js?v=64a4e9f';
import { abrirFormulario } from '../../core/ui/modal.js?v=64a4e9f';
import { avisar } from '../../core/ui/aviso.js?v=64a4e9f';
import { dinero, fechaLarga, hoyISO } from '../../core/ui/formato.js?v=64a4e9f';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=64a4e9f';
import { cobrarOrdenes, descobrarOrdenes } from './acciones.js?v=64a4e9f';

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

  const doc = (paso) => {
    const oc = paso === 'oc';
    abrirFormulario({
      titulo: oc ? 'Orden de compra del cliente' : 'Factura',
      mensaje: oc && c.estado === 'enviada' ? 'Con la OC la cotización queda aceptada.' : null,
      campos: [
        { id: 'numero', etiqueta: oc ? 'N° de OC' : 'N° de factura', requerido: !oc, valor: (oc ? c.oc_numero : c.factura_numero) ?? '' },
        { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: (oc ? c.oc_fecha : c.factura_fecha) ?? hoyISO() },
        { id: 'archivo', etiqueta: `${(oc ? c.oc_archivo : c.factura_archivo) ? 'Reemplazar archivo' : 'Archivo'} (PDF o imagen, opcional)`, tipo: 'file', accept: ARCHIVOS.join(','), multiple: false },
      ],
      alGuardar: async (v) => {
        const ruta = await subir(v.archivo);
        const cambios = oc ? { oc_numero: v.numero.trim() || null, oc_fecha: v.fecha } : { factura_numero: v.numero.trim(), factura_fecha: v.fecha };
        if (ruta) cambios[oc ? 'oc_archivo' : 'factura_archivo'] = ruta;
        if (c.estado === 'enviada') Object.assign(cambios, { estado: 'aceptada', respondida_at: new Date().toISOString() });
        await guardar(cambios, oc ? 'OC registrada.' : 'Factura registrada.');
      },
    });
  };
  const quitar = (paso) => abrirFormulario({
    titulo: { oc: 'Quitar la OC', factura: 'Quitar la factura', cobro: 'Anular el cobro' }[paso],
    mensaje: paso === 'cobro' ? 'La cotización vuelve a quedar por cobrar; las órdenes del taller que se cobraron con ella vuelven a quedar por cobrar.' : 'Se borran el número, la fecha y el archivo de la cotización.',
    campos: [], textoGuardar: paso === 'cobro' ? 'Anular cobro' : 'Quitar',
    alGuardar: async () => {
      if (paso === 'cobro') await descobrarOrdenes(ctx, c);
      await guardar({
        oc: { oc_numero: null, oc_fecha: null, oc_archivo: null },
        factura: { factura_numero: null, factura_fecha: null, factura_archivo: null },
        cobro: { cobro_fecha: null, cobro_monto: null, cobro_medio: null },
      }[paso], 'Listo.');
    },
  });
  const cobrar = () => abrirFormulario({
    titulo: 'Registrar cobro',
    mensaje: c.cot_grupos.some((g) => g.orden_id) ? 'Las órdenes del taller ligadas quedan cobradas con los valores de esta cotización (así suman al Estado de resultados).' : null,
    campos: [
      { id: 'monto', etiqueta: 'Monto cobrado ($, total)', tipo: 'number', requerido: true, valor: String(total) },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
    ],
    textoGuardar: 'Registrar cobro',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto cobrado.');
      const { error } = await ctx.api.from('cot_cotizaciones').update({ cobro_fecha: v.fecha, cobro_monto: monto, cobro_medio: v.medio,
        ...(c.estado === 'enviada' ? { estado: 'aceptada', respondida_at: new Date().toISOString() } : {}) }).eq('id', c.id);
      if (error) throw new Error(error.message);
      let nota = '';
      try { nota = await cobrarOrdenes(ctx, c, v.fecha, v.medio); } catch (e) { nota = `Las órdenes del taller no se pudieron marcar: ${e.message}`; }
      avisar(`Cobro registrado.${nota ? ` ${nota}` : ''}`); ctx.refrescar();
    },
  });

  const e = etapa(c);
  const paso = (n, hecho, activo, titulo, cuerpo, botones) => el('div', { class: `cie-paso${hecho ? ' cie-hecho' : activo ? ' cie-activo' : ''}` },
    el('div', { class: 'cie-paso-cab' }, el('span', { class: 'cie-paso-n' }, hecho ? icono('check', { tam: 14 }) : String(n)), el('strong', {}, titulo)),
    el('div', { class: 'texto-chico' }, cuerpo), el('div', { class: 'cie-paso-acc' }, botones.filter(Boolean)));
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Seguimiento'),
    el('div', { class: 'cie-pasos' },
      paso(1, !!(c.oc_fecha || c.oc_numero), e === 'sin_oc', 'Orden de compra',
        c.oc_fecha ? `${c.oc_numero ? `N° ${c.oc_numero} · ` : ''}${fechaLarga(c.oc_fecha)}` : 'Registra la OC cuando el cliente la envíe.',
        [editar && !c.cobro_fecha ? boton(c.oc_fecha ? 'Cambiar' : 'Registrar OC', { tipo: e === 'sin_oc' ? 'primario' : 'secundario', onclick: () => doc('oc') }) : null,
          verArchivo(ctx, c.oc_archivo, 'Ver OC'), editar && c.oc_fecha && !c.factura_numero ? boton('Quitar', { onclick: () => quitar('oc') }) : null]),
      paso(2, !!c.factura_numero, e === 'oc', 'Factura',
        c.factura_numero ? `N° ${c.factura_numero} · ${fechaLarga(c.factura_fecha)}` : 'Factura emitida por la OC.',
        [editar && !c.cobro_fecha ? boton(c.factura_numero ? 'Cambiar' : 'Registrar factura', { tipo: e === 'oc' ? 'primario' : 'secundario', onclick: () => doc('factura') }) : null,
          verArchivo(ctx, c.factura_archivo, 'Ver factura'), editar && c.factura_numero && !c.cobro_fecha ? boton('Quitar', { onclick: () => quitar('factura') }) : null]),
      paso(3, !!c.cobro_fecha, e === 'facturada', 'Cobro',
        c.cobro_fecha ? `${dinero(c.cobro_monto)} · ${fechaLarga(c.cobro_fecha)} · ${nombreMedio[c.cobro_medio] ?? ''}` : `Por cobrar: ${dinero(total)}`,
        [editar && !c.cobro_fecha ? boton('Registrar cobro', { icono: 'dinero', tipo: e === 'facturada' ? 'primario' : 'secundario', onclick: cobrar }) : null,
          editar && c.cobro_fecha ? boton('Anular cobro', { onclick: () => quitar('cobro') }) : null])));
}
