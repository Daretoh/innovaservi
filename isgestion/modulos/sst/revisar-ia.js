// Revisión de documentos preventivos con IA (SST 004): leer el Word o PDF, pedir la revisión y la versión corregida a
// la Edge Function revisar-documento (Claude) y exportar el documento corregido a Word y PDF con el logo y el color de
// la empresa. Librerías con versión fija desde CDN (08 Seguridad §5), solo al usarlas.
import { textoDocx } from './texto-docx.js?v=574ba64';
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=574ba64';
import { nombreEmpresa } from '../../core/empresas.js?v=574ba64';

const DOCX_LIB = 'https://cdn.jsdelivr.net/npm/docx@9.0.2/+esm';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_PDF = 10 * 1024 * 1024;

let jszip = null;
async function cargarJsZip() {
  if (jszip || window.JSZip) return (jszip = jszip || window.JSZip);
  await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = JSZIP; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de Word.'));
    document.head.append(s);
  });
  return (jszip = window.JSZip);
}
const aBase64 = (blob) => new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] ?? ''); fr.onerror = mal; fr.readAsDataURL(blob); });
export const esDocx = (nombre = '', tipo = '') => tipo === MIME_DOCX || /\.docx$/i.test(nombre);
export const esPdf = (nombre = '', tipo = '') => tipo === 'application/pdf' || /\.pdf$/i.test(nombre);

// Archivo (File o Blob con nombre) → contenido para la Edge Function
export async function leerContenido(archivo, nombre = archivo.name || '') {
  if (esDocx(nombre, archivo.type)) {
    const Zip = await cargarJsZip();
    const texto = await textoDocx(await Zip.loadAsync(await archivo.arrayBuffer()));
    if (!texto.trim()) throw new Error('El Word no tiene texto que revisar.');
    return { tipo: 'texto', texto };
  }
  if (esPdf(nombre, archivo.type)) {
    if (archivo.size > MAX_PDF) throw new Error('El PDF pesa más de 10 MB. Súbelo en Word o divídelo.');
    return { tipo: 'pdf', data: await aBase64(archivo) };
  }
  throw new Error('Sube un Word (.docx) o un PDF. Los .doc antiguos se guardan primero como .docx.');
}

export async function pedirIA(api, cuerpo) {
  const { data, error } = await api.functions.invoke('revisar-documento', { body: cuerpo });
  if (error) {
    let j = null; try { j = await error.context?.json?.(); } catch { /* sin cuerpo */ }
    throw new Error(j?.error || (/Failed to send|fetch/i.test(error.message) ? 'No hubo respuesta de la IA a tiempo. Intenta de nuevo.' : error.message) || 'No se pudo revisar');
  }
  return data;
}

// ---------- Exportar ----------
const limpio = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .()-]+/g, '').trim().slice(0, 60) || 'documento';
export const nombreArchivo = (doc, ext) => `${limpio([/^[\w.-]{2,30}$/.test(doc.codigo || '') ? doc.codigo : null, doc.titulo].filter(Boolean).join(' '))}.${ext}`;

