// Firmar un PDF: se sube un PDF (p. ej. la matriz IPER hecha en Excel), sus páginas se muestran como imágenes y encima
// van la firma, el timbre y la firma de la prevencionista guardados, movibles. Al descargar sale página por página, con
// el tamaño y la orientación de cada página. pdf.js 3.11.174 fijo desde cdnjs, se carga solo al usarlo.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

function cargarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = `${PDFJS}pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`; ok(); };
    s.onerror = () => mal(new Error('No se pudo cargar el lector de PDF. Revisa la conexión.'));
    document.head.append(s);
  });
}

// Cada página como imagen, y si su texto tiene un bloque de firmas ("Aprobado por", "Elaborado por"…)
export async function leerPaginas(archivo) {
  await cargarPdfJs();
  const pdf = await window.pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const paginas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const vp = pg.getViewport({ scale: 2 });
    const cv = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const texto = (await pg.getTextContent().catch(() => ({ items: [] }))).items.map((x) => x.str).join(' ');
    paginas.push({ src: cv.toDataURL('image/jpeg', 0.9), w: vp.width, h: vp.height, firma: /aprobado por|firma del|elaborado por|elabor[óo]/i.test(texto) });
  }
  return paginas;
}

// Página donde van las firmas por defecto: la última que tiene un bloque de firmas; si ninguna, la última.
export function paginaFirmas(paginas) {
  for (let k = paginas.length - 1; k >= 0; k--) if (paginas[k].firma) return String(k + 1);
  return String(paginas.length || 1);
}

// HTML del documento: las páginas y, sobre la elegida, las firmas (el editor las vuelve movibles)
export function htmlFirmado(paginas, pagina, firmaPrevHtml, firmaRepHtml) {
  const pf = Number(pagina) || paginas.length;
  return paginas.map((p, k) => `<div class="dg-pag" style="aspect-ratio:${p.w} / ${p.h}"><img class="dg-pag-img" src="${p.src}" alt="">${
    k + 1 === pf ? `<div class="dg-pag-fir">${firmaPrevHtml()}</div><div class="dg-pag-fir dg-pag-rep">${firmaRepHtml()}</div>` : ''}</div>`).join('');
}

// PDF página por página: ancho carta y alto según la proporción de cada página (vertical u horizontal)
export async function pdfFirmado(el, jsPDF) {
  let doc = null;
  for (const p of el.querySelectorAll('.dg-pag')) {
    const cv = await window.html2canvas(p, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const hz = cv.width > cv.height, W = hz ? 279.4 : 215.9, H = W * cv.height / cv.width;
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: hz ? 'l' : 'p', compress: true });
    else doc.addPage([W, H], hz ? 'l' : 'p');
    doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
  }
  return doc;
}
