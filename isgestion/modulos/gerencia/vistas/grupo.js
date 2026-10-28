// Vista Grupo: consolidado de las empresas del grupo donde el usuario puede ver el Estado de resultados
// (mes o año): ingresos, costo, margen, gastos, personal y resultado por empresa y total; por cobrar y
// por pagar; tendencia consolidada; CSV y PDF. Cada empresa se calcula con sus propios permisos.
// Las ventas y compras entre empresas del grupo (cliente o proveedor con el RUT de otra empresa) se descuentan
// del total (res_intercompania), solo cuando ambas empresas están en la vista.
import { el } from '../../../core/ui/dom.js?v=384ede1';
import { icono } from '../../../core/ui/iconos.js?v=384ede1';
import { boton } from '../../../core/ui/tabla.js?v=384ede1';
import { avisar } from '../../../core/ui/aviso.js?v=384ede1';
import { dinero, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=384ede1';
import { cargarEmpresas, nombreEmpresa } from '../../../core/empresas.js?v=384ede1';
import { mesesEntre, cargarEstado, sumarTotales, pct } from '../../resultados/datos.js?v=384ede1';

const estado = { modo: 'mes', mes: hoyISO().slice(0, 7), anio: Number(hoyISO().slice(0, 4)) };
const COLS = [['ingresos', 'Ingresos'], ['costo', 'Costo de lo vendido'], ['margen', 'Margen bruto'], ['gastos', 'Gastos'], ['personal', 'Personal'], ['resultado', 'Resultado']];
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function vista(ctx) {
  const anual = estado.modo === 'anio';
  const meses = anual ? mesesEntre(`${estado.anio}-01`, `${estado.anio}-12`) : [estado.mes];
  const [empresas, perm] = await Promise.all([cargarEmpresas(), ctx.api.rpc('mis_permisos')]);
  if (perm.error) throw new Error(perm.error.message);
  const tiene = new Set((perm.data ?? []).map((p) => `${p.empresa_id}|${p.modulo_id}|${p.accion}`));
  const visibles = empresas.filter((e) => tiene.has(`${e.id}|resultados|ver`));
  const ocultas = empresas.length - visibles.length;

  // Cada empresa con su propio contexto (sus permisos)
  const resultados = await Promise.all(visibles.map(async (e) => {
    const ctxE = { ...ctx, empresa: e, puede: (m, a) => tiene.has(`${e.id}|${m}|${a}`) };
    try {
      const [est, pend, inter] = await Promise.all([cargarEstado(ctxE, meses), ctx.api.rpc('res_pendientes', { p_empresa: e.id }),
        ctx.api.rpc('res_intercompania', { p_empresa: e.id, p_desde: rangoMes(meses[0]).desde, p_hasta: rangoMes(meses[meses.length - 1]).hasta })]);
      if (inter.error) throw new Error(inter.error.message);
      const p = pend.data ?? [];
      return { e, t: sumarTotales(est), est, aviso: est.avisoPersonal, inter: inter.data ?? [],
        cobrar: p.filter((x) => x.lado === 'cobrar').reduce((s, x) => s + Number(x.monto), 0),
        pagar: p.filter((x) => x.lado === 'pagar').reduce((s, x) => s + Number(x.monto), 0) };
    } catch (err) { return { e, error: err.message }; }
  }));
  const ok = resultados.filter((r) => !r.error);
  // Operaciones entre empresas presentes en la vista: se restan del total (por mes, para la tendencia)
  const enVista = new Set(ok.map((r) => r.e.id));
  const inter = ok.flatMap((r) => r.inter).filter((x) => enVista.has(x.contraparte));
  const elimMes = (m) => {
    const de = (lado) => inter.filter((x) => x.lado === lado && (!m || x.mes === m)).reduce((s, x) => s + Number(x.monto), 0);
    const ventas = de('venta'), gastos = de('gasto'), personal = de('personal');
    return { ingresos: -ventas, costo: 0, margen: -ventas, gastos: -gastos, personal: -personal, resultado: -ventas + gastos + personal, cobrar: 0, pagar: 0 };
  };
  const elim = elimMes(null);
  const hayElim = inter.length > 0;
  const total = Object.fromEntries([...COLS.map(([k]) => [k, ok.reduce((s, r) => s + r.t[k], 0) + elim[k]]),
    ['cobrar', ok.reduce((s, r) => s + r.cobrar, 0)], ['pagar', ok.reduce((s, r) => s + r.pagar, 0)]]);

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Periodo' },
    [['mes', 'Mes'], ['anio', 'Año']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.modo === k), onclick: () => { estado.modo = k; ctx.refrescar(); } }, n)));
  const mover = (n) => { if (anual) estado.anio += n; else estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const periodo = anual ? String(estado.anio) : nombreMes(estado.mes);
  const acciones = [segmento, el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, periodo),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Siguiente', onclick: () => mover(1) }, icono('derecha')))];
  if (ctx.puede('gerencia', 'exportar') && ok.length) {
    acciones.push(boton('Excel', { icono: 'descargar', onclick: () => exportarExcel(ctx, ok, total, periodo, hayElim ? elim : null).catch((e) => avisar(e.message, 'error')) }));
    acciones.push(boton('PDF', { icono: 'descargar', onclick: (ev) => exportarPdf(ctx, ok, total, periodo, ev.currentTarget, hayElim ? elim : null) }));
  }

  const fila = (nombre, x, clase = '') => el('tr', { class: clase },
    el('td', {}, nombre),
    COLS.map(([k]) => el('td', { class: `num${k === 'resultado' ? (x[k] < 0 ? ' pct-mal' : ' pct-bien') : ''}` }, k === 'resultado' ? el('strong', {}, dinero(x[k])) : dinero(x[k]))),
    el('td', { class: 'num' }, x === elim ? '—' : pct(x.resultado, x.ingresos)),
    el('td', { class: 'num' }, dinero(x.cobrar)), el('td', { class: 'num' }, dinero(x.pagar)));
  const tabla = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla res-tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Empresa'), COLS.map(([, n]) => el('th', { class: 'num' }, n)), el('th', { class: 'num' }, 'Margen'), el('th', { class: 'num' }, 'Por cobrar'), el('th', { class: 'num' }, 'Por pagar'))),
    el('tbody', {}, ok.map((r) => fila(el('span', { class: 'ger-empresa' }, el('i', { style: `background:${r.e.color || 'var(--empresa)'}` }), nombreEmpresa(r.e)), { ...r.t, cobrar: r.cobrar, pagar: r.pagar })),
      hayElim ? fila(el('span', { class: 'texto-suave', title: 'Ventas y compras entre empresas del grupo: se descuentan del total' }, 'Entre empresas del grupo'), elim, 'texto-suave') : null,
      ok.length > 1 ? fila(el('strong', {}, 'Total grupo'), total, 'res-total') : null)));

  // Tendencia consolidada (año: por mes)
  let tendencia = null;
  if (anual && ok.length) {
    const datos = meses.map((m) => {
      const x = { ing: 0, egr: 0, res: 0 };
      for (const r of ok) { const v = r.est.totales.get(m); x.ing += v.ingresos; x.egr += v.costo + v.gastos + v.personal; x.res += v.resultado; }
      const el2 = elimMes(m); x.ing += el2.ingresos; x.egr += el2.gastos + el2.personal; x.res += el2.resultado;
      return { m, ...x };
    });
    const max = Math.max(1, ...datos.flatMap((d) => [d.ing, d.egr]));
    tendencia = el('div', { class: 'ficha doc-grupo' }, el('h2', {}, `Grupo ${estado.anio} por mes`),
      el('div', { class: 'res-tendencia ger-tendencia-anual' }, datos.map((d) => el('div', { class: 'res-col' },
        el('div', { class: 'res-barras' },
          el('span', { class: 'res-barra res-ing', style: `height:${Math.round((d.ing / max) * 100)}%`, title: `Ingresos ${dinero(d.ing)}` }),
          el('span', { class: 'res-barra res-egr', style: `height:${Math.round((d.egr / max) * 100)}%`, title: `Costos, gastos y personal ${dinero(d.egr)} · resultado ${dinero(d.res)}` })),
        el('span', { class: 'texto-chico' }, MES_CORTO[Number(d.m.slice(5, 7)) - 1])))));
  }

  const avisos = [
    ...resultados.filter((r) => r.error).map((r) => `${nombreEmpresa(r.e)}: ${r.error}`),
    ...ok.filter((r) => r.aviso).map((r) => `${nombreEmpresa(r.e)}: ${r.aviso}`),
    hayElim && elim.resultado !== 0 ? `Entre empresas del grupo: lo vendido (${dinero(-elim.ingresos)}) no coincide con lo registrado como gasto (${dinero(-elim.gastos - elim.personal)}). Revisa que ambas empresas lo tengan registrado, en el mismo mes y con el mismo neto.` : null,
    ocultas ? `${ocultas} ${ocultas === 1 ? 'empresa no aparece' : 'empresas no aparecen'}: tu rol no ve su Estado de resultados.` : null,
  ].filter(Boolean);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Vista Grupo'), el('div', { class: 'listado-acciones' }, acciones)),
    ok.length ? el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, `Ingresos del grupo · ${periodo}`), el('strong', {}, dinero(total.ingresos))),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${total.resultado < 0 ? 'fin-alerta' : 'fin-bien'}` }, el('span', { class: 'texto-suave texto-chico' }, 'Resultado del grupo'), el('strong', {}, dinero(total.resultado)), el('span', { class: 'texto-suave texto-chico' }, `${pct(total.resultado, total.ingresos)} de los ingresos`)),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Por cobrar / por pagar'), el('strong', {}, `${dinero(total.cobrar)} / ${dinero(total.pagar)}`))) : null,
    avisos.map((a) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), a)),
    ok.length ? tabla : el('p', { class: 'texto-suave' }, 'No tienes acceso al Estado de resultados de ninguna empresa.'),
    tendencia,
    el('p', { class: 'texto-suave texto-chico' }, 'Suma de cada empresa en neto (sin IVA), con los criterios del Estado de resultados. Lo que una empresa le vende a otra del grupo (cliente o proveedor con el RUT de la otra empresa) se descuenta del total. Por cobrar y por pagar no se descuentan.'));
}

async function exportarExcel(ctx, ok, total, periodo, elim) {
  const { exportarExcel: excel } = await import('../../../core/excel.js?v=384ede1');
  const filas = ok.map((r) => [nombreEmpresa(r.e), ...COLS.map(([k]) => r.t[k]), r.cobrar, r.pagar]);
  if (elim) filas.push(['Entre empresas del grupo', ...COLS.map(([k]) => elim[k]), 0, 0]);
  await excel(ctx, { titulo: `Vista Grupo · ${periodo}`, subtitulo: 'Montos netos, sin IVA', nombre: `grupo-${periodo.replace(/\s+/g, '-').toLowerCase()}`,
    columnas: ['Empresa', ...COLS.map(([, n]) => ({ t: n, tipo: 'dinero' })), { t: 'Por cobrar', tipo: 'dinero' }, { t: 'Por pagar', tipo: 'dinero' }],
    filas, total: ['Total grupo', ...COLS.map(([k]) => total[k]), total.cobrar, total.pagar] });
}

async function exportarPdf(ctx, ok, total, periodo, b, elim) {
  b.disabled = true;
  try {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=384ede1');
    const pdf = await nuevoPdf(ctx, { titulo: `Grupo · ${periodo}`, subtitulo: elim ? 'Consolidado en neto (sin IVA), sin las operaciones entre empresas del grupo' : 'Consolidado en neto (sin IVA), suma por empresa', horizontal: true });
    pdf.tabla({
      columnas: ['Empresa', ...COLS.map(([, n]) => n), 'Margen', 'Por cobrar', 'Por pagar'],
      filas: [...ok.map((r) => [nombreEmpresa(r.e), ...COLS.map(([k]) => dinero(r.t[k])), pct(r.t.resultado, r.t.ingresos), dinero(r.cobrar), dinero(r.pagar)]),
        ...(elim ? [['Entre empresas del grupo', ...COLS.map(([k]) => dinero(elim[k])), '', '', '']] : []),
        ['Total grupo', ...COLS.map(([k]) => dinero(total[k])), pct(total.resultado, total.ingresos), dinero(total.cobrar), dinero(total.pagar)]],
    });
    pdf.guardar(`grupo-${periodo.replace(/\s+/g, '-').toLowerCase()}`);
  } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}
