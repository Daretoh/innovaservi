// Emitir factura electrónica (OpenFactura, Núcleo 021 + Cotizaciones 010, 2026-11-10). Mismo formulario que una
// factura registrada a mano, pero sin N°: el folio lo da el SII al emitir. Los datos del cliente se completan con el
// SII (RUT → razón social, giro, dirección y comuna) y el detalle sale de la cotización (una línea por vehículo o
// grupo) o de la orden del taller; se puede corregir: una línea por ítem con el monto neto al final.
// En producción la factura queda registrada en Facturas con el PDF del SII como respaldo y la OC como referencia.
// En pruebas se emite en el ambiente de desarrollo de Haulmer y solo se muestra el PDF de prueba.
// Anular: nota de crédito (anularConNota), que quita la factura de Facturas (la cotización queda libre).
import { el } from '../../core/ui/dom.js?v=9dfb925';
import { abrirFormulario } from '../../core/ui/modal.js?v=9dfb925';
import { avisar } from '../../core/ui/aviso.js?v=9dfb925';
import { hoyISO, sumarDias, dinero } from '../../core/ui/formato.js?v=9dfb925';
import { llamarDte, nuevaLlave, estadoDte } from '../../core/dte.js?v=9dfb925';
import { totales, numeroTexto, verPatente, nombreTercero, IVA } from './datos.js?v=9dfb925';
import { PLAZO_PAGO } from './facturas.js?v=9dfb925';

const detalleCot = (c) => c.cot_grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' · ')).join(', ');
const miles = (n) => Math.round(n).toLocaleString('es-CL');

// Líneas de una cotización: una por grupo (vehículo); el descuento adicional se reparte entre ellas
export function lineasCotizacion(c) {
  const t = totales(c, c.cot_grupos, c.cot_lineas);
  const grupos = c.cot_grupos.filter((g) => (t.porGrupo.get(g.id) ?? 0) > 0);
  if (!grupos.length) return [];
  let resto = t.neto;
  return grupos.map((g, i) => {
    const bruto = t.porGrupo.get(g.id);
    const monto = i === grupos.length - 1 ? resto : Math.round(bruto * (t.sub ? t.neto / t.sub : 1));
    resto -= monto;
    const nombre = [g.titulo || `Grupo ${i + 1}`, verPatente(g.patente)].filter(Boolean).join(' · ');
    return { nombre: `${nombre}${c.cot_grupos.length === 1 ? ` (cotización N° ${numeroTexto(c.numero)})` : ''}`.slice(0, 80), monto };
  });
}
const textoLineas = (ls) => ls.map((l) => `${l.nombre} ${miles(l.monto)}`).join('\n');
// "Mantención 10.000 km 120.000" → { nombre: 'Mantención 10.000 km', monto: 120000 }
export function leerLineas(texto) {
  return String(texto ?? '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.*?)[\s:;|=$-]+\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*$/);
    return m ? { nombre: m[1].trim(), monto: Number(m[2].replace(/\./g, '')) } : { nombre: s, monto: NaN };
  });
}

