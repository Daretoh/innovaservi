// Estado de resultados de la empresa: mes (con el mes anterior y tendencia de 6 meses) o año (12 meses),
// punto de equilibrio, PDF y CSV. Todo en neto (sin IVA). Cerrar / Reabrir mes (como InnovaGestión): el cierre guarda la
// foto del resultado y bloquea en Costos los cambios de montos, fechas y categorías de ese mes (fin_cierres).
import { el } from '../../../core/ui/dom.js?v=25e9201';
import { icono } from '../../../core/ui/iconos.js?v=25e9201';
import { boton } from '../../../core/ui/tabla.js?v=25e9201';
import { avisar } from '../../../core/ui/aviso.js?v=25e9201';
import { dinero, hoyISO, nombreMes, moverMes, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=25e9201';
import { abrirFormulario } from '../../../core/ui/modal.js?v=25e9201';
import { GRUPOS, mesesEntre, cargarEstado, sumarTotales, puntoEquilibrio, pct } from '../datos.js?v=25e9201';

const estado = { modo: 'mes', mes: hoyISO().slice(0, 7), anio: Number(hoyISO().slice(0, 4)) };
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const corto = (m) => `${MES_CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
// Monto compacto para la tendencia: -2,3 M · 850 k
const compacto = (n) => { const a = Math.abs(n), s = n < 0 ? '-' : n > 0 ? '+' : ''; return a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace('.', ',')} M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} k` : `${s}${a}`; };

// Filas del estado: { tipo: 'grupo' | 'linea' | 'total', label, valor(m), clave }
function filasDe(est) {
  const filas = [];
  const linea = (grupo) => [...est.lineas.get(grupo)].sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([concepto, porMes]) => ({ tipo: 'linea', label: concepto, valor: (m) => porMes.get(m) ?? 0 }));
  const tot = (k) => (m) => est.totales.get(m)?.[k] ?? 0;
  const nombre = Object.fromEntries(GRUPOS);
  filas.push({ tipo: 'grupo', label: nombre.ingreso, valor: tot('ingresos'), clave: 'ingresos' }, ...linea('ingreso'));
  filas.push({ tipo: 'grupo', label: nombre.costo, valor: tot('costo'), clave: 'costo' }, ...linea('costo'));
  filas.push({ tipo: 'total', label: 'Margen bruto', valor: tot('margen'), clave: 'margen' });
  filas.push({ tipo: 'grupo', label: nombre.gasto, valor: tot('gastos'), clave: 'gastos' }, ...linea('gasto'));
  filas.push({ tipo: 'grupo', label: nombre.personal, valor: tot('personal'), clave: 'personal' }, ...linea('personal'));
  filas.push({ tipo: 'total', label: 'Resultado', valor: tot('resultado'), clave: 'resultado' });
  return filas;
}

