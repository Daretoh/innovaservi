// Informe de trabajo en PDF (diseño de InnovaGestión): portada y contraportada en crema con franjas laterales de los
// colores de la marca (Reportes → Diseño del informe) y el logo grande, datos del servicio, trabajo realizado,
// observaciones, fotos por etapa (12 por página) y contraportada con teléfonos, correos, web y dirección con iconos.
// Las fotos "sin ordenar" y los videos no van al informe.
import { cargarJsPdf, cargarLogo, rgb, sellar } from '../../core/pdf.js?v=92f4191';
import { nombreEmpresa } from '../../core/empresas.js?v=92f4191';
import { fechaLarga } from '../../core/ui/formato.js?v=92f4191';
import { nombreEtapa, nombreTercero, urlsFirmadas, faenasDistintas } from './datos.js?v=92f4191';

const M = 15;                 // margen
const TEXTO = [28, 35, 48];
const GRIS = [91, 101, 118];
const LINEA = [221, 225, 231];
const ORDEN_ETAPAS = ['antes', 'proceso', 'despues', 'doc'];
const COLS = 2; const FILAS = 6;
const NAVY = [27, 31, 77]; const SUAVE_AZUL = [107, 115, 144];
const rutConPuntos = (r) => { const m = /^(\d+)-?([\dkK])$/.exec(String(r ?? '').replace(/\./g, '').trim()); return m ? `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${m[2].toUpperCase()}` : (r ?? ''); };
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

// Foto a JPEG en data URL, recortada al centro con la proporción de la celda (como InnovaGestión: llena el cuadro)
async function cargarFoto(url, proporcion = null) {
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    let sx = 0; let sy = 0; let sw = bmp.width; let sh = bmp.height;
    if (proporcion) {
      if (sw / sh > proporcion) { sw = sh * proporcion; sx = (bmp.width - sw) / 2; } else { sh = sw / proporcion; sy = (bmp.height - sh) / 2; }
    }
    const escala = Math.min(1, 1400 / sw);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * escala); c.height = Math.round(sh * escala);
    c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), ancho: c.width, alto: c.height };
  } catch {
    return null;
  }
}

