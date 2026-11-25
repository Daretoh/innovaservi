// Emitir factura electrónica (OpenFactura, Núcleo 021 + Cotizaciones 010, 2026-11-10). Mismo formulario que una
// factura registrada a mano, pero sin N°: el folio lo da el SII al emitir. Los datos del cliente se completan con el
// SII (RUT → razón social, giro, dirección y comuna) y el detalle sale de la cotización (una línea por vehículo o
// grupo) o de la orden del taller; se puede corregir: una línea por ítem con el monto neto al final.
// En producción la factura queda registrada en Facturas con el PDF del SII como respaldo y la OC como referencia.
// En pruebas se emite en el ambiente de desarrollo de Haulmer y solo se muestra el PDF de prueba.
// Anular: nota de crédito (anularConNota), que quita la factura de Facturas (la cotización queda libre).
import { el } from '../../core/ui/dom.js?v=1d279d8';
import { abrirFormulario } from '../../core/ui/modal.js?v=1d279d8';
import { avisar } from '../../core/ui/aviso.js?v=1d279d8';
import { hoyISO, sumarDias, dinero } from '../../core/ui/formato.js?v=1d279d8';
import { llamarDte, nuevaLlave, estadoDte, ofrecerPdf } from '../../core/dte.js?v=1d279d8';
import { totales, totalLinea, numeroTexto, verPatente, nombreTercero, IVA } from './datos.js?v=1d279d8';
import { PLAZO_PAGO } from './facturas.js?v=1d279d8';

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
// Ítems de la cotización tal cual (pedido de Enzo, 2026-11-12): cantidad, precio unitario y descuento de cada línea; con
// varios vehículos, cada ítem lleva su patente. El descuento adicional va aparte (descuento global de la factura).
export function itemsCotizacion(c) {
  const varios = c.cot_grupos.length > 1;
  const grupos = [...c.cot_grupos].sort((a, b) => a.orden - b.orden);
  return grupos.flatMap((g) => c.cot_lineas.filter((l) => l.grupo_id === g.id && l.tipo !== 'seccion').sort((a, b) => a.orden - b.orden)
    .map((l) => ({ l, monto: totalLinea(l) })).filter(({ monto }) => monto > 0)
    .map(({ l, monto }) => ({
      nombre: `${varios ? `${verPatente(g.patente) || g.titulo || 'Vehículo'} · ` : ''}${(l.descripcion || 'Ítem').replace(/\s+/g, ' ').trim()}`.slice(0, 80),
      cant: Number(l.cantidad) || 1, precio: Number(l.precio) || 0, monto,
    })));
}
const textoLineas = (ls) => ls.map((l) => `${l.nombre} ${miles(l.monto)}`).join('\n');
// Vista previa de los ítems (no se edita: para escribir otro detalle se elige "Escribir el detalle")
const textoItems = (ls) => ls.map((l) => `${l.nombre}  ·  ${l.cant} × ${miles(l.precio)} = ${miles(l.monto)}`).join('\n');
// "Mantención 10.000 km 120.000" → { nombre: 'Mantención 10.000 km', monto: 120000 }
export function leerLineas(texto) {
  return String(texto ?? '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.*?)[\s:;|=$-]+\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*$/);
    return m ? { nombre: m[1].trim(), monto: Number(m[2].replace(/\./g, '')) } : { nombre: s, monto: NaN };
  });
}

