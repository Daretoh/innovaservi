// Informe de trabajo en PDF (diseño heredado de InnovaGestión): portada, datos del servicio,
// trabajo realizado, observaciones, fotos por etapa (12 por página) y contraportada.
// Las fotos "sin ordenar" y los videos no van al informe.
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js';
import { nombreEmpresa } from '../../core/empresas.js';
import { fechaLarga } from '../../core/ui/formato.js';
import { nombreEtapa, nombreTercero, urlsFirmadas, faenasDistintas } from './datos.js';

const M = 15;                 // margen
const TEXTO = [28, 35, 48];
const GRIS = [91, 101, 118];
const LINEA = [221, 225, 231];
const ORDEN_ETAPAS = ['antes', 'proceso', 'despues', 'doc'];
const COLS = 3; const FILAS = 4;

// Foto a JPEG en data URL con sus medidas (corrige formatos que jsPDF no lee)
async function cargarFoto(url) {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), ancho: bmp.width, alto: bmp.height };
  } catch {
    return null;
  }
}

const unicos = (lista) => {
  const vistos = new Set();
  return lista.map((t) => t.trim()).filter((t) => t && !vistos.has(t.toLowerCase()) && vistos.add(t.toLowerCase()));
};

export async function generarInforme(ctx, { parte, faenas, media, config }) {
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await cargarLogo(ctx.api, e.logo_url);
  const cliente = parte.terceros?.razon_social || nombreTercero(parte.terceros);
  const lugar = parte.lugar || parte.ope_sitios?.nombre || '';
  const fechas = [...new Set(faenas.map((f) => f.fecha))].sort();
  const textoFechas = (fechas.length ? fechas : [parte.fecha]).map(fechaLarga).join(', ');

  const ponerLogo = (x, y, maxAncho, maxAlto, centrado = false) => {
    if (!logo) return false;
    const k = Math.min(maxAncho / logo.ancho, maxAlto / logo.alto);
    const w = logo.ancho * k; const h = logo.alto * k;
    doc.addImage(logo.dataUrl, logo.formato, centrado ? x - w / 2 : x, y, w, h);
    return true;
  };

  // ---------- Portada
  doc.setFillColor(...color).rect(0, 0, W, 150, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255).roundedRect(W / 2 - 40, 30, 80, 44, 3, 3, 'F');
    ponerLogo(W / 2, 34, 72, 36, true);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(255, 255, 255);
    doc.text(nombreEmpresa(e), W / 2, 58, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(255, 255, 255);
  doc.text('INFORME DE TRABAJO', W / 2, 108, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(13);
  doc.text(doc.splitTextToSize([cliente, lugar].filter(Boolean).join(' · '), W - 2 * M), W / 2, 120, { align: 'center' });
  doc.setFontSize(11).setTextColor(...TEXTO);
  doc.text(doc.splitTextToSize(textoFechas, W - 2 * M), W / 2, 172, { align: 'center' });
  if (config.lema) {
    doc.setFont('helvetica', 'italic').setFontSize(11).setTextColor(...GRIS);
    doc.text(doc.splitTextToSize(config.lema, W - 2 * M), W / 2, H - 40, { align: 'center' });
  }
  if (config.web) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...color);
    doc.text(config.web, W / 2, H - 28, { align: 'center' });
  }
  doc.setFillColor(...color).rect(0, H - 12, W, 12, 'F');

  // ---------- Páginas interiores
  const interiores = [];
  const nuevaPagina = () => {
    doc.addPage();
    interiores.push(doc.getNumberOfPages());
    if (!ponerLogo(M, 8, 34, 11)) {
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...color);
      doc.text(nombreEmpresa(e), M, 15);
    }
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GRIS);
    doc.text(`${nombreEmpresa(e)} — Informe de trabajo`, W - M, 12, { align: 'right' });
    doc.text(cliente, W - M, 16.5, { align: 'right' });
    doc.setDrawColor(...color).setLineWidth(0.7).line(M, 22, W - M, 22);
    return 30;
  };
  const tituloSeccion = (texto, y) => {
    doc.setFillColor(...color).rect(M, y - 4.5, 2, 6, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...TEXTO);
    doc.text(texto, M + 5, y);
    return y + 7;
  };

  let y = nuevaPagina();
  y = tituloSeccion('Datos del servicio', y);

  // Dos cajas: contratista y mandante
  const anchoCaja = (W - 2 * M - 6) / 2;
  const caja = (x, titulo, filas) => {
    const lineas = filas.filter(([, v]) => v).flatMap(([k, v]) => doc.splitTextToSize(k ? `${k}: ${v}` : String(v), anchoCaja - 8));
    return { x, titulo, lineas, alto: 14 + lineas.length * 4.6 };
  };
  const cajas = [
    caja(M, 'CONTRATISTA', [['', e.razon_social], ['RUT', e.rut], ['Teléfono', e.telefono], ['Correo', e.email], ['Responsable', parte.responsable], ...(config.lineas ?? []).map((l) => ['', l])]),
    caja(M + anchoCaja + 6, 'MANDANTE', [['', parte.terceros?.razon_social ?? 'Interno'], ['RUT', parte.terceros?.rut], ['Dirección', parte.ope_sitios?.direccion || parte.terceros?.direccion]]),
  ];
  const altoCajas = Math.max(...cajas.map((c) => c.alto));
  for (const c of cajas) {
    doc.setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(c.x, y, anchoCaja, altoCajas, 2, 2, 'S');
    doc.setFillColor(...color).roundedRect(c.x, y, anchoCaja, 8, 2, 2, 'F').rect(c.x, y + 4, anchoCaja, 4, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 255, 255);
    doc.text(c.titulo, c.x + 4, y + 5.5);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXTO);
    c.lineas.forEach((l, i) => doc.text(l, c.x + 4, y + 13.5 + i * 4.6));
  }
  y += altoCajas + 8;

  y = tituloSeccion('Detalle', y);
  doc.autoTable({
    startY: y,
    body: [['Solicitado por', parte.solicitado_por || '—'], ['Fecha', textoFechas], ['Lugar', lugar || '—']],
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold', fillColor: [247, 248, 250] } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Bloque de texto que salta de página si no cabe
  const parrafos = (lineas, conViñeta) => {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...TEXTO);
    for (const t of lineas) {
      const partes = doc.splitTextToSize(t, W - 2 * M - (conViñeta ? 6 : 0));
      if (y + partes.length * 5 > H - 20) y = nuevaPagina();
      if (conViñeta) { doc.setFillColor(...color).circle(M + 1.5, y - 1.3, 0.9, 'F'); }
      doc.text(partes, M + (conViñeta ? 6 : 0), y);
      y += partes.length * 5 + 1.5;
    }
  };

  const trabajos = unicos([...faenas.map((f) => f.ope_faenas?.titulo ?? ''), ...(parte.trabajo ?? '').split('\n')]);
  if (y > H - 50) y = nuevaPagina();
  y = tituloSeccion('Trabajo realizado', y);
  parrafos(trabajos.length ? trabajos : ['—'], true);
  y += 5;
  if (parte.observaciones) {
    if (y > H - 40) y = nuevaPagina();
    y = tituloSeccion('Observaciones', y);
    parrafos(parte.observaciones.split('\n').filter((t) => t.trim()), false);
  }

  // ---------- Registro fotográfico: por etapa y, si hay varias faenas, por faena
  const fotos = media.filter((m) => m.tipo === 'foto' && ORDEN_ETAPAS.includes(m.etapa));
  const urls = await urlsFirmadas(ctx.api, fotos.map((m) => m.ruta));
  const cargadas = new Map(await Promise.all(fotos.map(async (m) => [m.id, await cargarFoto(urls.get(m.ruta))])));
  const distintas = faenasDistintas(faenas);
  const varias = distintas.length > 1;
  const grupos = [];
  for (const etapa of ORDEN_ETAPAS) {
    const deEtapa = fotos.filter((m) => m.etapa === etapa && cargadas.get(m.id));
    if (!deEtapa.length) continue;
    if (!varias) { grupos.push({ titulo: nombreEtapa[etapa], fotos: deEtapa }); continue; }
    for (const f of [...distintas, { faena_id: null }]) {
      const deFaena = deEtapa.filter((m) => (m.faena_id ?? null) === f.faena_id);
      if (deFaena.length) grupos.push({ titulo: `${nombreEtapa[etapa]} · ${f.faena_id ? f.ope_faenas?.titulo : 'General'}`, fotos: deFaena });
    }
  }
  const anchoCelda = (W - 2 * M - (COLS - 1) * 4) / COLS;
  const altoCelda = (H - 30 - 10 - 20 - (FILAS - 1) * 4) / FILAS;
  for (const g of grupos) {
    for (let i = 0; i < g.fotos.length; i += COLS * FILAS) {
      y = nuevaPagina();
      y = tituloSeccion(`Registro fotográfico — ${g.titulo}${i ? ' (continuación)' : ''}`, y);
      g.fotos.slice(i, i + COLS * FILAS).forEach((m, j) => {
        const foto = cargadas.get(m.id);
        const x0 = M + (j % COLS) * (anchoCelda + 4);
        const y0 = y + Math.floor(j / COLS) * (altoCelda + 4);
        doc.setFillColor(247, 248, 250).rect(x0, y0, anchoCelda, altoCelda, 'F');
        const k = Math.min(anchoCelda / foto.ancho, altoCelda / foto.alto);
        const w = foto.ancho * k; const h = foto.alto * k;
        doc.addImage(foto.dataUrl, 'JPEG', x0 + (anchoCelda - w) / 2, y0 + (altoCelda - h) / 2, w, h);
      });
    }
  }

  // ---------- Contraportada
  doc.addPage();
  doc.setFillColor(...color).rect(0, 0, W, H, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255).roundedRect(W / 2 - 40, 80, 80, 44, 3, 3, 'F');
    ponerLogo(W / 2, 84, 72, 36, true);
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(255, 255, 255);
    doc.text(nombreEmpresa(e), W / 2, 105, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(255, 255, 255);
  (config.contactos ?? []).forEach((c, i) => doc.text(c, W / 2, 150 + i * 7, { align: 'center' }));
  if (config.web) {
    doc.setFont('helvetica', 'bold').setFontSize(12);
    doc.text(config.web, W / 2, 158 + (config.contactos?.length ?? 0) * 7, { align: 'center' });
  }

  // ---------- Pie en páginas interiores
  interiores.forEach((p, i) => {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
    doc.text(`${nombreEmpresa(e)} · Informe de trabajo · ${cliente}`, M, H - 8);
    doc.text(`Página ${i + 1} de ${interiores.length}`, W - M, H - 8, { align: 'right' });
  });
  // Portada y contraportada tienen fondo de color: ahí el sello va en blanco
  return sellar(doc, { autor: e.razon_social, empresa: e, titulo: `Informe de trabajo · ${cliente}`, claras: [1, doc.getNumberOfPages()] });
}