// Logo achicado (máx. 240 px) para que el PDF no pese 1 MB
async function logoChico(l) {
  if (!l || typeof document === 'undefined' || !document.createElement('canvas').getContext) return l;
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = l.dataUrl; });
    const k = Math.min(1, 240 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.9), formato: 'JPEG', ancho: c.width, alto: c.height };
  } catch { return l; }
}
const hoyTexto = () => new Date().toLocaleDateString('es-CL');
// Helvetica de jsPDF solo trae WinAnsi: lo demás se traduce o se descompone (si no, descuadra la línea entera)
const WINANSI = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const EQUIV = { '→': '->', '⇒': '=>', '←': '<-', '↔': '<->', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-', '✓': 'Sí', '✔': 'Sí', '✗': 'No', '✘': 'No', '▪': '•', '●': '•', '◦': '-', '·': '·' };
const pdfTexto = (t) => [...String(t ?? '').replace(/ /g, ' ')].map((c) => {
  const n = c.codePointAt(0);
  if ((n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || c === '\n' || WINANSI.has(c)) return c;
  if (EQUIV[c]) return EQUIV[c];
  if (n >= 0x2080 && n <= 0x2089) return String(n - 0x2080);
  if (n >= 0x2070 && n <= 0x2079) return String(n - 0x2070);
  const d = c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return [...d].every((x) => x.codePointAt(0) < 0x100) ? d : '';
}).join('');

// Ancho de cada columna (fracciones que suman 1) según cuánto texto lleva, con mínimo y máximo
export function anchosTabla(b) {
  const n = (b.columnas || []).length;
  const largo = Array.from({ length: n }, (_, i) => {
    const textos = [b.columnas[i], ...(b.filas || []).map((f) => f[i] ?? '')].map((t) => String(t).length);
    return Math.sqrt(Math.max(4, textos.reduce((s, x) => s + x, 0) / textos.length));
  });
  let w = largo.map((x) => x / largo.reduce((s, y) => s + y, 0));
  const min = Math.min(0.08, 1 / n), max = 0.5;
  for (let k = 0; k < 3; k++) {
    w = w.map((x) => Math.min(max, Math.max(min, x)));
    const s = w.reduce((a, x) => a + x, 0); w = w.map((x) => x / s);
  }
  return w;
}

async function logoBytes(ctx) {
  const l = await cargarLogo(ctx.api, ctx.empresa.logo_url);
  if (!l) return null;
  const bytes = new Uint8Array(await (await fetch(l.dataUrl)).arrayBuffer());
  return { ...l, bytes };
}

export async function exportarWord(ctx, doc) {
  const D = await import(DOCX_LIB);
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, Header, Footer, PageNumber, AlignmentType, ShadingType, BorderStyle, VerticalAlign, TableLayoutType } = D;
  const e = ctx.empresa;
  const COLOR = (e.color || '#1f4e8c').replace('#', '').toUpperCase();
  const OSC = '1F2937', GRIS = '6B7280', BORDE = 'D1D5DB', F = 'Calibri';
  const r = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: F, size: o.size ?? 19, bold: o.bold, color: o.color ?? OSC });
  const p = (text, o = {}) => new Paragraph({ children: [r(text, o)], spacing: { after: o.after ?? 80 }, alignment: o.align });
  const linea = { style: BorderStyle.SINGLE, size: 4, color: BORDE };
  const bordes = { top: linea, bottom: linea, left: linea, right: linea };
  const celda = (hijos, o = {}) => new TableCell({
    children: (Array.isArray(hijos) ? hijos : [hijos]).map((c) => (typeof c === 'string' ? p(c, { size: o.size ?? 17, bold: o.bold, color: o.color, after: 30 }) : c)),
    width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
    verticalAlign: o.va ?? VerticalAlign.TOP, borders: bordes, margins: { top: 50, bottom: 50, left: 80, right: 80 },
  });
  const tabla = (filas, n, w = Array(n).fill(1 / n)) => new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: w.map((x) => Math.round(x * 10000)) });

  const logo = await logoBytes(ctx);
  const escala = logo ? Math.min(52 / logo.ancho, 52 / logo.alto) : 1;
  const encabezado = new Header({ children: [
    tabla([new TableRow({ children: [
      celda(logo ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: logo.formato === 'PNG' ? 'png' : 'jpg', data: logo.bytes, transformation: { width: Math.round(logo.ancho * escala), height: Math.round(logo.alto * escala) } })] }) : p(nombreEmpresa(e), { bold: true, color: COLOR }), { w: 14, va: VerticalAlign.CENTER }),
      celda([p(doc.titulo || 'Documento', { bold: true, size: 22, color: COLOR, after: 20 }), doc.subtitulo ? p(doc.subtitulo, { bold: true, size: 18, after: 20 }) : null,
        p(`${e.razon_social}${e.rut ? ` · RUT ${e.rut}` : ''}`, { size: 16, color: GRIS, after: 0 })].filter(Boolean), { w: 58, va: VerticalAlign.CENTER }),
      celda([p(`Código: ${doc.codigo || '—'}`, { size: 16, bold: true, after: 10 }), p(`Versión: ${doc.version || '—'}`, { size: 16, after: 10 }), p(`Fecha: ${hoyTexto()}`, { size: 16, after: 10 }),
        new Paragraph({ children: [r('Página ', { size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: F, size: 16 }), r(' de ', { size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: F, size: 16 })] })], { w: 28, va: VerticalAlign.CENTER }),
    ] })], 3),
    new Paragraph({ children: [], spacing: { after: 60 } }),
  ] });
  const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [r(`${[doc.codigo, doc.version && `v${doc.version}`].filter(Boolean).join(' ')} · ${nombreEmpresa(e)} · Generado con ISgestión`, { size: 14, color: GRIS })] })] });

  const hijos = [];
  (doc.secciones || []).forEach((s) => {
    if (s.titulo) hijos.push(new Paragraph({ children: [r(s.titulo.toUpperCase(), { bold: true, color: 'FFFFFF', size: 20 })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR }, spacing: { before: 200, after: 100 }, keepNext: true, indent: { left: 60 } }));
    for (const b of s.bloques || []) {
      if (b.tipo === 'parrafo' && b.texto) b.texto.split(/\n+/).forEach((t) => hijos.push(p(t)));
      else if (b.tipo === 'lista') (b.items || []).forEach((t) => hijos.push(new Paragraph({ children: [r(t)], bullet: { level: 0 }, spacing: { after: 40 } })));
      else if (b.tipo === 'numerada') (b.items || []).forEach((t, i) => hijos.push(new Paragraph({ children: [r(`${i + 1}. `, { bold: true, color: COLOR }), r(t)], spacing: { after: 50 }, indent: { left: 280, hanging: 280 } })));
      else if (b.tipo === 'tabla' && (b.columnas || []).length) {
        const n = b.columnas.length;
        const w = anchosTabla(b);
        hijos.push(tabla([
          new TableRow({ tableHeader: true, cantSplit: true, children: b.columnas.map((c, i) => celda(c, { fondo: OSC, color: 'FFFFFF', bold: true, w: w[i] * 100 })) }),
          ...(b.filas || []).map((f) => new TableRow({ cantSplit: true, children: Array.from({ length: n }, (_, i) => celda(String(f[i] ?? ''), { w: w[i] * 100 })) })),
        ], n, w), new Paragraph({ children: [], spacing: { after: 80 } }));
      }
    }
  });
  const word = new Document({
    creator: e.razon_social, title: [doc.codigo, doc.titulo].filter(Boolean).join(' '),
    styles: { default: { document: { run: { font: F, size: 19 } } } },
    sections: [{ properties: { page: { margin: { top: 1900, bottom: 900, left: 900, right: 900, header: 400, footer: 400 } } }, headers: { default: encabezado }, footers: { default: pie }, children: hijos }],
  });
  return new Blob([await Packer.toBlob(word)], { type: MIME_DOCX });
}

