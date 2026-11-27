// Lector de boletas y facturas chilenas (migrado del lector beta de InnovaGestión, costos-prueba.html).
// Todo en el navegador y gratis: timbre electrónico (PDF417 → TED), XML del DTE y, como respaldo, el texto
// de la foto (OCR con Tesseract). Las librerías se cargan solo al usarlo, con versión fija.
// Nunca guarda nada: entrega los datos para que la persona los revise.

const LIBS = {
  zxing: 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/iife/reader/index.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};

export const TIPOS_DTE = {
  33: 'Factura electrónica', 34: 'Factura exenta electrónica', 39: 'Boleta electrónica', 41: 'Boleta exenta electrónica',
  46: 'Factura de compra electrónica', 52: 'Guía de despacho electrónica', 56: 'Nota de débito electrónica',
  61: 'Nota de crédito electrónica', 110: 'Factura de exportación', 0: 'Comprobante u otro',
};
export const EXENTOS = [34, 41, 110];
// Tipo de documento de Costos según el tipo del SII
export const docTipoDe = (td) => ([33, 34, 46, 110].includes(td) ? 'factura' : [39, 41].includes(td) ? 'boleta' : td === 52 ? 'guia' : td == null ? 'sin' : 'otro');

// ---------- utilidades ----------
const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) {
    cargados.set(src, new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { cargados.delete(src); mal(new Error('No se pudo cargar el lector. Revisa la conexión.')); }; document.head.append(s); }));
  }
  return cargados.get(src);
}
export const num = (v) => { const s = String(v ?? '').replace(/[^\d-]/g, ''); return s === '' || s === '-' ? null : parseInt(s, 10); };
const dvRut = (c) => { let s = 0; let m = 2; for (let i = c.length - 1; i >= 0; i--) { s += Number(c[i]) * m; m = m === 7 ? 2 : m + 1; } const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); };
export const limpioRut = (r) => String(r ?? '').replace(/[^\dkK]/g, '').toUpperCase();
export const rutValido = (r) => { const c = limpioRut(r); return c.length >= 2 && dvRut(c.slice(0, -1)) === c.slice(-1); };
export const fmtRut = (r) => { const c = limpioRut(r); return c.length < 2 ? (r ?? '') : `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`; };
const latin1 = (b) => { try { return new TextDecoder('iso-8859-1').decode(b); } catch { return String.fromCharCode(...b); } };

