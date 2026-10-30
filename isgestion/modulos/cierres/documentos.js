// PDFs de Cierres y cuentas, con el diseño de la cotización (encabezado con N°, caja del cliente, tabla,
// información de pago, totales, firma, contactos y sello de ISgestión):
// - Resumen del período (cierre mensual)
// - Estado de cuenta (cuenta corriente)
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=25e9201';
import { nombreEmpresa } from '../../core/empresas.js?v=25e9201';
import { cargarConfig } from '../cotizaciones/datos.js?v=25e9201';
import { numeroTexto, verPatente, nombreMesLargo, nombreMedio, totalCotizacion, totalesCierre } from './datos.js?v=25e9201';

const M = 15;
const TEXTO = [28, 35, 48];
const GRIS = [91, 101, 118];
const LINEA = [221, 225, 231];
const SUAVE = [247, 248, 250];
const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const fecha = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Encabezado, caja del cliente y pie comunes
async function base(ctx, { etiqueta, numero, lineas, cliente, filasCaja }) {
  const [jsPDF, cfg] = await Promise.all([cargarJsPdf(), cargarConfig(ctx)]);
  const e = ctx.empresa;
  const color = rgb(e.color);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await cargarLogo(ctx.api, e.logo_url);
  if (logo) {
    const k = Math.min(55 / logo.ancho, 22 / logo.alto);
    doc.addImage(logo.dataUrl, logo.formato, M, 12, logo.ancho * k, logo.alto * k);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...color).text(nombreEmpresa(e), M, 24);
  }
  doc.setFillColor(...SUAVE).setDrawColor(...LINEA).roundedRect(W - M - 62, 10, 62, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS).text(etiqueta, W - M - 31, 16, { align: 'center' });
  doc.setFont('helvetica', 'bold').setFontSize(numero.length > 8 ? 12 : 17).setTextColor(...color).text(numero, W - M - 31, 24, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TEXTO);
  lineas.forEach((t, i) => doc.text(t, W - M - 31, 30 + i * 5, { align: 'center' }));
  doc.setDrawColor(...color).setLineWidth(0.8).line(M, 42, W - M, 42);
  // Caja del cliente
  const alto = 10 + Math.ceil(filasCaja.length / 2) * 5.5;
  doc.setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(M, 47, W - 2 * M, alto, 2, 2, 'S');
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...color).text('CLIENTE', M + 4, 52.5);
  filasCaja.forEach(([k, v], i) => {
    const x = M + 4 + (i % 2) * ((W - 2 * M) / 2), y = 58.5 + Math.floor(i / 2) * 5.5;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(k, x, y);
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...TEXTO).text(doc.splitTextToSize(String(v || '—'), (W - 2 * M) / 2 - 32)[0], x + 26, y);
  });
  return { doc, cfg, color, W, H: doc.internal.pageSize.getHeight(), y: 47 + alto + 6, e, cliente };
}

// Información de pago, totales, firma, nota y pie
function cierrePdf(p, filasTotales, totalTexto, nota) {
  const { doc, cfg, color, W, H, e } = p;
  let y = doc.lastAutoTable.finalY + 8;
  if (y > H - 85) { doc.addPage(); y = 20; }
  const pago = cfg.pago ?? [];
  if (pago.length) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...color).text('INFORMACIÓN DE PAGO', M, y + 4);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TEXTO);
    pago.forEach((x, i) => doc.text(x, M, y + 9.5 + i * 4.6));
  }
  const xT = W - M - 75;
  doc.setFillColor(...SUAVE).setDrawColor(...LINEA).roundedRect(xT, y, 75, 8 + filasTotales.length * 5.5 + 9, 2, 2, 'FD');
  filasTotales.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXTO).text(k, xT + 4, y + 6.5 + i * 5.5);
    doc.text(v, xT + 71, y + 6.5 + i * 5.5, { align: 'right' });
  });
  const yTot = y + 8.5 + filasTotales.length * 5.5;
  doc.setFillColor(...color).rect(xT, yTot - 4.6, 75, 7.6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(255, 255, 255).text(totalTexto[0], xT + 4, yTot + 0.5).text(totalTexto[1], xT + 71, yTot + 0.5, { align: 'right' });
  y = Math.max(y + 10 + pago.length * 4.6, yTot + 10);
  doc.setDrawColor(...TEXTO).setLineWidth(0.3).line(W / 2 - 35, y + 16, W / 2 + 35, y + 16);
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...TEXTO).text(nombreEmpresa(e), W / 2, y + 20.5, { align: 'center' });
  if (cfg.firma) doc.setFont('helvetica', 'normal').setFontSize(8.5).text(cfg.firma, W / 2, y + 25, { align: 'center' });
  if (nota) doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS).text(doc.splitTextToSize(nota, W - 2 * M), M, y + 33);
  const pie = (cfg.contactos ?? []).join('   ·   ');
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...color).setLineWidth(0.5).line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
    if (pie) doc.text(pie, W / 2, H - 9.5, { align: 'center' });
    if (n > 1) doc.text(`Página ${i} de ${n}`, W - M, H - 9.5, { align: 'right' });
  }
}

const estilosTabla = (color) => ({
  margin: { left: M, right: M, bottom: 24 }, theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.8, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2 },
  headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
});

