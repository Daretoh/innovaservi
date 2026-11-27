// Formatos del cliente (SST 009): el PDF original del cliente (ej.: AST y permiso de trabajo crítico de Cermaq) con campos
// para rellenar encima. Al imprimir se escribe sobre el original: queda el formato del cliente tal cual, sin nada de
// ISgestión. pdf.js 3.11.174 (ver y detectar) y pdf-lib 1.17.1 (escribir), desde cdnjs, se cargan solo al usarlos.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

const script = (src) => new Promise((ok, mal) => {
  const s = document.createElement('script'); s.src = src;
  s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de PDF. Revisa la conexión.'));
  document.head.append(s);
});
export async function cargarPdfJs() {
  if (!window.pdfjsLib) await script(PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}
export async function cargarPdfLib() { if (!window.PDFLib) await script(PDFLIB); return window.PDFLib; }

// Datos que un campo puede proponer solo al rellenar desde una faena
export const DATOS = [
  ['', 'Ninguno (se escribe a mano)'], ['fecha', 'Fecha'], ['hora_inicio', 'Hora de inicio'], ['hora_termino', 'Hora de término'],
  ['empresa', 'Empresa contratista (nombre)'], ['empresa_rut', 'Empresa contratista (nombre y RUT)'], ['descripcion', 'Descripción del trabajo (faena y tareas)'],
  ['lugar', 'Lugar o instalación'], ['supervisor', 'Supervisor de la faena'], ['prevencionista', 'Prevencionista'],
  ['marca_si', 'Casilla marcada siempre (✓), ej.: Personal contratista'],
  ...Array.from({ length: 12 }, (_, i) => [`trab_nombre_${i + 1}`, `Trabajador ${i + 1}: nombre`]),
  ...Array.from({ length: 12 }, (_, i) => [`trab_rut_${i + 1}`, `Trabajador ${i + 1}: RUT`]),
];
export const MARCAS = { si: '✓', no: 'x', na: 'N' };
export const SIGUIENTE_MARCA = { '': 'si', si: 'no', no: 'na', na: '' };

// ---------- Detección de campos (como el análisis de los formatos de Cermaq) ----------
// Celdas vacías: zonas blancas encerradas por líneas largas, sin texto ni imagen adentro. Chicas = casilla para marcar.
// Subrayados ("Nombre: ______"): línea horizontal larga sin borde encima = campo de texto sobre la línea.
export async function detectarCampos(bytes, alProgreso = null) {
  const L = await cargarPdfJs();
  const pdf = await L.getDocument({ data: bytes.slice(0) }).promise;
  const paginas = []; const campos = [];
  for (let pi = 0; pi < pdf.numPages; pi++) {
    alProgreso?.(`Buscando campos: página ${pi + 1} de ${pdf.numPages}…`);
    const pg = await pdf.getPage(pi + 1);
    const vp1 = pg.getViewport({ scale: 1 });
    paginas.push([vp1.width, vp1.height]);
    const E = 2; const vp = pg.getViewport({ scale: E });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.fillStyle = '#fff'; c2.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: c2, viewport: vp }).promise;
    const { data } = c2.getImageData(0, 0, cv.width, cv.height);
    const W = cv.width, H = cv.height, N = W * H;
    const oscuro = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const g = data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11; oscuro[i] = g < 200 ? 1 : 0; }
    // Líneas: tramos oscuros de 8 pt o más (también los bordes de casillas chicas de 9 pt)
    const linea = new Uint8Array(N); const horiz = new Uint8Array(N);
    const minH = 8 * E, minV = 8 * E;
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!oscuro[y * W + x]) { x++; continue; } let f = x; while (f < W && oscuro[y * W + f]) f++; if (f - x >= minH) for (let k = x; k < f; k++) { linea[y * W + k] = 1; horiz[y * W + k] = 1; } x = f; } }
    for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!oscuro[y * W + x]) { y++; continue; } let f = y; while (f < H && oscuro[f * W + x]) f++; if (f - y >= minV) for (let k = y; k < f; k++) linea[k * W + x] = 1; y = f; } }
    // Engrosar las líneas un pixel (cierra rendijas)
    const borde = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (linea[i] || linea[i - 1] || linea[i + 1] || linea[i - W] || linea[i + W]) borde[i] = 1; }
    // Zonas libres (componentes conexas) con su caja y cuántos pixeles oscuros que no son línea tienen adentro
    const etiqueta = new Int32Array(N); const cola = new Int32Array(N); let n = 0;
    const zonas = [];
    for (let s = 0; s < N; s++) {
      if (borde[s] || etiqueta[s]) continue;
      n++; let ini = 0, fin = 0; cola[fin++] = s; etiqueta[s] = n;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0, tinta = 0;
      while (ini < fin) {
        const i = cola[ini++]; const x = i % W, y = (i / W) | 0; area++;
        if (oscuro[i]) tinta++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !borde[i - 1] && !etiqueta[i - 1]) { etiqueta[i - 1] = n; cola[fin++] = i - 1; }
        if (x < W - 1 && !borde[i + 1] && !etiqueta[i + 1]) { etiqueta[i + 1] = n; cola[fin++] = i + 1; }
        if (y > 0 && !borde[i - W] && !etiqueta[i - W]) { etiqueta[i - W] = n; cola[fin++] = i - W; }
        if (y < H - 1 && !borde[i + W] && !etiqueta[i + W]) { etiqueta[i + W] = n; cola[fin++] = i + W; }
      }
      zonas.push({ x0, y0, x1, y1, area, tinta });
    }
    const PT = (v) => Math.round((v / E) * 10) / 10;
    for (const z of zonas) {
      const w = z.x1 - z.x0 + 1, h = z.y1 - z.y0 + 1;
      if (w >= W * 0.9 || h >= H * 0.6) continue;                    // fondo de la página
      if (z.area < 0.85 * w * h) continue;                            // no es rectangular
      if (w < 7 * E || h < 6 * E) continue;
      if (z.tinta > Math.max(4, z.area * 0.002)) continue;            // tiene texto o imagen
      if (z.y0 < 28 * E) continue;                                    // margen superior
      const r = { x: PT(z.x0), y: PT(z.y0), w: PT(w), h: PT(h) };
      if (r.h < 9 && r.w > 200) continue;                             // franja delgada entre tablas
      campos.push({ pagina: pi, ...r, tipo: r.w <= 40 && r.h <= 30 ? 'marca' : r.h >= 30 ? 'multilinea' : 'texto' });
    }
    // Subrayados
    for (let y = 2; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!horiz[y * W + x] || horiz[(y - 1) * W + x]) { x++; continue; }
        let f = x; while (f < W && horiz[y * W + f]) f++;
        const largo = f - x;
        if (largo >= 40 * E) {
          // ¿Hay otra línea o tinta justo encima? Entonces es borde de una celda o tiene texto
          let ocupado = false;
          for (let yy = Math.max(0, y - 24); yy < y - 2 && !ocupado; yy++) for (let xx = x + 4; xx < f - 4; xx += 2) if (oscuro[yy * W + xx]) { ocupado = true; break; }
          const r = { x: PT(x), y: PT(y) - 13, w: PT(largo), h: 13 };
          if (!ocupado && !campos.some((c) => c.pagina === pi && Math.abs(c.y + c.h - (r.y + 13)) < 4 && c.x < r.x + r.w && c.x + c.w > r.x)) campos.push({ pagina: pi, ...r, tipo: 'texto', linea: true });
        }
        x = f;
      }
    }
  }
  campos.sort((a, b) => a.pagina - b.pagina || Math.round(a.y / 4) - Math.round(b.y / 4) || a.x - b.x);
  campos.forEach((c, i) => { c.id = `c${i + 1}`; });
  return { paginas, campos };
}

