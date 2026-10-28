// Excel con el membrete de la empresa activa, igual que los PDF (core/pdf.js): logo, razón social, RUT y giro,
// línea y encabezados con el color de la empresa, filas alternadas, totales, formato de pesos y fechas, pie con la
// página y el sello "Generado con ISgestión". Todo lo que se exporta a planilla usa esto (07 Decisiones, 2026-10-22).
// Uso:
//   const x = await nuevoExcel(ctx, { titulo: 'Pago mensual', subtitulo: 'Octubre 2026' });
//   x.tabla({ titulo: 'Fijos', columnas: ['Trabajador', { t: 'Sueldo', tipo: 'dinero' }], filas: [['Ana', 600000]], total: ['Total', 600000] });
//   await x.guardar('pago-mensual-2026-10');
// Tipos de columna: 'texto' (por omisión), 'dinero', 'numero', 'decimal', 'horas' (minutos → h:mm), 'fecha' (ISO), 'pct' (0 a 1).
// Varias tablas van una debajo de otra en la misma hoja; { hoja: 'Otra' } abre otra hoja con su membrete.
// ExcelJS 4.4.0 (cdnjs, versión fija; 08 Seguridad §5) se carga solo al exportar.
import { cargarLogo, contactoEmpresa } from './pdf.js?v=3a264c0';
import { nombreEmpresa } from './empresas.js?v=3a264c0';

const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let carga = null;
export function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  carga ??= new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = EXCELJS;
    s.onload = () => (window.ExcelJS ? ok(window.ExcelJS) : mal(new Error('No se pudo cargar Excel.')));
    s.onerror = () => { carga = null; mal(new Error('No se pudo cargar el generador de Excel. Revisa la conexión.')); };
    document.head.append(s);
  });
  return carga;
}

export const argb = (hex) => `FF${String(hex || '#1f4e8c').replace('#', '').toUpperCase()}`;
const TINTA = 'FF1C2330'; const GRIS = 'FF5B6576'; const ALT = 'FFF7F8FA'; const LINEA = 'FFDDE1E7';
const FORMATO = { dinero: '"$"#,##0;-"$"#,##0;"—"', numero: '#,##0.##;-#,##0.##;"—"', decimal: '#,##0.0', horas: '[h]:mm', fecha: 'dd-mm-yyyy', pct: '0.0%' };
const relleno = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
const borde = { bottom: { style: 'thin', color: { argb: LINEA } } };

