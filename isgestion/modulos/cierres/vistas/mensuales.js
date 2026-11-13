// Cierres: lista general de todos los meses y clientes, con filtros (2026-11-09, antes era una pantalla por mes).
// Si el cierre generó una cotización, sus montos y estado son los de la cotización.
import { el } from '../../../core/ui/dom.js?v=882cc93';
import { listado, boton } from '../../../core/ui/tabla.js?v=882cc93';
import { abrirFormulario } from '../../../core/ui/modal.js?v=882cc93';
import { dinero, hoyISO } from '../../../core/ui/formato.js?v=882cc93';
import { nombreTercero, nombreEstado, CHIP_ESTADO, numeroTexto, nombreMesLargo, IVA } from '../datos.js?v=882cc93';
import { totales, nombreEstado as estadoCot, CHIP_ESTADO as CHIP_COT } from '../../cotizaciones/datos.js?v=882cc93';

const filtro = { grupo: 'todos', cliente: '', anio: '' };
const GRUPOS = [['todos', 'Todos'], ['borrador', 'Borrador'], ['proceso', 'Por cobrar'], ['cobrado', 'Cobrados'], ['anulado', 'Anulados']];

const cotViva = (c) => (c.cot_cotizaciones && !c.cot_cotizaciones.deleted_at ? c.cot_cotizaciones : null);
const grupoDe = (c) => {
  if (c.estado === 'anulado') return 'anulado';
  const q = cotViva(c);
  if (q) return q.cobro_fecha ? 'cobrado' : 'proceso';
  return c.estado === 'borrador' ? 'borrador' : c.estado === 'cobrado' ? 'cobrado' : 'proceso';
};
function montos(c) {
  const q = cotViva(c);
  if (q) { const t = totales(q, q.cot_grupos, q.cot_lineas); return { neto: t.neto, iva: t.iva, total: t.total }; }
  if (c.estado !== 'borrador') return { neto: c.neto, iva: c.iva, total: c.total };
  const neto = c.cie_lineas.filter((l) => !l.excluida).reduce((s, l) => s + l.monto, 0);
  const iva = c.afecto_iva ? Math.round(neto * IVA) : 0;
  return { neto, iva, total: neto + iva };
}
function textoLineas(c) {
  const vivas = c.cie_lineas.filter((l) => !l.excluida);
  const autos = vivas.filter((l) => l.orden_id).length;
  if (autos && autos === vivas.length) return `${autos} ${autos === 1 ? 'vehículo' : 'vehículos'}`;
  return `${vivas.length} ${vivas.length === 1 ? 'línea' : 'líneas'}`;
}

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [cli, cie] = await Promise.all([
    ctx.api.from('cie_clientes').select('tercero_id, terceros(id, razon_social, nombre_fantasia)').eq('empresa_id', e).eq('activo', true),
    ctx.api.from('cie_cierres').select('*, cie_lineas(monto, excluida, orden_id), terceros(id, razon_social, nombre_fantasia), cot_cotizaciones(*, cot_grupos(id), cot_lineas(*))').eq('empresa_id', e).order('mes', { ascending: false }),
  ]);
  if (cli.error) throw cli.error;
  if (cie.error) throw cie.error;
  const clientes = [...new Map(cie.data.map((c) => [c.tercero_id, nombreTercero(c.terceros)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const anios = [...new Set(cie.data.map((c) => c.mes.slice(0, 4)))].sort().reverse();
  const filas = cie.data.filter((c) => (filtro.grupo === 'todos' || grupoDe(c) === filtro.grupo)
    && (!filtro.cliente || c.tercero_id === filtro.cliente) && (!filtro.anio || c.mes.startsWith(filtro.anio)))
    .map((c) => ({ ...c, m: montos(c), q: cotViva(c) }))
    .sort((a, b) => b.mes.localeCompare(a.mes) || nombreTercero(a.terceros).localeCompare(nombreTercero(b.terceros), 'es'));

  const selector = (clave, etiqueta, opciones) => {
    const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta }, el('option', { value: '' }, etiqueta), opciones.map(([v, t]) => el('option', { value: v, selected: filtro[clave] === v }, t)));
    s.addEventListener('change', () => { filtro[clave] = s.value; ctx.refrescar(); });
    return s;
  };
  const abrir = () => abrirFormulario({
    titulo: 'Abrir cierre',
    campos: [
      { id: 'cliente', etiqueta: 'Cliente', opciones: cli.data.map((x) => [x.tercero_id, nombreTercero(x.terceros)]) },
      { id: 'mes', etiqueta: 'Mes', tipo: 'month', requerido: true, valor: hoyISO().slice(0, 7) },
    ],
    textoGuardar: 'Abrir',
    alGuardar: async (v) => {
      const { data: id, error } = await ctx.api.rpc('cie_abrir', { p_empresa: e, p_tercero: v.cliente, p_mes: v.mes });
      if (error) throw new Error(error.message);
      location.hash = ctx.ruta('cierres.cierre', { id });
    },
  });
  const acciones = [
    el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' }, GRUPOS.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(filtro.grupo === k), onclick: () => { filtro.grupo = k; ctx.refrescar(); } }, n))),
    selector('cliente', 'Todos los clientes', clientes),
    selector('anio', 'Todos los años', anios.map((a) => [a, a])),
  ];
  if (ctx.puede('cierres', 'editar')) acciones.push(boton('Clientes con cierre', { icono: 'users', onclick: () => { location.hash = ctx.ruta('cierres.clientes'); } }));
  if (ctx.puede('cierres', 'crear') && cli.data.length) acciones.push(boton('Abrir cierre', { icono: 'mas', tipo: 'primario', onclick: abrir }));

  return listado({
    titulo: 'Cierres',
    filas,
    acciones,
    vacio: 'No hay cierres con estos filtros.',
    columnas: [
      { titulo: 'Cierre', valor: (c) => el('a', { href: ctx.ruta('cierres.cierre', { id: c.id }) }, el('strong', {}, nombreMesLargo(c.mes))) },
      { titulo: 'Cliente', valor: (c) => nombreTercero(c.terceros) },
      { titulo: 'Líneas', valor: textoLineas },
      { titulo: 'Neto', valor: (c) => dinero(c.m.neto) },
      { titulo: 'IVA', valor: (c) => dinero(c.m.iva) },
      { titulo: 'Total', valor: (c) => el('strong', {}, dinero(c.m.total)) },
      { titulo: 'Documento', valor: (c) => (c.q ? el('a', { href: ctx.ruta('cotizaciones.editor', { id: c.q.id }) }, `Cotización N° ${numeroTexto(c.q.numero)}`) : c.numero ? `Cierre ${nombreMesLargo(c.mes).toLowerCase()}` : el('span', { class: 'texto-suave' }, 'Sin documento')) },
      { titulo: 'Estado', valor: (c) => (c.q ? el('span', { class: `chip ${c.q.cobro_fecha ? 'chip-ok' : CHIP_COT[c.q.estado]}` }, c.q.cobro_fecha ? 'Cobrada' : estadoCot[c.q.estado]) : el('span', { class: `chip ${CHIP_ESTADO[c.estado]}` }, nombreEstado[c.estado])) },
    ],
  });
}
