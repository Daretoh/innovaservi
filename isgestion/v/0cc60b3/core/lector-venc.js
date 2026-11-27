// Lector de vencimientos (migrado de InnovaGestión), todo en el navegador y gratis:
// - Cédula de identidad: reverso (zona MRZ con <<<, trae dígito de control → fecha verificada) o frente
//   (fechas impresas: el vencimiento cae en el cumpleaños y es posterior a la emisión → revisar con la imagen).
// - Cualquier documento (PDF con texto, PDF escaneado o foto): fecha junto a "vence", "válido hasta"…;
//   si solo hay emisión y el tipo tiene vigencia conocida (certificado de vigencia: 30 días) se sugiere.
// Nunca guarda: propone la fecha y la persona la confirma.
const LIBS = {
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  mrz: 'https://cdn.jsdelivr.net/npm/mrz@4.2.1/+esm',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};
const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) cargados.set(src, new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { cargados.delete(src); mal(new Error('No se pudo cargar el lector. Revisa la conexión.')); }; document.head.append(s); }));
  return cargados.get(src);
}
async function pdfjs() {
  if (!window.pdfjsLib) await cargarScript(LIBS.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
  return window.pdfjsLib;
}
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

// ---------- motor de lectura (Tesseract en español y uno para la zona MRZ) ----------
const LEC = {};
function cargarLector() {
  if (LEC.listo) return LEC.listo;
  LEC.listo = (async () => {
    await cargarScript(LIBS.tesseract);
    LEC.mrz = (await import(LIBS.mrz)).parse;
    [LEC.w, LEC.wm] = await Promise.all([window.Tesseract.createWorker('spa'), window.Tesseract.createWorker('eng')]);
    await LEC.wm.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<', tessedit_pageseg_mode: '6' });
  })();
  LEC.listo.catch(() => { LEC.listo = null; });
  return LEC.listo;
}

// Imagen o PDF (archivo o URL) → canvas en gris
async function aCanvas(src) {
  const blob = typeof Blob !== 'undefined' && src instanceof Blob;
  const esPdf = blob ? /pdf/i.test(src.type || '') : /\.pdf(\?|$)/i.test(String(src));
  if (esPdf) {
    const L = await pdfjs();
    const datos = blob ? await src.arrayBuffer() : await (await fetch(src)).arrayBuffer();
    return pagina(await L.getDocument({ data: datos }).promise, 1, 2000);
  }
  const b = blob ? src : await (await fetch(src)).blob();
  const bm = await createImageBitmap(b);
  const s = Math.min(1, 2600 / Math.max(bm.width, bm.height)); const c = document.createElement('canvas');
  c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  const x = c.getContext('2d'); x.filter = 'grayscale(1)'; x.drawImage(bm, 0, 0, c.width, c.height);
  return c;
}
async function pagina(pdf, n, ancho) {
  const pg = await pdf.getPage(n); const v = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: ancho / v.width });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}