export default async function vista(ctx) {
  const anual = estado.modo === 'anio';
  const meses = anual ? mesesEntre(`${estado.anio}-01`, `${estado.anio}-12`) : mesesEntre(moverMes(estado.mes, -5), estado.mes);
  const est = await cargarEstado(ctx, meses);
  const filas = filasDe(est);
  const mes = estado.mes, anterior = moverMes(mes, -1);
  const columnas = anual ? meses : [mes];
  const t = anual ? sumarTotales(est) : sumarTotales(est, [mes]);
  const pe = puntoEquilibrio(t);

  // Cabecera y navegación
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Periodo' },
    [['mes', 'Mes'], ['anio', 'Año']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.modo === k), onclick: () => { estado.modo = k; ctx.refrescar(); } }, n)));
  const mover = (n) => { if (anual) estado.anio += n; else estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const nav = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, anual ? String(estado.anio) : nombreMes(mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Siguiente', onclick: () => mover(1) }, icono('derecha')));
  const acciones = [segmento, nav];
  // Cierre del mes (si la empresa usa Costos)
  const conCostos = ctx.puede('costos', 'ver');
  const cierre = conCostos && !anual ? (await ctx.api.from('fin_cierres').select('*').eq('empresa_id', ctx.empresa.id).eq('periodo', mes).maybeSingle()).data : null;
  const puedeCerrar = conCostos && ctx.puede('costos', 'aprobar') && !anual && mes < hoyISO().slice(0, 7);
  if (cierre) acciones.push(el('span', { class: 'chip chip-ok', title: `Cerrado el ${fechaLarga(diaLocal(cierre.cerrado_at))}` }, icono('candado', { tam: 12 }), ' Mes cerrado'));
  if (puedeCerrar) acciones.push(boton(cierre ? 'Reabrir mes' : 'Cerrar mes', { icono: cierre ? 'editar' : 'candado', onclick: () => abrirFormulario({
    titulo: cierre ? `Reabrir ${nombreMes(mes)}` : `Cerrar ${nombreMes(mes)}`,
    mensaje: cierre ? 'Se podrán volver a cambiar montos, fechas y categorías de los gastos e ingresos del mes. El cierre anterior se borra.'
      : `Resultado: ${dinero(t.resultado)}. Desde ahora los gastos e ingresos del mes no cambian de monto, fecha ni categoría (pagar sí se puede). Lo nuevo va al mes siguiente.`,
    campos: [], textoGuardar: cierre ? 'Reabrir' : 'Cerrar el mes',
    alGuardar: async () => {
      const r = cierre ? await ctx.api.from('fin_cierres').delete().eq('id', cierre.id)
        : await ctx.api.from('fin_cierres').insert({ empresa_id: ctx.empresa.id, periodo: mes, resultado: { ...t, puntoEquilibrio: pe, lineas: filas.map((f) => [f.tipo, f.label, f.valor(mes)]) } });
      if (r.error) throw new Error(r.error.message);
      avisar(cierre ? 'Mes reabierto.' : 'Mes cerrado.'); ctx.refrescar();
    },
  }) }));
  if (ctx.puede('resultados', 'exportar')) {
    acciones.push(boton('Excel', { icono: 'descargar', onclick: () => exportarExcel(ctx, filas, anual ? meses : [mes, anterior]).catch((e) => avisar(e.message, 'error')) }));
    acciones.push(boton('PDF', { icono: 'descargar', onclick: (ev) => exportarPdf(ctx, filas, anual, anual ? meses : [mes, anterior], t, pe, ev.currentTarget) }));
  }

  // Tarjetas
  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const tarjetas = el('div', { class: 'fin-tarjetas' },
    tarjeta('Ingresos', dinero(t.ingresos), 'neto'),
    tarjeta('Margen bruto', dinero(t.margen), pct(t.margen, t.ingresos)),
    tarjeta('Resultado', dinero(t.resultado), `${pct(t.resultado, t.ingresos)} de los ingresos`, t.resultado < 0 ? 'fin-alerta' : 'fin-bien'),
    tarjeta('Punto de equilibrio', pe ? dinero(pe) : '—', pe ? `ingresos para cubrir gastos y personal${t.ingresos ? ` (hoy ${pct(t.ingresos, pe)})` : ''}` : 'sin margen positivo'));

  // Tabla
  const cols = anual ? [...meses.map((m) => MES_CORTO[Number(m.slice(5, 7)) - 1]), 'Total'] : [nombreMes(mes), '% ingresos', nombreMes(anterior), 'Variación'];
  const celdas = (f) => {
    if (anual) return [...meses.map((m) => f.valor(m)), meses.reduce((s, m) => s + f.valor(m), 0)].map((v) => el('td', { class: 'num' }, v ? dinero(v) : '—'));
    const a = f.valor(mes), b = f.valor(anterior), ing = est.totales.get(mes)?.ingresos ?? 0;
    const varia = b ? Math.round(((a - b) / Math.abs(b)) * 100) : null;
    return [el('td', { class: 'num' }, a ? dinero(a) : '—'), el('td', { class: 'num texto-suave' }, f.tipo === 'linea' && !a ? '' : pct(a, ing)),
      el('td', { class: 'num' }, b ? dinero(b) : '—'), el('td', { class: 'num texto-suave' }, varia === null ? '' : `${varia > 0 ? '+' : ''}${varia}%`)];
  };
  const tabla = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla res-tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Concepto'), cols.map((c) => el('th', { class: 'num' }, c)))),
    el('tbody', {}, filas.filter((f) => f.tipo !== 'linea' || columnas.concat(anual ? [] : [anterior]).some((m) => f.valor(m)))
      .map((f) => el('tr', { class: `res-${f.tipo}${f.clave === 'resultado' ? ((anual ? t.resultado : f.valor(mes)) < 0 ? ' res-negativo' : ' res-positivo') : ''}` },
        el('td', {}, f.tipo === 'total' ? `= ${f.label}` : f.label), celdas(f))))));

  // Tendencia (solo en modo mes): ingresos vs costos+gastos+personal, con el resultado arriba
  let tendencia = null;
  if (!anual) {
    const datos = meses.map((m) => { const x = est.totales.get(m); return { m, ing: x.ingresos, egr: x.costo + x.gastos + x.personal, res: x.resultado }; });
    const max = Math.max(1, ...datos.flatMap((d) => [d.ing, d.egr]));
    tendencia = el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Últimos 6 meses'),
      el('div', { class: 'res-tendencia' }, datos.map((d) => el('div', { class: `res-col${d.m === mes ? ' res-col-actual' : ''}` },
        el('span', { class: `texto-chico ${d.res < 0 ? 'pct-mal' : 'pct-bien'}` }, compacto(d.res)),
        el('div', { class: 'res-barras' },
          el('span', { class: 'res-barra res-ing', style: `height:${Math.round((d.ing / max) * 100)}%`, title: `Ingresos ${dinero(d.ing)}` }),
          el('span', { class: 'res-barra res-egr', style: `height:${Math.round((d.egr / max) * 100)}%`, title: `Costos, gastos y personal ${dinero(d.egr)}` })),
        el('span', { class: 'texto-chico' }, corto(d.m))))),
      el('p', { class: 'texto-suave texto-chico' }, el('span', { class: 'res-leyenda res-ing' }), ' Ingresos   ', el('span', { class: 'res-leyenda res-egr' }), ' Costos, gastos y personal'));
  }

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Estado de resultados'), el('div', { class: 'listado-acciones' }, acciones)),
    est.avisoPersonal ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), est.avisoPersonal) : null,
    tarjetas, tabla, tendencia,
    el('p', { class: 'texto-suave texto-chico' }, 'Montos netos, sin IVA. Ingresos por fecha de cobro (taller), de venta (mesón) y de registro (otros ingresos). ',
      'El inventario es costo cuando se usa o se vende; las compras de inventario no van al resultado. Personal: Remuneraciones del mes y categorías de clase Personal.'));
}

