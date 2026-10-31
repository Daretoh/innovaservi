// Liquidación de pago semanal en PDF de un trabajador (como en InnovaGestión): datos del trabajador, días trabajados
// (faena, horario, horas, vueltas y monto; con el motivo si el monto se ajustó), haberes, descuentos y total a pagar.
// Usa los mismos montos que la pantalla (contables si la empresa usa el ajuste contable). Documento informativo.
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=64a4e9f';
import { dinero, horas, nombreDia, fechaCorta, fechaLarga, numSemana, hhmm, hoyISO } from '../../core/ui/formato.js?v=64a4e9f';
import { nombreEmpresa } from '../../core/empresas.js?v=64a4e9f';

const X = 16;
const W = 178;
const GRIS = [110, 116, 128];
const TINTA = [28, 35, 48];

// f: fila de calcular() de la persona · lunes/domingo de la semana · contable: si se pagan los montos contables
export async function liquidacionPdf(ctx, { f, persona, cargo, lunes, domingo, contable }) {
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const nombre = [persona.nombres, persona.apellido_paterno, persona.apellido_materno].filter(Boolean).join(' ');
  const fijo = f.modo === 'fijo';
  let y = 16;

  // Encabezado: logo o nombre de la empresa | título y semana
  const logo = await cargarLogo(ctx.api, e.logo_url);
  if (logo) {
    const k = Math.min(58 / logo.ancho, 15 / logo.alto);
    doc.addImage(logo.dataUrl, logo.formato, X, y - 3, logo.ancho * k, logo.alto * k);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...color).text(nombreEmpresa(e), X, y + 3);
  }
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...color).text('LIQUIDACIÓN DE PAGO SEMANAL', X + W, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...GRIS);
  doc.text(`Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} al ${fechaCorta(domingo)}`, X + W, y + 8, { align: 'right' });
  doc.text(`Emitida el ${fechaLarga(hoyISO())}`, X + W, y + 13, { align: 'right' });
  y += 19;
  doc.setDrawColor(...color).setLineWidth(0.8).line(X, y, X + W, y).setLineWidth(0.2);

  // Datos del trabajador
  y += 7;
  doc.setFillColor(244, 245, 248).roundedRect(X, y - 4.5, W, 22, 2, 2, 'F');
  const dato = (etiqueta, valor, cx, cy) => {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(etiqueta.toUpperCase(), cx, cy);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TINTA).text(String(valor || '—'), cx, cy + 4.6);
  };
  dato('Trabajador', doc.splitTextToSize(nombre, 100)[0], X + 4, y);
  dato('RUT', persona.rut, X + 112, y);
  dato('Empleador', doc.splitTextToSize(nombreEmpresa(e), 30)[0], X + 148, y);
  dato('Cargo', doc.splitTextToSize(cargo ?? '', 70)[0], X + 4, y + 10);
  dato('Modalidad', fijo ? 'Contrato fijo' : 'Spot (por hora)', X + 80, y + 10);
  dato('Valor hora', f.vh ? dinero(f.vh) : '', X + 132, y + 10);
  y += 26;

  // Días trabajados
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...color).text('Detalle de días trabajados', X, y);
  const dias = f.detalle.filter((d) => d.min > 0 || d.vueltas);
  const monto = (d) => (contable ? d.contable : d.real);
  const filas = dias.map((d) => {
    const faenas = [...new Set(d.registros.map((r) => String(r.faena ?? '').trim()).filter(Boolean))];
    const ajuste = contable && d.contable !== d.real ? `\nAjustado (real ${dinero(d.real)})${d.ajuste?.obs ? `: ${d.ajuste.obs}` : ''}` : '';
    return [
      `${nombreDia(d.fecha)} ${fechaCorta(d.fecha)}`,
      (faenas.join(' / ') || (d.min ? 'Sin faena' : 'Vueltas')) + ajuste,
      d.registros.filter((r) => r.entrada && r.salida).map((r) => `${hhmm(r.entrada)}-${hhmm(r.salida)}`).join('\n') || '—',
      d.min ? horas(d.min) : '—',
      d.vueltas ? String(d.vueltas) : '—',
      dinero(monto(d)),
    ];
  });
  const totDias = dias.filter((d) => d.min > 0).length;
  const totMin = dias.reduce((s, d) => s + d.min, 0);
  const totMonto = dias.reduce((s, d) => s + monto(d), 0);
  doc.autoTable({
    startY: y + 3, margin: { left: X, right: X },
    head: [['Fecha', 'Faena', 'Horario', 'Horas', 'Vueltas', 'Monto']],
    body: filas.length ? filas : [[{ content: 'Sin días registrados esta semana.', colSpan: 6, styles: { fontStyle: 'italic', textColor: GRIS } }]],
    foot: [[`${totDias} día${totDias === 1 ? '' : 's'} con horas`, '', '', horas(totMin), String(f.vueltas || '—'), dinero(totMonto)]],
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 1.6, textColor: TINTA, valign: 'top' },
    headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [244, 245, 248], textColor: TINTA, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold' }, 2: { cellWidth: 26 }, 3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 16 }, 5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' } },
    didParseCell: (c) => { if (c.section !== 'body' && c.column.index >= 3) c.cell.styles.halign = 'right'; },
  });
  y = doc.lastAutoTable.finalY + 9;

  // Haberes y descuentos
  const salto = (h) => { if (y + h > 280) { doc.addPage(); y = 18; } };
  const seccion = (t) => {
    salto(14);
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...color).text(t, X, y);
    y += 1.8; doc.setDrawColor(...color).line(X, y, X + 40, y); y += 5;
  };
  const linea = (t, v, { tono = TINTA, negrita = false } = {}) => {
    salto(6);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(9).setTextColor(50, 54, 62);
    doc.text(doc.splitTextToSize(t, W - 40)[0], X + 4, y);
    doc.setTextColor(...tono).text(v, X + W - 2, y, { align: 'right' });
    y += 5.4;
  };
  const base = contable ? f.baseContable : f.base;
  const haberes = f.items.filter((it) => it.tipo !== 'descuento');
  const descuentos = f.items.filter((it) => it.tipo === 'descuento');
  seccion('Haberes');
  linea(`${fijo ? 'Horas fuera de jornada, fines de semana y feriados' : 'Horas trabajadas'} (${horas(f.pagoMin)}${f.vh ? ` × ${dinero(f.vh)}` : ''})`, dinero(base));
  if (f.montoVueltas) linea(`${f.vueltas} vuelta${f.vueltas > 1 ? 's' : ''} × ${dinero(f.vv)}`, dinero(f.montoVueltas));
  for (const it of haberes) linea(`Extra: ${it.concepto || '—'}`, dinero(it.monto), { tono: [15, 110, 86] });
  linea('Total haberes', dinero(base + f.montoVueltas + f.extra), { negrita: true });
  y += 2;
  seccion('Descuentos');
  if (descuentos.length) for (const it of descuentos) linea(`Descuento: ${it.concepto || '—'}`, `- ${dinero(it.monto)}`, { tono: [200, 40, 40] });
  else linea('Sin descuentos esta semana', dinero(0), { tono: GRIS });
  if (f.descuento) linea('Total descuentos', `- ${dinero(f.descuento)}`, { tono: [200, 40, 40], negrita: true });

  // Total a pagar
  y += 3; salto(16);
  doc.setFillColor(...color.map((c) => Math.round(c + (255 - c) * 0.85))).roundedRect(X, y - 5, W, 13, 2, 2, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...color).text('TOTAL A PAGAR', X + 5, y + 3);
  doc.setFontSize(15).text(dinero(contable ? f.total : f.real), X + W - 5, y + 3.4, { align: 'right' });
  y += 15;
  if (fijo) {
    salto(10);
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...GRIS)
      .text(doc.splitTextToSize('Trabajador con contrato fijo: el sueldo base mensual se liquida aparte. Esta liquidación incluye solo las horas fuera de su jornada, fines de semana, feriados y otros montos de la semana.', W), X, y);
  }

  // Pie: documento informativo y páginas (el sello de ISgestión va centrado)
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(140, 148, 160);
    doc.text(`Documento informativo · Semana ${numSemana(lunes)}`, X, 289);
    doc.text(`Página ${i} de ${n}`, X + W, 289, { align: 'right' });
  }
  sellar(doc, { autor: e.razon_social, titulo: `Liquidación semana ${numSemana(lunes)} · ${nombre}` });
  const archivo = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`liquidacion-sem${numSemana(lunes)}-${lunes.slice(0, 4)}-${archivo}.pdf`);
}
