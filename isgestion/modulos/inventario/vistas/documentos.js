// Movimientos: documentos de inventario (entradas, salidas, ajustes y traslados) por mes.
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { listado, boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { dinero, fechaLarga, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=b8da9fc';
import { TIPOS_DOC, nombreDoc, cargarBase, nombreTercero } from '../datos.js?v=b8da9fc';

const estado = { tipo: 'todos', mes: new Date().toISOString().slice(0, 7) };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  let q = ctx.api.from('inv_documentos').select('*, terceros(razon_social, nombre_fantasia), inv_movimientos(cantidad, costo_unitario)')
    .eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta).order('numero', { ascending: false });
  if (estado.tipo !== 'todos') q = q.eq('tipo', estado.tipo);
  const [{ data, error }, base] = await Promise.all([q, cargarBase(ctx)]);
  if (error) throw error;

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Tipo' },
    [['todos', 'Todos'], ...TIPOS_DOC].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.tipo === k), onclick: () => { estado.tipo = k; ctx.refrescar(); } }, n)));
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [segmento, el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')))];
  if (ctx.puede('inventario', 'crear')) {
    for (const [k, n] of TIPOS_DOC) acciones.push(boton(n, { icono: 'mas', tipo: k === 'entrada' ? 'primario' : 'secundario', onclick: () => { location.hash = ctx.ruta('inventario.documento', { tipo: k }); } }));
  }
  // Valor: entradas al costo de compra; el resto al costo del producto
  const valor = (d) => d.inv_movimientos.filter((m) => (d.tipo === 'traslado' ? Number(m.cantidad) > 0 : true)).reduce((s, m) => s + Math.abs(Number(m.cantidad)) * m.costo_unitario, 0);

  return listado({
    titulo: 'Movimientos de inventario',
    filas: data,
    acciones,
    vacio: 'Sin movimientos en el mes.',
    columnas: [
      { titulo: 'N°', valor: (d) => el('a', { href: ctx.ruta('inventario.documento', { id: d.id }) }, el('strong', {}, `N° ${d.numero}`)) },
      { titulo: 'Fecha', valor: (d) => fechaLarga(d.fecha) },
      { titulo: 'Tipo', valor: (d) => el('span', { class: `chip ${d.estado === 'anulado' ? 'chip-na' : d.tipo === 'entrada' ? 'chip-ok' : d.tipo === 'salida' ? 'chip-prox' : 'chip-pend'}` }, `${nombreDoc[d.tipo]}${d.estado === 'anulado' ? ' (anulado)' : ''}`) },
      { titulo: 'Almacén', valor: (d) => [base.almacenDe.get(d.almacen_id)?.nombre, d.almacen_destino_id ? base.almacenDe.get(d.almacen_destino_id)?.nombre : null].filter(Boolean).join(' → ') },
      { titulo: 'Detalle', valor: (d) => [nombreTercero(d.terceros), d.doc_numero ? `${d.doc_tipo ?? ''} ${d.doc_numero}` : null, d.motivo].filter(Boolean).join(' · ') },
      { titulo: 'Líneas', valor: (d) => (d.tipo === 'traslado' ? d.inv_movimientos.length / 2 : d.inv_movimientos.length) },
      { titulo: 'Valor', valor: (d) => dinero(valor(d)) },
    ],
  });
}
