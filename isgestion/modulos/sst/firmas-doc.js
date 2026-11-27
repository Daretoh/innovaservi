// Bloque de firmas de un documento preventivo (pedido de Enzo, 2026-11-26): una fila de casillas con quién elabora, revisa o
// aprueba, cada una con la firma guardada en Prevención SST → Datos y firmas (representante legal o prevencionista), con o
// sin timbre, o en blanco para firmar a mano. Se agregan las que se quieran (no reemplaza la anterior).
// Contenido: { tipo: 'firmas', firmas: [{ rol, nombre, cargo, firma: 'rep' | 'prev' | '', timbre: boolean, fx, fy, fs, tx, ty, ts }] }
// La firma y el timbre se arrastran para moverlos y se agrandan con la rueda del mouse (como en el generador): fx/fy (tx/ty)
// es el corrimiento como fracción del ancho de la casilla y fs (ts) la escala; no ocupan espacio, así nada se corre.
import { el } from '../../core/ui/dom.js?v=0b94763';
import { icono } from '../../core/ui/iconos.js?v=0b94763';
import { cargarLogo } from '../../core/pdf.js?v=0b94763';
import { cargarConfig } from './datos.js?v=0b94763';

const cache = new Map();
// Firmas guardadas de la empresa: { rep: { nombre, cargo, img }, prev: { … }, timbre: img } (img = { dataUrl, formato, ancho, alto })
export function cargarFirmasDoc(ctx) {
  const k = ctx.empresa.id;
  if (!cache.has(k)) {
    cache.set(k, (async () => {
      const c = await cargarConfig(ctx);
      const [rep, prev, timbre] = await Promise.all([cargarLogo(ctx.api, c.firma_ruta), cargarLogo(ctx.api, c.firma_prev_ruta), cargarLogo(ctx.api, c.timbre_ruta)]);
      return {
        rep: { nombre: c.representante || '', cargo: c.cargo_rep || 'Representante legal', img: rep },
        prev: { nombre: c.prevencionista || '', cargo: c.prev_cargo || 'Prevencionista de riesgos', img: prev },
        timbre,
      };
    })().catch((e) => { cache.delete(k); throw e; }));
  }
  return cache.get(k);
}
export { tieneFirmas } from './firmas-doc-base.js?v=0b94763';

const ROL = { prev: 'Elaborado por', rep: 'Aprobado por', '': 'Revisado por' };
export function nuevaFirma(F, quien) {
  const p = F?.[quien];
  return { rol: ROL[quien] ?? 'Firma', nombre: p?.nombre ?? '', cargo: p?.cargo ?? '', firma: quien, timbre: quien === 'rep' && !!F?.timbre };
}
export const OPCIONES_FIRMA = [['prev', 'Prevencionista'], ['rep', 'Representante legal'], ['', 'Sin firma (a mano)']];

// Vista en la hoja. editar: textos editables (editableEl del editor) y controles (firma, timbre, quitar, agregar);
// alCambiarTodo() cuando cambia algo que obliga a volver a pintar.
// Arrastrar (mover) y rueda (agrandar/achicar) sobre una imagen de la casilla; k = 'f' (firma) o 't' (timbre)
function movible(img, f, k, caja, alGuardar) {
  img.classList.add('edf-mov'); img.title = 'Arrastra para mover · rueda del mouse para agrandar o achicar · doble clic para volver a su lugar';
  img.draggable = false; img.addEventListener('dragstart', (ev) => ev.preventDefault()); img.addEventListener('mousedown', (ev) => ev.preventDefault());
  const aplicar = () => {
    const w = caja.clientWidth || 1;
    img.style.transform = `translate(${(f[`${k}x`] ?? 0) * w}px, ${(f[`${k}y`] ?? 0) * w}px) scale(${f[`${k}s`] ?? 1})`;
  };
  let a = null;
  img.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); try { img.setPointerCapture(ev.pointerId); } catch { /* */ } a = { x: ev.clientX, y: ev.clientY, fx: f[`${k}x`] ?? 0, fy: f[`${k}y`] ?? 0, w: caja.clientWidth || 1 }; caja.classList.add('edf-moviendo'); });
  img.addEventListener('pointermove', (ev) => { if (!a) return; f[`${k}x`] = +(a.fx + (ev.clientX - a.x) / a.w).toFixed(4); f[`${k}y`] = +(a.fy + (ev.clientY - a.y) / a.w).toFixed(4); aplicar(); });
  const fin = (ev) => { if (!a) return; a = null; caja.classList.remove('edf-moviendo'); try { img.releasePointerCapture(ev.pointerId); } catch { /* */ } alGuardar(); };
  img.addEventListener('pointerup', fin); img.addEventListener('pointercancel', fin);
  img.addEventListener('wheel', (ev) => { ev.preventDefault(); f[`${k}s`] = +Math.max(0.3, Math.min(4, (f[`${k}s`] ?? 1) * (ev.deltaY < 0 ? 1.08 : 0.92))).toFixed(3); aplicar(); clearTimeout(img.__t); img.__t = setTimeout(alGuardar, 500); }, { passive: false });
  img.addEventListener('dblclick', () => { delete f[`${k}x`]; delete f[`${k}y`]; delete f[`${k}s`]; aplicar(); alGuardar(); });
  requestAnimationFrame(aplicar);
}

