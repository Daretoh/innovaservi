// Texto de un .docx para revisarlo con IA (SST 004): párrafos, listas y tablas (filas con | entre celdas), en el
// orden del documento, incluidos el encabezado y el pie. Sin dependencias del navegador: recibe el XML ya extraído
// (lo saca JSZip en revisar-ia.js), así también se puede probar en Node.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]));

function textoParrafo(p) {
  let t = '';
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
    t += m[1] !== undefined ? decodificar(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
  }
  t = t.replace(/[ \t]+$/g, '');
  if (!t.trim()) return '';
  return /<w:numPr>/.test(p) ? `- ${t.trim()}` : t;
}

// Bloques de primer nivel (<w:p> y <w:tbl>, respetando tablas dentro de tablas)
function bloques(xml) {
  const salida = [];
  const re = /<w:tbl>|<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  let prof = 0, inicio = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] === '<w:tbl>') { if (prof++ === 0) inicio = m.index; }
    else if (m[0] === '</w:tbl>') { if (--prof === 0) salida.push({ tipo: 'tabla', xml: xml.slice(inicio, re.lastIndex) }); }
    else if (prof === 0) salida.push({ tipo: 'p', xml: m[0] });
  }
  return salida;
}

function textoTabla(tbl) {
  const interior = tbl.slice('<w:tbl>'.length, -'</w:tbl>'.length);
  const filas = [];
  for (const tr of interior.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
    const celdas = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => bloques(tc.slice(6, -7))
      .map((x) => (x.tipo === 'tabla' ? textoTabla(x.xml).replace(/\n/g, ' ') : textoParrafo(x.xml))).filter(Boolean).join(' / ').replace(/\s*\|\s*/g, ' '));
    if (celdas.some((c) => c.trim())) filas.push(`| ${celdas.join(' | ')} |`);
  }
  return filas.join('\n');
}

export function textoDeXml(xml) {
  const cuerpo = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml.replace(/^[\s\S]*?<w:(hdr|ftr)[^>]*>/, '');
  return bloques(cuerpo).map((b) => (b.tipo === 'tabla' ? `\n${textoTabla(b.xml)}\n` : textoParrafo(b.xml))).filter((t) => t !== '')
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// zip: instancia de JSZip ya cargada con el .docx. Devuelve el texto con encabezado, cuerpo y pie.
export async function textoDocx(zip) {
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('El archivo no es un Word válido (.docx).');
  const partes = async (re) => (await Promise.all(Object.keys(zip.files).filter((n) => re.test(n)).sort().map((n) => zip.file(n).async('string')))).map(textoDeXml).filter(Boolean);
  const [enc, cuerpo, pie] = [await partes(/^word\/header\d*\.xml$/), textoDeXml(await doc.async('string')), await partes(/^word\/footer\d*\.xml$/)];
  return [enc.length ? `[Encabezado]\n${[...new Set(enc)].join('\n')}` : '', cuerpo, pie.length ? `[Pie de página]\n${[...new Set(pie)].join('\n')}` : ''].filter(Boolean).join('\n\n');
}
