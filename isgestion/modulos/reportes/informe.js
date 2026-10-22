// Informe de trabajo en PDF (diseño de InnovaGestión): portada y contraportada en crema con franjas laterales de los
// colores de la marca (Reportes → Diseño del informe) y el logo grande, datos del servicio, trabajo realizado,
// observaciones, fotos por etapa (12 por página) y contraportada con teléfonos, correos, web y dirección con iconos.
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
const CREMA = [239, 236, 230]; const TINTA = [20, 17, 14]; const SUAVE = [106, 103, 95]; const AZUL = [31, 40, 176];
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));

// Icono SVG (trazo) a PNG para jsPDF: teléfono, correo, web y ubicación (mismos de InnovaGestión)
const ICONOS = {
  tel: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};
async function iconoPng(nombre, colorHex) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="${colorHex}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre]}</svg>`;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 96; c.height = 96;
    c.getContext('2d').drawImage(img, 0, 0, 96, 96);
    return c.toDataURL('image/png');
  } catch { return null; }
}

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
  const logoGrande = (config.logo_portada ? await cargarLogo(ctx.api, config.logo_portada) : null) ?? logo;
  const franjas = (config.franjas ?? []).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map(hexRgb);
  const web = config.web || e.web || '';
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

  // Fondo crema con franjas laterales (negro con los colores de la marca, como InnovaGestión)
  const fondoMarca = () => {
    doc.setFillColor(...CREMA).rect(0, 0, W, H, 'F');
    const ancho = 14.8; const colores = franjas.length ? franjas : [color];
    const desde = 0.42; const hasta = 0.70; const paso = (hasta - desde) / colores.length;
    [[0, 1], [W - ancho, -1]].forEach(([x0, dir]) => {
      doc.setFillColor(...TINTA).rect(x0, 0, ancho, H, 'F');
      colores.forEach((c, i) => {
        const a = ancho * (desde + i * paso); const w = ancho * paso;
        doc.setFillColor(...c).rect(dir === 1 ? x0 + a : x0 + ancho - a - w, 0, w, H, 'F');
      });
    });
  };
  const logoCentrado = (y, maxAncho, maxAlto) => {
    if (!logoGrande) return 0;
    const k = Math.min(maxAncho / logoGrande.ancho, maxAlto / logoGrande.alto);
    const w = logoGrande.ancho * k; const h = logoGrande.alto * k;
    doc.addImage(logoGrande.dataUrl, logoGrande.formato, W / 2 - w / 2, y, w, h);
    return h;
  };

  // ---------- Portada
  fondoMarca();
  if (web) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TINTA);
    doc.text(web.replace(/^https?:\/\//, ''), W / 2, 22, { align: 'center', charSpace: 0.6 });
  }
  let yP = 92;
  const hLogo = logoCentrado(yP, 80, 62);
  if (hLogo) yP += hLogo + 14;
  else { doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...TINTA); doc.text(nombreEmpresa(e), W / 2, yP + 20, { align: 'center' }); yP += 36; }
  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...TINTA);
  doc.text('INFORME DE TRABAJO', W / 2, yP, { align: 'center', charSpace: 0.4 });
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...SUAVE);
  doc.text(doc.splitTextToSize([cliente, lugar].filter(Boolean).join(' · ').toUpperCase(), W - 70), W / 2, yP + 10, { align: 'center', charSpace: 0.8 });
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text(doc.splitTextToSize(textoFechas, W - 70), W / 2, yP + 18, { align: 'center' });
  if (config.lema) {
    doc.setFont('helvetica', 'bolditalic').setFontSize(11.5).setTextColor(...TINTA);
    const lema = config.lema.trim();
    doc.text(doc.splitTextToSize(/^["“]/.test(lema) ? lema : `"${lema}"`, W - 70), W / 2, H - 22, { align: 'center' });
  }

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

  // ---------- Contraportada: teléfonos, correos, web y dirección con iconos, y el logo grande
  doc.addPage();
  fondoMarca();
  const extra = config.contactos ?? [];
  const esCorreo = (t) => /@/.test(t); const esTel = (t) => /^\+?[\d\s().-]{7,}$/.test(t);
  const contactosAtras = [
    ['tel', unicos([e.telefono, ...extra.filter(esTel)].filter(Boolean))],
    ['mail', unicos([e.email, ...extra.filter(esCorreo)].filter(Boolean))],
    ['web', unicos([web].filter(Boolean))],
    ['pin', unicos([e.direccion, ...extra.filter((t) => !esCorreo(t) && !esTel(t))].filter(Boolean))],
  ].filter(([, l]) => l.length);
  const azul = franjas.length ? franjas[franjas.length - 1] : AZUL;
  const azulHex = `#${azul.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  const iconos = Object.fromEntries(await Promise.all(contactosAtras.map(async ([k]) => [k, await iconoPng(k, azulHex)])));
  const altoGrupos = contactosAtras.reduce((t, [, l]) => t + 10 + l.length * 5.6 + 7, 0);
  let yC = Math.max(50, (H - altoGrupos - 70) / 2);
  contactosAtras.forEach(([k, l]) => {
    if (iconos[k]) doc.addImage(iconos[k], 'PNG', W / 2 - 3.6, yC, 7.2, 7.2);
    yC += 13;
    doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(42, 42, 42);
    l.forEach((t) => { doc.text(t, W / 2, yC, { align: 'center' }); yC += 5.6; });
    yC += 7;
  });
  if (!logoCentrado(yC + 6, 76, 60)) {
    doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...TINTA);
    doc.text(nombreEmpresa(e), W / 2, yC + 26, { align: 'center' });
  }

  // ---------- Pie en páginas interiores
  interiores.forEach((p, i) => {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
    doc.text(`${nombreEmpresa(e)} · Informe de trabajo · ${cliente}`, M, H - 8);
    doc.text(`Página ${i + 1} de ${interiores.length}`, W - M, H - 8, { align: 'right' });
  });
  return sellar(doc, { autor: e.razon_social, empresa: e, titulo: `Informe de trabajo · ${cliente}` });
}