export function vistaFirmas(b, F, { editar = false, editableEl, alCambiarTodo = () => {}, alGuardar = () => {} } = {}) {
  b.firmas ??= [];
  const txt = (obj, k, tag, clase) => (editar ? editableEl(obj, k, tag, clase) : el(tag, { class: clase }, obj[k] ?? ''));
  const caja = (f, i) => {
    const img = f.firma ? F?.[f.firma]?.img : null;
    const iFirma = img ? el('img', { class: 'edf-firma', src: img.dataUrl, alt: '' }) : null;
    const iTimbre = f.timbre && F?.timbre ? el('img', { class: 'edf-timbre', src: F.timbre.dataUrl, alt: '' }) : null;
    const zona = el('div', { class: 'edf-zona' }, iTimbre, iFirma,
      f.firma && !img ? el('span', { class: 'texto-suave texto-chico' }, 'Sin imagen guardada') : null);
    const ctrl = editar ? el('div', { class: 'edf-ctrl', contenteditable: 'false' },
      el('select', { class: 'campo', 'data-nativo': '', 'aria-label': 'Firma', onchange: (ev) => {
        const q = ev.currentTarget.value; const p = F?.[q];
        f.firma = q; if (p) { if (p.nombre) f.nombre = p.nombre; if (p.cargo) f.cargo = p.cargo; }
        alCambiarTodo();
      } }, OPCIONES_FIRMA.map(([v, t]) => el('option', { value: v, selected: v === (f.firma ?? '') }, t))),
      F?.timbre ? el('label', { class: 'edf-chk' }, el('input', { type: 'checkbox', checked: !!f.timbre, onchange: (ev) => { f.timbre = ev.currentTarget.checked; alCambiarTodo(); } }), 'Timbre') : null,
      el('button', { type: 'button', class: 'boton-icono', title: 'Quitar esta firma', 'aria-label': 'Quitar esta firma', onclick: () => { b.firmas.splice(i, 1); alCambiarTodo(); } }, icono('cerrar', { tam: 14 }))) : null;
    const c = el('div', { class: 'edf-caja' }, ctrl, txt(f, 'rol', 'div', 'edf-rol'), zona, el('div', { class: 'edf-linea' }), txt(f, 'nombre', 'div', 'edf-nombre'), txt(f, 'cargo', 'div', 'edf-cargo'));
    const w = () => c.clientWidth || 1;
    if (editar) { if (iFirma) movible(iFirma, f, 'f', c, alGuardar); if (iTimbre) movible(iTimbre, f, 't', c, alGuardar); }
    else requestAnimationFrame(() => {
      if (iFirma) iFirma.style.transform = `translate(${(f.fx ?? 0) * w()}px, ${(f.fy ?? 0) * w()}px) scale(${f.fs ?? 1})`;
      if (iTimbre) iTimbre.style.transform = `translate(${(f.tx ?? 0) * w()}px, ${(f.ty ?? 0) * w()}px) scale(${f.ts ?? 1})`;
    });
    return c;
  };
  return el('div', { class: 'edf' },
    ...b.firmas.map(caja),
    editar ? el('button', { type: 'button', class: 'edf-mas', contenteditable: 'false', onclick: () => {
      const usadas = new Set(b.firmas.map((f) => f.firma));
      const q = ['prev', 'rep'].find((x) => !usadas.has(x)) ?? '';
      b.firmas.push(nuevaFirma(F, q)); alCambiarTodo();
    } }, icono('mas', { tam: 16 }), 'Agregar firma') : null);
}

