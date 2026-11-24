// Entrega individual de documentos (pedido de Enzo, 2026-11-23): cada trabajador recibe su propio PDF con cada documento
// completo (Matriz IPER, Inventario de riesgos, cada PTS, PTS acorde al cargo, IRL…) y, al pie de la última hoja de cada
// uno, la recepción con su casilla de firma (nombre, RUT y cargo) y la firma del relator. Se guarda un registro de entrega
// por trabajador y se envía a firmar por WhatsApp: con una sola firma su sello queda bajo cada documento (función firmar).
// Los documentos salen de Prevención SST → Documentos preventivos (última versión en PDF) o de un PDF que se sube aquí.
// pdf-lib 1.17.1 fijo desde cdnjs, se carga solo al usarlo.
import { el } from '../../core/ui/dom.js?v=6df4ca6';
import { icono } from '../../core/ui/iconos.js?v=6df4ca6';
import { boton } from '../../core/ui/tabla.js?v=6df4ca6';
import { avisar } from '../../core/ui/aviso.js?v=6df4ca6';
import { hoyISO, fechaLarga } from '../../core/ui/formato.js?v=6df4ca6';
import { urlFirmada, subirArchivo, eliminarArchivo } from '../../core/adjuntos.js?v=6df4ca6';
import { enviarVarios } from '../../core/firmas.js?v=6df4ca6';
import { cargarPlantillas, pdfDePlantilla } from '../documentos/editor.js?v=6df4ca6';

const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const MM = 72 / 25.4;
// Alto de la franja de recepción (pt por cada 612 pt de ancho). Bajo las casillas queda libre el pie, donde la función
// firmar escribe la nota de la firma electrónica (a 8,8 mm del borde).
const ALTO_FRANJA = 178;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nombreDe = (p) => [p?.nombres, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(' ');
const rutDe = (r) => {
  const s = String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase(); if (s.length < 2) return r ?? '';
  return `${s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${s.slice(-1)}`;
};
// Solo caracteres que la fuente estándar del PDF sabe escribir
const ansi = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•·]/g, '·')
  .replace(/[^\x20-\x7E\xA0-\xFF·]/g, '');

function cargarPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = PDFLIB;
    s.onload = () => ok(window.PDFLib);
    s.onerror = () => mal(new Error('No se pudo cargar el armador de PDF. Revisa la conexión.'));
    document.head.append(s);
  });
}
const colorDe = (hex, L) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0x1d2b55; return L.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };

// Líneas que caben en un ancho
function partir(texto, fuente, tam, ancho) {
  const out = []; let linea = '';
  for (const p of texto.split(' ')) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) { out.push(linea); linea = p; } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}
function centrado(pg, texto, cx, y, fuente, tam, color, ancho) {
  const t = ansi(texto); let k = tam;
  while (ancho && fuente.widthOfTextAtSize(t, k) > ancho && k > tam * 0.6) k -= tam * 0.04;
  pg.drawText(t, { x: cx - fuente.widthOfTextAtSize(t, k) / 2, y, size: k, font: fuente, color });
}