// ---------- timbre electrónico (PDF417 con el XML del TED) ----------
const tag = (xml, n) => { const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`)); return m ? m[1].trim() : null; };
const desXml = (s) => (s == null ? null : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
export function parseTED(txt) {
  if (!txt || !/<TED[\s>]/.test(txt) || !/<DD>/.test(txt)) return null;
  const dd = tag(txt, 'DD') ?? ''; const dda = dd.replace(/<CAF[\s\S]*<\/CAF>/, ''); const caf = tag(txt, 'DA') ?? '';
  return { td: num(tag(dda, 'TD')), folio: tag(dda, 'F'), fecha: tag(dda, 'FE'), rut: tag(dda, 'RE'), razon: desXml(tag(caf, 'RS')), total: num(tag(dda, 'MNT')), item: desXml(tag(dda, 'IT1')) };
}

let nativo;   // BarcodeDetector del navegador, si soporta PDF417
async function detectorNativo() {
  if (nativo !== undefined) return nativo;
  nativo = null;
  try { if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('pdf417')) nativo = new BarcodeDetector({ formats: ['pdf417'] }); } catch { /* sin detector */ }
  return nativo;
}
async function zx(fuente, binarizador) {
  await cargarScript(LIBS.zxing);
  try {
    const op = { formats: ['PDF417'], tryHarder: true, tryDownscale: false, maxNumberOfSymbols: 1 };
    if (binarizador) op.binarizer = binarizador;
    const res = await window.ZXingWASM.readBarcodes(fuente, op);
    if (res.length && res[0].isValid !== false) { const t = res[0].bytes?.length ? latin1(res[0].bytes) : res[0].text; if (/<TED/.test(t)) return t; }
  } catch { /* no se leyó */ }
  return null;
}
// Recorta la zona z de la imagen, la gira y la escala para el lector
function recorteGirado(src, z, grados, esc = 1) {
  const r = (grados * Math.PI) / 180; const cs = Math.abs(Math.cos(r)); const sn = Math.abs(Math.sin(r)); const w = z.w * esc; const h = z.h * esc;
  const c = document.createElement('canvas'); c.width = Math.round(w * cs + h * sn); c.height = Math.round(w * sn + h * cs);
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high'; g.translate(c.width / 2, c.height / 2); g.rotate(r); g.drawImage(src, z.x, z.y, z.w, z.h, -w / 2, -h / 2, w, h);
  return g.getImageData(0, 0, c.width, c.height);
}
// Zonas con más "textura" (bordes muy juntos): el timbre es el bloque más denso de la boleta
function ubicarTimbre(base) {
  const W = 320; const s = W / base.width; const H = Math.max(1, Math.round(base.height * s)); const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(base, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data; const gris = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gris[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const C = 6; const cw = Math.floor(W / C); const ch = Math.floor(H / C); const en = new Float32Array(cw * ch);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const gx = Math.abs(gris[y * W + x + 1] - gris[y * W + x - 1]); const gy = Math.abs(gris[(y + 1) * W + x] - gris[(y - 1) * W + x]);
    const cx = Math.floor(x / C); const cy = Math.floor(y / C); if (cx < cw && cy < ch) en[cy * cw + cx] += gx + gy;
  }
  const n = en.length; let media = 0; for (let i = 0; i < n; i++) media += en[i]; media /= n;
  let ds = 0; for (let i = 0; i < n; i++) ds += (en[i] - media) ** 2; ds = Math.sqrt(ds / n);
  const umbral = media + 0.8 * ds; const marca = new Uint8Array(n); const visto = new Uint8Array(n); const comps = [];
  for (let i = 0; i < n; i++) if (en[i] > umbral) marca[i] = 1;
  for (let i = 0; i < n; i++) {
    if (!marca[i] || visto[i]) continue;
    const pila = [i]; let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1; let suma = 0; let cant = 0; visto[i] = 1;
    while (pila.length) {
      const q = pila.pop(); const qx = q % cw; const qy = (q / cw) | 0; suma += en[q]; cant++;
      x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx; const ny = qy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const v = ny * cw + nx; if (marca[v] && !visto[v]) { visto[v] = 1; pila.push(v); }
      }
    }
    if (cant < 6) continue;
    comps.push({ score: suma * (cant / ((x1 - x0 + 1) * (y1 - y0 + 1))), x0, y0, x1, y1 });
  }
  comps.sort((a, b) => b.score - a.score);
  return comps.slice(0, 3).map((o) => {
    const f = C / s; const bx = o.x0 * f; const by = o.y0 * f; const bw = (o.x1 - o.x0 + 1) * f; const bh = (o.y1 - o.y0 + 1) * f; const m = 0.15;
    const X = Math.max(0, bx - bw * m); const Y = Math.max(0, by - bh * m);
    return { x: X, y: Y, w: Math.min(base.width - X, bw * (1 + 2 * m)), h: Math.min(base.height - Y, bh * (1 + 2 * m)) };
  });
}
// Lectura a fondo de una foto: se ubica el timbre en una copia chica y se lee recortándolo de la ORIGINAL,
// enderezándolo cada 3° (hasta ±15°), de lado si hace falta, y con otro binarizador para papel térmico desteñido.
export async function leerTimbreFoto(fuente) {
  const bmp = fuente instanceof Blob ? await createImageBitmap(fuente) : fuente;
  const det = await detectorNativo();
  if (det) { try { const r = await det.detect(bmp); if (r.length && /<TED/.test(r[0].rawValue)) return r[0].rawValue; } catch { /* sigue */ } }
  const W = bmp.width; const H = bmp.height; const k = Math.min(1, 1600 / Math.max(W, H)); const base = document.createElement('canvas');
  base.width = Math.round(W * k); base.height = Math.round(H * k); base.getContext('2d').drawImage(bmp, 0, 0, base.width, base.height);
  const zonas = ubicarTimbre(base).map((z) => ({ x: z.x / k, y: z.y / k, w: z.w / k, h: z.h / k }));
  const angs = [0, -3, 3, -6, 6, -9, 9, -12, 12, -15, 15];
  for (const zn of zonas) {
    const lado = Math.max(zn.w, zn.h); const esc = lado > 2600 ? 2600 / lado : lado < 900 ? 900 / lado : 1; const giro = zn.h > zn.w ? 90 : 0;
    for (const a of angs) {
      let t = await zx(recorteGirado(bmp, zn, giro + a, esc));
      if (!t && giro) t = await zx(recorteGirado(bmp, zn, a, esc));
      if (t) return t;
    }
    for (const a of angs.slice(0, 5)) { const t = await zx(recorteGirado(bmp, zn, giro + a, esc), 'GlobalHistogram'); if (t) return t; }
  }
  const kk = Math.min(1, 3000 / Math.max(W, H));
  for (const a of [0, -3, 3]) { const t = await zx(recorteGirado(bmp, { x: 0, y: 0, w: W, h: H }, a, kk)); if (t) return t; }
  return null;
}

// Cámara en vivo: prueba un ángulo distinto en cada cuadro hasta leer el timbre. Devuelve { detener }.
export async function escanearCamara(video, alLeer, alError) {
  if (!navigator.mediaDevices?.getUserMedia) { alError?.('Este navegador no permite usar la cámara. Usa "Tomar foto".'); return { detener() {} }; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false }); }
  catch (e) { alError?.(`No se pudo abrir la cámara: ${e.message}. Usa "Tomar foto".`); return { detener() {} }; }
  video.srcObject = stream; await video.play();
  const track = stream.getVideoTracks()[0]; const cap = track.getCapabilities?.() ?? {};
  try { if (cap.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* sin enfoque */ }
  let vivo = true; let n = 0; const ANG = [0, -3, 3, -6, 6, -9, 9];
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
  const detener = () => { vivo = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  const linterna = cap.torch ? async (on) => { try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch { /* sin linterna */ } } : null;
  (async () => {
    const det = await detectorNativo();
    while (vivo) {
      if (video.videoWidth) {
        cv.width = video.videoWidth; cv.height = video.videoHeight; cx.drawImage(video, 0, 0);
        const ang = ANG[(n++) % ANG.length]; let ted = null;
        if (det && ang === 0) { try { const r = await det.detect(cv); if (r.length) ted = parseTED(r[0].rawValue); } catch { /* sigue */ } }
        if (!ted) ted = parseTED(await zx(recorteGirado(cv, { x: cv.width * 0.04, y: cv.height * 0.18, w: cv.width * 0.92, h: cv.height * 0.64 }, ang)));
        if (ted) {
          navigator.vibrate?.(80);
          const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85));
          detener(); alLeer(ted, blob); return;
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  })();
  return { detener, linterna };
}

// ---------- XML del DTE ----------
export function parseXML(buf) {
  const u8 = new Uint8Array(buf); const m = /encoding=["']([^"']+)/i.exec(latin1(u8.slice(0, 200))); const enc = m ? m[1].toLowerCase() : 'utf-8';
  let txt; try { txt = new TextDecoder(enc).decode(u8); } catch { txt = latin1(u8); }
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  const q = (el, n) => { const r = el.getElementsByTagNameNS('*', n); return r.length ? r[0] : null; };
  const t = (el, n) => { const r = el && q(el, n); return r ? r.textContent.trim() : null; };
  return [...doc.getElementsByTagNameNS('*', 'Documento')].map((d) => {
    const tot = q(d, 'Totales') ?? d; const em = q(d, 'Emisor') ?? d; let imp = 0;
    for (const r of tot.getElementsByTagNameNS('*', 'ImptoReten')) imp += num(t(r, 'MontoImp')) ?? 0;
    return {
      td: num(t(d, 'TipoDTE')), folio: t(d, 'Folio'), fecha: t(d, 'FchEmis'), rut: t(em, 'RUTEmisor'), razon: t(em, 'RznSoc') ?? t(em, 'RznSocEmisor'),
      neto: num(t(tot, 'MntNeto')), iva: num(t(tot, 'IVA')), exento: num(t(tot, 'MntExe')), otros: imp || null, total: num(t(tot, 'MntTotal')),
      items: [...d.getElementsByTagNameNS('*', 'Detalle')].map((l) => ({ nombre: t(l, 'NmbItem'), cant: parseFloat(t(l, 'QtyItem')) || null, precio: parseFloat(t(l, 'PrcItem')) || null, monto: num(t(l, 'MontoItem')) })),
    };
  });
}

// ---------- texto de la foto (OCR) ----------
let worker = null;
export async function ocr(img, avance) {
  if (!worker) {
    await cargarScript(LIBS.tesseract);
    worker = await window.Tesseract.createWorker('spa', 1, { logger: (m) => { if (m.status === 'recognizing text') worker?._avance?.(Math.round(m.progress * 100)); } });
  }
  worker._avance = avance;
  const r = await worker.recognize(await prepararOCR(img));
  worker._avance = null;
  return r.data.text || '';
}
// Escala de grises y más contraste: el papel térmico sale gris y lavado
async function prepararOCR(blob) {
  const img = await createImageBitmap(blob); const lado = Math.max(img.width, img.height); const k = lado > 2800 ? 2800 / lado : lado < 1400 ? 1400 / lado : 1;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height); const p = d.data; let lo = 255; let hi = 0;
  for (let i = 0; i < p.length; i += 4) { const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const f = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < p.length; i += 4) { const y = Math.max(0, Math.min(255, (p[i] - lo) * f)); p[i] = p[i + 1] = p[i + 2] = y; }
  g.putImageData(d, 0, 0);
  return c;
}
const montosDe = (l) => (l.match(/\d{1,3}(?:[.,]\d{3})+(?![\d.,]*\d{3})|\b\d{3,7}\b/g) ?? []).map((s) => parseInt(s.replace(/[^\d]/g, ''), 10)).filter((n) => n >= 10);
// Datos de boletas y facturas chilenas en el texto leído. propios: RUT de la empresa (receptor, nunca el emisor)
export function extraer(texto, propios = []) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean); const T = texto.toUpperCase();
  const r = { td: null, folio: null, fecha: null, rut: null, razon: null, neto: null, iva: null, exento: null, total: null, avisos: [] }; let m;
  if (/NOTA\s+DE\s+CR[EÉ]DITO/.test(T)) r.td = 61; else if (/FACTURA\s+(NO\s+AFECTA|EXENTA)/.test(T)) r.td = 34; else if (/FACTURA/.test(T)) r.td = 33;
  else if (/BOLETA\s+(NO\s+AFECTA|EXENTA)/.test(T)) r.td = 41; else if (/BOLETA/.test(T)) r.td = 39; else if (/GU[IÍ]A\s+DE\s+DESPACHO/.test(T)) r.td = 52;
  const it = lineas.findIndex((l) => /FACTURA|BOLETA|NOTA DE|GU[IÍ]A/i.test(l));
  if (it >= 0) lineas.slice(it, it + 3).some((l) => { const mm = l.replace(/\d{1,2}[.,]\d{3}[.,]\d{3}\s*-\s*[\dkK]/g, '').match(/\b(\d{2,10})\b/); if (mm) { r.folio = mm[1]; return true; } return false; });
  const reF = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/g;
  while ((m = reF.exec(texto))) {
    const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); const mo = Number(m[2]); const dd = Number(m[1]);
    if (yy >= 2020 && yy <= 2035 && mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) { r.fecha = `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; break; }
  }
  const ruts = []; const reR = /(SOLICITANTE\W*)?(\d{1,2})[.,\s]{0,2}(\d{3})[.,\s]{0,2}(\d{3})\s*[-–.]\s*([\dkK])\b/gi;
  while ((m = reR.exec(texto))) if (!m[1]) ruts.push({ c: m[2] + m[3] + m[4], d: m[5].toUpperCase() });
  // El OCR a veces lee mal el RUT de la empresa: se descarta todo RUT que difiera en 2 dígitos o menos
  const prop = propios.map(limpioRut).filter(Boolean);
  const parecido = (c) => prop.some((p) => { const b = p.slice(0, -1); if (b.length !== c.length) return false; let dif = 0; for (let k = 0; k < c.length; k++) if (c[k] !== b[k]) dif++; return dif <= 2; });
  const ajenos = ruts.filter((x) => !parecido(x.c)); const val = ajenos.find((x) => dvRut(x.c) === x.d);
  if (val) r.rut = `${val.c}-${val.d}`; else if (ajenos.length) { r.rut = `${ajenos[0].c}-${ajenos[0].d}`; r.avisos.push('RUT del emisor dudoso'); }
  const raz = lineas.find((l) => /\b([S5]\.\s?A\b\.?|SPA|LTDA|LIMITADA|E\.?I\.?R\.?L)/i.test(l) && !/\d{6,}/.test(l));
  if (raz) r.razon = raz.replace(/^[^A-Za-zÁÉÍÓÚÑ]+|[^A-Za-zÁÉÍÓÚÑ.)]+$/g, '');
  // 1) neto + IVA (19 %) = total entre todos los montos del texto
  const todos = []; lineas.forEach((l) => montosDe(l).forEach((x) => { if (!todos.includes(x)) todos.push(x); }));
  let mejor = null;
  for (const n of todos) for (const i of todos) if (i < n && Math.abs(Math.round(n * 0.19) - i) <= 1) {
    const t = todos.find((x) => x === n + i) ?? todos.find((x) => Math.abs(x - n - i) <= 1);
    if (t && (!mejor || t > mejor[2])) mejor = [n, i, t];
  }
  if (mejor) { [r.neto, r.iva, r.total] = mejor; return r; }
  // 2) por palabra clave; el total suele repetirse (total, débito, voucher)
  const clave = (re, ex) => { for (const l of lineas) { const u = l.toUpperCase(); if (re.test(u) && !(ex && ex.test(u))) { const ms = montosDe(l); if (ms.length) return ms[ms.length - 1]; } } return null; };
  r.total = clave(/\bTOTAL\b|T\s*O\s*T\s*A\s*L/, /SUB|NETO|IVA/); r.neto = clave(/NETO|COMPRA\b|AFECTO/); r.iva = clave(/\bI\.?\s?V\.?\s?A\b|19\s?[,.]?0*\s?%/); r.exento = clave(/EXENTO|NO AFECTO/);
  const frec = {}; lineas.filter((l) => /TOTAL|MONTO|D[EÉ]BITO|CR[EÉ]DITO|PAGO/i.test(l)).forEach((l) => montosDe(l).forEach((x) => { frec[x] = (frec[x] ?? 0) + 1; }));
  const rep = Object.keys(frec).sort((a, b) => frec[b] - frec[a] || b - a)[0];
  if (rep && frec[rep] > 1) r.total = Number(rep);
  if (r.total == null) r.total = clave(/SUB\s*TOTAL|MONTO/);
  if (r.neto != null && r.total != null && Math.abs(Math.round(r.neto * 0.19) - (r.total - r.neto)) <= 2) r.iva = r.total - r.neto;
  else if (r.iva != null && r.total != null && Math.abs(Math.round((r.total - r.iva) * 0.19) - r.iva) <= 2) r.neto = r.total - r.iva;
  else if (r.neto != null && r.iva != null && Math.abs(Math.round(r.neto * 0.19) - r.iva) <= 2) r.total = r.neto + r.iva;
  else { r.neto = null; r.iva = null; }
  return r;
}