// ---- Resumen del período (cierre mensual)
export async function pdfCierre(ctx, c, lineas, cliente, nota) {
  const vivas = lineas.filter((l) => !l.excluida).sort((a, b) => a.orden - b.orden);
  const t = totalesCierre(c, lineas);
  const p = await base(ctx, {
    etiqueta: c.numero ? 'N° CIERRE' : 'BORRADOR', numero: c.numero ? numeroTexto(c.numero) : 'SIN EMITIR',
    lineas: [`Período: ${nombreMesLargo(c.mes)}`, `Fecha: ${fecha(c.emitido_at ? c.emitido_at.slice(0, 10) : hoy())}`],
    cliente,
    filasCaja: [['Empresa', cliente?.razon_social], ['RUT', cliente?.rut], ['Período', nombreMesLargo(c.mes)], ['Líneas', String(vivas.length)],
      ...(c.oc_numero ? [['Orden de compra', c.oc_numero]] : []), ...(c.factura_numero ? [['Factura', c.factura_numero]] : [])],
  });
  p.doc.autoTable({
    startY: p.y,
    head: [['#', 'Vehículo o servicio', 'Patente', 'Detalle', 'Valor neto']],
    body: vivas.map((l, i) => [String(i + 1), l.descripcion || '—', verPatente(l.patente) || '—', [l.detalle, l.notas].filter(Boolean).join(' · '), pesos(l.monto)]),
    ...estilosTabla(p.color),
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 42 }, 2: { cellWidth: 22 }, 4: { cellWidth: 28, halign: 'right' } },
  });
  const filas = c.afecto_iva ? [['Neto', pesos(t.neto)], ['IVA 19 %', pesos(t.iva)]] : [['Neto', pesos(t.neto)]];
  cierrePdf(p, filas, ['TOTAL A PAGAR', pesos(t.total)], nota || 'Cierre mensual de servicios. Los valores corresponden a los servicios realizados en el período indicado.');
  return sellar(p.doc, { autor: p.e.razon_social, titulo: `Cierre ${nombreMesLargo(c.mes)}${c.numero ? ` N° ${numeroTexto(c.numero)}` : ''}` });
}

// ---- Estado de cuenta (cuenta corriente)
export async function pdfCuenta(ctx, k, items, abonos, t, cliente) {
  const p = await base(ctx, {
    etiqueta: 'ESTADO DE CUENTA', numero: fecha(hoy()), lineas: [k.nombre.slice(0, 34)], cliente,
    filasCaja: [['Empresa', cliente?.razon_social], ['RUT', cliente?.rut], ['Cuenta', k.nombre], ['Cotizaciones', String(items.length)],
      ...(k.oc_numero ? [['Orden de compra', k.oc_numero]] : []), ...(k.factura_numero ? [['Factura', k.factura_numero]] : [])],
  });
  p.doc.autoTable({
    startY: p.y,
    head: [['Cotización', 'Fecha', 'Vehículos o trabajo', 'Total', 'Abonado', 'Saldo']],
    body: items.map((i) => {
      const c = i.cot_cotizaciones, x = t.porCot.get(i.cotizacion_id);
      const det = (c.cot_grupos ?? []).map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' ')).join(', ');
      return [`N° ${numeroTexto(c.numero)}`, fecha(c.fecha), det || '—', pesos(x.total), pesos(x.abonado), pesos(x.saldo)];
    }),
    ...estilosTabla(p.color),
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 20 }, 3: { cellWidth: 25, halign: 'right' }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 25, halign: 'right' } },
  });
  const vivos = abonos.filter((a) => !a.deleted_at).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let corre = t.total;
  p.doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...p.color).text('ABONOS', M, p.doc.lastAutoTable.finalY + 8);
  p.doc.autoTable({
    startY: p.doc.lastAutoTable.finalY + 10,
    head: [['Fecha', 'Monto', 'Asignado a', 'Medio', 'Referencia', 'Saldo']],
    body: vivos.length ? vivos.map((a) => {
      corre -= a.monto;
      const c = items.find((i) => i.cotizacion_id === a.cotizacion_id)?.cot_cotizaciones;
      return [fecha(a.fecha), pesos(a.monto), c ? `N° ${numeroTexto(c.numero)}` : 'General', nombreMedio[a.medio] ?? a.medio, a.referencia || '', pesos(corre)];
    }) : [[{ content: 'Sin abonos registrados.', colSpan: 6 }]],
    ...estilosTabla(p.color),
    columnStyles: { 1: { halign: 'right' }, 5: { halign: 'right' } },
  });
  cierrePdf(p, [['Total aprobado', pesos(t.total)], ['− Abonos', `- ${pesos(t.abonado)}`]], t.saldo < 0 ? ['SALDO A FAVOR', pesos(-t.saldo)] : ['TOTAL A PAGAR', pesos(t.saldo)],
    'Estado de cuenta de los trabajos aprobados. Los montos incluyen IVA cuando la cotización lo indica.');
  return sellar(p.doc, { autor: p.e.razon_social, titulo: `Estado de cuenta ${k.nombre}` });
}

// Cotización: total para mostrar
export { totalCotizacion };
