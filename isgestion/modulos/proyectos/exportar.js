// Proyectos: cálculo del resumen formal (lo usan la pantalla y el PDF), Excel con el membrete de la empresa y PDF del
// resumen ("Resumen de materiales y mobiliario", como el que se imprimía desde el prototipo).
import { nuevoExcel } from '../../core/excel.js?v=574ba64';
import { nuevoPdf, rgb } from '../../core/pdf.js?v=574ba64';
import {
  NOMBRE_ESTADO, NO_SUMA, FUENTES, clp, subtotal, suma, tienePrecio, gDe, ordenGrupos, neto, fmtNum, hoyLargo,
} from './datos.js?v=574ba64';

const n = (v) => fmtNum(v, 'cantidad');

// Resumen: { ps, total, sinPrecio, zonas, porArea[], consolidada[], totalC, detalle[{zona, areas[{g, filas, total}]}], pendientes[] }
export function calcularResumen(d, { zona = '', alt = false } = {}) {
  const ps = [...d.partidas].sort((a, b) => a.orden - b.orden).filter((x) => (!zona || x.zona === zona) && (alt || !NO_SUMA.has(x.estado)));
  const total = suma(ps);
  const sinPrecio = ps.filter((x) => !NO_SUMA.has(x.estado) && !tienePrecio(x));
  const zonas = [...new Set(ps.map((x) => x.zona))];
  const varias = zonas.length > 1;
  const detalle = zonas.map((z) => {
    const fzs = ps.filter((x) => x.zona === z);
    return { zona: z, areas: ordenGrupos([...new Set(fzs.map(gDe))]).map((g) => { const filas = fzs.filter((x) => gDe(x) === g); return { g, filas, total: suma(filas) }; }) };
  });
  const porArea = detalle.flatMap((dz) => dz.areas.map((a) => {
    const sp = a.filas.filter((x) => !NO_SUMA.has(x.estado) && !tienePrecio(x)).length;
    return { nombre: `${varias ? `${dz.zona} · ` : ''}${a.g}`, partidas: a.filas.length, con: a.filas.length - sp, sin: sp, total: a.total };
  }));
  // Lista consolidada: mismo material (campo material, o mismo ítem y unidad) sumado entre áreas
  const claveMat = (x) => String(x.material || `${x.item}|${x.unidad || ''}`).toLowerCase().replace(/\s+/g, ' ').trim();
  const grupos = new Map();
  for (const x of ps.filter((y) => !NO_SUMA.has(y.estado))) {
    const k = claveMat(x);
    const g = grupos.get(k) || { nombre: x.material || x.item, detalle: x.material ? '' : x.detalle, unidad: x.unidad || '', cant: 0, partes: [], precio: null, prov: x, cat: x.categoria || '' };
    g.cant += Number(x.cantidad) || 0;
    g.partes.push(`${gDe(x)}${varias ? ` (${x.zona})` : ''}: ${n(x.cantidad)}`);
    if (g.precio === null && tienePrecio(x)) { g.precio = Number(x.precio); g.prov = x; }
    grupos.set(k, g);
  }
  const ordenCat = ['Material', 'Iluminación', 'Mueble', 'Fabricación', 'Equipamiento', 'Servicio', 'Decoración'];
  const pc = (c) => (ordenCat.indexOf(c) + 99) % 99;
  const consolidada = [...grupos.values()].sort((a, b) => pc(a.cat) - pc(b.cat) || a.nombre.localeCompare(b.nombre, 'es'));
  const totalC = consolidada.reduce((t, g) => t + (g.precio ? g.precio * g.cant : 0), 0);
  const pendientes = ps.filter((x) => /confirmar|revisar|medir|por cotizar/i.test(x.nota || '') || !tienePrecio(x))
    .map((x) => ({ item: x.item, area: gDe(x), falta: `${!tienePrecio(x) ? 'Precio por cotizar. ' : ''}${/^por cotizar\.?$/i.test(x.nota || '') ? '' : x.nota || ''}`.trim() }));
  return { ps, total, sinPrecio, zonas, varias, porArea, consolidada, totalC, detalle, pendientes };
}