// Formulario. Igual que formFactura: cotizacion (desde el editor), cotizaciones y clientes (pestaña Facturas),
// ordenes del taller por facturar y orden ya elegida.
export async function formEmitir(ctx, { cotizacion = null, cotizaciones = [], clientes = [], ordenes = [], orden = null, alGuardar } = {}) {
  const est = await estadoDte(ctx);
  if (!est.conectado) { avisar(`OpenFactura no está conectado: ${est.error ?? `falta la clave ${est.falta_clave ?? ''}`}`, 'error'); return; }
  const llave = nuevaLlave();   // la misma en los reintentos de este formulario
  const cot0 = cotizacion;
  const fecha0 = hoyISO();
  const cliente0 = cot0?.tercero_id ?? orden?.tercero ?? '';
  const t0 = clientes.find((t) => t.id === cliente0);
  const lineas0 = cot0 ? lineasCotizacion(cot0) : orden ? [{ nombre: `${orden.detalle || 'Servicio de taller'} · OT N° ${orden.numero}`.slice(0, 80), monto: orden.neto }] : [];
  const opcionesCot = [['', 'Sin cotización'], ...(cot0 ? [cot0] : cotizaciones).map((c) => [c.id, `N° ${numeroTexto(c.numero)} · ${c.cliente_nombre ?? ''} · ${detalleCot(c) || 'sin detalle'}`])];
  const opcionesOrden = [['', 'Sin vehículo del taller'], ...ordenes.map((o) => [o.id, o.texto])];
  let sii = null;   // datos del SII del último RUT consultado

  const traerSii = async (rutTexto, poner, estado) => {
    if (!rutTexto) return;
    estado?.('Buscando en el SII…');
    try {
      sii = await llamarDte(ctx, 'contribuyente', { rut: rutTexto });
      poner('rut', sii.rut);
      if (sii.razon) poner('razon', sii.razon);
      if (sii.giro) poner('giro', sii.giro);
      if (sii.direccion) poner('direccion', sii.direccion);
      if (sii.comuna) poner('comuna', sii.comuna);
      estado?.(`Datos del SII${sii.giros?.length > 1 ? `. Otros giros: ${sii.giros.slice(1, 4).join(' · ')}` : ''}.`, 'ok');
    } catch (err) { estado?.(err.message, 'error'); }
  };
  const sumar = (texto) => {
    const ls = leerLineas(texto);
    if (!ls.length) return 'Sin líneas.';
    if (ls.some((l) => !l.nombre || !(l.monto > 0))) return 'Cada línea debe terminar en su monto neto (ej.: Mantención 120.000).';
    const neto = ls.reduce((s, l) => s + l.monto, 0);
    return `Neto ${dinero(neto)} · IVA ${dinero(Math.round(neto * IVA))} · Total ${dinero(neto + Math.round(neto * IVA))}`;
  };

  abrirFormulario({
    titulo: est.prueba_emision ? 'Emitir factura electrónica (prueba)' : 'Emitir factura electrónica',
    mensaje: est.prueba_emision
      ? 'Ambiente de pruebas de OpenFactura: se emite con timbre simulado y no se guarda en Facturas. Sirve para revisar el PDF.'
      : `Se emite en el SII como ${est.emisor?.razon ?? ctx.empresa.razon_social}. No se puede deshacer: se anula con una nota de crédito.`,
    campos: [
      ...(!cot0 && opcionesOrden.length > 1 ? [{ id: 'orden', etiqueta: 'Vehículo (orden del taller)', opciones: opcionesOrden, valor: orden?.id ?? '',
        alCambiar: ({ valor, poner }) => {
          const o = ordenes.find((x) => x.id === valor); if (!o) return;
          poner('cliente', o.tercero ?? ''); poner('detalle', o.detalle); poner('ejecucion', o.fecha ?? '');
          poner('lineas', textoLineas([{ nombre: `${o.detalle || 'Servicio de taller'} · OT N° ${o.numero}`.slice(0, 80), monto: o.neto }]));
          const t = clientes.find((x) => x.id === o.tercero); if (t?.rut) traerSii(t.rut, poner);
        } }] : []),
      { id: 'cotizacion', etiqueta: 'Cotización', opciones: opcionesCot, valor: cot0?.id ?? '',
        alCambiar: ({ valor, poner }) => {
          const c = cotizaciones.find((x) => x.id === valor); if (!c) return;
          poner('cliente', c.tercero_id ?? ''); poner('oc', c.oc_numero ?? ''); poner('detalle', detalleCot(c)); poner('ejecucion', c.fecha ?? '');
          poner('lineas', textoLineas(lineasCotizacion(c)));
          const t = clientes.find((x) => x.id === c.tercero_id); if (t?.rut) traerSii(t.rut, poner);
        } },
      { id: 'cliente', etiqueta: 'Cliente', opciones: [['', 'Elegir…'], ...clientes.map((t) => [t.id, nombreTercero(t)])], valor: cliente0,
        alCambiar: ({ valor, poner, estado }) => { const t = clientes.find((x) => x.id === valor); if (t?.rut) traerSii(t.rut, poner, estado); else if (t) { poner('rut', ''); poner('razon', t.razon_social ?? ''); } } },
      { id: 'rut', etiqueta: 'RUT del cliente', requerido: true, valor: t0?.rut ?? '',
        accion: { texto: 'Traer datos del SII', icono: 'buscar', alClic: ({ valores, poner, estado }) => traerSii(valores.rut, poner, estado) } },
      { id: 'razon', etiqueta: 'Razón social', requerido: true, valor: t0?.razon_social ?? '' },
      { id: 'giro', etiqueta: 'Giro', requerido: true, valor: t0?.giro ?? '', ayuda: 'Hasta 40 caracteres (así lo pide el SII).' },
      { id: 'direccion', etiqueta: 'Dirección', requerido: true, valor: '' },
      { id: 'comuna', etiqueta: 'Comuna', requerido: true, valor: '' },
      { id: 'lineas', etiqueta: 'Detalle de la factura', tipo: 'textarea', requerido: true, valor: textoLineas(lineas0),
        ayuda: 'Una línea por ítem, con el monto neto al final (ej.: Mantención 10.000 km 120.000).',
        alCambiar: ({ valor, estado }) => estado(sumar(valor)) },
      { id: 'iva', etiqueta: 'IVA', opciones: [['si', 'Con IVA (19 %)'], ['no', 'Sin IVA (factura exenta)']], valor: cot0 && !cot0.con_iva ? 'no' : 'si' },
      { id: 'forma', etiqueta: 'Forma de pago', opciones: [['2', 'Crédito'], ['1', 'Contado']], valor: '2' },
      { id: 'oc', etiqueta: 'OC u orden de servicio (va como referencia)', valor: cot0?.oc_numero ?? '' },
      { id: 'detalle', etiqueta: 'Detalle de trabajos (para Facturas)', valor: cot0 ? detalleCot(cot0) : orden?.detalle ?? '' },
      { id: 'emision', etiqueta: 'Fecha de emisión', tipo: 'date', requerido: true, valor: fecha0,
        alCambiar: ({ valor, poner }) => { if (valor) poner('estimada', sumarDias(valor, PLAZO_PAGO)); } },
      { id: 'estimada', etiqueta: 'Fecha de pago estimada', tipo: 'date', valor: sumarDias(fecha0, PLAZO_PAGO) },
      { id: 'ejecucion', etiqueta: 'Fecha de ejecución del trabajo', tipo: 'date', valor: cot0?.fecha ?? orden?.fecha ?? '' },
      { id: 'notas', etiqueta: 'Notas internas', tipo: 'textarea', valor: '' },
    ],
    textoGuardar: est.prueba_emision ? 'Emitir prueba' : 'Emitir en el SII',
    alGuardar: async (v) => {
      const lineas = leerLineas(v.lineas);
      if (!lineas.length || lineas.some((l) => !l.nombre || !(l.monto > 0))) throw new Error('Revisa el detalle: cada línea debe terminar en su monto neto.');
      const neto = lineas.reduce((s, l) => s + l.monto, 0);
      const tercero = clientes.find((t) => t.id === v.cliente);
      const r = await llamarDte(ctx, 'emitir_factura', {
        idempotencia: llave, exenta: v.iva === 'no', forma_pago: Number(v.forma),
        receptor: { rut: v.rut, razon: v.razon, giro: v.giro, direccion: v.direccion, comuna: v.comuna },
        lineas,
        factura: { cotizacion_id: v.cotizacion || null, orden_id: v.orden || orden?.id || null, tercero_id: tercero?.id ?? null, oc_numero: v.oc.trim() || null,
          detalle: v.detalle.trim() || null, fecha_emision: v.emision, fecha_pago_estimada: v.estimada || null, fecha_ejecucion: v.ejecucion || null, notas: v.notas.trim() || null },
      });
      if (r.pdf) window.open(r.pdf, '_blank', 'noopener');
      const total = v.iva === 'no' ? neto : neto + Math.round(neto * IVA);
      if (r.aviso) avisar(r.aviso, 'error');
      else avisar(r.prueba ? `Factura de prueba N° ${r.folio} emitida (${dinero(total)}). No se guardó en Facturas.` : `Factura N° ${r.folio} emitida en el SII y registrada (${dinero(total)}).`);
      alGuardar?.(r);
    },
  });
}

// Anular una factura emitida con una nota de crédito (documento de dte_documentos)
export function anularConNota(ctx, f, doc, { alGuardar } = {}) {
  const llave = nuevaLlave();
  abrirFormulario({
    titulo: `Anular la factura N° ${f.numero}`,
    mensaje: `Se emite en el SII una nota de crédito por el total (${dinero(f.total)}) que anula la factura. La factura sale de Facturas${f.cotizacion_id ? ' y la cotización queda libre para facturarla de nuevo' : ''}. No se puede deshacer.`,
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: '', ayuda: 'Ej.: error en el RUT del cliente, monto mal calculado.' }],
    textoGuardar: 'Emitir nota de crédito',
    alGuardar: async (v) => {
      const r = await llamarDte(ctx, 'nota_credito', { documento_id: doc.id, motivo: v.motivo, idempotencia: llave });
      if (r.pdf) window.open(r.pdf, '_blank', 'noopener');
      if (r.aviso) avisar(r.aviso, 'error'); else avisar(`Nota de crédito N° ${r.folio} emitida: la factura N° ${f.numero} quedó anulada.`);
      alGuardar?.(r);
    },
  });
}