function rotar(src, deg) {
  if (!deg) return src;
  const c = document.createElement('canvas'); const s = deg % 180 !== 0; c.width = s ? src.height : src.width; c.height = s ? src.width : src.height;
  const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
function escalar(src, sx, sy, sw, sh, max, filtro) {
  const e = Math.min(2, max / Math.max(sw, sh)); const c = document.createElement('canvas'); c.width = Math.round(sw * e); c.height = Math.round(sh * e);
  const x = c.getContext('2d'); x.filter = filtro; x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
// Recorta la zona clara (la tarjeta) y estira el contraste: ayuda con fotos sobreexpuestas o con fondo oscuro
function tarjeta(src) {
  const w = src.width; const h = src.height; const d = src.getContext('2d').getImageData(0, 0, w, h).data; const L = new Float32Array(w * h); let s = 0;
  for (let i = 0; i < w * h; i++) { L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; s += L[i]; }
  const th = Math.max((s / (w * h)) * 1.15, 110); const rows = []; const cols = new Float32Array(w);
  for (let y = 0; y < h; y++) { let c = 0; for (let k = 0; k < w; k++) if (L[y * w + k] > th) { c++; cols[k]++; } rows.push(c / w > 0.25); }
  const cs = Array.from(cols, (v) => v / h > 0.25);
  let y0 = rows.indexOf(true); let y1 = rows.lastIndexOf(true); let x0 = cs.indexOf(true); let x1 = cs.lastIndexOf(true);
  if (y0 < 0 || x0 < 0 || y1 - y0 < h * 0.15 || x1 - x0 < w * 0.15) { y0 = 0; y1 = h - 1; x0 = 0; x1 = w - 1; }
  const o = escalar(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 1800, 'none'); const ox = o.getContext('2d'); const im = ox.getImageData(0, 0, o.width, o.height); const p = im.data;
  const hist = new Uint32Array(256); const N = p.length / 4; let acc = 0; let lo = 0; let hi = 255;
  for (let i = 0; i < p.length; i += 4) { const v = Math.round(p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11); p[i] = v; hist[v]++; }
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc < N * 0.02) lo = v; if (acc < N * 0.97) hi = v; }
  for (let i = 0; i < p.length; i += 4) { const q = Math.max(0, Math.min(1, (p[i] - lo) / Math.max(1, hi - lo))); p[i] = p[i + 1] = p[i + 2] = q ** 1.6 * 255; }
  ox.putImageData(im, 0, 0);
  return o;
}
// Variantes de la imagen, de la más barata a la más costosa: completa, tarjeta recortada y franjas; en 4 rotaciones
function variantes(src) {
  const L = [];
  for (const g of [0, 90, 270, 180]) {
    L.push(() => { const r = rotar(src, g); return escalar(r, 0, 0, r.width, r.height, 2000, 'grayscale(1) contrast(1.4)'); });
    L.push(() => tarjeta(rotar(src, g)));
    for (const [a, b] of [[0, 0.55], [0.22, 0.78], [0.45, 1]]) {
      L.push(() => { const r = rotar(src, g); const v = r.width > r.height * 1.15;
        return v ? escalar(r, a * r.width, 0, (b - a) * r.width, r.height, 1800, 'grayscale(1) contrast(1.5)') : escalar(r, 0, a * r.height, r.width, (b - a) * r.height, 1800, 'grayscale(1) contrast(1.5)'); });
    }
  }
  return L;
}