// ---------------------------------------------------------------- Excel (Lista detallada)
export async function excelProyecto(ctx, d, partidas = d.partidas) {
  const x = await nuevoExcel(ctx, { titulo: `Cotización ${d.proyecto.nombre}`, subtitulo: `Cliente: ${d.proyecto.cliente || '-'} · Precios con IVA incluido · ${hoyLargo()}` });
  const fuente = Object.fromEntries(FUENTES);
  const filas = [...partidas].sort((a, b) => a.orden - b.orden);
  x.tabla({
    titulo: 'Partidas',
    columnas: ['Zona', 'Área', 'Categoría', 'Ítem', 'Detalle', 'Código', { t: 'Cantidad', tipo: 'decimal' }, 'Unidad', { t: 'Precio unitario', tipo: 'dinero' },
      { t: 'Subtotal', tipo: 'dinero' }, 'Proveedor', 'Link', 'Estado', { t: 'Fecha del precio', tipo: 'fecha' }, 'Cantidad sale de', 'Nota'],
    filas: filas.map((p) => [p.zona, gDe(p), p.categoria, p.item, p.detalle, p.sku, p.cantidad == null ? null : Number(p.cantidad), p.unidad,
      p.precio == null ? null : Number(p.precio), tienePrecio(p) ? subtotal(p) : null, p.tienda, /^https?:/i.test(p.url || '') ? p.url : p.url ? 'Archivo en ISgestión' : '',
      NOMBRE_ESTADO[p.estado], p.fecha_precio, fuente[p.fuente], p.nota]),
    total: ['Total con precio (IVA incluido)', '', '', '', '', '', null, '', null, suma(filas), '', '', '', null, '', ''],
    nota: 'Alternativas y descartados no suman al total.',
  });
  await x.guardar(`proyecto-${d.proyecto.nombre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`);
}

