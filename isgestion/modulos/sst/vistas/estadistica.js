// Estadística de accidentabilidad: por mes y acumulado del período (año calendario o 12 meses móviles), de toda la
// empresa o de un mandante. Indicadores usuales en Chile (Ley 16.744 / D.S. 67 y los que piden los mandantes):
//  · Tasa de accidentabilidad = accidentes con tiempo perdido ÷ dotación promedio × 100
//  · Tasa de siniestralidad   = días perdidos ÷ dotación promedio × 100
//  · Índice de frecuencia     = accidentes con tiempo perdido × 1.000.000 ÷ horas hombre
//  · Índice de gravedad       = días perdidos × 1.000.000 ÷ horas hombre
// Dotación del mes: personas con horas en el Registro de horas (si no hay horas, los vínculos vigentes del mes).
// Trayecto e incidentes se muestran aparte (no entran en las tasas). Datos: sst_estadistica (base).
import { el } from '../../../core/ui/dom.js?v=fb81a8b';
import { icono } from '../../../core/ui/iconos.js?v=fb81a8b';
import { boton } from '../../../core/ui/tabla.js?v=fb81a8b';
import { avisar } from '../../../core/ui/aviso.js?v=fb81a8b';
import { hoyISO, moverMes, nombreMes, rangoMes } from '../../../core/ui/formato.js?v=fb81a8b';
import { cargarClientes } from '../datos.js?v=fb81a8b';

const estado = { modo: 'anio', anio: Number(hoyISO().slice(0, 4)), tercero: '' };
const num = (n, d = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }));
const ent = (n) => Math.round(n || 0).toLocaleString('es-CL');

// Indicadores de un conjunto de meses (la dotación es el promedio de los meses con dotación)
export function indicadores(meses) {
  const dot = meses.map((m) => m.trabajadores || m.vinculos).filter((x) => x > 0);
  const prom = dot.length ? dot.reduce((s, x) => s + x, 0) / dot.length : 0;
  const hh = meses.reduce((s, m) => s + Number(m.minutos), 0) / 60;
  const t = (k) => meses.reduce((s, m) => s + m[k], 0);
  const ctp = t('acc_ctp'); const dias = t('dias_perdidos');
  return {
    prom, hh, ctp, stp: t('acc_stp'), trayecto: t('trayecto'), enfermedades: t('enfermedades'), incidentes: t('incidentes'), dias, fatales: t('fatales'),
    accidentabilidad: prom ? (ctp / prom) * 100 : null, siniestralidad: prom ? (dias / prom) * 100 : null,
    frecuencia: hh ? (ctp * 1e6) / hh : null, gravedad: hh ? (dias * 1e6) / hh : null,
  };
}

