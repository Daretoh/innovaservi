// Registro de facturas (007, 2026-11-03): formulario de factura (con o sin cotización), pago, anular pago, eliminar
// y subir respaldos (factura, OC, comprobante de pago). Lo usan la pestaña Facturas y el Seguimiento del editor.
// Si la factura está ligada a una cotización, la base copia en ella la factura y el pago; al pagar, las órdenes del
// taller ligadas quedan cobradas (cobrarOrdenes) y al anular el pago vuelven a quedar por cobrar.
// Con una orden del taller ligada directo (008, orden_id), lo hace la base: ver db/008_factura_orden.sql.
import { el } from '../../core/ui/dom.js?v=92f4191';
import { abrirFormulario } from '../../core/ui/modal.js?v=92f4191';
import { avisar } from '../../core/ui/aviso.js?v=92f4191';
import { hoyISO, sumarDias, dinero } from '../../core/ui/formato.js?v=92f4191';
import { subirArchivo } from '../../core/adjuntos.js?v=92f4191';
import { cobrarOrdenes, descobrarOrdenes } from './acciones.js?v=92f4191';
import { totales, numeroTexto, verPatente, nombreTercero, cargarCotizacion, IVA } from './datos.js?v=92f4191';
import { MEDIOS } from './seguimiento.js?v=92f4191';

export const PLAZO_PAGO = 30;   // días entre la emisión y el pago estimado (como en la planilla de Performance)
export const TIPOS_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png'];
export const RESPALDOS = [['archivo', 'Factura'], ['oc_archivo', 'OC'], ['pago_archivo', 'Comprobante de pago']];

// Estado de pago: pagada, vencida (pasó la fecha estimada) o pendiente
export function estadoPago(f, hoy = hoyISO()) {
  if (f.fecha_pago) return 'pagada';
  if (f.fecha_pago_estimada && f.fecha_pago_estimada < hoy) return 'vencida';
  return 'pendiente';
}
export const ESTADOS_PAGO = [['pendiente', 'Pendiente', 'chip-prox'], ['vencida', 'Vencida', 'chip-venc'], ['pagada', 'Pagada', 'chip-ok']];

const detalleCot = (c) => c.cot_grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' · ')).join(', ');
const subir = async (ctx, archivo, id) => (archivo?.size
  ? (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'cotizaciones', archivo, tabla: 'cot_facturas', registroId: id, tipos: TIPOS_ARCHIVO })).ruta : null);