// ---------- cédula ----------
const MES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
function fechasCedula(t) {
  const r = []; const s = t.toUpperCase().replace(/(\d)O/g, '$10').replace(/O(\d)/g, '0$1');
  for (const x of s.match(/\b(\d{1,2})[\s.,-]*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*[\s.,-]*(\d{4})\b/g) ?? []) {
    const m = x.match(/(\d{1,2})[\s.,-]*([A-Z]+)[\s.,-]*(\d{4})/); const mm = MES[m[2].slice(0, 3)];
    if (mm && Number(m[1]) >= 1 && Number(m[1]) <= 31) r.push(`${m[3]}-${String(mm).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`);
  }
  return r;
}
const rutsDe = (t) => (t.match(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]\b/g) ?? []).map((x) => x.replace(/[^\dkK]/g, '').toLowerCase());
// Frente: nacimiento = la más antigua; vencimiento = la más nueva en el día del cumpleaños; emisión entre ambas
function frente(t) {
  const f = [...new Set(fechasCedula(t))].sort(); const nac = f[0]; if (!nac) return null;
  const otras = f.filter((d) => d > nac); const cand = otras.filter((d) => d.slice(5) === nac.slice(5)); const venc = cand.length ? cand[cand.length - 1] : null;
  const emis = otras.filter((d) => d !== venc).pop() ?? null; const y = (s) => Number(s.slice(0, 4));
  return { nac, emis, venc, ok: !!venc && !!emis && emis < venc && y(venc) - y(emis) <= 11 && y(venc) - y(nac) >= 5, ruts: rutsDe(t), fuente: 'frente' };
}
function mrz(t) {
  const ls = t.split('\n').map((l) => l.replace(/\s/g, '')).filter((l) => l.length >= 25 && l.includes('<'));
  for (let i = 0; i + 3 <= ls.length; i++) {
    const tri = ls.slice(i, i + 3).map((l) => `${l}<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`.slice(0, 30));
    try {
      const r = LEC.mrz(tri, { autocorrect: true }); const F = r?.fields; if (!F?.expirationDate) continue;
      const malo = (r.details ?? []).some((d) => d.field === 'expirationDate' && !d.valid) || !F.expirationDateCheckDigit; if (malo) continue;
      // RUN en la línea 2, tras "CHL" (el OCR suele confundir 1 con I/L y 0 con O)
      const e = F.expirationDate; const z = (tri[1].split('CHL')[1] ?? '').replace(/[IL]/g, '1').replace(/O/g, '0'); const mr = /^(\d{7,8})<*([0-9K])/.exec(z);
      return { venc: `20${e.slice(0, 2)}-${e.slice(2, 4)}-${e.slice(4, 6)}`, ok: true, seguro: true, ruts: mr ? [(mr[1] + mr[2]).toLowerCase()] : [], fuente: 'mrz' };
    } catch { /* sigue */ }
  }
  return null;
}
async function leerUna(src, prog) {
  const V = variantes(src); let mejor = null; const t0 = Date.now();
  for (let i = 0; i < V.length && Date.now() - t0 < 70000; i++) {
    prog?.(i + 1, V.length);
    const img = V[i](); const t = (await LEC.w.recognize(img)).data.text || '';
    if (/<{3,}/.test(t)) { const m = mrz((await LEC.wm.recognize(img)).data.text || ''); if (m) return m; continue; }
    const f = frente(t); if (f?.ok) return f; if (f?.venc && !mejor) mejor = f;
  }
  return mejor;
}
// fuentes: [reverso, frente] (archivo o URL). Devuelve { venc, fuente: 'mrz'|'frente', seguro, rutOk } o null
export async function leerVencCedula(fuentes, rut, prog) {
  const F = (fuentes ?? []).filter(Boolean); const rn = String(rut ?? '').replace(/[^\dkK]/g, '').toLowerCase(); let mejor = null;
  prog?.('Preparando el lector (la primera vez tarda un poco)…');
  await cargarLector();
  for (let n = 0; n < F.length; n++) {
    let r = null;
    try { r = await leerUna(await aCanvas(F[n]), (a, b) => prog?.(`Leyendo imagen ${n + 1}${F.length > 1 ? ` de ${F.length}` : ''} · intento ${a} de ${b}`)); } catch { r = null; }
    if (r) {
      const cuerpo = rn.slice(0, -1);
      r.rutOk = rn && r.ruts.length ? r.ruts.some((x) => { const c = x.slice(0, -1); return c === cuerpo || (c.length >= 7 && cuerpo.slice(-c.length) === c); }) : null;
      if (r.seguro) return r;
      if (!mejor || (r.ok && !mejor.ok)) mejor = r;
    }
  }
  return mejor;
}
export function resumenCedula(r) {
  if (!r?.venc) return { texto: 'No se pudo leer la fecha. Escríbela a mano mirando el carnet.', clase: 'mal' };
  const base = r.fuente === 'mrz' ? 'Leído del reverso (zona MRZ con dígito de control): fecha verificada.' : r.ok ? 'Leído del frente: confirma que coincida con la imagen.' : 'Lectura dudosa del frente: revisa con la imagen.';
  const rt = r.rutOk === true ? ' El RUN coincide con la ficha.' : r.rutOk === false ? ' Atención: el RUN leído no coincide con la ficha.' : '';
  return { texto: base + rt, clase: r.fuente === 'mrz' && r.rutOk !== false ? 'ok' : 'prox' };
}

