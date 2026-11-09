// PDF del catálogo (horizontal, como el catálogo de Canva): banda con el logo y los contactos de la empresa,
// una o más páginas por categoría con sus secciones y tarjetas (foto, nombre, descripción, material, procedencia,
// marca y precio si corresponde), página de marcas y página de cierre. Color de la empresa en los acentos.
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=163dc56rfht';
import { nombreEmpresa } from '../../core/empresas.js?v=163dc56rfht';
import { dinero } from '../../core/ui/formato.js?v=163dc56rfht';
import { urlsFotos, agrupar } from './datos.js?v=163dc56rfht';

const M = 12;                 // margen
const OSCURO = [24, 26, 31];
const TEXTO = [28, 35, 48];
const GRIS = [100, 108, 122];
const COLS = 6;
const GAP = 4;
const ALTO_TARJETA = 60;
const ALTO_TITULO = 11;

// Foto a JPEG (o PNG si tiene transparencia) achicada para el PDF: { dataUrl, formato, ancho, alto }
async function imagen(url, lado = 520, png = false) {
  if (!url) return null;
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d');
    if (!png) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85), formato: png ? 'PNG' : 'JPEG', ancho: c.width, alto: c.height };
  } catch { return null; }
}

// Dibuja una imagen centrada dentro de una caja, sin deformarla
function encajar(doc, img, x, y, w, h) {
  const k = Math.min(w / img.ancho, h / img.alto);
  doc.addImage(img.dataUrl, img.formato, x + (w - img.ancho * k) / 2, y + (h - img.alto * k) / 2, img.ancho * k, img.alto * k);
}