export async function exportarPdf(ctx, doc) {
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const OSC = [31, 41, 55], GRIS = [107, 114, 128];
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = 15, ARRIBA = 38, ABAJO = H - 16, ancho = W - 2 * M;
  let y = ARRIBA;
  const espacio = (mm) => { if (y + mm > ABAJO) { pdf.addPage(); y = ARRIBA; } };
  const texto = (t, { tam = 9.5, negrita = false, sangria = 0, prefijo = '', col = OSC } = {}) => {
    pdf.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(tam).setTextColor(...col);
    const lineas = pdf.splitTextToSize(pdfTexto(t), ancho - sangria);
    const alto = tam * 0.42;
    lineas.forEach((l, i) => {
      espacio(alto);
      if (i === 0 && prefijo) { pdf.setFont('helvetica', 'bold').setTextColor(...color); pdf.text(prefijo, M + sangria - 5, y + alto * 0.75); pdf.setFont('helvetica', negrita ? 'bold' : 'normal').setTextColor(...col); }
      pdf.text(l, M + sangria, y + alto * 0.75); y += alto;
    });
    y += 1.4;
  };
  for (const s of doc.secciones || []) {
    if (s.titulo) {
      espacio(14);
      y += 2;
      pdf.setFillColor(...color).rect(M, y, ancho, 6.2, 'F');
      pdf.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(255, 255, 255).text(pdfTexto(s.titulo.toUpperCase()), M + 2, y + 4.3);
      y += 8.5;
    }
    for (const b of s.bloques || []) {
      if (b.tipo === 'parrafo' && b.texto) b.texto.split(/\n+/).forEach((t) => texto(t));
      else if (b.tipo === 'lista') (b.items || []).forEach((t) => texto(t, { sangria: 5, prefijo: '•' }));
      else if (b.tipo === 'numerada') (b.items || []).forEach((t, i) => texto(t, { sangria: 6, prefijo: `${i + 1}.` }));
      else if (b.tipo === 'tabla' && (b.columnas || []).length) {
        const n = b.columnas.length;
        pdf.autoTable({
          startY: y, head: [b.columnas.map(pdfTexto)], body: (b.filas || []).map((f) => Array.from({ length: n }, (_, i) => pdfTexto(f[i] ?? ''))),
          margin: { left: M, right: M, top: ARRIBA, bottom: H - ABAJO }, rowPageBreak: 'avoid',
          columnStyles: Object.fromEntries(anchosTabla(b).map((x, i) => [i, { cellWidth: x * ancho }])),
          styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: OSC, lineColor: [209, 213, 219], lineWidth: 0.1, valign: 'top' },
          headStyles: { fillColor: OSC, textColor: 255, fontStyle: 'bold' },
        });
        y = pdf.lastAutoTable.finalY + 4;
      }
    }
  }
  // Encabezado y pie en cada página
  const logo = await logoChico(await cargarLogo(ctx.api, e.logo_url));
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(209, 213, 219).setLineWidth(0.2).rect(M, 8, ancho, 22);
    pdf.line(M + 26, 8, M + 26, 30); pdf.line(W - M - 46, 8, W - M - 46, 30);
    if (logo) { const k = Math.min(20 / logo.ancho, 18 / logo.alto); pdf.addImage(logo.dataUrl, logo.formato, M + 13 - (logo.ancho * k) / 2, 19 - (logo.alto * k) / 2, logo.ancho * k, logo.alto * k, 'logo-empresa', 'FAST'); }
    else pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...color).text(pdfTexto(nombreEmpresa(e)), M + 2, 20, { maxWidth: 22 });
    pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...color);
    const tit = pdf.splitTextToSize(pdfTexto(doc.titulo || 'Documento'), ancho - 76).slice(0, 2);
    pdf.text(tit, M + 29, 14);
    let yt = 14 + tit.length * 4.6;
    if (doc.subtitulo) { pdf.setFontSize(8.5).setTextColor(...OSC); const st = pdf.splitTextToSize(pdfTexto(doc.subtitulo), ancho - 76).slice(0, 1); pdf.text(st, M + 29, yt); yt += 4; }
    pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS).text(pdfTexto(`${e.razon_social}${e.rut ? ` · RUT ${e.rut}` : ''}`), M + 29, Math.min(yt, 28));
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...OSC);
    const cod = pdf.splitTextToSize(pdfTexto(`Código: ${doc.codigo || '-'}`), 43).slice(0, 2);
    pdf.text(cod, W - M - 44, 12.5, { lineHeightFactor: 1.3 });
    pdf.setFont('helvetica', 'normal').text([pdfTexto(`Versión: ${String(doc.version || '-').slice(0, 20)}`), `Fecha: ${hoyTexto()}`, `Página ${i} de ${n}`], W - M - 44, 13 + cod.length * 3.6, { lineHeightFactor: 1.4 });
  }
  sellar(pdf, { autor: e.razon_social, titulo: [doc.codigo, doc.titulo].filter(Boolean).join(' ') });
  return pdf.output('blob');
}

export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
