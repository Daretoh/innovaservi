// Detalle de una venta: líneas, pago, voucher, salida de stock y anular (repone el stock).
import { el } from '../../../core/ui/dom.js?v=14e2347';
import { icono } from '../../../core/ui/iconos.js?v=14e2347';
import { boton } from '../../../core/ui/tabla.js?v=14e2347';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14e2347';
import { avisar } from '../../../core/ui/aviso.js?v=14e2347';
import { urlFirmada } from '../../../core/adjuntos.js?v=14e2347';
import { dinero, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=14e2347';
import { nombreMedio, nombreDocVenta } from '../datos.js?v=14e2347';

const cant = (n) => String(Number(n));

export default async function vista(ctx) {
  const { data: v, error } = await ctx.api.from('pos_ventas').select('*, terceros(razon_social, nombre_fantasia), pos_lineas(*), inv_almacenes(nombre)').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('pos.ventas') }, icono('volver', { tam: 16 }), 'Ventas');
  if (!v) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Venta no encontrada'));
  const anulada = v.estado === 'anulada';

  const acciones = [];
  if (v.archivo) acciones.push(boton('Ver voucher', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, v.archivo, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }));
  if (!anulada && ctx.puede('pos', 'editar')) acciones.push(boton('Anular', { icono: 'cerrar', onclick: () => abrirFormulario({
    titulo: `Anular venta N° ${v.numero}`,
    mensaje: 'Los productos vuelven al stock y la venta sale del cuadre de caja.',
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true }], textoGuardar: 'Anular',
    alGuardar: async (f) => {
      const { error: e } = await ctx.api.rpc('pos_anular', { p_venta: v.id, p_motivo: f.motivo.trim() });
      if (e) throw new Error(e.message);
      avisar('Venta anulada.'); ctx.refrescar();
    },
  }) }));

  const cliente = v.terceros?.nombre_fantasia || v.terceros?.razon_social || v.cliente;
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `Venta N° ${v.numero}`),
        el('p', { class: 'texto-suave' }, [fechaLarga(v.fecha), v.inv_almacenes?.nombre].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${anulada ? 'chip-na' : 'chip-ok'}` }, anulada ? 'Anulada' : 'Vigente'), acciones)),
    anulada ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `Anulada el ${fechaLarga(diaLocal(v.anulada_at))}: ${v.anulada_motivo}`) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Pago'),
      [['Medio de pago', nombreMedio[v.medio_pago]], ['Documento', `${nombreDocVenta[v.doc_tipo]}${v.doc_numero ? ` N° ${v.doc_numero}` : ''}`],
        ['Cliente', cliente], ['Patente', v.patente]]
        .filter(([, x]) => x).map(([k, x]) => el('p', {}, el('span', { class: 'texto-suave' }, `${k}: `), x)),
      v.documento_id && ctx.puede('inventario', 'ver')
        ? el('p', {}, el('span', { class: 'texto-suave' }, 'Salida de stock: '), el('a', { href: ctx.ruta('inventario.documento', { id: v.documento_id }) }, 'ver movimiento')) : null),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Detalle (${v.pos_lineas.length})`),
      v.pos_lineas.map((l) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, l.descripcion), el('span', { class: 'texto-suave texto-chico' }, l.producto_id ? 'Producto' : 'Servicio o ítem')),
        el('span', {}, `${cant(l.cantidad)} × ${dinero(l.precio)}`),
        el('strong', {}, dinero(l.total)))),
      v.descuento ? el('p', { class: 'pos-cuadre-fila' }, el('span', { class: 'texto-suave' }, 'Descuento'), el('span', {}, dinero(-v.descuento))) : null,
      el('p', { class: 'pos-total' }, el('span', {}, 'Total'), el('strong', { class: 'pos-total-valor' }, dinero(v.total)))));
}