// PDF (jsPDF, mm): casillas de hasta 3 por fila. y = posición actual; espacio(mm) hace salto de página si no cabe.
export function pdfFirmas(pdf, b, F, { M, ancho, y, espacio, color, texto }) {
  const lista = b.firmas ?? []; if (!lista.length) return y;
  // Casillas de ancho fijo (como en la hoja, donde miden hasta 240 px) para que mover y agrandar se vea igual en el PDF
  const porFila = Math.min(3, lista.length); const gap = 6; const w = Math.min(60, (ancho - gap * (porFila - 1)) / porFila); const zh = w * 0.29; const H = zh + 20;
  for (let i = 0; i < lista.length; i += porFila) {
    const fila = lista.slice(i, i + porFila);
    y = espacio(H + 4, y);
    const x0 = M + (ancho - (fila.length * w + (fila.length - 1) * gap)) / 2;
    fila.forEach((f, j) => {
      const x = x0 + j * (w + gap);
      pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...color).text(texto(f.rol || ''), x + w / 2, y + 3.5, { align: 'center' });
      const img = f.firma ? F?.[f.firma]?.img : null;
      const zy = y + 5.5;
      // Rectángulo base, luego el corrimiento (fracción del ancho de la casilla) y la escala desde el centro, como en la hoja
      const poner = (im, bx, by, bw, bh, ox, oy, sc, alias) => {
        const s = sc ?? 1; const cx = bx + bw / 2 + (ox ?? 0) * w; const cy = by + bh / 2 + (oy ?? 0) * w;
        pdf.addImage(im.dataUrl, im.formato, cx - (bw * s) / 2, cy - (bh * s) / 2, bw * s, bh * s, alias, 'FAST');
      };
      if (f.timbre && F?.timbre) {
        const t = F.timbre; const k = Math.min((w * 0.46) / t.ancho, zh / t.alto);
        poner(t, x + w * 0.96 - t.ancho * k, zy + (zh - t.alto * k) / 2, t.ancho * k, t.alto * k, f.tx, f.ty, f.ts, 'timbre-empresa');
      }
      if (img) {
        const k = Math.min((w * 0.8) / img.ancho, zh / img.alto);
        poner(img, x + (w - img.ancho * k) / 2, zy + zh - img.alto * k, img.ancho * k, img.alto * k, f.fx, f.fy, f.fs, `firma-${f.firma}`);
      }
      const ly = zy + zh + 1;
      pdf.setDrawColor(107, 114, 128).setLineWidth(0.3).line(x + w * 0.1, ly, x + w * 0.9, ly);
      pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(31, 41, 55).text(pdf.splitTextToSize(texto(f.nombre || ''), w - 2).slice(0, 1), x + w / 2, ly + 4.2, { align: 'center' });
      pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(107, 114, 128).text(pdf.splitTextToSize(texto(f.cargo || ''), w - 2).slice(0, 2), x + w / 2, ly + 8, { align: 'center' });
    });
    y += H + 4;
  }
  return y;
}

// Word (docx): una tabla sin bordes con una celda por firma
export function wordFirmas(D, b, F, { r, COLOR, GRIS, bytesDe }) {
  const { Paragraph, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle, TableLayoutType } = D;
  const lista = b.firmas ?? []; if (!lista.length) return [];
  const sin = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const porFila = Math.min(3, lista.length); const out = [];
  const imagen = (img, alto) => {
    const k = alto / img.alto;
    return new ImageRun({ type: img.formato === 'PNG' ? 'png' : 'jpg', data: bytesDe(img), transformation: { width: Math.round(img.ancho * k), height: alto } });
  };
  for (let i = 0; i < lista.length; i += porFila) {
    const fila = lista.slice(i, i + porFila);
    const celdas = fila.map((f) => {
      const img = f.firma ? F?.[f.firma]?.img : null; const imgs = [];
      if (img) imgs.push(imagen(img, Math.round(60 * (f.fs ?? 1))));
      if (f.timbre && F?.timbre) imgs.push(imagen(F.timbre, Math.round(60 * (f.ts ?? 1))));
      return new TableCell({
        width: { size: 100 / porFila, type: WidthType.PERCENTAGE }, borders: { top: sin, bottom: sin, left: sin, right: sin },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [r(f.rol || '', { bold: true, color: COLOR, size: 16 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: imgs.length ? imgs : [r(' ')], spacing: { before: imgs.length ? 40 : 700 } }),
          new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: GRIS, space: 2 } }, children: [r(f.nombre || '', { bold: true, size: 18 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [r(f.cargo || '', { color: GRIS, size: 16 })] }),
        ],
      });
    });
    out.push(new Table({ rows: [new TableRow({ cantSplit: true, children: celdas })], width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
      borders: { top: sin, bottom: sin, left: sin, right: sin, insideHorizontal: sin, insideVertical: sin } }), new Paragraph({ children: [], spacing: { after: 120 } }));
  }
  return out;
}