// ---------------------------------------------------------------- PDF del resumen
export async function pdfResumen(ctx, d, opciones) {
  const r = calcularResumen(d, opciones);
  const p = d.proyecto;
  const pdf = await nuevoPdf(ctx, { titulo: 'Resumen de materiales y mobiliario',
    subtitulo: `${p.nombre}${opciones.zona ? ` · ${opciones.zona}` : ''} · Cliente: ${p.cliente || '-'} · ${hoyLargo()} · Precios con IVA incluido` });
  const { doc } = pdf;
  const color = rgb(ctx.empresa.color);
  const ancho = doc.internal.pageSize.getWidth(); const M = 14;
  const PEND = [138, 90, 0];
  // Indicadores
  const kpis = [['Total con precio', clp(r.total)], ['Neto (sin IVA)', clp(neto(r.total))], ['IVA 19 %', clp(r.total - neto(r.total))], ['Partidas sin precio', `${r.sinPrecio.length} de ${r.ps.length}`]];
  const w = (ancho - 2 * M - 9) / 4; let y = pdf.y;
  kpis.forEach(([t, v], i) => {
    const x0 = M + i * (w + 3);
    doc.setDrawColor(213, 218, 214).setLineWidth(0.3).roundedRect(x0, y, w, 15, 2, 2, 'S');
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(93, 103, 99).text(t, x0 + 3, y + 5);
    doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(...(i === 3 && r.sinPrecio.length ? PEND : [27, 31, 29])).text(v, x0 + 3, y + 11.5);
  });
  pdf.saltar(21);
  const seccion = (t) => {
    y = pdf.y; if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; pdf.saltar(y - pdf.y); }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...color).text(t, M, y);
    doc.setDrawColor(...color).setLineWidth(0.6).line(M, y + 1.8, ancho - M, y + 1.8);
    pdf.saltar(5);
  };
  const tabla = (head, body, { totales = null, der = [], pend = [], cols = {} } = {}) => {
    doc.autoTable({
      startY: pdf.y, head: [head], body: totales ? [...body, totales] : body,
      margin: { left: M, right: M, bottom: 18 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [27, 31, 29], lineColor: [230, 233, 230], lineWidth: { bottom: 0.1 } },
      headStyles: { fillColor: [244, 246, 244], textColor: [93, 103, 99], fontStyle: 'bold', fontSize: 7 },
      columnStyles: Object.fromEntries([...der.map((c) => [c, { halign: 'right' }]), ...Object.entries(cols)]),
      didParseCell: (h) => {
        if (h.section === 'head' && der.includes(h.column.index)) h.cell.styles.halign = 'right';
        if (h.section !== 'body') return;
        if (totales && h.row.index === body.length) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [244, 246, 244]; }
        const esTotal = totales && h.row.index === body.length;
        if (!esTotal && pend.includes(h.column.index) && (h.cell.raw === 'Por cotizar' || (typeof h.cell.raw === 'number' && h.cell.raw > 0))) h.cell.styles.textColor = PEND;
      },
    });
    pdf.saltar(doc.lastAutoTable.finalY + 7 - pdf.y);
  };
  seccion('1. Resumen general');
  tabla(['Área', 'Partidas', 'Con precio', 'Sin precio', 'Total'], r.porArea.map((a) => [a.nombre, a.partidas, a.con, a.sin, clp(a.total)]),
    { totales: ['Total', r.ps.length, r.ps.length - r.sinPrecio.length, r.sinPrecio.length, clp(r.total)], der: [1, 2, 3, 4], pend: [3] });
  seccion('2. Lista de compra consolidada');
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(93, 103, 99).text('Junta el mismo material o producto de todas las áreas en una sola línea, para comprar todo junto.', M, pdf.y);
  pdf.saltar(3);
  tabla(['Material o producto', 'Cant. total', 'Unidad', 'Desglose por área', 'P. unitario', 'Total', 'Proveedor'],
    r.consolidada.map((g) => [`${g.nombre}${g.detalle ? `\n${g.detalle}` : ''}`, n(g.cant), g.unidad, g.partes.join(' · '), g.precio ? clp(g.precio) : 'Por cotizar', g.precio ? clp(g.precio * g.cant) : '-', g.prov.tienda || '']),
    { totales: ['Total con precio', '', '', '', '', clp(r.totalC), ''], der: [1, 4, 5], pend: [4], cols: { 0: { cellWidth: 48 }, 3: { cellWidth: 34, fontSize: 7, textColor: [93, 103, 99] } } });
  seccion('3. Detalle por área');
  for (const dz of r.detalle) {
    if (r.varias) { doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...color).text(dz.zona, M, pdf.y + 1); pdf.saltar(5); }
    dz.areas.forEach((a, i) => {
      if (pdf.y > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); pdf.saltar(20 - pdf.y); }
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(27, 31, 29).text(`${r.varias ? '' : `${i + 1}. `}${a.g}`, M, pdf.y);
      doc.text(clp(a.total), ancho - M, pdf.y, { align: 'right' });
      pdf.saltar(2);
      tabla(['Ítem', 'Detalle', 'Cant.', 'Unidad', 'P. unitario', 'Subtotal', 'Proveedor', 'Estado'],
        a.filas.map((x) => [`${x.item}${x.sku ? `\n${x.sku}` : ''}`, x.detalle || '', n(x.cantidad), x.unidad || '', tienePrecio(x) ? clp(x.precio) : 'Por cotizar', tienePrecio(x) ? clp(subtotal(x)) : '-', x.tienda || '', NOMBRE_ESTADO[x.estado]]),
        { totales: [`Subtotal ${a.g}`, '', '', '', '', clp(a.total), '', ''], der: [2, 4, 5], pend: [4], cols: { 1: { fontSize: 7, textColor: [93, 103, 99] } } });
    });
  }
  seccion('4. Pendientes');
  if (r.pendientes.length) tabla(['Ítem', 'Área', 'Qué falta'], r.pendientes.map((x) => [x.item, x.area, x.falta]), { cols: { 2: { fontSize: 7, textColor: [93, 103, 99] } } });
  else { doc.setFont('helvetica', 'normal').setFontSize(9).text('Sin pendientes.', M, pdf.y); pdf.saltar(8); }
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(93, 103, 99);
  doc.text(doc.splitTextToSize('El total considera solo las partidas con precio; las partidas por cotizar se suman cuando tengan precio. Precios referenciales a la fecha de cada partida; pueden variar según disponibilidad y despacho.', ancho - 2 * M), M, pdf.y);
  pdf.guardar(`resumen-${p.nombre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}${opciones.zona ? `-${opciones.zona.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}` : ''}`);
}