// ---------- PDF rellenado: el original con lo escrito encima ----------
export async function pdfRellenado(bytes, formato, llenado) {
  const L = await cargarPdfLib();
  const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
  const f = await doc.embedFont(L.StandardFonts.Helvetica);
  const paginas = doc.getPages();
  const tinta = L.rgb(0.05, 0.1, 0.35);
  const ansi = (s) => String(s ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ\n]/g, '');
  const escribir = (pg, x, y, w, h, texto, multilinea) => {
    const alto = pg.getHeight();
    let tam = Math.min(10, Math.max(6, h * 0.62));
    const lineas = () => {
      const out = [];
      for (const parrafo of ansi(texto).split('\n')) {
        let actual = '';
        for (const p of parrafo.split(/\s+/)) {
          const prueba = actual ? `${actual} ${p}` : p;
          if (f.widthOfTextAtSize(prueba, tam) > w - 3 && actual) { out.push(actual); actual = p; } else actual = prueba;
        }
        out.push(actual);
      }
      return out;
    };
    if (!multilinea) {
      const t = ansi(texto).replace(/\n/g, ' ');
      while (f.widthOfTextAtSize(t, tam) > w - 3 && tam > 5) tam -= 0.25;
      pg.drawText(t, { x: x + 1.5, y: alto - y - h / 2 - tam * 0.35, size: tam, font: f, color: tinta });
      return;
    }
    let ls = lineas();
    while (ls.length * tam * 1.15 > h - 2 && tam > 5) { tam -= 0.25; ls = lineas(); }
    ls.forEach((l, i) => pg.drawText(l, { x: x + 2, y: alto - y - 2 - tam * (i + 1) * 1.15 + tam * 0.25, size: tam, font: f, color: tinta }));
  };
  const marca = (pg, c, v) => {
    const alto = pg.getHeight();
    const s = Math.min(c.w, c.h) * 0.6; const cx = c.x + c.w / 2, cy = alto - (c.y + c.h / 2);
    const g = { thickness: Math.max(0.9, s / 8), color: tinta };
    if (v === 'si') { pg.drawLine({ start: { x: cx - s / 2, y: cy }, end: { x: cx - s / 8, y: cy - s / 2.4 }, ...g }); pg.drawLine({ start: { x: cx - s / 8, y: cy - s / 2.4 }, end: { x: cx + s / 2, y: cy + s / 2 }, ...g }); }
    else if (v === 'no') { pg.drawLine({ start: { x: cx - s / 2.5, y: cy - s / 2.5 }, end: { x: cx + s / 2.5, y: cy + s / 2.5 }, ...g }); pg.drawLine({ start: { x: cx - s / 2.5, y: cy + s / 2.5 }, end: { x: cx + s / 2.5, y: cy - s / 2.5 }, ...g }); }
    else if (v === 'na') { const t = Math.min(10, s * 1.2); pg.drawText('N', { x: cx - f.widthOfTextAtSize('N', t) / 2, y: cy - t * 0.35, size: t, font: f, color: tinta }); }
  };
  for (const c of formato.campos ?? []) {
    const v = llenado.valores?.[c.id]; const pg = paginas[c.pagina];
    if (!pg || v == null || v === '') continue;
    if (c.tipo === 'marca') marca(pg, c, v); else escribir(pg, c.x, c.y, c.w, c.h, v, c.tipo === 'multilinea');
  }
  for (const x of llenado.extras ?? []) {
    const pg = paginas[x.pagina];
    if (pg && String(x.texto ?? '').trim()) escribir(pg, x.x, x.y, x.w ?? 160, x.h ?? 13, x.texto, (x.h ?? 13) > 20);
  }
  return doc.save();
}