// Borrador (2026-11-17, pedido de Enzo): PDF local con el mismo diseño de la factura de Haulmer y lo mismo que se
// enviará al SII, marcado BORRADOR, sin folio ni timbre. No llama al SII.
async function verBorrador(ctx, v, lineas, descuentoPct, { emisor = null, ocFecha = null } = {}) {
  const { cargarJsPdf, cargarLogo, rgb } = await import('../../core/pdf.js?v=1d279d8');
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const em = { razon: emisor?.razon ?? e.razon_social, rut: emisor?.rut ?? e.rut, giro: emisor?.giro ?? e.giro ?? '',
    direccion: [emisor?.direccion ?? e.direccion, emisor?.comuna].filter(Boolean).join(', '), comuna: emisor?.comuna ?? '' };
  const suma = lineas.reduce((s, l) => s + l.monto, 0);
  const desc = Math.round(suma * descuentoPct / 100);
  const neto = suma - desc;
  const exenta = v.iva === 'no';
  const iva = exenta ? 0 : Math.round(neto * IVA);
  const pesos = (n) => `$ ${miles(n)}`;
  const rutPuntos = (r) => { const [c, dv] = String(r ?? '').split('-'); return c ? `${Number(c).toLocaleString('es-CL')}-${dv ?? ''}` : ''; };
  const ROJO = [226, 0, 26];
  const NEGRO = [20, 20, 20];
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  const punteado = (x, y0, w, h) => { doc.setLineDashPattern([0.5, 0.6], 0).setDrawColor(90).setLineWidth(0.2).rect(x, y0, w, h); doc.setLineDashPattern([], 0); };

  // Emisor: logo y datos
  const logo = await cargarLogo(ctx.api, e.logo_url);
  if (logo) { const k = Math.min(42 / logo.ancho, 26 / logo.alto); doc.addImage(logo.dataUrl, logo.formato, M, 9, logo.ancho * k, logo.alto * k); }
  let y = 12;
  doc.setTextColor(...NEGRO).setFont('helvetica', 'bold').setFontSize(9.5);
  doc.text(String(em.razon).toUpperCase(), 58, y); y += 4.6;
  doc.setFontSize(8.5);
  for (const t of doc.splitTextToSize(String(em.giro).toUpperCase(), 90)) { doc.text(t, 58, y); y += 4; }
  if (em.direccion) { doc.text(em.direccion.toUpperCase(), 58, y); y += 4.4; }
  if (e.email) doc.text(e.email, 58, y);

  // Recuadro rojo
  doc.setDrawColor(...ROJO).setLineWidth(0.6).rect(151, 8, 55, 30);
  doc.setTextColor(...ROJO).setFont('helvetica', 'bold').setFontSize(11);
  doc.text(`R.U.T.: ${rutPuntos(em.rut)}`, 178.5, 16, { align: 'center' });
  doc.text(exenta ? 'FACTURA EXENTA' : 'FACTURA ELECTRÓNICA', 178.5, 24.5, { align: 'center' });
  doc.text('N° BORRADOR', 178.5, 33, { align: 'center' });
  if (em.comuna) doc.text(`S.I.I. ${em.comuna.toUpperCase()}`, 178.5, 44, { align: 'center' });
  doc.setDrawColor(200).setLineWidth(0.3).line(M, 48, W - M, 48);

  // Fecha, receptor y condiciones
  const f = new Date(`${v.emision}T12:00:00`);
  const fechaTxt = f.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '').replace(/ de (\d{4})$/, ' del $1');
  doc.setTextColor(...NEGRO).setFont('helvetica', 'normal').setFontSize(9);
  doc.text(fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1), W - M, 53, { align: 'right' });
  const filasR = [['R.U.T.', rutPuntos(v.rut)], ['SEÑOR (ES)', v.razon], ['GIRO', v.giro], ['DIRECCIÓN', [v.direccion, v.comuna].filter(Boolean).join(', ')]];
  punteado(M, 56, 113, 4 + filasR.length * 4.6);
  filasR.forEach(([k, val], i) => {
    const yy = 60.5 + i * 4.6;
    doc.setFont('helvetica', 'bold').text(k, M + 2, yy);
    doc.text(':', M + 25, yy);
    doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(String(val ?? '').toUpperCase(), 84)[0] ?? '', M + 28, yy);
  });
  [['Forma de pago', v.forma === '1' ? 'Contado' : 'Crédito'], ['Tipo Venta', 'Ventas del Giro.'], ['Tipo Compra', 'Compras del Giro.']].forEach(([k, val], i) => {
    const yy = 62 + i * 5;
    doc.setFont('helvetica', 'bold').text(`${k} :`, 140, yy);
    const x = 140 + doc.getTextWidth(`${k} : `) + 0.5;
    doc.setFont('helvetica', 'normal').text(val, x, yy);
  });

  // Detalle y referencias
  const titulo = (t, yy) => {
    doc.setDrawColor(...NEGRO).setLineWidth(0.4).line(M, yy, W - M, yy);
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NEGRO).text(t, W / 2, yy + 4, { align: 'center' });
    return yy + 5.5;
  };
  const tabla = (startY, head, body, columnStyles) => {
    doc.autoTable({ startY, head: [head], body, margin: { left: M, right: M, bottom: 60 }, theme: 'grid', columnStyles,
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.2, textColor: NEGRO, lineColor: [120, 120, 120], lineWidth: 0.1, fillColor: false },
      headStyles: { fontStyle: 'bold', halign: 'center', fillColor: false, textColor: NEGRO }, bodyStyles: { fontStyle: 'bold' } });
    return doc.lastAutoTable.finalY;
  };
  y = titulo('DETALLE DE ITEMS', 81);
  y = tabla(y, ['Item', 'Cantidad', 'Precio', 'Subtotal'],
    lineas.map((l) => [String(l.nombre).toUpperCase(), String(l.cant ?? 1), pesos(l.precio ?? l.monto), pesos(l.monto)]),
    { 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 38, halign: 'right' }, 3: { cellWidth: 34, halign: 'right' } });
  if (v.oc && v.oc.trim()) {
    y = titulo('REFERENCIAS', y + 3);
    y = tabla(y, ['Documento', 'Folio', 'Fecha de emision'], [['ORDEN DE COMPRA', v.oc.trim(), ocFecha ?? '']],
      { 0: { halign: 'center' }, 1: { halign: 'center', cellWidth: 45 }, 2: { halign: 'center', cellWidth: 80 } });
  }

  // Pie: timbre (no existe en un borrador) y totales
  const yp = H - 52;
  punteado(25, yp, 70, 22);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
  doc.text(['Timbre electrónico S.I.I.', 'se genera al emitir la factura'], 60, yp + 9.5, { align: 'center' });
  const tot = [...(desc ? [['SUBTOTAL', suma], [`DESCUENTO ${descuentoPct} %`, -desc]] : []),
    [exenta ? 'MONTO EXENTO' : 'MONTO NETO', neto], ...(exenta ? [] : [['IVA 19%', iva]]), ['MONTO TOTAL', neto + iva]];
  punteado(137, yp, 69, 4 + tot.length * 4.6);
  doc.setTextColor(...NEGRO).setFontSize(9);
  tot.forEach(([k, n], i) => {
    const yy = yp + 4.5 + i * 4.6;
    if (i === tot.length - 1) doc.setDrawColor(...NEGRO).setLineWidth(0.3).line(138, yy - 3.6, 205, yy - 3.6);
    doc.text(k, 175, yy, { align: 'right' });
    doc.text('$', 180, yy);
    doc.text(miles(n), 204, yy, { align: 'right' });
  });

  // Marca BORRADOR
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.16 }));
  doc.setFont('helvetica', 'bold').setFontSize(90).setTextColor(...rgb(e.color));
  doc.text('BORRADOR', W / 2, H / 2 + 20, { align: 'center', angle: 35 });
  doc.restoreGraphicsState();
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(150);
  doc.text('Borrador sin validez tributaria: el folio y el timbre los da el SII al emitir.', W / 2, H - 8, { align: 'center' });
  window.open(URL.createObjectURL(doc.output('blob')), '_blank', 'noopener');
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
  // Cómo va el detalle: ítems de la cotización (con cantidad y precio), un ítem por vehículo, o escrito a mano
  let cotActual = cot0;
  const items0 = cot0 ? itemsCotizacion(cot0) : [];
  const modo0 = cot0 && items0.length && items0.length <= 60 ? 'items' : cot0 ? 'vehiculos' : 'libre';
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
  const resumenItems = (c) => {
    const t = totales(c, c.cot_grupos, c.cot_lineas);
    return `${itemsCotizacion(c).length} ítems${t.desc ? ` · descuento adicional ${Number(c.desc_adic_pct)} %` : ''} · Neto ${dinero(t.neto)} · IVA ${dinero(Math.round(t.neto * IVA))} · Total ${dinero(t.neto + Math.round(t.neto * IVA))}`;
  };
  const sumar = (texto) => {
    const ls = leerLineas(texto);
    if (!ls.length) return 'Sin líneas.';
    if (ls.some((l) => !l.nombre || !(l.monto > 0))) return 'Cada línea debe terminar en su monto neto (ej.: Mantención 120.000).';
    const neto = ls.reduce((s, l) => s + l.monto, 0);
    return `Neto ${dinero(neto)} · IVA ${dinero(Math.round(neto * IVA))} · Total ${dinero(neto + Math.round(neto * IVA))}`;
  };

  // Lo que se envía al SII (lo usan "Ver borrador" y "Emitir")
  const calcular = (v) => {
    const conItems = v.modo === 'items' && cotActual;
    const lineas = conItems ? itemsCotizacion(cotActual) : v.modo === 'vehiculos' && cotActual ? lineasCotizacion(cotActual) : leerLineas(v.lineas);
    if (!lineas.length || lineas.some((l) => !l.nombre || !(l.monto > 0))) throw new Error('Revisa el detalle: cada línea debe terminar en su monto neto.');
    if (lineas.length > 60) throw new Error('El SII acepta hasta 60 ítems: elige "Un ítem por vehículo".');
    if (!v.rut || !v.razon || !v.giro || !v.direccion || !v.comuna) throw new Error('Completa RUT, razón social, giro, dirección y comuna.');
    return { lineas, descuentoPct: conItems ? Number(cotActual.desc_adic_pct) || 0 : 0 };
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
          cotActual = c;
          const its = itemsCotizacion(c);
          const conItems = its.length && its.length <= 60;
          poner('modo', conItems ? 'items' : 'vehiculos');
          poner('lineas', conItems ? textoItems(its) : textoLineas(lineasCotizacion(c)));
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
      { id: 'modo', etiqueta: 'Detalle de la factura', opciones: [
          ...(cot0 || cotizaciones.length ? [['items', 'Ítems de la cotización (cantidad y precio)'], ['vehiculos', 'Un ítem por vehículo']] : []), ['libre', 'Escribir el detalle']], valor: modo0,
        alCambiar: ({ valor, poner }) => {
          const c = cotActual;
          if (valor === 'items' && c) {
            const its = itemsCotizacion(c);
            if (its.length > 60) { avisar('La cotización tiene más de 60 ítems (el máximo del SII): va un ítem por vehículo.', 'error'); poner('modo', 'vehiculos'); poner('lineas', textoLineas(lineasCotizacion(c))); return; }
            poner('lineas', textoItems(its));
          } else if (valor === 'vehiculos' && c) poner('lineas', textoLineas(lineasCotizacion(c)));
        } },
      { id: 'lineas', etiqueta: 'Líneas', tipo: 'textarea', filas: 6, requerido: true, valor: modo0 === 'items' ? textoItems(items0) : textoLineas(lineas0),
        ayuda: 'Con "Ítems de la cotización" esto es solo la vista previa. Para escribir: una línea por ítem con el monto neto al final (ej.: Mantención 10.000 km 120.000).',
        alCambiar: ({ valor, valores, estado }) => estado(valores.modo === 'items' && cotActual ? resumenItems(cotActual) : sumar(valor)) },
      { id: 'iva', etiqueta: 'IVA', opciones: [['si', 'Con IVA (19 %)'], ['no', 'Sin IVA (factura exenta)']], valor: cot0 && !cot0.con_iva ? 'no' : 'si' },
      { id: 'forma', etiqueta: 'Forma de pago', opciones: [['2', 'Crédito'], ['1', 'Contado']], valor: '2' },
      { id: 'oc', etiqueta: 'OC u orden de servicio (va como referencia)', valor: cot0?.oc_numero ?? '' },
      { id: 'detalle', etiqueta: 'Detalle de trabajos (para Facturas)', valor: cot0 ? detalleCot(cot0) : orden?.detalle ?? '' },
      { id: 'emision', etiqueta: 'Fecha de emisión', tipo: 'date', requerido: true, valor: fecha0,
        alCambiar: ({ valor, poner }) => { if (valor) poner('estimada', sumarDias(valor, PLAZO_PAGO)); } },
      { id: 'estimada', etiqueta: 'Fecha de pago estimada', tipo: 'date', valor: sumarDias(fecha0, PLAZO_PAGO) },
      { id: 'ejecucion', etiqueta: 'Fecha de ejecución del trabajo', tipo: 'date', valor: cot0?.fecha ?? orden?.fecha ?? '',
        accion: { texto: 'Ver borrador de la factura', icono: 'documento', alClic: async ({ valores, estado }) => {
          try {
            const { lineas, descuentoPct } = calcular(valores);
            await verBorrador(ctx, valores, lineas, descuentoPct, { emisor: est.emisor, ocFecha: cotActual?.oc_fecha ?? null });
            estado('Borrador abierto en otra pestaña. Si está bien, toca "Emitir".', 'ok');
          } catch (err) { estado(err.message, 'error'); }
        } } },
      { id: 'notas', etiqueta: 'Notas internas', tipo: 'textarea', valor: '' },
    ],
    textoGuardar: est.prueba_emision ? 'Emitir prueba' : 'Emitir en el SII',
    alGuardar: async (v) => {
      const { lineas, descuentoPct } = calcular(v);
      const suma = lineas.reduce((s, l) => s + l.monto, 0);
      const neto = suma - Math.round(suma * descuentoPct / 100);
      const tercero = clientes.find((t) => t.id === v.cliente);
      const r = await llamarDte(ctx, 'emitir_factura', {
        idempotencia: llave, exenta: v.iva === 'no', forma_pago: Number(v.forma),
        receptor: { rut: v.rut, razon: v.razon, giro: v.giro, direccion: v.direccion, comuna: v.comuna },
        lineas, descuento_pct: descuentoPct,
        factura: { cotizacion_id: v.cotizacion || null, orden_id: v.orden || orden?.id || null, tercero_id: tercero?.id ?? null, oc_numero: v.oc.trim() || null,
          detalle: v.detalle.trim() || null, fecha_emision: v.emision, fecha_pago_estimada: v.estimada || null, fecha_ejecucion: v.ejecucion || null, notas: v.notas.trim() || null },
      });
      const total = v.iva === 'no' ? neto : neto + Math.round(neto * IVA);
      if (r.aviso) avisar(r.aviso, 'error');
      else avisar(r.prueba ? `Factura de prueba N° ${r.folio} emitida (${dinero(total)}). No se guardó en Facturas.` : `Factura N° ${r.folio} emitida en el SII y registrada (${dinero(total)}).`);
      ofrecerPdf(r.pdf, { titulo: r.prueba ? `Factura de prueba N° ${r.folio}` : `Factura N° ${r.folio}`, texto: r.prueba ? 'Emitida en el ambiente de pruebas de Haulmer (timbre simulado): no vale en el SII y no queda en Facturas.' : 'Emitida en el SII y registrada en Facturas.' });
      alGuardar?.(r);
    },
  });
  // Con el RUT del cliente ya puesto, completar dirección, comuna y giro con el SII al abrir
  if (t0?.rut) {
    setTimeout(() => {
      const dlg = [...document.querySelectorAll('dialog[open]')].pop();
      [...(dlg?.querySelectorAll('.campo-accion button') ?? [])].find((b) => /Traer datos del SII/.test(b.textContent))?.click();
    }, 0);
  }
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
      ofrecerPdf(r.pdf, { titulo: `Nota de crédito N° ${r.folio}` });
      if (r.aviso) avisar(r.aviso, 'error'); else avisar(`Nota de crédito N° ${r.folio} emitida: la factura N° ${f.numero} quedó anulada.`);
      alGuardar?.(r);
    },
  });
}