async function exportarExcel(ctx, filas, meses) {
  const { exportarExcel: excel } = await import('../../../core/excel.js?v=25e9201');
  await excel(ctx, { titulo: 'Estado de resultados', subtitulo: `${nombreMes(meses[0])}${meses.length > 1 ? ` a ${nombreMes(meses[meses.length - 1])}` : ''} · montos netos, sin IVA`,
    nombre: `estado-resultados-${meses[0]}${meses.length > 2 ? `-${meses[meses.length - 1]}` : ''}`,
    columnas: ['Concepto', ...meses.map((m) => ({ t: nombreMes(m), tipo: 'dinero' }))],
    filas: filas.map((f) => [`${f.tipo === 'linea' ? '   ' : ''}${f.label}`, ...meses.map((m) => f.valor(m))]) });
}

async function exportarPdf(ctx, filas, anual, meses, t, pe, b) {
  b.disabled = true;
  try {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=25e9201');
    const titulo = `Estado de resultados · ${anual ? meses[0].slice(0, 4) : nombreMes(meses[0])}`;
    const pdf = await nuevoPdf(ctx, { titulo, subtitulo: `Montos netos, sin IVA · Emitido el ${new Date().toLocaleDateString('es-CL')}`, horizontal: anual });
    const cab = anual ? ['Concepto', ...meses.map((m) => MES_CORTO[Number(m.slice(5, 7)) - 1]), 'Total'] : ['Concepto', nombreMes(meses[0]), '% ingresos', nombreMes(meses[1])];
    const cuerpo = filas.filter((f) => f.tipo !== 'linea' || meses.some((m) => f.valor(m))).map((f) => {
      const label = f.tipo === 'total' ? `= ${f.label}` : f.tipo === 'linea' ? `   ${f.label}` : f.label;
      if (anual) return [label, ...meses.map((m) => (f.valor(m) ? dinero(f.valor(m)) : '-')), dinero(meses.reduce((s, m) => s + f.valor(m), 0))];
      const ing = filas[0].valor(meses[0]);
      const v0 = f.valor(meses[0]), v1 = f.valor(meses[1]);
      return [label, v0 ? dinero(v0) : '-', v0 ? pct(v0, ing) : '', v1 ? dinero(v1) : '-'];
    });
    const tipos = filas.filter((f) => f.tipo !== 'linea' || meses.some((m) => f.valor(m))).map((f) => f.tipo);
    pdf.doc.autoTable({
      startY: pdf.y, head: [cab], body: cuerpo,
      margin: { left: 15, right: 15, bottom: 18 },
      styles: { font: 'helvetica', fontSize: anual ? 7 : 9, cellPadding: anual ? 1.5 : 2.2, textColor: [28, 35, 48], lineColor: [221, 225, 231], lineWidth: 0.1 },
      headStyles: { fillColor: [28, 35, 48], textColor: 255, fontStyle: 'bold', halign: 'right' },
      columnStyles: { 0: { halign: 'left', cellWidth: anual ? 48 : 80 } },
      didParseCell: (d) => {
        if (d.column.index > 0) d.cell.styles.halign = 'right';
        if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
        if (d.section !== 'body') return;
        const tipo = tipos[d.row.index];
        if (tipo === 'grupo') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [241, 243, 246]; }
        if (tipo === 'total') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 232, 240]; }
        if (tipo === 'linea') d.cell.styles.textColor = [91, 101, 118];
      },
    });
    const y = pdf.doc.lastAutoTable.finalY + 8;
    pdf.doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(91, 101, 118);
    pdf.doc.text([`Resultado ${dinero(t.resultado)} (${pct(t.resultado, t.ingresos)} de los ingresos). Punto de equilibrio: ${pe ? dinero(pe) : 'sin margen positivo'}.`,
      'Ingresos por fecha de cobro o venta. El inventario es costo cuando se usa o se vende. Personal: Remuneraciones y categorías de personal.'], 15, y);
    pdf.guardar(`estado-resultados-${anual ? meses[0].slice(0, 4) : meses[0]}`);
  } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}
