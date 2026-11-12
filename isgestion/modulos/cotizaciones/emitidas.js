// Facturas emitidas fuera de ISgestión (la TUU o la plataforma de OpenFactura), Núcleo 021-022, 2026-11-10.
// Decisión de Enzo: las facturas las hace la máquina; ISgestión las trae del SII y las registra en Facturas con su
// PDF y XML (folio = N°), ligadas a la cotización u orden del taller. Emitir desde ISgestión queda para los cierres.
// En el ambiente de pruebas se ven las de la empresa de pruebas de Haulmer y "Registrar" solo muestra el PDF.
import { el } from '../../core/ui/dom.js?v=9dfb925';
import { boton } from '../../core/ui/tabla.js?v=9dfb925';
import { abrirFormulario } from '../../core/ui/modal.js?v=9dfb925';
import { avisar } from '../../core/ui/aviso.js?v=9dfb925';
import { dinero, fechaLarga, sumarDias } from '../../core/ui/formato.js?v=9dfb925';
import { llamarDte, estadoDte, NOMBRE_DTE } from '../../core/dte.js?v=9dfb925';
import { numeroTexto, nombreTercero } from './datos.js?v=9dfb925';
import { PLAZO_PAGO } from './facturas.js?v=9dfb925';

const limpio = (r) => String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

export function formRegistrar(ctx, d, { cotizaciones, clientes, ordenes, prueba, alGuardar }) {
  const cliente = clientes.find((t) => limpio(t.rut) === limpio(d.rut));
  // Sugerencias: cotizaciones y órdenes del mismo cliente primero
  const cots = [...cotizaciones].sort((a, b) => Number(b.tercero_id === cliente?.id) - Number(a.tercero_id === cliente?.id));
  const ords = [...ordenes].sort((a, b) => Number(b.tercero === cliente?.id) - Number(a.tercero === cliente?.id));
  abrirFormulario({
    titulo: `Registrar ${NOMBRE_DTE[d.tipo].toLowerCase()} N° ${d.folio}`,
    mensaje: prueba ? 'Ambiente de pruebas: solo se muestra el PDF; no se registra.'
      : `${d.razon ?? ''} · ${fechaLarga(d.fecha)} · ${dinero(d.total)}. Queda en Facturas con el PDF y el XML del SII; el N°, el cliente y los montos no se pueden cambiar.`,
    campos: [
      // Toda venta queda ligada a algo (pedido de Enzo): cotización, vehículo del taller u "otra venta" con detalle
      { id: 'cotizacion', etiqueta: 'Cotización', opciones: [['', 'Sin cotización'], ...cots.map((c) => [c.id, `N° ${numeroTexto(c.numero)} · ${c.cliente_nombre ?? ''}`])] },
      ...(ords.length ? [{ id: 'orden', etiqueta: 'Vehículo del taller', opciones: [['', 'Sin vehículo'], ...ords.map((o) => [o.id, o.texto])],
        ayuda: 'Al registrar el pago de la factura, la orden queda cobrada.' }] : []),
      { id: 'otra', etiqueta: 'Si no es de una cotización ni de un vehículo', opciones: [['', 'Es de una cotización o un vehículo'], ['si', 'Otra venta (escribe qué se vendió abajo)']] },
      { id: 'cliente', etiqueta: 'Cliente', opciones: [['', cliente ? 'Elegir…' : `Sin ficha (${d.razon ?? 'sin nombre'})`], ...clientes.map((t) => [t.id, nombreTercero(t)])], valor: cliente?.id ?? '' },
      { id: 'estimada', etiqueta: 'Fecha de pago estimada', tipo: 'date', valor: sumarDias(d.fecha, PLAZO_PAGO) },
      { id: 'detalle', etiqueta: 'Detalle de trabajos', valor: '' },
    ],
    textoGuardar: prueba ? 'Ver el PDF' : 'Registrar en Facturas',
    alGuardar: async (v) => {
      if (!prueba && !v.cotizacion && !v.orden && !(v.otra === 'si' && v.detalle?.trim().length >= 4)) {
        throw new Error('Liga la factura a una cotización o a un vehículo, o elige "Otra venta" y escribe qué se vendió.');
      }
      const r = await llamarDte(ctx, 'registrar_emitida', { token: d.token, cotizacion_id: v.cotizacion || null, orden_id: v.orden || null, otra: v.otra === 'si',
        tercero_id: v.cliente || null, fecha_pago_estimada: v.estimada || null, detalle: v.detalle?.trim() || null });
      if (r.pdf) window.open(r.pdf, '_blank', 'noopener');
      avisar(prueba ? `Factura de prueba N° ${r.folio}: no se registró.` : `Factura N° ${r.folio} registrada en Facturas.`);
      alGuardar?.();
    },
  });
}

// Panel con botón: trae las facturas emitidas de los últimos 45 días y muestra las que faltan en Facturas
export function panelEmitidas(ctx, { cotizaciones = [], clientes = [], ordenes = [], alGuardar } = {}) {
  const lista = el('div', {});
  const estado = el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' },
    'Las facturas que hace la máquina TUU o la plataforma de OpenFactura se traen del SII y se registran aquí con su PDF.');
  const traer = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.classList.add('cargando'); }
    estado.textContent = 'Buscando facturas emitidas en el SII…';
    try {
      const est = await estadoDte(ctx);
      if (!est.conectado) throw new Error(`OpenFactura no está conectado: ${est.error ?? 'falta la clave'}`);
      const r = await llamarDte(ctx, 'emitidas');
      const faltan = r.documentos.filter((d) => [33, 34].includes(d.tipo) && !d.factura_id);
      const notas = r.documentos.filter((d) => d.tipo === 61);
      estado.textContent = `${r.prueba ? 'Ambiente de pruebas (empresa de pruebas de Haulmer). ' : ''}Desde el ${fechaLarga(r.desde)}: ${r.documentos.length - notas.length} facturas en el SII, ${faltan.length} sin registrar${notas.length ? `, ${notas.length} notas de crédito` : ''}.${r.completo ? '' : ' (Se revisaron las primeras 180.)'}`;
      lista.replaceChildren(...faltan.map((d) => el('div', { class: 'doc-fila' },
        el('span', { class: 'doc-nombre' }, el('strong', {}, `${NOMBRE_DTE[d.tipo]} N° ${d.folio} · ${d.razon ?? 'Sin nombre'}`),
          el('span', { class: 'texto-suave texto-chico' }, `${fechaLarga(d.fecha)} · ${d.rut ?? ''} · ${dinero(d.total)}`)),
        ctx.puede('cotizaciones', 'crear') ? boton(r.prueba ? 'Ver' : 'Registrar', { icono: 'mas', class: 'boton boton-secundario boton-chico',
          onclick: () => formRegistrar(ctx, d, { cotizaciones, clientes, ordenes, prueba: r.prueba, alGuardar }) }) : null)));
    } catch (err) { estado.textContent = err.message; }
    finally { if (b) { b.disabled = false; b.classList.remove('cargando'); } }
  };
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Facturas emitidas en el SII'),
    el('div', { class: 'listado-acciones' }, boton('Traer del SII', { icono: 'descargar', tipo: 'primario', onclick: traer })),
    estado, lista);
}