// Valor de la celda según el tipo (los números quedan como números para que Excel sume)
function valor(v, tipo) {
  if (v == null || v === '') return null;
  if (tipo === 'fecha') { const t = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00Z`) : String(v); }
  if (tipo === 'horas') return typeof v === 'number' ? (v ? v / 1440 : null) : String(v);   // minutos → fracción de día
  if (['dinero', 'numero', 'decimal', 'pct'].includes(tipo)) { const n = Number(v); return Number.isFinite(n) ? n : String(v); }
  return String(v);   // en .xlsx un texto que empieza con = o + sigue siendo texto (no es fórmula)
}
const largo = (v, tipo) => (v == null ? 0 : tipo === 'dinero' ? String(Math.round(Math.abs(v))).length * 1.35 + 3 : tipo === 'fecha' ? 11 : String(v).length);

export async function nuevoExcel(ctx, { titulo, subtitulo = '' }) {
  const e = ctx.empresa;
  const [ExcelJS, logo] = await Promise.all([cargarExcelJS(), cargarLogo(ctx.api, e.logo_url)]);
  const COLOR = argb(e.color);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ISgestión'; wb.company = e.razon_social; wb.title = titulo; wb.created = new Date();
  const img = logo ? wb.addImage({ base64: logo.dataUrl, extension: logo.formato === 'PNG' ? 'png' : 'jpeg' }) : null;
  const hojas = new Map();   // nombre → { ws, fila, anchos[], tablas }

  function hoja(nombre) {
    if (hojas.has(nombre)) return hojas.get(nombre);
    const ws = wb.addWorksheet(String(nombre).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), { views: [{ showGridLines: false }] });
    const h = { ws, fila: 8, anchos: [], tablas: 0, columnasMax: 1 };
    hojas.set(nombre, h);
    return h;
  }

  // Membrete (se dibuja al guardar, cuando se sabe cuántas columnas tiene la hoja)
  function membrete(h) {
    const { ws } = h; const n = Math.max(h.columnasMax, 4);
    [1, 2, 3].forEach((r) => { ws.getRow(r).height = 17; });
    if (img != null) ws.addImage(img, { tl: { col: 0.1, row: 0.15 }, ext: { width: Math.round(48 * (logo.ancho / logo.alto)), height: 48 } });
    else { const c = ws.getCell(1, 1); c.value = nombreEmpresa(e); c.font = { bold: true, size: 14, color: { argb: COLOR } }; }
    const der = (r, texto, fuente) => { ws.mergeCells(r, 2, r, n); const c = ws.getCell(r, 2); c.value = texto; c.font = fuente; c.alignment = { horizontal: 'right', vertical: 'middle' }; };
    der(1, e.razon_social, { bold: true, size: 11, color: { argb: TINTA } });
    der(2, [`RUT ${e.rut}`, e.giro].filter(Boolean).join(' · '), { size: 9, color: { argb: GRIS } });
    der(3, contactoEmpresa(e), { size: 9, color: { argb: GRIS } });
    ws.getRow(4).height = 4;
    for (let c = 1; c <= n; c++) ws.getCell(4, c).fill = relleno(COLOR);
    ws.mergeCells(6, 1, 6, n); ws.mergeCells(7, 1, 7, n);
    const t = ws.getCell(6, 1); t.value = titulo; t.font = { bold: true, size: 14, color: { argb: TINTA } };
    const s = ws.getCell(7, 1); s.value = subtitulo || `Emitido el ${new Date().toLocaleString('es-CL')}`; s.font = { size: 9, color: { argb: GRIS } };
    ws.pageSetup = { orientation: n > 7 ? 'landscape' : 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: `&L&8${nombreEmpresa(e)} · ${titulo}&C&7Generado con ISgestión&R&8Página &P de &N` };
    h.anchos.forEach((a, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(a + 2, 9), 48); });
    if (h.tablas === 1 && h.cab) {   // una sola tabla: encabezado fijo y filtros
      ws.views = [{ state: 'frozen', ySplit: h.cab, showGridLines: false }];
      ws.autoFilter = { from: { row: h.cab, column: 1 }, to: { row: h.ultima, column: h.columnasMax } };
    }
  }

  return {
    wb,
    // Agrega una tabla. columnas: texto o { t, tipo, ancho }. filas: arreglos de valores. total: fila final en negrita.
    tabla({ hoja: nombreHoja = 'Hoja 1', titulo: tituloTabla = '', columnas, filas, total = null, nota = '' }) {
      const h = hoja(nombreHoja); const { ws } = h;
      const cols = columnas.map((c) => (typeof c === 'string' ? { t: c, tipo: 'texto' } : { tipo: 'texto', ...c }));
      h.columnasMax = Math.max(h.columnasMax, cols.length);
      if (h.tablas) h.fila += 1;
      h.tablas += 1;
      if (tituloTabla) {
        const c = ws.getCell(h.fila, 1); c.value = tituloTabla; c.font = { bold: true, size: 11, color: { argb: COLOR } };
        h.fila += 1;
      }
      const cab = ws.getRow(h.fila); h.cab = h.fila;
      cols.forEach((c, i) => {
        const x = cab.getCell(i + 1); x.value = c.t;
        x.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; x.fill = relleno(COLOR);
        x.alignment = { vertical: 'middle', horizontal: c.tipo === 'texto' ? 'left' : 'right', wrapText: true };
        h.anchos[i] = Math.max(h.anchos[i] ?? 0, c.ancho ?? 0, Math.min(String(c.t).length, 18));
      });
      cab.height = 20;
      const escribir = (f, esTotal, k) => {
        h.fila += 1; const r = ws.getRow(h.fila);
        cols.forEach((c, i) => {
          const x = r.getCell(i + 1); x.value = valor(f[i], c.tipo);
          if (FORMATO[c.tipo] && typeof x.value !== 'string') x.numFmt = FORMATO[c.tipo];
          x.font = { size: 10, bold: esTotal, color: { argb: TINTA } };
          x.alignment = { vertical: 'top', horizontal: c.tipo === 'texto' ? 'left' : 'right', wrapText: c.tipo === 'texto' && String(f[i] ?? '').length > 40 };
          x.border = esTotal ? { top: { style: 'thin', color: { argb: COLOR } }, bottom: { style: 'double', color: { argb: COLOR } } } : borde;
          if (!esTotal && k % 2 === 1) x.fill = relleno(ALT);
          if (!c.ancho) h.anchos[i] = Math.max(h.anchos[i] ?? 0, Math.min(largo(f[i], c.tipo), 45));
        });
      };
      filas.forEach((f, k) => escribir(f, false, k));
      if (total) escribir(total, true, 0);
      h.ultima = h.fila;
      if (nota) { h.fila += 1; const c = ws.getCell(h.fila, 1); c.value = nota; c.font = { italic: true, size: 9, color: { argb: GRIS } }; }
      h.fila += 1;
      return this;
    },
    // Línea destacada (por ejemplo el total general): etiqueta y monto en pesos, con el color de la empresa
    total(etiqueta, monto, { hoja: nombreHoja = 'Hoja 1' } = {}) {
      const h = hoja(nombreHoja); const { ws } = h;
      h.fila += 1;
      const a = ws.getCell(h.fila, 1); a.value = etiqueta; a.font = { bold: true, size: 12, color: { argb: COLOR } };
      const col = Math.max(h.columnasMax, 2);
      const b = ws.getCell(h.fila, col); b.value = monto; b.numFmt = FORMATO.dinero; b.font = { bold: true, size: 12, color: { argb: COLOR } };
      b.alignment = { horizontal: 'right' };
      h.fila += 2;
      return this;
    },
    async guardar(nombre) {
      if (!hojas.size) hoja('Hoja 1');
      hojas.forEach(membrete);
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };
}

// Atajo para una sola tabla: arma, escribe y descarga
export async function exportarExcel(ctx, { titulo, subtitulo = '', columnas, filas, total = null, nombre, nota = '' }) {
  const x = await nuevoExcel(ctx, { titulo, subtitulo });
  x.tabla({ columnas, filas, total, nota });
  await x.guardar(nombre);
}