// Agrega el documento (todas sus hojas) y, al pie de la última, la recepción. Devuelve la casilla del trabajador (mm desde arriba a la izquierda).
async function agregarDocumento(L, salida, bytes, doc, t, rel, F, fecha, color) {
  const fuente = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
  const n = fuente.getPageCount();
  // Todas las hojas se copian de una vez (las imágenes compartidas van una sola vez); la última se alarga hacia abajo:
  // su contenido sube y abajo queda la franja de recepción, con el origen en 0 (así lo espera la función firmar).
  const copias = await salida.copyPages(fuente, [...Array(n).keys()]);
  for (const c of copias) salida.addPage(c);
  let pg = copias[n - 1];
  const mb = pg.getMediaBox();
  let W = mb.width, H = mb.height;
  const k0 = W / 612, S0 = ALTO_FRANJA * k0;
  if ((pg.getRotation()?.angle ?? 0) % 360 === 0) {
    pg.setMediaBox(0, 0, W, H + S0); pg.setCropBox(0, 0, W, H + S0);
    pg.translateContent(-mb.x, S0 - mb.y);
    // pdf-lib deja su propio bloque de dibujo dentro de lo trasladado: se empieza uno nuevo para que la franja no se corra
    pg.contentStream = undefined; pg.contentStreamRef = undefined;
  } else {
    // Hoja girada: se dibuja como imagen vectorial en una hoja nueva
    salida.removePage(salida.getPageCount() - 1);
    const [emb] = await salida.embedPdf(fuente, [n - 1]);
    W = emb.width; H = emb.height;
    pg = salida.addPage([W, H + W / 612 * ALTO_FRANJA]);
    pg.drawPage(emb, { x: 0, y: W / 612 * ALTO_FRANJA, width: W, height: H });
  }
  const k = W / 612, S = ALTO_FRANJA * k;
  const m = 22 * k, gris = L.rgb(0.3, 0.32, 0.38), negro = L.rgb(0.08, 0.08, 0.1), blanco = L.rgb(1, 1, 1);
  // Banda con el nombre del documento
  pg.drawRectangle({ x: m, y: S - 22 * k, width: W - 2 * m, height: 15 * k, color });
  pg.drawText(ansi(`RECEPCIÓN DEL DOCUMENTO · ${[doc.codigo, doc.titulo].filter(Boolean).join(' · ')}${doc.version ? ` · Versión ${doc.version}` : ''}`).slice(0, 140),
    { x: m + 6 * k, y: S - 17.5 * k, size: 7.6 * k, font: F.b, color: blanco });
  const decl = ansi(`Declaro haber recibido este documento y que se me explicó su contenido, los riesgos y las medidas de control que aplican a mis tareas (D.S. N° 44/2024 y Ley N° 16.744). Me comprometo a cumplirlo. Fecha de entrega: ${fechaLarga(fecha)}.`);
  let y = S - 31 * k;
  for (const l of partir(decl, F.r, 7 * k, W - 2 * m - 12 * k)) { pg.drawText(l, { x: m + 6 * k, y, size: 7 * k, font: F.r, color: gris }); y -= 8.6 * k; }
  // Dos casillas: trabajador (su sello va arriba de la línea) y relator
  const gap = 16 * k, bw = (W - 2 * m - gap) / 2, top = y - 2 * k, bot = Math.max(34, 12 * k), bh = top - bot;
  const caja = (x0, titulo, nom, rut, cargo) => {
    pg.drawRectangle({ x: x0, y: bot, width: bw, height: bh, borderColor: color, borderWidth: 0.8 * k });
    pg.drawText(ansi(titulo), { x: x0 + 5 * k, y: top - 9 * k, size: 6.8 * k, font: F.b, color });
    const ly = bot + 27 * k;
    pg.drawLine({ start: { x: x0 + 14 * k, y: ly }, end: { x: x0 + bw - 14 * k, y: ly }, thickness: 0.5 * k, color: gris });
    centrado(pg, nom, x0 + bw / 2, ly - 8.5 * k, F.b, 7.2 * k, negro, bw - 10 * k);
    centrado(pg, rut ? `RUT ${rut}` : '', x0 + bw / 2, ly - 16.5 * k, F.r, 6.8 * k, gris);
    centrado(pg, cargo || '', x0 + bw / 2, ly - 24 * k, F.r, 6.8 * k, gris, bw - 10 * k);
    return { x: x0 + 8 * k, y: ly + 2 * k, w: bw - 16 * k, h: top - 12 * k - (ly + 2 * k) };   // zona de la firma (pt, desde abajo)
  };
  const zt = caja(m, 'FIRMA DEL TRABAJADOR', t.nombre, t.rut, t.cargo);
  const zr = caja(m + bw + gap, 'FIRMA DEL RELATOR', rel?.nombre || '', rel?.rut || '', rel?.cargo || '');
  if (rel?.firma) {
    const img = rel.firma; const e = Math.min(zr.w / img.width, zr.h / img.height);
    pg.drawImage(img, { x: zr.x + (zr.w - img.width * e) / 2, y: zr.y + (zr.h - img.height * e) / 2, width: img.width * e, height: img.height * e });
  }
  const alto = H + S;
  return { pagina: salida.getPageCount() - 1, x: +(zt.x / MM).toFixed(2), y: +((alto - (zt.y + zt.h)) / MM).toFixed(2), w: +(zt.w / MM).toFixed(2), h: +(zt.h / MM).toFixed(2) };
}

