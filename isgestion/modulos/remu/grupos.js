// Tablas separadas de Fijos y Spot (Pago mensual y Resumen mensual → Para remuneraciones): cada grupo con sus propias
// columnas y subtotal, y la misma definición sirve para la pantalla, el Excel y el PDF (con membrete de la empresa).
// Columna: { t: título, tipo: 'texto' | 'dinero' | 'horas' | 'numero', v: (fila) => valor, suma?: true, neg?: true (se
// muestra con signo menos), fuerte?: true, celda?: (fila) => contenido propio en pantalla, soloExport?: true (no se
// muestra en pantalla) }.
import { el } from '../../core/ui/dom.js?v=25e9201';
import { dinero, horas } from '../../core/ui/formato.js?v=25e9201';

const texto = (c, v) => {
  if (c.tipo === 'dinero') return v ? `${c.neg ? '−' : ''}${dinero(v)}` : '—';
  if (c.tipo === 'horas') return v ? horas(v) : '—';
  if (c.tipo === 'numero') return v || v === 0 ? Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }) : '—';
  return v ?? '';
};
const sumar = (cols, filas) => cols.map((c, i) => (i === 0 ? 'Subtotal' : c.suma ? filas.reduce((s, f) => s + (Number(c.v(f)) || 0), 0) : null));

// Tabla en pantalla de un grupo (con su subtotal)
export function tablaGrupo({ titulo, cols: todas, filas, alFila }) {
  const cols = todas.filter((c) => !c.soloExport);
  const tot = sumar(cols, filas);
  const clase = (c, i) => (i === 0 ? '' : c.tipo === 'texto' ? '' : 'num');
  return el('div', { class: 'remu-grupo' },
    el('h2', { class: 'remu-grupo-titulo' }, titulo, el('span', { class: 'texto-suave texto-chico' }, ` · ${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}`)),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, cols.map((c, i) => el('th', { class: clase(c, i) }, c.t)))),
      el('tbody', {}, filas.map((f) => {
        const tr = el('tr', {}, cols.map((c, i) => el('td', { class: `${clase(c, i)}${c.neg && c.v(f) ? ' pct-mal' : ''}` },
          c.celda ? c.celda(f) : c.fuerte ? el('strong', {}, texto(c, c.v(f))) : texto(c, c.v(f)))));
        alFila?.(tr, f);
        return tr;
      })),
      el('tfoot', {}, el('tr', { class: 'remu-cal-subtotal' }, cols.map((c, i) => el('td', { class: clase(c, i) },
        i === 0 ? el('strong', {}, 'Subtotal') : tot[i] == null ? '' : c.fuerte ? el('strong', {}, texto(c, tot[i])) : texto(c, tot[i]))))))));
}

// Excel o PDF con un bloque por grupo y el total general al final
export async function exportarGrupos(ctx, { formato, titulo, subtitulo, grupos, nombre, total, notas = [] }) {
  const con = grupos.filter((g) => g.filas.length);
  const exp = (c) => c.exp ?? c.v;
  if (formato === 'excel') {
    const { nuevoExcel } = await import('../../core/excel.js?v=25e9201');
    const x = await nuevoExcel(ctx, { titulo, subtitulo });
    con.forEach((g) => x.tabla({
      titulo: g.titulo,
      columnas: g.cols.map((c) => ({ t: c.t, tipo: c.tipo })),
      filas: g.filas.map((f) => g.cols.map((c) => { const v = exp(c)(f); return c.neg && typeof v === 'number' && v ? -v : v; })),
      total: sumar(g.cols, g.filas).map((v, i) => (g.cols[i].neg && v ? -v : v)),
    }));
    if (total) x.total('Total a pagar (fijos y spot)', total);
    if (notas.length) x.tabla({ columnas: ['Notas'], filas: notas.map((n) => [n]) });
    await x.guardar(nombre);
    return;
  }
  const { nuevoPdf } = await import('../../core/pdf.js?v=25e9201');
  const pdf = await nuevoPdf(ctx, { titulo, subtitulo, horizontal: true });
  con.forEach((g) => {
    pdf.doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(28, 35, 48).text(g.titulo, 15, pdf.y);
    pdf.saltar(3);
    const tot = sumar(g.cols, g.filas);
    pdf.tabla({ columnas: g.cols.map((c) => c.t), filas: [...g.filas.map((f) => g.cols.map((c) => texto(c, exp(c)(f)))), g.cols.map((c, i) => (i === 0 ? 'Subtotal' : tot[i] == null ? '' : texto(c, tot[i])))] });
  });
  if (total) pdf.tabla({ columnas: ['Total general', 'A pagar'], filas: [['Fijos y spot', dinero(total)]] });
  if (notas.length) pdf.tabla({ columnas: ['Notas'], filas: notas.map((n) => [n]) });
  pdf.guardar(nombre);
}