// ---------- Datos propuestos desde una faena-día ----------
export async function datosDeFaena(ctx, faenaId, fecha) {
  const d = { fecha: fecha ? fecha.split('-').reverse().join('-') : '', marca_si: 'si' };
  d.empresa = ctx.empresa.razon_social ?? '';
  d.empresa_rut = [ctx.empresa.razon_social, ctx.empresa.rut ? `RUT ${ctx.empresa.rut}` : null].filter(Boolean).join(' · ');
  const gen = await ctx.api.from('gen_config').select('prevencionista').eq('empresa_id', ctx.empresa.id).maybeSingle().then((r) => r, () => ({ data: null }));
  d.prevencionista = gen.data?.prevencionista ?? '';
  if (!faenaId) return d;
  const [{ data: f }, { data: planes }] = await Promise.all([
    ctx.api.from('ope_faenas').select('titulo, tareas, hora_inicio, hora_fin, tercero_id, sitio_id, ope_sitios(nombre)').eq('id', faenaId).maybeSingle(),
    ctx.api.from('ope_plan').select('fecha, hora_inicio, hora_fin, ope_plan_personas(persona_id, rol)').eq('faena_id', faenaId),
  ]);
  if (!f) return d;
  // La gente del día; si ese día aún no se planifica, la del día planificado más cercano de la misma faena
  const p = (planes ?? []).find((x) => x.fecha === fecha) ?? null;
  const conGente = (planes ?? []).filter((x) => x.ope_plan_personas?.length);
  const dist = (x) => Math.abs(new Date(x.fecha) - new Date(fecha || x.fecha));
  const pg = p?.ope_plan_personas?.length ? p : [...conGente].sort((a, b) => dist(a) - dist(b))[0] ?? null;
  if (pg && pg !== p) d.gente_de = pg.fecha;
  const hh = (t) => String(t ?? '').slice(0, 5);
  d.hora_inicio = hh(p?.hora_inicio ?? f.hora_inicio); d.hora_termino = hh(p?.hora_fin ?? f.hora_fin);
  d.lugar = f.ope_sitios?.nombre ?? '';
  d.descripcion = [f.titulo, ...(f.tareas ?? [])].filter(Boolean).join('. ');
  d.personas = [];
  const ids = (pg?.ope_plan_personas ?? []).map((x) => x.persona_id);
  if (ids.length) {
    const [{ data: ps }, { data: vs }] = await Promise.all([
      ctx.api.from('personas').select('id, nombres, apellido_paterno, apellido_materno, rut').in('id', ids),
      ctx.api.from('persona_empresa').select('persona_id, cargo').eq('empresa_id', ctx.empresa.id).in('persona_id', ids).is('deleted_at', null),
    ]);
    const nombre = (x) => [x.nombres, x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' ');
    // Supervisor del formato: el supervisor de la faena o, si no hay, el capataz (Faenas 008)
    const peso = (x) => ({ sup: 0, cap: 1 })[x.rol] ?? 2;
    const orden = [...(pg.ope_plan_personas ?? [])].sort((a, b) => peso(a) - peso(b));
    const sup = orden.find((x) => x.rol === 'sup') ?? orden.find((x) => x.rol === 'cap');
    if (sup) d.supervisor = nombre(ps.find((x) => x.id === sup.persona_id) ?? {});
    orden.forEach((x) => {
      const q = (ps ?? []).find((y) => y.id === x.persona_id); if (!q) return;
      d.personas.push({ id: q.id, nombre: nombre(q), rut: q.rut ?? '', cargo: (vs ?? []).find((v) => v.persona_id === q.id)?.cargo ?? '', rol: x.rol });
    });
    d.personas.forEach((q, i) => { d[`trab_nombre_${i + 1}`] = q.nombre; d[`trab_rut_${i + 1}`] = q.rut; });
  }
  return d;
}

// Faenas de unos días (para elegir a cuál va un formato): [{ faenaId, fecha, titulo, tercero_id }]
export async function faenasCercanas(ctx, { desde, hasta, terceroId = null } = {}) {
  let q = ctx.api.from('ope_faenas').select('id, titulo, fecha_inicio, fecha_fin, dias, tercero_id').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
    .lte('fecha_inicio', hasta).gte('fecha_fin', desde).order('fecha_inicio');
  if (terceroId) q = q.eq('tercero_id', terceroId);
  const { data } = await q;
  const out = [];
  for (const f of data ?? []) {
    for (let t = new Date(`${f.fecha_inicio < desde ? desde : f.fecha_inicio}T12:00`); ; t.setDate(t.getDate() + 1)) {
      const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      if (iso > hasta || iso > f.fecha_fin) break;
      if (!f.dias?.length || f.dias.includes(iso)) out.push({ faenaId: f.id, fecha: iso, titulo: f.titulo, tercero_id: f.tercero_id });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.titulo).localeCompare(String(b.titulo)));
}