export async function pdfCatalogo(ctx, datos, { categorias, precios = false, marcas = true }) {
  const jsPDF = await cargarJsPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const cfg = ctx.config ?? {};

  const productos = datos.productos.filter((p) => p.activo && categorias.includes(p.categoria_id));
  if (!productos.length) throw new Error('No hay productos activos en esas categorías.');
  const grupos = agrupar(datos, productos);
  const usadas = datos.marcas.filter((m) => productos.some((p) => p.marca_id === m.id));

  // Fotos y logos (en paralelo)
  const urls = await urlsFotos(ctx, [...productos.map((p) => p.foto_ruta), ...usadas.map((m) => m.logo_ruta)]);
  const fotos = new Map(await Promise.all(productos.map(async (p) => [p.id, await imagen(urls.get(p.foto_ruta))])));
  const logos = new Map(await Promise.all(usadas.map(async (m) => [m.id, await imagen(urls.get(m.logo_ruta), 360, true)])));
  const logoEmpresa = await cargarLogo(ctx.api, e.logo_url);

  const whatsapp = cfg.whatsapp || e.telefono;
  const contactos = [whatsapp && `WhatsApp ${whatsapp}`, cfg.instagram && (cfg.instagram.startsWith('@') ? cfg.instagram : `@${cfg.instagram}`), e.email, e.web].filter(Boolean);
  let pagina = 0;

  // ---- Banda superior de cada página
  function cabecera(subtitulo) {
    if (pagina++) doc.addPage();
    doc.setFillColor(...OSCURO).rect(0, 0, W, 26, 'F');
    doc.setFillColor(...color).rect(0, 26, W, 1.2, 'F');
    if (logoEmpresa) {
      const k = Math.min(42 / logoEmpresa.ancho, 18 / logoEmpresa.alto);
      doc.addImage(logoEmpresa.dataUrl, logoEmpresa.formato, M, 13 - (logoEmpresa.alto * k) / 2, logoEmpresa.ancho * k, logoEmpresa.alto * k);
    } else {
      doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(255, 255, 255).text(nombreEmpresa(e), M, 15);
    }
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(225, 228, 233);
    contactos.slice(0, 3).forEach((t, i) => doc.text(t, 64, 9 + i * 5));
    doc.setFont('helvetica', 'bolditalic').setFontSize(20).setTextColor(255, 255, 255).text('Catálogo de productos', W - M, 12, { align: 'right' });
    if (subtitulo) doc.setFont('helvetica', 'bolditalic').setFontSize(13).setTextColor(...color).text(subtitulo, W - M, 20.5, { align: 'right' });
    let y = 34;
    if (cfg.frase) {
      doc.setFont('helvetica', 'italic').setFontSize(11).setTextColor(...color).text(cfg.frase.toUpperCase(), W / 2, y, { align: 'center' });
      y += 6;
    }
    return y;
  }
  // Aviso al pie (sobre el sello de ISgestión)
  function pie() {
    if (!cfg.aviso) return;
    doc.setDrawColor(...color).setLineWidth(0.6).line(M, H - 15, W - M, H - 15);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...color).text(cfg.aviso.toUpperCase(), W / 2, H - 10.5, { align: 'center' });
  }
  const limite = H - (cfg.aviso ? 18 : 12);

  // Título de una sección sobre sus tarjetas (la letra se achica si la sección es angosta)
  function tituloSeccion(texto, x, y, ancho) {
    const t = texto.toUpperCase();
    let tam = 15;
    doc.setFont('helvetica', 'bolditalic');
    while (tam > 8 && doc.setFontSize(tam).getTextWidth(t) > ancho) tam -= 0.5;
    doc.setTextColor(...TEXTO).text(t, x, y + 5.5);
    doc.setFillColor(...color).rect(x, y + 7.6, Math.min(doc.getTextWidth(t) + 14, ancho), 1.2, 'F');
  }

  function tarjeta(p, x, y, w) {
    doc.setDrawColor(40, 44, 52).setLineWidth(0.5).setFillColor(255, 255, 255).roundedRect(x, y, w, ALTO_TARJETA, 3, 3, 'FD');
    doc.setFillColor(...color).rect(x + 4, y + ALTO_TARJETA - 0.4, w - 8, 0.8, 'F');
    const foto = fotos.get(p.id);
    if (foto) encajar(doc, foto, x + 2, y + 2, w - 4, 25);
    let ty = y + 31;
    const centro = x + w / 2;
    doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(...TEXTO);
    for (const l of doc.splitTextToSize(p.nombre.toUpperCase(), w - 3).slice(0, 2)) { doc.text(l, centro, ty, { align: 'center' }); ty += 3.4; }
    if (p.descripcion) {
      doc.setFont('helvetica', 'italic').setFontSize(6.6).setTextColor(...GRIS);
      for (const l of doc.splitTextToSize(p.descripcion, w - 4).slice(0, 2)) { doc.text(l, centro, ty, { align: 'center' }); ty += 2.9; }
    }
    ty += 0.6;
    doc.setFontSize(5.9).setTextColor(...TEXTO);
    for (const [k, v] of [['Material', p.material], ['Procedencia', p.procedencia]]) {
      if (!v) continue;
      doc.setFont('helvetica', 'bold');
      const t = doc.splitTextToSize(`${k}: ${v}`, w - 4)[0];
      doc.text(t, centro, ty, { align: 'center' }); ty += 2.6;
    }
    // Marca (logo o nombre) y precio al pie de la tarjeta
    const base = y + ALTO_TARJETA - 2.2;
    const m = datos.marcaDe.get(p.marca_id);
    const conPrecio = precios && p.precio_en_pdf && p.precio != null;
    if (conPrecio) {
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...color).text(`${dinero(p.precio)} + IVA`, centro, base - (m ? 7 : 0.5), { align: 'center' });
    }
    if (m) {
      const logo = logos.get(m.id);
      if (logo) encajar(doc, logo, x + w / 2 - 13, base - 5.6, 26, 5.4);
      else doc.setFont('helvetica', 'bolditalic').setFontSize(7.5).setTextColor(...GRIS).text(m.nombre, centro, base - 1.5, { align: 'center' });
    }
  }

  // ---- Páginas por categoría
  const w = (W - 2 * M - (COLS - 1) * GAP) / COLS;
  for (const g of grupos) {
    let y = cabecera(g.categoria.nombre);
    if (g.categoria.descripcion) {
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRIS).text(doc.splitTextToSize(g.categoria.descripcion, W - 2 * M), M, y);
      y += 6;
    }
    // Filas de tarjetas: secciones cortas lado a lado (como el catálogo de Canva); las largas ocupan varias filas
    const filas = [];
    let actual = null;
    for (const s of g.secciones) {
      for (let i = 0; i < s.productos.length; i += COLS) {
        const bloque = { titulo: i === 0 ? (s.nombre || g.categoria.nombre) : null, productos: s.productos.slice(i, i + COLS) };
        if (!actual || actual.usadas + bloque.productos.length > COLS) filas.push((actual = { bloques: [], usadas: 0 }));
        bloque.col = actual.usadas; actual.usadas += bloque.productos.length;
        actual.bloques.push(bloque);
      }
    }
    for (const f of filas) {
      if (y + ALTO_TITULO + ALTO_TARJETA > limite) { pie(); y = cabecera(g.categoria.nombre); }
      for (const b of f.bloques) {
        const x = M + b.col * (w + GAP);
        if (b.titulo) tituloSeccion(b.titulo, x, y, b.productos.length * (w + GAP) - GAP);
        b.productos.forEach((p, i) => tarjeta(p, x + i * (w + GAP), y + ALTO_TITULO, w));
      }
      y += ALTO_TITULO + ALTO_TARJETA + 5;
    }
    pie();
  }

  // ---- Marcas con su presentación
  const conTexto = usadas.filter((m) => m.descripcion);
  if (marcas && conTexto.length) {
    let y = cabecera('Nuestras marcas') + 2;
    for (const m of conTexto) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5);
      const lineas = doc.splitTextToSize(m.descripcion, W - 2 * M - 70);
      const alto = Math.max(22, lineas.length * 4.6 + 6);
      if (y + alto > limite) { pie(); y = cabecera('Nuestras marcas') + 2; }
      const logo = logos.get(m.id);
      if (logo) encajar(doc, logo, M, y, 58, alto - 6);
      else doc.setFont('helvetica', 'bolditalic').setFontSize(18).setTextColor(...TEXTO).text(m.nombre, M, y + 10);
      doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...TEXTO).text(m.nombre, M + 70, y + 3);
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...TEXTO).text(lineas, M + 70, y + 8.5);
      doc.setDrawColor(225, 228, 233).setLineWidth(0.3).line(M, y + alto - 2, W - M, y + alto - 2);
      y += alto + 3;
    }
    pie();
  }

  // ---- Cierre
  cabecera('');
  doc.setFont('helvetica', 'bolditalic').setFontSize(30).setTextColor(...TEXTO);
  doc.text(doc.splitTextToSize((cfg.cierre || 'Gracias por su preferencia.').toUpperCase(), W - 60), W / 2, 85, { align: 'center' });
  doc.setFillColor(...color).rect(W / 2 - 60, 120, 120, 1.4, 'F');
  doc.setFont('helvetica', 'normal').setFontSize(12).setTextColor(...GRIS);
  [e.direccion, ...contactos].filter(Boolean).forEach((t, i) => doc.text(t, W / 2, 132 + i * 7, { align: 'center' }));

  sellar(doc, { autor: e.razon_social, titulo: 'Catálogo de productos' });
  doc.save(`catalogo-${new Date().toISOString().slice(0, 10)}.pdf`);
}