// ---------- cualquier documento ----------
const VMES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
// Vigencias conocidas cuando el documento no trae vencimiento (clave = tipo del documento)
export const REGLAS_VIGENCIA = { vigencia: { dias: 30, texto: 'El certificado de vigencia no trae vencimiento: se sugieren 30 días desde su emisión (ajústalo si el mandante pide otro plazo).' } };
const iso = (y, mo, d) => { y = Number(y); if (y < 100) y += 2000; mo = Number(mo); d = Number(d); if (!(y >= 1990 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
function fechas(t) {
  const s = String(t ?? '').toLowerCase().replace(/[º°]/g, ' '); const out = [];
  const R = [
    [/\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})\b/g, (m) => iso(m[3], m[2], m[1])],
    [/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/g, (m) => iso(m[1], m[2], m[3])],
    [/\b(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,10})\.?\s*(?:del?\s+)?(\d{4})\b/g, (m) => { const mo = VMES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')]; return mo ? iso(m[3], mo, m[1]) : null; }],
    [/\b(\d{1,2})\s+del?\s+(\d{1,2})\s+del?\s+(\d{4})\b/g, (m) => iso(m[3], m[2], m[1])],
  ];
  for (const [re, f] of R) { re.lastIndex = 0; let m; while ((m = re.exec(s))) { const x = f(m); if (x) out.push({ f: x, i: m.index }); } }
  return out.sort((a, b) => a.i - b.i);
}
export function vencDesdeTexto(t, tipo) {
  const F = fechas(t); if (!F.length) return null;
  const s = String(t).toLowerCase(); let m; const cand = []; let emi = null;
  const KEY = /(fecha\s+de\s+(vencimiento|expiraci[oó]n|caducidad)|vencimiento|vence|v[aá]lid[oa]\s+hasta|vigen(cia|te)\s+hasta|hasta\s+el|\bhasta\b|expira|caduca)/gi;
  while ((m = KEY.exec(s))) { const fin = m.index + m[0].length; const d = F.find((x) => x.i >= fin - 1 && x.i - fin <= 90); if (d) cand.push(d.f); }
  const EMI = /(fecha\s+de\s+emisi[oó]n(\s+del\s+certificado)?|emitid[oa]|emisi[oó]n|fecha\s+del\s+certificado|en\s+santiago|santiago,|puerto\s+montt,)/gi;
  while ((m = EMI.exec(s))) { const f2 = m.index + m[0].length; const e = F.find((x) => x.i >= f2 - 1 && x.i - f2 <= 60); if (e) { emi = e.f; break; } }
  if (cand.length) { cand.sort(); return { venc: cand[cand.length - 1], emis: emi, modo: 'explicita' }; }
  const R = REGLAS_VIGENCIA[tipo];
  if (R) { const base = emi ?? F.map((x) => x.f).sort().pop(); const d2 = new Date(`${base}T12:00:00`); d2.setDate(d2.getDate() + R.dias); return { venc: iso(d2.getFullYear(), d2.getMonth() + 1, d2.getDate()), emis: base, modo: 'regla', texto: R.texto }; }
  const fut = [...new Set(F.map((x) => x.f).filter((f) => f > hoyISO()))];
  if (fut.length === 1) return { venc: fut[0], emis: emi, modo: 'futura' };
  return emi ? { venc: null, emis: emi, modo: 'emision' } : null;
}
async function ocrGiros(c) {
  await cargarLector(); let ult = '';
  for (const g of [0, 90, 270]) {
    const r = rotar(c, g); const t = (await LEC.w.recognize(escalar(r, 0, 0, r.width, r.height, 2200, 'grayscale(1) contrast(1.35)'))).data.text || '';
    ult ||= t; if (fechas(t).length) return { t, ocr: true };
  }
  return { t: ult, ocr: true };
}
async function textoDe(src, prog) {
  const blob = typeof Blob !== 'undefined' && src instanceof Blob;
  const esPdf = blob ? /pdf/i.test(src.type || '') : /\.pdf(\?|$)/i.test(String(src));
  if (esPdf) {
    const L = await pdfjs(); const p = await L.getDocument({ data: blob ? await src.arrayBuffer() : await (await fetch(src)).arrayBuffer() }).promise;
    let txt = '';
    for (let k = 1; k <= Math.min(p.numPages, 3); k++) txt += ` ${(await (await p.getPage(k)).getTextContent()).items.map((x) => x.str).join(' ')}`;
    if (txt.replace(/\s/g, '').length > 40) return { t: txt, ocr: false };
    prog?.('PDF escaneado: leyendo la imagen…');
    return ocrGiros(await pagina(p, 1, 2000));
  }
  prog?.('Leyendo la imagen (la primera vez tarda un poco)…');
  return ocrGiros(await aCanvas(src));
}
// Vencimiento de un documento (archivo o URL). tipo: clave del documento (para reglas como la del certificado de vigencia)
export async function leerVencDoc(src, tipo, prog) {
  prog?.('Leyendo el documento…');
  const r = await textoDe(src, prog); const x = vencDesdeTexto(r.t, tipo); if (x) x.ocr = r.ocr;
  return x;
}
export function resumenDoc(x) {
  const f = (d) => d.split('-').reverse().join('-');
  if (!x) return { texto: 'No se encontraron fechas en el documento. Escríbela a mano.', clase: 'mal' };
  if (!x.venc) return { texto: `El documento no indica vencimiento${x.emis ? ` (emitido el ${f(x.emis)})` : ''}. Escríbelo si corresponde.`, clase: 'prox' };
  if (x.modo === 'regla') return { texto: `${x.texto}${x.emis ? ` Emitido el ${f(x.emis)}.` : ''}`, clase: 'prox' };
  if (x.modo === 'futura') return { texto: 'El documento no dice "vence"; se propone su única fecha futura. Revísala.', clase: 'prox' };
  return x.ocr ? { texto: 'Leída de la imagen: confírmala con el documento.', clase: 'prox' } : { texto: 'Fecha de vencimiento leída del documento.', clase: 'ok' };
}
