// Gastos e ingresos del mes, pendientes de pago o cobro (de todos los meses), resumen y CSV.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { listado, boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js';
import { cargarBase, nombreTercero, nombreDoc, nombreMedio, MEDIOS, traerComprasInventario } from '../datos.js';

const estado = { vista: 'todos', mes: hoyISO().slice(0, 7), categoria: '' };
const VISTAS = [['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['pendientes', 'Por pagar y cobrar']];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const { desde, hasta } = rangoMes(estado.mes);
  const pendientes = estado.vista === 'pendientes';
  let q = ctx.api.from('fin_registros').select('*, terceros(razon_social, nombre_fantasia)').eq('empresa_id', e).is('deleted_at', null)
    .order('fecha', { ascending: !pendientes ? false : true }).order('created_at', { ascending: false });
  q = pendientes ? q.eq('estado_pago', 'pendiente') : q.gte('fecha', desde).lte('fecha', hasta);
  if (estado.vista === 'gasto' || estado.vista === 'ingreso') q = q.eq('tipo', estado.vista);
  if (estado.categoria) q = q.eq('categoria_id', estado.categoria);
  const [{ data, error }, base, pend] = await Promise.all([q, cargarBase(ctx),
    ctx.api.from('fin_registros').select('tipo, total').eq('empresa_id', e).is('deleted_at', null).eq('estado_pago', 'pendiente')]);
  if (error) throw error;

  const suma = (l, f) => l.reduce((s, r) => s + (f ? f(r) : r), 0);
  const delMes = pendientes ? [] : data;
  const gastosNeto = suma(delMes.filter((r) => r.tipo === 'gasto' && base.categoriaDe.get(r.categoria_id)?.clase !== 'inventario'), (r) => r.neto);
  const comprasInv = suma(delMes.filter((r) => base.categoriaDe.get(r.categoria_id)?.clase === 'inventario'), (r) => r.neto);
  const ingresosNeto = suma(delMes.filter((r) => r.tipo === 'ingreso'), (r) => r.neto);
  const porPagar = suma((pend.data ?? []).filter((r) => r.tipo === 'gasto'), (r) => r.total);
  const porCobrar = suma((pend.data ?? []).filter((r) => r.tipo === 'ingreso'), (r) => r.total);

  const marcarPagado = (r) => abrirFormulario({
    titulo: `${r.tipo === 'ingreso' ? 'Cobrado' : 'Pagado'}: ${r.concepto}`,
    mensaje: `${dinero(r.total)}${r.doc_numero ? ` · ${nombreDoc[r.doc_tipo]} ${r.doc_numero}` : ''}`,
    campos: [{ id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' }],
    textoGuardar: r.tipo === 'ingreso' ? 'Marcar cobrado' : 'Marcar pagado',
    alGuardar: async (v) => {
      const { error: er } = await ctx.api.from('fin_registros').update({ estado_pago: 'pagado', fecha_pago: v.fecha, medio_pago: v.medio }).eq('id', r.id);
      if (er) throw new Error(er.message);
      avisar('Listo.'); ctx.refrescar();
    },
  });

  const traer = async (b) => {
    const cats = base.categorias.filter((c) => c.clase === 'inventario' && c.activo);
    if (!cats.length) { avisar('Crea una categoría de clase "Compra de inventario" en Categorías y centros.', 'error'); return; }
    b.disabled = true;
    try {
      const n = await traerComprasInventario(ctx, cats[0].id);
      avisar(n ? `${n} ${n === 1 ? 'compra cargada' : 'compras cargadas'} como gasto por pagar.` : 'No hay compras nuevas en Inventario.');
      if (n) ctx.refrescar();
    } catch (err) { avisar(err.message, 'error'); } finally { b.disabled = false; }
  };

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    VISTAS.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.vista === k), onclick: () => { estado.vista = k; ctx.refrescar(); } }, n)));
  const selCat = el('select', { class: 'campo', 'aria-label': 'Categoría' }, el('option', { value: '' }, 'Todas las categorías'),
    base.categorias.map((c) => el('option', { value: c.id, selected: c.id === estado.categoria }, c.nombre)));
  selCat.addEventListener('change', () => { estado.categoria = selCat.value; ctx.refrescar(); });
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [segmento, selCat];
  if (!pendientes) acciones.push(el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha'))));
  if (ctx.puede('costos', 'exportar') && data.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => import('../../../core/excel.js').then(({ exportarExcel }) => exportarExcel(ctx, {
    titulo: pendientes ? 'Gastos e ingresos pendientes' : `Gastos e ingresos · ${nombreMes(estado.mes)}`, nombre: `costos-${pendientes ? 'pendientes' : estado.mes}`,
    columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Tipo', 'Concepto', 'Categoría', 'Centro', 'Proveedor o cliente', 'Documento', 'N°', { t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, 'Estado', { t: 'Fecha de pago', tipo: 'fecha' }, 'Medio', 'Patente'],
    filas: data.map((r) => [r.fecha, r.tipo === 'gasto' ? 'Gasto' : 'Ingreso', r.concepto, base.categoriaDe.get(r.categoria_id)?.nombre ?? '', base.centroDe.get(r.centro_id)?.nombre ?? '', nombreTercero(r.terceros),
      nombreDoc[r.doc_tipo], r.doc_numero ?? '', r.neto, r.iva, r.total, r.estado_pago ? r.estado_pago[0].toUpperCase() + r.estado_pago.slice(1) : '', r.fecha_pago ?? '', r.medio_pago ? nombreMedio[r.medio_pago] : '', r.patente ?? '']),
  })).catch((e) => avisar(e.message, 'error')) }));
  if (ctx.puede('costos', 'crear')) {
    if (ctx.puede('inventario', 'ver')) acciones.push(boton('Traer compras de Inventario', { icono: 'caja', onclick: (ev) => traer(ev.currentTarget) }));
    acciones.push(boton('Ingreso', { icono: 'mas', onclick: () => { location.hash = ctx.ruta('costos.registro', { tipo: 'ingreso' }); } }));
    acciones.push(boton('Leer boleta o factura', { icono: 'camara', onclick: () => { location.hash = ctx.ruta('costos.lector'); } }));
    acciones.push(boton('Gasto', { icono: 'mas', tipo: 'primario', onclick: () => { location.hash = ctx.ruta('costos.registro', { tipo: 'gasto' }); } }));
  }

  // Patente → vehículo del taller (como el OS: la patente abre el vehículo y su cobro)
  let vehDe = new Map();
  const patentes = [...new Set(data.map((r) => r.patente).filter(Boolean))];
  if (patentes.length && ctx.puede('taller', 'ver')) {
    const { data: vs } = await ctx.api.from('tal_vehiculos').select('id, patente').eq('empresa_id', ctx.empresa.id).in('patente', patentes).is('deleted_at', null);
    vehDe = new Map((vs ?? []).map((v) => [v.patente, v.id]));
  }
  const patenteNodo = (p) => (vehDe.has(p) ? el('a', { href: ctx.ruta('taller.vehiculo', { id: vehDe.get(p) }), title: 'Ver el vehículo y sus órdenes' }, p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p) : p);

  const tabla = listado({
    titulo: 'Gastos e ingresos',
    filas: data,
    acciones,
    vacio: pendientes ? 'No hay nada por pagar ni por cobrar.' : 'Sin registros en el mes.',
    columnas: [
      { titulo: 'Fecha', valor: (r) => fechaLarga(r.fecha) },
      { titulo: 'Concepto', valor: (r) => el('div', {}, el('a', { href: ctx.ruta('costos.registro', { id: r.id }) }, el('strong', {}, r.concepto)),
        el('div', { class: 'texto-suave texto-chico' }, [nombreTercero(r.terceros), r.patente ? patenteNodo(r.patente) : null, r.recurrente_id ? 'recurrente' : null, r.documento_id ? 'de Inventario' : null].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x])))) },
      { titulo: 'Categoría', valor: (r) => {
        const c = base.categoriaDe.get(r.categoria_id);
        return el('div', {}, el('span', { class: `chip ${r.tipo === 'ingreso' ? 'chip-ok' : c?.clase === 'inventario' ? 'chip-pend' : 'chip-prox'}` }, c?.nombre ?? ''),
          r.centro_id ? el('div', { class: 'texto-suave texto-chico' }, base.centroDe.get(r.centro_id)?.nombre) : null);
      } },
      { titulo: 'Documento', valor: (r) => `${nombreDoc[r.doc_tipo]}${r.doc_numero ? ` ${r.doc_numero}` : ''}` },
      { titulo: 'Neto', valor: (r) => dinero(r.neto) },
      { titulo: 'Total', valor: (r) => el('strong', {}, `${r.tipo === 'ingreso' ? '+' : ''}${dinero(r.total)}`) },
      { titulo: 'Estado', valor: (r) => (r.estado_pago === 'pagado'
        ? el('span', { class: 'chip chip-ok', title: r.medio_pago ? nombreMedio[r.medio_pago] : '' }, `${r.tipo === 'ingreso' ? 'Cobrado' : 'Pagado'} ${fechaLarga(r.fecha_pago)}`)
        : ctx.puede('costos', 'editar')
          ? boton(r.tipo === 'ingreso' ? 'Por cobrar' : 'Por pagar', { icono: 'check', title: 'Marcar como pagado o cobrado', onclick: () => marcarPagado(r) })
          : el('span', { class: 'chip chip-venc' }, r.tipo === 'ingreso' ? 'Por cobrar' : 'Por pagar')) },
    ],
  });
  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const resumen = el('div', { class: 'fin-tarjetas' },
    pendientes ? null : tarjeta(`Gastos de ${nombreMes(estado.mes)}`, gastosNeto, 'neto, sin compras de inventario'),
    pendientes || !comprasInv ? null : tarjeta('Compras de inventario', comprasInv, 'neto, es stock: no va al resultado'),
    pendientes ? null : tarjeta('Otros ingresos', ingresosNeto, 'neto'),
    tarjeta('Por pagar', porPagar, 'total, todos los meses', porPagar ? 'fin-alerta' : ''),
    tarjeta('Por cobrar', porCobrar, 'total, todos los meses'));
  tabla.querySelector('.listado-cabecera').after(resumen);
  return tabla;
}
