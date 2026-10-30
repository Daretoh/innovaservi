// PDF de la cotización (diseño del OS de IS Performance, con la marca de cada empresa):
// encabezado con N° y fecha, cajas Cliente y Contacto, tabla por grupo con secciones y subtotal,
// información de pago, totales, firma, nota de validez, contactos y sello de ISgestión.
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=af5b0f2';
import { nombreEmpresa } from '../../core/empresas.js?v=af5b0f2';
import { sumarDias } from '../../core/ui/formato.js?v=af5b0f2';
import { totales, totalLinea, numeroTexto, verPatente, cargarConfig, IVA } from './datos.js?v=af5b0f2';

const M = 15;
const TEXTO = [28, 35, 48];
const GRIS = [91, 101, 118];
const LINEA = [221, 225, 231];
const SUAVE = [247, 248, 250];
const pesos = (n) => `$${Math.round(n).toLocaleString('es-CL')}`;
const fecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Abonos asignados a esta cotización en Cierres y cuentas (si la empresa usa ese módulo y el usuario lo ve)
async function abonosDe(ctx, c) {
  if (!ctx.puede('cierres', 'ver')) return 0;
  const { data, error } = await ctx.api.from('cie_abonos').select('monto').eq('cotizacion_id', c.id).is('deleted_at', null);
  return error ? 0 : (data ?? []).reduce((s, a) => s + Number(a.monto || 0), 0);
}