// Ancho de un texto con espaciado entre letras (charSpace) y el texto partido en líneas que quepan en "maximo"
// (con la fuente activa del documento); una palabra más ancha que el máximo se corta por letras
const anchoEspaciado = (doc, t, esp) => doc.getTextWidth(t) + esp * Math.max(0, t.length - 1);
function partirEspaciado(doc, texto, maximo, esp) {
  const lineas = []; let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || anchoEspaciado(doc, prueba, esp) <= maximo) { actual = prueba; continue; }
    lineas.push(actual); actual = palabra;
  }
  if (actual) lineas.push(actual);
  return lineas.flatMap((l) => {
    if (anchoEspaciado(doc, l, esp) <= maximo) return [l];
    const out = []; let t = '';
    for (const c of l) { if (t && anchoEspaciado(doc, t + c, esp) > maximo) { out.push(t); t = c; } else t += c; }
    return t ? [...out, t] : out;
  });
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
  const textoFechas = parte.fecha_texto?.trim() || (fechas.length ? fechas : [parte.fecha]).map(fechaLarga).join(', ');

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
  const centrado = (texto, y, esp = 0) => {
    const lineas = Array.isArray(texto) ? texto : [texto];
    lineas.forEach((t, i) => {
      const w = doc.getTextWidth(t) + esp * Math.max(0, t.length - 1);
      doc.text(t, W / 2 - w / 2, y + i * doc.getLineHeight() / doc.internal.scaleFactor, { charSpace: esp });
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
    centrado(web.replace(/^https?:\/\//, ''), 22, 0.6);
  }
  let yP = 92;
  const hLogo = logoCentrado(yP, 80, 62);
  if (hLogo) yP += hLogo + 14;
  else { doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...TINTA); doc.text(nombreEmpresa(e), W / 2, yP + 20, { align: 'center' }); yP += 36; }
  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...TINTA);
  centrado('INFORME DE TRABAJO', yP, 0.3);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...SUAVE);
  centrado(doc.splitTextToSize([cliente, lugar].filter(Boolean).join(' · ').toUpperCase(), W - 80), yP + 10, 0.8);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  centrado(doc.splitTextToSize(textoFechas, W - 70), yP + 18);
  if (config.lema) {
    doc.setFont('helvetica', 'bolditalic').setFontSize(11.5).setTextColor(...TINTA);
    const lema = config.lema.trim();
    doc.text(doc.splitTextToSize(/^["“]/.test(lema) ? lema : `"${lema}"`, W - 70), W / 2, H - 22, { align: 'center' });
  }

  // ---------- Páginas interiores (diseño de InnovaGestión)
  const interiores = [];
  const ETIQUETA = { antes: 'ESTADO INICIAL', proceso: 'EN PROCESO', despues: 'ESTADO FINAL', doc: 'REGISTRO DOCUMENTAL' };
  const nuevaPagina = () => {
    doc.addPage();
    interiores.push(doc.getNumberOfPages());
    const conLogo = ponerLogo(M, 9, 12, 9);
    const x = conLogo ? M + 15 : M;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY);
    const marca = nombreEmpresa(e).toUpperCase();
    doc.text(marca, x, 15.5);
    const anchoMarca = doc.getTextWidth(marca);
    doc.setFont('helvetica', 'normal').setTextColor(...SUAVE_AZUL);
    doc.text(' — Informe de Trabajo', x + anchoMarca + 0.8, 15.5);
    doc.setDrawColor(...color).setLineWidth(0.5).line(M, 21, W - M, 21);
    return 32;
  };
  const tituloSeccion = (texto, y) => {
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...NAVY);
    doc.text(texto, M, y);
    doc.setDrawColor(...color).setLineWidth(0.5).line(M, y + 3.5, W - M, y + 3.5);
    return y + 11;
  };
  // "Etiqueta: valor" con el valor en negrita; devuelve las líneas para medir el alto
  const filaDato = (x, y, ancho, etiqueta, valor, { tam = 10.5 } = {}) => {
    doc.setFontSize(tam);
    if (!etiqueta) {
      doc.setFont('helvetica', 'bold').setTextColor(...NAVY);
      const ls = doc.splitTextToSize(String(valor), ancho); doc.text(ls, x, y); return ls.length;
    }
    doc.setFont('helvetica', 'normal').setTextColor(...NAVY);
    const et = `${etiqueta}: `; const wEt = doc.getTextWidth(et);
    doc.setFont('helvetica', 'bold');
    if (wEt + doc.getTextWidth(String(valor)) <= ancho) {
      doc.setFont('helvetica', 'normal').text(et, x, y);
      doc.setFont('helvetica', 'bold').text(String(valor), x + wEt, y);
      return 1;
    }
    doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(et.trim(), ancho), x, y);
    const ls = doc.setFont('helvetica', 'bold').splitTextToSize(String(valor), ancho);
    doc.text(ls, x, y + 5.6);
    return 1 + ls.length;
  };

  let y = nuevaPagina();
  y = tituloSeccion('Datos del servicio', y);

  // Dos cajas: empresa contratista (franja del color de la empresa) y empresa mandante (azul)
  const anchoCaja = (W - 2 * M - 7) / 2; const pad = 6; const paso = 5.6;
  const lineasCfg = (config.lineas ?? []).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [null, l];
  });
  const datosContratista = [['Empresa', config.contratista_nombre?.trim() || e.razon_social], ['RUT', rutConPuntos(e.rut)], ['Responsable faena', parte.responsable], ...lineasCfg.filter(([k]) => k)];
  const notasContratista = lineasCfg.filter(([k]) => !k).map(([, v]) => v);
  const t = parte.terceros;
  // Lo escrito en el parte manda sobre los datos del cliente (como en InnovaGestión, Reportes 006)
  const datosMandante = [['Empresa', parte.mandante_razon || t?.razon_social || nombreTercero(t)], ['RUT', parte.mandante_rut || (t?.rut ? rutConPuntos(t.rut) : null)], ['Dirección', parte.mandante_direccion || parte.ope_sitios?.direccion || t?.direccion || lugar]];
  const medir = (filas, notas) => {
    let n = 0;
    filas.filter(([, v]) => v).forEach(([k, v]) => {
      doc.setFont('helvetica', 'normal').setFontSize(10.5); const wEt = doc.getTextWidth(`${k}: `);
      doc.setFont('helvetica', 'bold');
      n += wEt + doc.getTextWidth(String(v)) <= anchoCaja - 2 * pad ? 1 : 1 + doc.splitTextToSize(String(v), anchoCaja - 2 * pad).length;
    });
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    const nn = notas.reduce((s, v) => s + doc.splitTextToSize(v, anchoCaja - 2 * pad).length, 0);
    return 16 + n * paso + (nn ? 3 + nn * 4.6 : 0) + 4;
  };
  const altoCajas = Math.max(medir(datosContratista, notasContratista), medir(datosMandante, []), 40);
  const pintarCaja = (x, titulo, acento, filas, notas) => {
    doc.setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(x, y, anchoCaja, altoCajas, 3, 3, 'S');
    doc.setFillColor(...acento).roundedRect(x, y, anchoCaja, 3, 1.5, 1.5, 'F');
    doc.setFillColor(255, 255, 255).rect(x + 0.2, y + 1.2, anchoCaja - 0.4, 2, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...acento);
    doc.text(titulo, x + pad, y + 11, { charSpace: 0.2 });
    let yy = y + 18.5;
    filas.filter(([, v]) => v).forEach(([k, v]) => { yy += filaDato(x + pad, yy, anchoCaja - 2 * pad, k, v) * paso; });
    if (notas.length) {
      yy += 1.5;
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...SUAVE_AZUL);
      notas.forEach((v) => { const ls = doc.splitTextToSize(v, anchoCaja - 2 * pad); doc.text(ls, x + pad, yy); yy += ls.length * 4.6; });
    }
  };
  pintarCaja(M, 'EMPRESA CONTRATISTA', color, datosContratista, notasContratista);
  pintarCaja(M + anchoCaja + 7, 'EMPRESA MANDANTE', NAVY, datosMandante, []);
  y += altoCajas + 14;

  // Detalle del trabajo: solicitado por, fecha y lugar en tres columnas
  y = tituloSeccion('Detalle del trabajo realizado', y);
  const col = (W - 2 * M) / 3;
  [['SOLICITADO POR', parte.solicitado_por || '—'], ['FECHA FAENA', textoFechas], ['LUGAR', lugar || '—']].forEach(([k, v], i) => {
    const x = M + i * col;
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...SUAVE_AZUL).text(k, x, y, { charSpace: 0.15 });
    doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(...NAVY);
    const ls = doc.splitTextToSize(String(v), col - 4); doc.text(ls, x, y + 6.5);
    doc.setDrawColor(...LINEA).setLineDashPattern([0.8, 0.8], 0).setLineWidth(0.3).line(x, y + 8.5 + (ls.length - 1) * 5, x + Math.min(col - 4, doc.getTextWidth(ls[0])), y + 8.5 + (ls.length - 1) * 5);
    doc.setLineDashPattern([], 0);
  });
  y += 17;

  // Trabajo realizado (caja con viñetas)
  const trabajos = unicos([...faenas.map((f) => f.ope_faenas?.titulo ?? ''), ...(parte.trabajo ?? '').split('\n').map((s) => s.replace(/^[-•\s]+/, ''))]);
  doc.setFont('helvetica', 'normal').setFontSize(10.5);
  const itemLs = (trabajos.length ? trabajos : ['—']).map((tx) => doc.splitTextToSize(tx, W - 2 * M - 2 * pad - 5));
  const altoTrabajo = 16 + itemLs.reduce((s, ls) => s + ls.length * 5, 0) + 4;
  if (y + altoTrabajo > H - 25) y = nuevaPagina();
  doc.setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(M, y, W - 2 * M, altoTrabajo, 3, 3, 'S');
  doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(...NAVY).text('Trabajo realizado', M + pad, y + 9);
  let yt = y + 16;
  doc.setFont('helvetica', 'normal').setFontSize(10.5);
  itemLs.forEach((ls) => { doc.setFillColor(...NAVY).circle(M + pad + 1, yt - 1.3, 0.8, 'F'); doc.text(ls, M + pad + 4, yt); yt += ls.length * 5; });
  y += altoTrabajo + 6;

  // Observaciones: sección propia; en un mismo cuadro suave el texto y debajo hasta 4 imágenes (rep_media con etapa 'obs')
  // en una fila, más chicas y enteras. Si el texto es largo el cuadro sigue en la página siguiente.
  const fotosObs = media.filter((m) => m.tipo === 'foto' && m.etapa === 'obs').slice(0, 4);
  const textoObs = parte.observaciones?.trim() ?? '';
  if (textoObs || fotosObs.length) {
    const urlsObs = await urlsFirmadas(ctx.api, fotosObs.map((m) => m.ruta));
    const imgsObs = (await Promise.all(fotosObs.map((m) => cargarFoto(urlsObs.get(m.ruta))))).filter(Boolean);
    const LIM = H - 22; const anchoIn = W - 2 * M - 2 * pad;
    const gapImg = 4; const anchoImg = (anchoIn - 3 * gapImg) / 4; const altoImg = 34;
    const hImgs = imgsObs.length ? altoImg + (textoObs ? 4 : 0) : 0;
    doc.setFont('helvetica', 'normal').setFontSize(10.5);
    let resto = textoObs ? doc.splitTextToSize(textoObs, anchoIn) : [];
    if (y + 11 + 2 * pad + Math.min(resto.length, 3) * 5 + hImgs > LIM) y = nuevaPagina();
    y = tituloSeccion('Observaciones', y);
    let fotosPuestas = !imgsObs.length;
    while (resto.length || !fotosPuestas) {
      const libre = LIM - y - 2 * pad + 1;
      let caben = Math.max(0, Math.floor(libre / 5));
      if (!resto.length && libre < hImgs) { y = nuevaPagina(); continue; }   // solo faltan las imágenes y no caben aquí
      if (resto.length && caben < 1) { y = nuevaPagina(); continue; }
      const trozo = resto.slice(0, caben); resto = resto.slice(caben);
      const conFotos = !resto.length && !fotosPuestas && trozo.length * 5 + hImgs <= libre;
      const altoTexto = trozo.length ? trozo.length * 5 - 1 : 0;
      const alto = 2 * pad + altoTexto + (conFotos ? altoImg + (trozo.length ? 4 : 0) : 0);
      doc.setFillColor(243, 244, 250).setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(M, y, W - 2 * M, alto, 3, 3, 'FD');
      if (trozo.length) doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...NAVY).text(trozo, M + pad, y + pad + 3.2);
      if (conFotos) {
        const y0 = y + pad + altoTexto + (trozo.length ? 4 : 0);
        imgsObs.forEach((img, k) => {
          const x0 = M + pad + k * (anchoImg + gapImg);
          const esc = Math.min((anchoImg - 1.5) / img.ancho, (altoImg - 1.5) / img.alto);
          const w = img.ancho * esc; const h = img.alto * esc;
          doc.setFillColor(255, 255, 255).setDrawColor(...LINEA).setLineWidth(0.3).roundedRect(x0, y0, anchoImg, altoImg, 1.5, 1.5, 'FD');
          doc.addImage(img.dataUrl, 'JPEG', x0 + (anchoImg - w) / 2, y0 + (altoImg - h) / 2, w, h);
        });
        fotosPuestas = true;
      }
      y += alto + 6;
      if (resto.length || !fotosPuestas) y = nuevaPagina();
    }
  }

  // ---------- Registro fotográfico: por etapa (y por faena si hay varias), 2 columnas × 6 filas por página
  const fotos = media.filter((m) => m.tipo === 'foto' && ORDEN_ETAPAS.includes(m.etapa));
  const urls = await urlsFirmadas(ctx.api, fotos.map((m) => m.ruta));
  const anchoCelda = (W - 2 * M - 5) / COLS;
  const altoCelda = (H - 58 - 22 - (FILAS - 1) * 4) / FILAS;
  const cargadas = new Map(await Promise.all(fotos.map(async (m) => [m.id, await cargarFoto(urls.get(m.ruta), anchoCelda / altoCelda)])));
  const distintas = faenasDistintas(faenas);
  const varias = distintas.length > 1;
  // Procesos personalizados: dentro de Proceso, primero las fotos generales y luego un bloque por paso, en su orden
  const procesos = parte.procesos ?? [];
  const idProceso = (m) => (procesos.some((p) => p.id === m.proceso) ? m.proceso : null);
  const PASOS = ORDEN_ETAPAS.flatMap((etapa) => (etapa === 'proceso' ? [{ etapa, proceso: null }, ...procesos.map((proceso) => ({ etapa, proceso }))] : [{ etapa, proceso: null }]));
  const enPaso = (m, paso) => m.etapa === paso.etapa && (paso.etapa !== 'proceso' || idProceso(m) === (paso.proceso?.id ?? null));
  const grupos = [];
  // Con secciones (ej.: Cámara 1 / Cámara 2): un bloque por sección (y faena si hay varias) con sus etapas; las fotos
  // sin sección van al final
  const secciones = [...new Set(fotos.map((m) => m.seccion).filter(Boolean))];
  if (secciones.length) {
    for (const f of varias ? [...distintas, { faena_id: null }] : [null]) {
      for (const sec of [...secciones, null]) {
        for (const paso of PASOS) {
          const g = fotos.filter((m) => enPaso(m, paso) && cargadas.get(m.id) && (m.seccion ?? null) === sec && (!f || (m.faena_id ?? null) === f.faena_id));
          const faena = f ? (f.faena_id ? f.ope_faenas?.titulo : 'General') : null;
          if (g.length) grupos.push({ ...paso, faena: [faena, sec].filter(Boolean).join(' — ') || null, fotos: g });
        }
      }
    }
  }
  for (const paso of secciones.length ? [] : PASOS) {
    const deEtapa = fotos.filter((m) => enPaso(m, paso) && cargadas.get(m.id));
    if (!deEtapa.length) continue;
    if (!varias) { grupos.push({ ...paso, faena: null, fotos: deEtapa }); continue; }
    for (const f of [...distintas, { faena_id: null }]) {
      const deFaena = deEtapa.filter((m) => (m.faena_id ?? null) === f.faena_id);
      if (deFaena.length) grupos.push({ ...paso, faena: f.faena_id ? f.ope_faenas?.titulo : 'General', fotos: deFaena });
    }
  }
  for (const g of grupos) {
    const total = Math.ceil(g.fotos.length / (COLS * FILAS));
    for (let i = 0, n = 1; i < g.fotos.length; i += COLS * FILAS, n += 1) {
      y = nuevaPagina();
      y = tituloSeccion(`Registro fotográfico${g.faena ? ` — ${g.faena}` : ''}`, y);
      const chip = `${g.proceso ? g.proceso.nombre.toUpperCase() : ETIQUETA[g.etapa] ?? nombreEtapa[g.etapa].toUpperCase()}${total > 1 ? ` ${n}-${total}` : ''}`;
      // Píldora con el título: crece con el texto y, si es muy largo (o hay nota al lado), se parte en varias líneas;
      // la nota del proceso va a su derecha, completa y ajustada al espacio que queda
      const nota = g.proceso?.nota?.trim() ?? '';
      doc.setFont('helvetica', 'bold').setFontSize(10);
      const lineasChip = partirEspaciado(doc, chip, (nota ? (W - 2 * M) * 0.5 : W - 2 * M) - 10, 0.3);
      const wChip = Math.max(...lineasChip.map((l) => anchoEspaciado(doc, l, 0.3))) + 10;
      const hChip = 7.5 + (lineasChip.length - 1) * 4.6;
      doc.setFillColor(...color).roundedRect(M, y, wChip, hChip, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      lineasChip.forEach((l, k) => doc.text(l, M + 5, y + 5.2 + k * 4.6, { charSpace: 0.3 }));
      let hNota = 0;
      if (nota) {
        doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...NAVY);
        const ls = doc.splitTextToSize(nota, W - 2 * M - wChip - 5);
        ls.forEach((l, k) => doc.text(l, M + wChip + 5, y + 5.2 + k * 4.4));
        hNota = 7.5 + (ls.length - 1) * 4.4;
      }
      y += 12 + Math.max(hChip, hNota) - 7.5;
      // Si la cabecera ocupó más de una línea, las fotos se achican un poco (mismas proporciones) para caber en la página
      const k = Math.min(1, (H - 22 - y + 4) / (FILAS * (altoCelda + 4)));
      const aw = anchoCelda * k; const ah = altoCelda * k;
      const x00 = M + (W - 2 * M - (COLS * aw + (COLS - 1) * 5)) / 2;
      g.fotos.slice(i, i + COLS * FILAS).forEach((m, j) => {
        const foto = cargadas.get(m.id);
        const x0 = x00 + (j % COLS) * (aw + 5);
        const y0 = y + Math.floor(j / COLS) * (ah + 4);
        doc.addImage(foto.dataUrl, 'JPEG', x0, y0, aw, ah);
        doc.setDrawColor(...LINEA).setLineWidth(0.4).roundedRect(x0, y0, aw, ah, 1.5, 1.5, 'S');
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

  // ---------- Pie: en las páginas interiores empresa · web a la izquierda (como InnovaGestión); en todas, "Página X de Y"
  // a la derecha. La única fecha es la del sello "Generado con ISgestión" (sellar, al centro abajo).
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    const interior = interiores.includes(p);
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(154, 150, 142);
    if (interior) {
      doc.setDrawColor(230, 227, 220).setLineWidth(0.3).line(M, H - 12.5, W - M, H - 12.5);
      doc.text([nombreEmpresa(e), web.replace(/^https?:\/\//, '').replace(/^www\./, '')].filter(Boolean).join(' · '), M, H - 9);
    }
    // portada y contraportada: dentro de las franjas laterales
    doc.text(`Página ${p} de ${totalPaginas}`, W - (interior ? M : 19), H - 9, { align: 'right' });
  }
  return sellar(doc, { autor: e.razon_social, titulo: `Informe de trabajo · ${cliente}` });
}