// ---------- PDF e imágenes ----------
export async function paginasPDF(file, max = 3) {
  await cargarScript(LIBS.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const out = [];
  for (let n = 1; n <= Math.min(pdf.numPages, max); n++) {
    const page = await pdf.getPage(n); const vp = page.getViewport({ scale: 2.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(await new Promise((ok) => c.toBlob(ok, 'image/png')));
  }
  return out;
}
export async function aJPEG(blob, max = 1800) {
  const img = await createImageBitmap(blob); const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
}

// ---------- una parte del documento (foto, PDF o XML) ----------
// Devuelve { ted, xml, texto, foto } (foto: JPEG para guardar). avance(texto) informa el progreso.
export async function leerParte(archivo, { avance, propios } = {}) {
  const esXml = /\.xml$/i.test(archivo.name) || /xml/.test(archivo.type);
  const esPdf = /pdf/.test(archivo.type) || /\.pdf$/i.test(archivo.name);
  if (esXml) { const ds = parseXML(await archivo.arrayBuffer()); if (!ds.length) throw new Error('El XML no trae documentos.'); return { xml: ds[0], esXml: true }; }
  const imgs = esPdf ? await paginasPDF(archivo) : [archivo];
  const foto = imgs.length ? await aJPEG(imgs[0]) : null;
  avance?.('Buscando el timbre…');
  let ted = null;
  for (const img of imgs) { if (ted) break; ted = parseTED(await leerTimbreFoto(img)); }
  const textos = [];
  for (const img of imgs) textos.push(await ocr(img, (pc) => avance?.(`Leyendo el texto ${pc}%`)));
  return { ted, texto: textos.join('\n'), foto, esPdf, propios };
}

// ---------- combinar lo leído de todas las partes ----------
// Prioridad: XML > timbre (SII) > texto (revisar) > calculado. origen dice de dónde salió cada dato.
export const CAMPOS_DTE = ['td', 'folio', 'fecha', 'rut', 'razon', 'neto', 'iva', 'exento', 'otros', 'total'];
export function combinar(partes, propios = []) {
  const d = { origen: {}, items: [] };
  const poner = (k, v, o) => { if (v != null && v !== '' && d[k] == null) { d[k] = v; d.origen[k] = o; } };
  const xml = partes.find((p) => p.xml); const ted = partes.find((p) => p.ted);
  const texto = partes.map((p) => p.texto).filter(Boolean).join('\n');
  if (xml) { CAMPOS_DTE.forEach((k) => poner(k, xml.xml[k], 'xml')); d.items = xml.xml.items ?? []; }
  if (ted) { ['td', 'folio', 'fecha', 'rut', 'razon', 'total'].forEach((k) => poner(k, ted.ted[k], 'timbre')); if (!d.items.length && ted.ted.item) d.items = [{ nombre: ted.ted.item }]; }
  const o = texto ? extraer(texto, propios) : { avisos: [] };
  if (d.total != null && o.total != null && o.total !== d.total) { o.neto = null; o.iva = null; }   // el neto del texto solo vale si cuadra
  CAMPOS_DTE.forEach((k) => poner(k, o[k], 'ocr'));
  if (d.total != null && d.neto == null && d.iva == null && d.exento == null) {
    if (EXENTOS.includes(d.td)) poner('exento', d.total, 'calc');
    else if (d.td !== 0) { poner('neto', Math.round(d.total / 1.19), 'calc'); poner('iva', d.total - d.neto, 'calc'); }
  }
  if (d.td == null && texto && /PEDIDO|COMPROBANTE|VOUCHER/i.test(texto) && !/BOLETA|FACTURA/i.test(texto)) poner('td', 0, 'ocr');
  d.texto = texto; d.avisos = o.avisos ?? [];
  return d;
}

// Avisos de revisión: RUT inválido, montos que no cuadran, IVA distinto del 19 %
export function validar(v) {
  const av = [];
  if (v.rut && !rutValido(v.rut)) av.push('El RUT del emisor no es válido (dígito verificador).');
  const n = v.neto ?? 0; const i = v.iva ?? 0; const e = v.exento ?? 0; const o = v.otros ?? 0; const t = v.total;
  if (t != null && (n || i || e || o) && n + i + e + o !== t) av.push(`Neto + IVA + exento + otros no cuadra con el total.`);
  if (n && i && Math.abs(Math.round(n * 0.19) - i) > 1) av.push('El IVA no es el 19 % del neto.');
  if (v.td === 61) av.push('Es una nota de crédito: rebaja una compra. Regístrala como "Otro" y revisa el concepto.');
  return av;
}
