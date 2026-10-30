// Utilidades de imágenes compartidas por los módulos.
// Fotos de iPhone (HEIC/HEIF): el PC no las muestra, así que se convierten a JPEG en el navegador (heic2any, versión
// fija desde CDN, se carga solo cuando hace falta). Escáner: varias fotos (ej. cédula por ambos lados) → un PDF.

const HEIC2ANY = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
let cargaHeic = null;

export const esHeic = (f) => /heic|heif/i.test(f?.type || '') || /\.(heic|heif)$/i.test(f?.name || '');
// Algunos celulares mandan el tipo vacío: se mira también la extensión
export const esImagen = (f) => (f?.type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(f?.name || '');
export const esPdf = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '');

function cargarHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  cargaHeic ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = HEIC2ANY; s.async = true;
    s.onload = () => (window.heic2any ? ok(window.heic2any) : mal(new Error('No se pudo cargar el conversor de fotos.')));
    s.onerror = () => { cargaHeic = null; mal(new Error('No se pudo cargar el conversor de fotos. Revisa la conexión.')); };
    document.head.append(s);
  });
  return cargaHeic;
}

// Foto HEIC → JPEG (otras imágenes quedan igual). Si no se puede convertir, devuelve el original.
export async function aJpeg(archivo) {
  if (!esHeic(archivo)) return archivo;
  try {
    const heic2any = await cargarHeic2any();
    const r = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(r) ? r[0] : r;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}

// Achica una foto antes de subirla (lado mayor 1600 px, JPEG 82 %): pesa ~10 veces menos y basta para el informe.
// Las HEIC se convierten primero a JPEG.
export async function comprimirFoto(archivo, lado = 1600) {
  if (esHeic(archivo)) archivo = await aJpeg(archivo);
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/gif') return archivo;
  const bmp = await createImageBitmap(archivo).catch(() => null);
  if (!bmp) return archivo;
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  if (!blob || blob.size >= archivo.size) return archivo;
  return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// Escáner (como en InnovaGestión): varias fotos → un PDF, una foto por página (carta, centrada). Las fotos se
// achican antes; las que no se pueden leer se omiten. Devuelve un File application/pdf.
export async function fotosAPdf(fotos, nombre = 'documento') {
  const { cargarJsPdf } = await import('./pdf.js?v=81adf5e');
  const jsPDF = await cargarJsPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let paginas = 0;
  for (const f of fotos) {
    const jpg = await comprimirFoto(f, 2000);
    const bmp = await createImageBitmap(jpg).catch(() => null);
    if (!bmp) continue;
    const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(jpg); });
    if (paginas) doc.addPage();
    const pw = doc.internal.pageSize.getWidth(); const ph = doc.internal.pageSize.getHeight(); const m = 18;
    const k = Math.min((pw - 2 * m) / bmp.width, (ph - 2 * m) / bmp.height);
    doc.addImage(url, jpg.type === 'image/png' ? 'PNG' : 'JPEG', (pw - bmp.width * k) / 2, (ph - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    paginas += 1;
  }
  if (!paginas) throw new Error('No se pudieron leer las fotos. Intenta con otras.');
  return new File([doc.output('blob')], `${nombre.replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' });
}

// Lo que se sube desde un campo de archivo: una foto (HEIC → JPEG), un PDF tal cual o varias fotos → un PDF.
export async function prepararArchivos(lista) {
  const archivos = [...lista].filter((f) => f && f.size);
  if (!archivos.length) return null;
  if (archivos.length === 1) return aJpeg(archivos[0]);
  if (archivos.some((f) => !esImagen(f))) throw new Error('Para juntar varias páginas en un PDF, elige solo fotos (un PDF se sube solo).');
  return fotosAPdf(archivos, archivos[0].name);
}