async function armarPdf(t, docs, rel, fecha, colorHex) {
  const L = await cargarPdfLib();
  const salida = await L.PDFDocument.create();
  const F = { r: await salida.embedFont(L.StandardFonts.Helvetica), b: await salida.embedFont(L.StandardFonts.HelveticaBold) };
  const color = colorDe(colorHex, L);
  const relF = rel?.firmaBytes ? { ...rel, firma: await salida.embedPng(rel.firmaBytes).catch(() => salida.embedJpg(rel.firmaBytes)) } : rel;
  const casillas = [];
  for (const d of docs) casillas.push({ persona_id: t.id, ...await agregarDocumento(L, salida, d.bytes, d, t, relF, F, fecha, color), encima: false });
  salida.setTitle(ansi(`Entrega individual · ${t.nombre}`));
  return { bytes: await salida.save(), casillas };
}

// Un registro de entrega por trabajador, con un PDF por documento (SST 005: columna documentos). El registro guarda el
// primero como su archivo; la función firmar sella cada uno con la casilla de la persona.
async function guardarEntrega(ctx, { id, t, ds, rel, fecha, tipo, tema, contenido }) {
  const e = ctx.empresa.id, subidos = [], documentos = [];
  try {
    for (const [k, d] of ds.entries()) {
      avisar(`${t.nombre}: documento ${k + 1} de ${ds.length}…`);
      const { bytes, casillas } = await armarPdf(t, [d], rel, fecha, ctx.empresa.color);
      const nombre = `${[d.codigo, d.titulo].filter(Boolean).join(' ')} - ${t.nombre}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
      const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'sst', archivo: new File([bytes], `${nombre}.pdf`, { type: 'application/pdf' }), tabla: 'sst_entregas', registroId: id, tipos: ['application/pdf'] });
      subidos.push(ruta);
      documentos.push({ titulo: [d.codigo, d.titulo].filter(Boolean).join(' · ').slice(0, 300), codigo: d.codigo || null, version: d.version || null, archivo: ruta, casillas });
    }
    const { error } = await ctx.api.from('sst_entregas').insert({ id, empresa_id: e, tipo, tema, fecha, relator: rel?.nombre || null, contenido, archivo: documentos[0].archivo,
      firma_casillas: documentos[0].casillas, documentos });
    if (error) throw new Error(error.message);
  } catch (err) {
    for (const r of subidos) await eliminarArchivo(ctx.api, r).catch(() => {});
    throw err;
  }
  const p = await ctx.api.from('sst_entrega_personas').insert({ entrega_id: id, empresa_id: e, persona_id: t.id, cargo: t.cargo || null });
  if (p.error) throw new Error(`El registro quedó guardado, pero sin el trabajador: ${p.error.message}. Agrégalo en el registro.`);
  return id;
}

const bajar = async (ctx, ruta) => {
  const r = await fetch(await urlFirmada(ctx.api, ruta, 300));
  if (!r.ok) throw new Error('No se pudo descargar un documento.');
  return new Uint8Array(await r.arrayBuffer());
};

export async function abrirEntregaIndividual(ctx, { alGuardado = null } = {}) {
  if (!document.getElementById('sst-individual-css')) document.head.append(el('link', { id: 'sst-individual-css', rel: 'stylesheet', href: new URL('./individual.css?v=6df4ca6', import.meta.url).href }));
  const e = ctx.empresa.id;
  const [vinc, docsR, gen] = await Promise.all([
    ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno, rut, telefono)').eq('empresa_id', e).is('deleted_at', null),
    ctx.api.from('sst_documentos').select('id, codigo, titulo, tipo, sst_documento_versiones(version, fecha, archivo, created_at)').eq('empresa_id', e),
    ctx.api.from('gen_config').select('prevencionista, prev_cargo, firma_prev_ruta').eq('empresa_id', e).maybeSingle(),
  ]);
  if (vinc.error) throw vinc.error;
  if (docsR.error) throw docsR.error;
  const gente = (vinc.data ?? []).filter((v) => v.estado === 'activo' && v.personas)
    .map((v) => ({ id: v.persona_id, nombre: nombreDe(v.personas), rut: rutDe(v.personas.rut), cargo: v.cargo || '', telefono: v.personas.telefono }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  // Última versión en PDF de cada documento preventivo
  const docs = (docsR.data ?? []).map((d) => {
    const v = [...(d.sst_documento_versiones ?? [])].filter((x) => /\.pdf$/i.test(x.archivo || ''))
      .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0) || String(b.created_at).localeCompare(String(a.created_at)))[0];
    return v ? { id: d.id, codigo: d.codigo || '', titulo: d.titulo, tipo: d.tipo, version: v.version, ruta: v.archivo } : null;
  }).filter(Boolean).sort((a, b) => (a.codigo || a.titulo).localeCompare(b.codigo || b.titulo));
  // Plantillas del generador: Matriz IPER general, cada PTS y el PTS acorde al cargo (según el cargo de cada trabajador)
  let P = null;
  if (ctx.puede('documentos', 'ver')) { try { ({ P } = await cargarPlantillas(ctx)); } catch { P = null; } }
  const plantillas = [];
  if (P) {
    if (P.EMP_GEN?.iper) plantillas.push({ id: 'tpl:iper', codigo: '', titulo: 'Matriz de identificación de peligros y evaluación de riesgos (IPER) · plantilla general', tipo: 'iper', version: '', plantilla: () => P.EMP_GEN.iper.build(), clave: () => 'iper' });
    const pts = Object.keys(P.PTS_DOC ?? {}).map((slug) => { try { return [slug, P.ptsDatos(slug)]; } catch { return [slug, null]; } })
      .sort((a, b) => String(a[1]?.cod ?? a[0]).localeCompare(String(b[1]?.cod ?? b[0])));
    for (const [slug, dd] of pts) {
      let ver = ''; try { ver = P.ptsCambios(dd).at(-1)[0]; } catch { /* sin versión */ }
      plantillas.push({ id: `tpl:${slug}`, codigo: dd?.cod || '', titulo: dd?.titulo || slug, tipo: 'pts', version: ver, plantilla: () => P.docPTSDoc(slug), clave: () => slug });
    }
    plantillas.push({ id: 'tpl:pts_funciones', codigo: 'PTS-FUN', titulo: 'PTS acorde al cargo (según el cargo de cada trabajador)', tipo: 'pts', version: '02',
      plantilla: (t) => P.docPTSFunciones(P.varDefault(t)), clave: (t) => `fun-${P.varDefault(t)}`,
      codigoDe: (t) => `PTS-FUN-${{ oper: '01', prev: '02', prevadm: '03' }[P.varDefault(t)] ?? '01'}`,
      tituloDe: (t) => `PTS acorde a sus funciones · ${(P.DG_VARS ?? []).find((x) => x.v === P.varDefault(t))?.n ?? t.cargo}` });
  }
  const cfg = gen.data ?? {};
  const prev = gente.find((p) => norm(p.nombre) === norm(cfg.prevencionista)) ?? null;

  const elegidosT = new Set(); const elegidosD = new Set(); const subidos = [];
  const marca = (set, id, texto, sub) => el('label', { class: 'casilla dg-lista-it' },
    el('input', { type: 'checkbox', onchange: (ev) => { if (ev.currentTarget.checked) set.add(id); else set.delete(id); } }),
    el('span', {}, texto, sub ? el('span', { class: 'texto-suave texto-chico' }, ` · ${sub}`) : null));
  const listaT = el('div', { class: 'ind-lista' }, gente.map((p) => marca(elegidosT, p.id, p.nombre, [p.cargo, p.rut].filter(Boolean).join(' · '))));
  const listaD = el('div', { class: 'ind-lista' }, docs.length ? docs.map((d) => marca(elegidosD, d.id, [d.codigo, d.titulo].filter(Boolean).join(' · '), `versión ${d.version}`))
    : el('p', { class: 'texto-suave texto-chico' }, 'No hay documentos en PDF en Documentos preventivos.'));
  const listaP = el('div', { class: 'ind-lista' }, plantillas.map((d) => marca(elegidosD, d.id, [d.codigo, d.titulo].filter(Boolean).join(' · '), d.version ? `versión ${d.version}` : 'plantilla')));
  const listaSub = el('div', { class: 'ind-lista' });
  const subir = el('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true, onchange: async (ev) => {
    for (const f of ev.currentTarget.files ?? []) {
      const id = `sub-${crypto.randomUUID()}`;
      subidos.push({ id, codigo: '', titulo: f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '), version: '', bytes: new Uint8Array(await f.arrayBuffer()) });
      elegidosD.add(id);
      const it = marca(elegidosD, id, subidos.at(-1).titulo, 'PDF subido'); it.querySelector('input').checked = true; listaSub.append(it);
    }
    ev.currentTarget.value = '';
  } });
  const selRel = el('select', { class: 'campo', id: 'ind-rel' }, el('option', { value: '' }, 'Sin relator'),
    gente.map((p) => el('option', { value: p.id, selected: prev?.id === p.id }, p.nombre)));
  const fecha = el('input', { type: 'date', class: 'campo', id: 'ind-fecha', value: hoyISO() });

  // Relator con su firma (si es la prevencionista con su firma guardada)
  let firmaPrev;
  const relator = async () => {
    const p = gente.find((x) => x.id === selRel.value); if (!p) return null;
    const esPrev = prev && p.id === prev.id;
    if (esPrev && cfg.firma_prev_ruta && firmaPrev === undefined) firmaPrev = await bajar(ctx, cfg.firma_prev_ruta).catch(() => null);
    return { nombre: p.nombre, rut: p.rut, cargo: esPrev ? (cfg.prev_cargo || p.cargo) : p.cargo, firmaBytes: esPrev ? firmaPrev : null };
  };
  const cacheDocs = new Map();
  const todosDocs = () => [...docs, ...plantillas, ...subidos];
  // Documentos elegidos, en el orden de la lista (sin bytes: se arman para cada trabajador con conDatos)
  const elegidos = () => todosDocs().filter((d) => elegidosD.has(d.id));
  const conDatos = async (lista, t) => {
    const L = [];
    for (const d of lista) {
      if (d.bytes) { L.push(d); continue; }
      const k = d.plantilla ? `${d.id}|${d.clave(t)}` : d.id;
      if (!cacheDocs.has(k)) {
        if (d.plantilla) avisar(`Armando ${d.codigoDe?.(t) || d.codigo || d.titulo}…`);
        cacheDocs.set(k, d.plantilla ? await pdfDePlantilla(d.plantilla(t), { titulo: d.titulo, autor: ctx.empresa.razon_social }) : await bajar(ctx, d.ruta));
      }
      L.push({ ...d, codigo: d.codigoDe?.(t) || d.codigo, titulo: d.tituloDe?.(t) || d.titulo, bytes: cacheDocs.get(k) });
    }
    return L;
  };
  const validar = () => {
    if (!elegidosT.size) throw new Error('Elige al menos un trabajador.');
    if (!elegidosD.size) throw new Error('Elige al menos un documento.');
  };

  const verPrevia = async () => {
    const v = window.open('', '_blank');
    try {
      validar();
      const t = gente.find((p) => elegidosT.has(p.id));
      const { bytes } = await armarPdf(t, await conDatos(elegidos(), t), await relator(), fecha.value || hoyISO(), ctx.empresa.color);
      const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (v) v.location = u; else window.open(u, '_blank');
    } catch (err) { v?.close(); avisar(err.message, 'error'); }
  };
  const guardar = async (b) => {
    try {
      validar();
      if (!ctx.puede('sst', 'crear')) throw new Error('No tienes permiso para crear registros de Prevención SST.');
      b.disabled = true;
      const ds = elegidos(); const rel = await relator(); const f = fecha.value || hoyISO();
      const nombres = ds.map((d) => d.codigo || d.titulo);
      const tema = `Entrega individual: ${nombres.join(', ')}`.slice(0, 200);
      const tipo = ds.every((d) => d.tipo === 'pts') ? 'pts' : 'otro';
      const lotes = []; let primero = null;
      for (const t of gente.filter((p) => elegidosT.has(p.id))) {
        avisar(`Armando el documento de ${t.nombre}…`);
        const id = await guardarEntrega(ctx, { id: crypto.randomUUID(), t, ds: await conDatos(ds, t), rel, fecha: f, tipo, tema,
          contenido: ds.map((d) => [d.codigo, d.titulo, d.version ? `versión ${d.version}` : ''].filter(Boolean).join(' · ')).join('\n') });
        primero ??= id;
        lotes.push({ origen: 'sst_entrega', id, personas: [t], titulo: tema });
      }
      cerrar();
      avisar(`${lotes.length} registro${lotes.length === 1 ? '' : 's'} guardado${lotes.length === 1 ? '' : 's'} en Prevención SST → Registros de entrega.`);
      if (ctx.puede('sst', 'editar')) {
        try { await enviarVarios(ctx, lotes, () => ctx.refrescar?.()); }
        catch (err) { avisar(`Quedaron guardados, pero no se pudo preparar el envío: ${err.message}. Envíalos desde cada registro.`, 'error'); }
      }
      if (lotes.length === 1) alGuardado?.(primero);
    } catch (err) { b.disabled = false; avisar(err.message, 'error'); }
  };

  const cerrar = () => d.remove();
  const bGuardar = boton('Guardar y enviar a firmar', { tipo: 'primario', icono: 'chat' });
  bGuardar.addEventListener('click', () => guardar(bGuardar));
  const d = el('dialog', { class: 'modal ind-modal', 'aria-label': 'Entrega individual de documentos' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, 'Entrega individual de documentos'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' },
      el('p', { class: 'texto-suave texto-chico' }, 'Cada trabajador recibe su propio PDF: cada documento completo y, al pie de su última hoja, su casilla de firma con nombre, RUT y cargo, y la firma del relator. Firma una vez por WhatsApp y su sello queda bajo cada documento.'),
      el('h3', { class: 'doc-sub' }, 'Trabajadores'), listaT,
      el('h3', { class: 'doc-sub' }, 'Documentos'),
      el('p', { class: 'texto-suave texto-chico' }, 'Guardados en Documentos preventivos (última versión en PDF). Para la IRL de cada persona, súbela abajo como PDF propio y elige solo a esa persona.'),
      listaD,
      el('h3', { class: 'doc-sub' }, 'Plantillas'),
      el('p', { class: 'texto-suave texto-chico' }, 'Se arman con los datos de la empresa. El PTS acorde al cargo sale según el cargo de cada trabajador.'),
      listaP,
      el('h3', { class: 'doc-sub' }, 'PDF propio'), listaSub,
      boton('Subir PDF', { icono: 'carpeta', onclick: () => subir.click() }), subir,
      el('div', { class: 'ind-fila' },
        el('div', { class: 'form-fila' }, el('label', { for: 'ind-rel' }, 'Relator'), selRel),
        el('div', { class: 'form-fila' }, el('label', { for: 'ind-fecha' }, 'Fecha de entrega'), fecha)),
      el('div', { class: 'modal-pie' }, boton('Vista previa', { icono: 'documento', onclick: verPrevia }), bGuardar)));
  document.body.append(d);
  d.showModal();
}