export async function pdfCotizacion(ctx, c) {
  const [jsPDF, cfg] = await Promise.all([cargarJsPdf(), cargarConfig(ctx)]);
  const e = ctx.empresa;
  const color = rgb(e.color);
  const claro = color.map((x) => Math.round(x + (255 - x) * 0.88));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await cargarLogo(ctx.api, e.logo_url);
  const t = totales(c, c.cot_grupos, c.cot_lineas);

  // ---- Encabezado
  if (logo) {
    const k = Math.min(55 / logo.ancho, 22 / logo.alto);
    doc.addImage(logo.dataUrl, logo.formato, M, 12, logo.ancho * k, logo.alto * k);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...color).text(nombreEmpresa(e), M, 24);
  }
  doc.setFillColor(...SUAVE).setDrawColor(...LINEA).roundedRect(W - M - 62, 10, 62, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS).text('N° COTIZACIÓN', W - M - 31, 16, { align: 'center' });
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...color).text(numeroTexto(c.numero), W - M - 31, 24, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TEXTO)
    .text(c.fecha_hasta && c.fecha_hasta !== c.fecha ? `Período: ${fecha(c.fecha)} – ${fecha(c.fecha_hasta)}` : `Fecha: ${fecha(c.fecha)}`, W - M - 31, 30, { align: 'center' })
    .text(`Válida hasta: ${fecha(sumarDias(c.fecha, c.validez_dias))}`, W - M - 31, 35, { align: 'center' });
  doc.setDrawColor(...color).setLineWidth(0.8).line(M, 42, W - M, 42);

  // ---- Cajas Cliente y Contacto
  const ancho = (W - 2 * M - 6) / 2;
  const cajaDatos = (x, titulo, filas) => {
    doc.setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(x, 47, ancho, 27, 2, 2, 'S');
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...color).text(titulo.toUpperCase(), x + 4, 52.5);
    filas.forEach(([k, v], i) => {
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(k, x + 4, 58.5 + i * 5.5);
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...TEXTO).text(doc.splitTextToSize(v || '—', ancho - 30)[0], x + 26, 58.5 + i * 5.5);
    });
  };
  cajaDatos(M, 'Cliente', [['Empresa', c.cliente_nombre], ['RUT', c.cliente_rut], ['Giro', c.cliente_giro]]);
  cajaDatos(M + ancho + 6, 'Contacto', [['Persona', c.cliente_contacto], ['Correo', c.cliente_correo], ['Teléfono', c.cliente_telefono]]);

  // ---- Tabla por grupo (como el OS, 2026-10-22): sin columna c/IVA por ítem (el IVA va solo en el total) y, si hay
  // descuentos por ítem, las columnas Neto · Desc. · Neto c/desc
  const conIva = c.con_iva;
  // Agrupar secciones (Diseño, como el OS): cada sección en una línea con su total; "Extras" y las líneas sin sección se
  // detallan. Con un cliente "siempre por cotizar" (GM en el OS) no se muestra el valor de cada línea, solo el total
  // de cada vehículo.
  const agrupar = !!cfg.agrupar_secciones;
  const porCotizar = agrupar && c.tercero_id
    ? !!(await ctx.api.from('terceros').select('por_cotizar').eq('id', c.tercero_id).maybeSingle()).data?.por_cotizar : false;
  const mostrar = c.mostrar_valores && !porCotizar;
  const conDesc = mostrar && !agrupar && c.cot_lineas.some((l) => l.tipo !== 'seccion' && Number(l.desc_pct) > 0);
  const bruto = (l) => Math.round(Number(l.cantidad || 0) * Number(l.precio || 0));
  const cols = conDesc ? 5 : 3;
  const esExtras = (s) => /^\s*extras?\s*$/i.test(s ?? '');
  const sangria = { cellPadding: { top: 1.8, bottom: 1.8, left: 6, right: 2 } };
  const body = [];
  c.cot_grupos.forEach((g, n) => {
    const ls = c.cot_lineas.filter((l) => l.grupo_id === g.id);
    if (!ls.length && !g.titulo) return;
    const cab = [`${n + 1}. ${g.titulo || 'Detalle'}`, verPatente(g.patente), g.anio, g.talla ? `Talla ${g.talla}` : null].filter(Boolean).join('  ·  ');
    body.push([{ content: cab, colSpan: cols, styles: { fillColor: claro, fontStyle: 'bold', textColor: TEXTO } }]);
    let seccion = null;   // sección agrupada en curso: { fila, total }
    for (const l of ls) {
      if (l.tipo === 'seccion') {
        seccion = null;
        if (agrupar && l.descripcion && !esExtras(l.descripcion)) {
          seccion = { total: 0, fila: [{ content: l.descripcion, styles: sangria }, '', ''] };
          body.push(seccion.fila);
          continue;
        }
        if (l.descripcion) body.push([{ content: l.descripcion.toUpperCase(), colSpan: cols, styles: { fontStyle: 'bold', fontSize: 8, textColor: color, cellPadding: { top: 2.2, bottom: 1.2, left: 6, right: 2 } } }]);
        continue;
      }
      const v = totalLinea(l);
      if (seccion) { seccion.total += v; seccion.fila[2] = mostrar ? pesos(seccion.total) : ''; continue; }
      const dp = Number(l.desc_pct) || 0;
      const fila = [{ content: l.descripcion, styles: sangria }, String(Number(l.cantidad))];
      if (conDesc) fila.push(pesos(bruto(l)), dp ? `${dp.toLocaleString('es-CL')} %` : '—', pesos(v));
      else fila.push(mostrar ? pesos(v) : '');
      body.push(fila);
    }
    const sg = t.porGrupo.get(g.id) ?? 0;
    // Con un cliente "siempre por cotizar" el total del vehículo se muestra siempre (es el único valor)
    const sub = [{ content: `${porCotizar ? 'Total' : 'Subtotal'} ${g.titulo || ''}`.trim(), colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', textColor: GRIS } }];
    if (conDesc) sub.push({ content: pesos(ls.reduce((s2, l) => s2 + (l.tipo === 'seccion' ? 0 : bruto(l)), 0)), styles: { fontStyle: 'bold' } }, '', { content: pesos(sg), styles: { fontStyle: 'bold' } });
    else sub.push({ content: mostrar || porCotizar ? pesos(sg) : '', styles: { fontStyle: 'bold' } });
    body.push(sub);
  });
  doc.autoTable({
    startY: 80,
    head: [['Descripción del servicio', 'Cant.', ...(conDesc ? ['Neto', 'Desc.', 'Neto c/desc'] : [conIva ? 'Valor neto' : 'Valor'])]],
    body,
    margin: { left: M, right: M, bottom: 24 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 1.8, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2 },
    headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
    columnStyles: conDesc ? { 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 30, halign: 'right' } }
      : { 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 34, halign: 'right' } },
  });
  let y = doc.lastAutoTable.finalY + 8;
  if (y > H - 85) { doc.addPage(); y = 20; }

  // ---- Información de pago y totales
  const pago = cfg.pago ?? [];
  if (pago.length) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...color).text('INFORMACIÓN DE PAGO', M, y + 4);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TEXTO);
    pago.forEach((p, i) => doc.text(p, M, y + 9.5 + i * 4.6));
  }
  // Totales (como el OS): Subtotal / Desc. adicional / IVA 19 % / Total c/IVA / − Abonos / Total a pagar
  const filas = [['Subtotal', pesos(t.sub)]];
  if (t.desc) filas.push([`Descuento adicional ${Number(c.desc_adic_pct)} %`, `- ${pesos(t.desc)}`]);
  if (conIva) filas.push(['IVA 19 %', pesos(t.iva)], ['Total c/IVA', pesos(t.total)]);
  const abonos = await abonosDe(ctx, c);
  if (abonos) filas.push(['− Abonos', `- ${pesos(abonos)}`]);
  const aPagar = Math.max(0, (conIva ? t.total : t.neto) - abonos);
  const xT = W - M - 75;
  doc.setFillColor(...SUAVE).setDrawColor(...LINEA).roundedRect(xT, y, 75, 8 + filas.length * 5.5 + 9, 2, 2, 'FD');
  filas.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXTO).text(k, xT + 4, y + 6.5 + i * 5.5);
    doc.text(v, xT + 71, y + 6.5 + i * 5.5, { align: 'right' });
  });
  const yTot = y + 8.5 + filas.length * 5.5;
  doc.setFillColor(...color).rect(xT, yTot - 4.6, 75, 7.6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(255, 255, 255).text('TOTAL A PAGAR', xT + 4, yTot + 0.5).text(pesos(aPagar), xT + 71, yTot + 0.5, { align: 'right' });
  y = Math.max(y + 10 + pago.length * 4.6, yTot + 10);

  // ---- Firma y nota
  doc.setDrawColor(...TEXTO).setLineWidth(0.3).line(W / 2 - 35, y + 16, W / 2 + 35, y + 16);
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...TEXTO).text(nombreEmpresa(e), W / 2, y + 20.5, { align: 'center' });
  const firma = cfg.firma || ctx.usuario?.nombre || '';
  if (firma) doc.setFont('helvetica', 'normal').setFontSize(8.5).text(firma, W / 2, y + 25, { align: 'center' });
  const nota = `Nota: la cotización es válida por ${c.validez_dias} ${c.validez_dias === 1 ? 'día' : 'días'}.${cfg.nota ? ` ${cfg.nota}` : ''}`;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS).text(doc.splitTextToSize(nota, W - 2 * M), M, y + 33);

  // ---- Pie: contactos en cada página
  const pie = (cfg.contactos ?? []).join('   ·   ');
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(...color).setLineWidth(0.5).line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
    if (pie) doc.text(pie, W / 2, H - 9.5, { align: 'center' });
    if (n > 1) doc.text(`Página ${p} de ${n}`, W - M, H - 9.5, { align: 'right' });
  }
  return sellar(doc, { autor: e.razon_social, titulo: `Cotización N° ${numeroTexto(c.numero)}` });
}
