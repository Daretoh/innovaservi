// PDF con el membrete de la empresa activa (03 Estándar de módulos §4).
// Uso:
//   const pdf = await nuevoPdf(ctx, { titulo: 'Nómina de personas' });
//   pdf.tabla({ columnas: ['RUT', 'Nombre'], filas: [['1-9', 'Ana']] });
//   pdf.guardar('nomina-personas');
// Librerías con versión fija desde CDN (08 Seguridad §5); se cargan solo al generar un PDF.
import { urlFirmada } from './adjuntos.js?v=af5b0f2';
import { nombreEmpresa } from './empresas.js?v=af5b0f2';

const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm';
const AUTOTABLE = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm';
const MARGEN = 15;
const GRIS = [91, 101, 118];

export const rgb = (hex) => [1, 3, 5].map((i) => parseInt((hex || '#1f4e8c').slice(i, i + 2), 16));

export async function cargarLogo(api, ruta) {
  if (!ruta) return null;
  try {
    const blob = await (await fetch(await urlFirmada(api, ruta, 60))).blob();
    const dataUrl = await new Promise((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = mal;
      r.readAsDataURL(blob);
    });
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = dataUrl;
    });
    return { dataUrl, formato: blob.type === 'image/png' ? 'PNG' : 'JPEG', ancho: img.width, alto: img.height };
  } catch {
    return null;   // sin logo el PDF sale igual
  }
}

// Datos de contacto de la empresa en una línea (dirección, teléfono, correo y web; Administración → Empresa)
export const contactoEmpresa = (e, { direccion = true } = {}) =>
  [direccion && e?.direccion, e?.telefono && `Tel. ${e.telefono}`, e?.email, e?.web].filter(Boolean).join(' · ');

// Sello discreto de ISgestión al pie de cada página: un pequeño isotipo "IS" y "Generado con ISgestión"
// con la fecha y hora. Va en todos los documentos de todas las empresas (07 Decisiones, 2026-10-18).
// claras: números de página con fondo de color (portadas), donde el sello va en blanco.
export function sellar(doc, { autor = '', titulo = '', claras = [] } = {}) {
  doc.setProperties({ title: titulo, author: autor, creator: 'ISgestión' });
  const d = new Date(); const dos = (n) => String(n).padStart(2, '0');
  const cuando = `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const texto = `Generado con ISgestión · ${cuando}`;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    const claro = claras.includes(p);
    doc.setFont('helvetica', 'normal').setFontSize(6.5);
    const ancho = doc.getTextWidth(texto) + 4.2;
    const x = (W - ancho) / 2;
    const y = H - 4.2;
    // Isotipo: cuadrado redondeado con "IS"
    doc.setFillColor(...(claro ? [255, 255, 255] : [96, 108, 128])).roundedRect(x, y - 2.6, 3.2, 3.2, 0.7, 0.7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(4.6).setTextColor(...(claro ? [60, 70, 90] : [255, 255, 255]));
    doc.text('IS', x + 1.6, y - 0.3, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...(claro ? [255, 255, 255] : [140, 148, 160]));
    doc.text(texto, x + 4.2, y);
  }
  return doc;
}

// jsPDF con autoTable listo, para documentos con diseño propio (por ejemplo el informe de trabajo)
export async function cargarJsPdf() {
  const [{ jsPDF }, { applyPlugin }] = await Promise.all([import(JSPDF), import(AUTOTABLE)]);
  applyPlugin(jsPDF);   // agrega doc.autoTable()
  return jsPDF;
}

export async function nuevoPdf(ctx, { titulo, subtitulo = '', horizontal = false }) {
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const doc = new jsPDF({ orientation: horizontal ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const fecha = new Date().toLocaleString('es-CL');

  // Membrete: logo a la izquierda, datos de la empresa a la derecha, línea con su color.
  const logo = await cargarLogo(ctx.api, e.logo_url);
  if (logo) {
    const escala = Math.min(40 / logo.ancho, 16 / logo.alto);
    doc.addImage(logo.dataUrl, logo.formato, MARGEN, 10, logo.ancho * escala, logo.alto * escala);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...color);
    doc.text(nombreEmpresa(e), MARGEN, 18);
  }
  const derecha = ancho - MARGEN;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(28, 35, 48);
  doc.text(e.razon_social, derecha, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS);
  const lineas = [[`RUT ${e.rut}`, e.giro].filter(Boolean).join(' · '), e.direccion, contactoEmpresa(e, { direccion: false })].filter(Boolean);
  lineas.forEach((t, i) => doc.text(String(t), derecha, 18 + i * 4, { align: 'right' }));
  doc.setDrawColor(...color).setLineWidth(0.8).line(MARGEN, 30, derecha, 30);

  // Título
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(28, 35, 48);
  doc.text(titulo, MARGEN, 40);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS);
  doc.text(subtitulo || `Emitido el ${fecha}`, MARGEN, 45.5);
  let y = 52;
  let cerrado = false;

  return {
    doc,
    get y() { return y; },
    tabla({ columnas, filas }) {
      doc.autoTable({
        startY: y,
        head: [columnas],
        body: filas.map((f) => f.map((c) => (c == null ? '' : String(c)))),
        margin: { left: MARGEN, right: MARGEN, bottom: 18 },
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [28, 35, 48], lineColor: [221, 225, 231], lineWidth: 0.1 },
        headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 248, 250] },
      });
      y = doc.lastAutoTable.finalY + 8;
    },
    // Avanza la posición (para dibujar algo propio con doc entre tablas)
    saltar(mm) { y += mm; },
    guardar(nombre) {
      cerrar();
      const dia = new Date().toISOString().slice(0, 10);
      doc.save(`${nombre}-${dia}.pdf`);
    },
    // El PDF terminado como Blob (para subirlo en vez de descargarlo)
    blob() { cerrar(); return doc.output('blob'); },
  };

  // Pie en todas las páginas y sello de ISgestión (una sola vez)
  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
      doc.text(`${nombreEmpresa(e)} · ${titulo}`, MARGEN, alto - 8);
      doc.text(`Página ${p} de ${paginas}`, ancho - MARGEN, alto - 8, { align: 'right' });
    }
    sellar(doc, { autor: e.razon_social, titulo });
  }
}