export default async function vista(ctx) {
  const hoy = hoyISO();
  const clientes = await cargarClientes(ctx);
  const desde = estado.modo === 'anio' ? `${estado.anio}-01-01` : rangoMes(moverMes(hoy.slice(0, 7), -11)).desde;
  const hasta = estado.modo === 'anio' ? `${estado.anio}-12-31` : rangoMes(hoy.slice(0, 7)).hasta;
  const { data, error } = await ctx.api.rpc('sst_estadistica', { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta, p_tercero: estado.tercero || null });
  if (error) throw error;
  // Con un mandante, la dotación es solo la que trabajó en sus faenas (sin respaldo de vínculos de toda la empresa)
  const meses = data.filter((m) => m.mes <= hoy.slice(0, 7)).map((m) => (estado.tercero ? { ...m, vinculos: 0 } : m));
  const T = indicadores(meses);
  const mandante = clientes.find((c) => c.id === estado.tercero)?.nombre ?? '';
  const periodo = estado.modo === 'anio' ? `Año ${estado.anio}` : `12 meses móviles (${nombreMes(meses[0]?.mes ?? hoy.slice(0, 7))} a ${nombreMes(hoy.slice(0, 7))})`;

  const cambiar = (c) => { Object.assign(estado, c); ctx.refrescar(); };
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Período' },
    [['anio', 'Año calendario'], ['movil', '12 meses móviles']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(estado.modo === v), onclick: () => cambiar({ modo: v }) }, t)));
  const navAnio = estado.modo === 'anio' ? el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año anterior', onclick: () => cambiar({ anio: estado.anio - 1 }) }, icono('volver')),
    el('strong', {}, String(estado.anio)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año siguiente', disabled: estado.anio >= Number(hoy.slice(0, 4)), onclick: () => cambiar({ anio: estado.anio + 1 }) }, icono('derecha'))) : null;
  const filtro = el('select', { class: 'campo campo-filtro', 'aria-label': 'Mandante', onchange: (ev) => cambiar({ tercero: ev.currentTarget.value }) },
    el('option', { value: '' }, 'Toda la empresa'), clientes.map((c) => el('option', { value: c.id, selected: c.id === estado.tercero }, c.nombre)));

  const kpi = (t, v, s) => el('div', { class: 'cmo-kpi' }, el('span', { class: 'cmo-kpi-t' }, t), el('strong', {}, v), el('span', { class: 'cmo-kpi-s' }, s));
  const kpis = el('div', { class: 'cmo-kpis' },
    kpi('Tasa de accidentabilidad', num(T.accidentabilidad), `${T.ctp} con tiempo perdido · dotación prom. ${num(T.prom, 1)}`),
    kpi('Tasa de siniestralidad', num(T.siniestralidad), `${T.dias} días perdidos`),
    kpi('Índice de frecuencia', num(T.frecuencia), `por millón de horas · ${ent(T.hh)} HH`),
    kpi('Índice de gravedad', num(T.gravedad, 1), 'días perdidos por millón de horas'),
    kpi('Otros', `${T.stp + T.trayecto + T.incidentes}`, `${T.stp} sin tiempo perdido · ${T.trayecto} trayecto · ${T.incidentes} incidentes${T.fatales ? ` · ${T.fatales} fatal` : ''}`));

  const columnas = ['Mes', 'Dotación', 'HH', 'Acc. CTP', 'Acc. STP', 'Trayecto', 'Enferm.', 'Incidentes', 'Días perdidos', 'T. accid.', 'T. sinies.', 'I. frec.', 'I. grav.'];
  const fila = (etq, m, I, clase = '') => el('tr', { class: clase }, el('td', {}, etq),
    [m ? (m.trabajadores || m.vinculos) : num(I.prom, 1), ent(I.hh), I.ctp, I.stp, I.trayecto, I.enfermedades, I.incidentes, I.dias,
      num(I.accidentabilidad), num(I.siniestralidad), num(I.frecuencia), num(I.gravedad, 1)].map((v) => el('td', { class: 'num' }, String(v))));
  const tabla = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla est-tabla' },
    el('thead', {}, el('tr', {}, columnas.map((c, i) => el('th', { class: i ? 'num' : '' }, c)))),
    el('tbody', {}, meses.map((m) => fila(nombreMes(m.mes), m, indicadores([m])))),
    el('tfoot', {}, fila(estado.modo === 'anio' ? `Total ${estado.anio}` : 'Total 12 meses', null, T))));

  const filasExport = () => [...meses.map((m) => { const I = indicadores([m]); return [nombreMes(m.mes), m.trabajadores || m.vinculos, Math.round(I.hh), I.ctp, I.stp, I.trayecto, I.enfermedades, I.incidentes, I.dias, num(I.accidentabilidad), num(I.siniestralidad), num(I.frecuencia), num(I.gravedad, 1)]; }),
    ['Total', num(T.prom, 1), Math.round(T.hh), T.ctp, T.stp, T.trayecto, T.enfermedades, T.incidentes, T.dias, num(T.accidentabilidad), num(T.siniestralidad), num(T.frecuencia), num(T.gravedad, 1)]];
  const titulo = `Estadística de accidentabilidad${mandante ? ` · ${mandante}` : ''}`;
  const pdf = async () => {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=fb81a8b');
    const p = await nuevoPdf(ctx, { titulo, subtitulo: `${periodo} · emitido el ${new Date().toLocaleDateString('es-CL')}`, horizontal: true });
    p.tabla({ columnas, filas: filasExport() });
    p.tabla({ columnas: ['Indicador', 'Fórmula'], filas: [
      ['Tasa de accidentabilidad', 'Accidentes con tiempo perdido ÷ dotación promedio × 100'], ['Tasa de siniestralidad', 'Días perdidos ÷ dotación promedio × 100'],
      ['Índice de frecuencia', 'Accidentes con tiempo perdido × 1.000.000 ÷ horas hombre'], ['Índice de gravedad', 'Días perdidos × 1.000.000 ÷ horas hombre'],
      ['Dotación', 'Personas con horas registradas en el mes (o vínculos vigentes si no hay horas)'], ['Fuera de las tasas', 'Accidentes de trayecto e incidentes sin lesión'],
    ] });
    p.guardar(`estadistica-accidentabilidad-${estado.modo === 'anio' ? estado.anio : 'movil'}`);
  };
  const excel = async () => {
    const { exportarExcel } = await import('../../../core/excel.js?v=fb81a8b');
    const L = filasExport();
    await exportarExcel(ctx, { titulo, subtitulo: periodo, columnas: columnas.map((c, i) => (i ? { t: c, tipo: i <= 8 ? 'numero' : 'texto' } : c)),
      filas: L.slice(0, -1), total: L[L.length - 1], nombre: `estadistica-accidentabilidad-${estado.modo === 'anio' ? estado.anio : 'movil'}` });
  };
  const accion = (fn) => async () => { try { await fn(); } catch (e) { avisar(e.message, 'error'); } };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Estadística de accidentabilidad'), el('p', { class: 'texto-suave' }, `${periodo}${mandante ? ` · ${mandante}` : ''}`)),
      el('div', { class: 'listado-acciones' }, boton('PDF', { icono: 'descargar', onclick: accion(pdf) }), boton('Excel', { icono: 'descargar', onclick: accion(excel) }))),
    el('div', { class: 'listado-acciones' }, segmento, navAnio, filtro),
    kpis, tabla,
    el('p', { class: 'texto-suave texto-chico' }, 'Accidentes con tiempo perdido (CTP): del trabajo con al menos un día perdido o fatales. Dotación del mes: personas con horas registradas (si no hay, los vínculos vigentes). ',
      'Con un mandante elegido: horas de sus faenas (la faena empieza con su nombre) y accidentes ocurridos ahí. Trayecto e incidentes no entran en las tasas.'));
}