// Formulario de factura. f = factura existente; cotizacion = la cotización desde la que se factura (editor).
// cotizaciones = enviadas o aceptadas sin factura, para elegir una (pestaña Facturas); clientes = terceros.
// ordenes = órdenes del taller por facturar, para buscar el vehículo; orden = la que ya viene elegida.
export function formFactura(ctx, { f = null, cotizacion = null, cotizaciones = [], clientes = [], ordenes = [], orden = null, alGuardar } = {}) {
  const cot0 = cotizacion ?? null;
  const t0 = cot0 ? totales(cot0, cot0.cot_grupos, cot0.cot_lineas) : null;
  const opcionesCot = [['', 'Sin cotización'], ...(cot0 ? [cot0] : cotizaciones).map((c) => [c.id, `N° ${numeroTexto(c.numero)} · ${c.cliente_nombre ?? ''} · ${detalleCot(c) || 'sin detalle'}`])];
  if (f?.cotizacion_id && !opcionesCot.some(([v]) => v === f.cotizacion_id)) opcionesCot.push([f.cotizacion_id, 'Cotización ligada']);
  const conIva = f ? (f.iva > 0 || f.neto === 0 ? 'si' : 'no') : t0 ? (cot0.con_iva ? 'si' : 'no') : 'si';
  const fecha0 = f?.fecha_emision ?? hoyISO();
  const opcionesOrden = [['', 'Sin vehículo del taller'], ...ordenes.map((o) => [o.id, o.texto])];
  if (f?.orden_id && !opcionesOrden.some(([v]) => v === f.orden_id)) opcionesOrden.push([f.orden_id, 'Orden ligada']);
  abrirFormulario({
    titulo: f ? `Factura N° ${f.numero}` : 'Nueva factura',
    mensaje: cot0 && !f ? `Se liga a la cotización N° ${numeroTexto(cot0.numero)} (la deja aceptada si estaba enviada).` : orden ? `Orden N° ${orden.numero}: al registrar el pago queda cobrada y se puede entregar.` : null,
    campos: [
      { id: 'numero', etiqueta: 'N° de factura', requerido: true, valor: f?.numero ?? '' },
      ...(!cot0 && opcionesOrden.length > 1 ? [{ id: 'orden', etiqueta: 'Vehículo (orden del taller)', opciones: opcionesOrden, valor: f?.orden_id ?? orden?.id ?? '',
        ayuda: 'Escribe la patente o el cliente. Al pagar la factura, la orden queda cobrada.',
        alCambiar: ({ valor, poner }) => {
          const o = ordenes.find((x) => x.id === valor);
          if (!o) return;
          poner('cliente', o.tercero ?? ''); poner('detalle', o.detalle); poner('neto', String(o.neto)); poner('iva', 'si'); poner('ejecucion', o.fecha ?? '');
        } }] : []),
      { id: 'cotizacion', etiqueta: 'Cotización', opciones: opcionesCot, valor: f?.cotizacion_id ?? cot0?.id ?? '',
        ayuda: cot0 ? null : 'Al elegir una, se llenan el cliente, la OC, el detalle y los montos.',
        alCambiar: ({ valor, poner }) => {
          const c = cotizaciones.find((x) => x.id === valor);
          if (!c) return;
          const t = totales(c, c.cot_grupos, c.cot_lineas);
          poner('cliente', c.tercero_id ?? ''); poner('oc', c.oc_numero ?? ''); poner('detalle', detalleCot(c));
          poner('neto', String(t.neto)); poner('iva', c.con_iva ? 'si' : 'no'); poner('ejecucion', c.fecha ?? '');
        } },
      { id: 'cliente', etiqueta: 'Cliente', opciones: [['', 'Elegir…'], ...clientes.map((t) => [t.id, nombreTercero(t)])], valor: f?.tercero_id ?? cot0?.tercero_id ?? orden?.tercero ?? '' },
      { id: 'oc', etiqueta: 'OC u orden de servicio', valor: f?.oc_numero ?? cot0?.oc_numero ?? '' },
      { id: 'detalle', etiqueta: 'Detalle de trabajos', valor: f?.detalle ?? (cot0 ? detalleCot(cot0) : orden?.detalle ?? '') },
      { id: 'emision', etiqueta: 'Fecha de emisión', tipo: 'date', requerido: true, valor: fecha0,
        alCambiar: ({ valor, poner }) => { if (valor && !f) poner('estimada', sumarDias(valor, PLAZO_PAGO)); } },
      { id: 'estimada', etiqueta: 'Fecha de pago estimada', tipo: 'date', valor: f?.fecha_pago_estimada ?? sumarDias(fecha0, PLAZO_PAGO), ayuda: `Por omisión, ${PLAZO_PAGO} días después de la emisión.` },
      { id: 'ejecucion', etiqueta: 'Fecha de ejecución del trabajo', tipo: 'date', valor: f?.fecha_ejecucion ?? cot0?.fecha ?? orden?.fecha ?? '' },
      { id: 'neto', etiqueta: 'Monto neto ($)', tipo: 'number', requerido: true, valor: String(f?.neto ?? t0?.neto ?? orden?.neto ?? '') },
      { id: 'iva', etiqueta: 'IVA', opciones: [['si', 'Con IVA (19 %)'], ['no', 'Sin IVA (exenta)']], valor: conIva },
      { id: 'archivo', etiqueta: `${f?.archivo ? 'Reemplazar factura' : 'Factura'} (PDF o imagen, opcional)`, tipo: 'file', accept: TIPOS_ARCHIVO.join(','), multiple: false },
      { id: 'oc_archivo', etiqueta: `${f?.oc_archivo ? 'Reemplazar OC' : 'OC'} (opcional)`, tipo: 'file', accept: TIPOS_ARCHIVO.join(','), multiple: false },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: f?.notas ?? '' },
    ],
    textoGuardar: f ? 'Guardar' : 'Registrar factura',
    alGuardar: async (v) => {
      const neto = Math.round(Number(v.neto));
      if (!(neto >= 0)) throw new Error('Indica el monto neto.');
      const tercero = clientes.find((t) => t.id === v.cliente);
      const cot = cotizaciones.find((x) => x.id === v.cotizacion) ?? (cot0?.id === v.cotizacion ? cot0 : null);
      const datos = {
        numero: v.numero.trim(), cotizacion_id: v.cotizacion || null, orden_id: v.orden || f?.orden_id || null, tercero_id: v.cliente || cot?.tercero_id || f?.tercero_id || null,
        cliente_nombre: tercero ? nombreTercero(tercero) : cot?.cliente_nombre ?? f?.cliente_nombre ?? null,
        oc_numero: v.oc.trim() || null, detalle: v.detalle.trim() || null, fecha_emision: v.emision, fecha_pago_estimada: v.estimada || null,
        fecha_ejecucion: v.ejecucion || null, neto, iva: v.iva === 'si' ? Math.round(neto * IVA) : 0, notas: v.notas.trim() || null,
      };
      if (!datos.tercero_id && !datos.cliente_nombre) throw new Error('Elige el cliente.');
      if (datos.fecha_pago_estimada && datos.fecha_pago_estimada < datos.fecha_emision) throw new Error('El pago estimado es anterior a la emisión.');
      if (!f && cot?.oc_archivo) datos.oc_archivo = cot.oc_archivo;
      const q = f ? ctx.api.from('cot_facturas').update(datos).eq('id', f.id) : ctx.api.from('cot_facturas').insert({ empresa_id: ctx.empresa.id, ...datos });
      const { data, error } = await q.select('*').single();
      if (error) throw new Error(/cot_facturas_numero_uq/.test(error.message) ? `Ya hay una factura N° ${datos.numero}.` : /cot_facturas_cot_uq/.test(error.message) ? 'Esa cotización ya tiene factura.' : /cot_facturas_orden_uq/.test(error.message) ? 'Esa orden ya tiene factura.' : error.message);
      // Respaldos después de guardar (la ruta lleva el id de la factura)
      const archivos = {};
      for (const k of ['archivo', 'oc_archivo']) { const r = await subir(ctx, v[k], data.id); if (r) archivos[k] = r; }
      if (Object.keys(archivos).length) {
        const r = await ctx.api.from('cot_facturas').update(archivos).eq('id', data.id);
        if (r.error) throw new Error(r.error.message);
      }
      avisar(f ? 'Factura guardada.' : 'Factura registrada.');
      alGuardar?.(data);
    },
  });
}

// Registrar el pago. Con cotización ligada, sus órdenes del taller quedan cobradas.
export function formPago(ctx, f, { alGuardar } = {}) {
  abrirFormulario({
    titulo: `Pago de la factura N° ${f.numero}`,
    mensaje: f.orden_id ? 'La orden del taller queda cobrada y se puede entregar.' : f.cotizacion_id ? 'Si la cotización tiene órdenes del taller ligadas, quedan cobradas con sus valores (así suman al Estado de resultados).' : null,
    campos: [
      { id: 'monto', etiqueta: 'Monto pagado ($, total)', tipo: 'number', requerido: true, valor: String(f.pago_monto ?? f.total) },
      { id: 'fecha', etiqueta: 'Fecha de pago', tipo: 'date', requerido: true, valor: f.fecha_pago ?? hoyISO() },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: f.pago_medio ?? 'transferencia' },
      { id: 'comprobante', etiqueta: `${f.pago_archivo ? 'Reemplazar comprobante' : 'Comprobante'} (opcional)`, tipo: 'file', accept: TIPOS_ARCHIVO.join(','), multiple: false },
    ],
    textoGuardar: 'Registrar pago',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto pagado.');
      const cambios = { fecha_pago: v.fecha, pago_monto: monto, pago_medio: v.medio };
      const r = await subir(ctx, v.comprobante, f.id);
      if (r) cambios.pago_archivo = r;
      const { error } = await ctx.api.from('cot_facturas').update(cambios).eq('id', f.id);
      if (error) throw new Error(error.message);
      let nota = '';
      if (f.cotizacion_id) {
        try { const c = await cargarCotizacion(ctx, f.cotizacion_id); if (c) nota = await cobrarOrdenes(ctx, c, v.fecha, v.medio); }
        catch (e) { nota = `Las órdenes del taller no se pudieron marcar: ${e.message}`; }
      }
      avisar(`Pago registrado${monto !== Number(f.total) ? ` (${dinero(monto)} de ${dinero(f.total)})` : ''}.${nota ? ` ${nota}` : ''}`);
      alGuardar?.();
    },
  });
}

export function anularPago(ctx, f, { alGuardar } = {}) {
  abrirFormulario({
    titulo: 'Anular el pago', campos: [], textoGuardar: 'Anular pago',
    mensaje: `La factura N° ${f.numero} vuelve a quedar pendiente${f.cotizacion_id || f.orden_id ? '; las órdenes del taller que se cobraron con ella vuelven a quedar por cobrar' : ''}.`,
    alGuardar: async () => {
      if (f.cotizacion_id) { const c = await cargarCotizacion(ctx, f.cotizacion_id); if (c) await descobrarOrdenes(ctx, c); }
      const { error } = await ctx.api.from('cot_facturas').update({ fecha_pago: null, pago_monto: null, pago_medio: null }).eq('id', f.id);
      if (error) throw new Error(error.message);
      avisar('Pago anulado.'); alGuardar?.();
    },
  });
}

export function eliminarFactura(ctx, f, { alGuardar } = {}) {
  abrirFormulario({
    titulo: 'Eliminar factura', campos: [], textoGuardar: 'Eliminar',
    mensaje: `Se elimina la factura N° ${f.numero}${f.cotizacion_id ? ' y se quita de su cotización' : ''}. Queda en la auditoría.`,
    alGuardar: async () => {
      if (f.fecha_pago) throw new Error('La factura tiene un pago registrado: anúlalo primero.');
      const { error } = await ctx.api.from('cot_facturas').update({ deleted_at: new Date().toISOString() }).eq('id', f.id);
      if (error) throw new Error(error.message);
      avisar('Factura eliminada.'); alGuardar?.();
    },
  });
}

// Subir un respaldo directo (sin abrir el formulario): abre el selector de archivos
export function subirRespaldo(ctx, f, campo, { alGuardar } = {}) {
  const input = el('input', { type: 'file', accept: TIPOS_ARCHIVO.join(','), hidden: true });
  input.addEventListener('change', async () => {
    const archivo = input.files[0];
    input.remove();
    if (!archivo) return;
    try {
      const ruta = await subir(ctx, archivo, f.id);
      const { error } = await ctx.api.from('cot_facturas').update({ [campo]: ruta }).eq('id', f.id);
      if (error) throw new Error(error.message);
      avisar(`${Object.fromEntries(RESPALDOS)[campo]} subido.`); alGuardar?.();
    } catch (e) { avisar(e.message, 'error'); }
  });
  document.body.append(input);
  input.click();
}
