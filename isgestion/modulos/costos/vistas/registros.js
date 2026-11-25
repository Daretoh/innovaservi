// Gastos (y Otros ingresos, con vistaRegistros(ctx, 'ingreso')): lo que ya está cargado (lo que falta cargar está en la Bandeja). Los recientes (últimos cargados, de
// cualquier mes), los del mes, pendientes de pago o cobro (de todos los meses), filtro por categoría y por declarado o no
// declarado (2026-11-24), resumen y Excel. "Editar como planilla" cambia la tabla por la planilla del OS (planilla.js). En el teléfono
// las filas se ven como tarjetas.
import { el } from '../../../core/ui/dom.js?v=5f7c89a';
import { icono } from '../../../core/ui/iconos.js?v=5f7c89a';
import { listado, boton } from '../../../core/ui/tabla.js?v=5f7c89a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=5f7c89a';
import { avisar } from '../../../core/ui/aviso.js?v=5f7c89a';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes, diaLocal } from '../../../core/ui/formato.js?v=5f7c89a';
import { cargarBase, nombreTercero, nombreDoc, nombreMedio, MEDIOS, traerComprasInventario, estadosDe, nombreEstado, CHIP_ESTADO } from '../datos.js?v=5f7c89a';
import { planilla } from '../planilla.js?v=5f7c89a';
import { urlFirmada } from '../../../core/adjuntos.js?v=5f7c89a';
import { pendientesBandeja } from './bandeja.js?v=5f7c89a';

// (2026-11-24, orden de Finanzas) Gastos y Otros ingresos son pantallas separadas: los gastos en Compras y gastos,
// los otros ingresos en Ventas y cobros (vistas/ingresos.js). Cada una recuerda su propio filtro.
const estados = {
  gasto: { vista: 'recientes', mes: hoyISO().slice(0, 7), categoria: '', declarado: '', editar: false },
  ingreso: { vista: 'recientes', mes: hoyISO().slice(0, 7), categoria: '', declarado: '', editar: false },
};
const RECIENTES = 15;
const VISTAS = {
  gasto: [['recientes', 'Recientes'], ['todos', 'Del mes'], ['pendientes', 'Por pagar']],
  ingreso: [['recientes', 'Recientes'], ['todos', 'Del mes'], ['pendientes', 'Por cobrar']],
};

export default (ctx) => vistaRegistros(ctx, 'gasto');

export async function vistaRegistros(ctx, solo) {
  const estado = estados[solo];
  const esGasto = solo === 'gasto';
  const nombre = esGasto ? 'Gastos' : 'Otros ingresos';
  const e = ctx.empresa.id;
  // (2026-11-24) Los pagos de cada mes ya no se generan solos: cambian de monto mes a mes y se cargan con su documento
  const { desde, hasta } = rangoMes(estado.mes);
  const pendientes = estado.vista === 'pendientes';
  const recientes = estado.vista === 'recientes';
  const revisar = estado.vista === 'revisar';
  if (estado.vista === 'sincentro' && !ctx.config?.centros) estado.vista = 'recientes';   // centros apagados (opción del módulo)
  const sinCentro = estado.vista === 'sincentro';
  const sinMes = pendientes || recientes || revisar || sinCentro;
  let q = ctx.api.from('fin_registros').select('*, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).is('deleted_at', null);
  if (recientes) q = q.order('created_at', { ascending: false }).limit(RECIENTES);
  else q = q.order('fecha', { ascending: pendientes }).order('created_at', { ascending: false });
  if (pendientes) q = q.neq('estado_pago', 'pagado');
  else if (revisar) q = q.eq('estado_pago', 'pendiente');
  else if (sinCentro) q = q.is('centro_id', null).is('a_cuenta_de', null);   // lo comprado por cuenta de un tercero no es costo nuestro: no lleva centro
  else if (!recientes) q = q.gte('fecha', desde).lte('fecha', hasta);
  q = q.eq('tipo', solo);
  if (estado.categoria) q = q.eq('categoria_id', estado.categoria);
  if (estado.declarado && esGasto) q = q.eq('declarable', estado.declarado === 'si');
  const [{ data: datos, error }, base, pend, nRevisar, nSinCentro, us, ctas] = await Promise.all([q, cargarBase(ctx),
    ctx.api.from('fin_registros').select('tipo, total, tercero_id').eq('empresa_id', e).eq('tipo', solo).is('deleted_at', null).neq('estado_pago', 'pagado'),
    ctx.api.from('fin_registros').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('tipo', solo).is('deleted_at', null).eq('estado_pago', 'pendiente'),
    ctx.api.from('fin_registros').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('tipo', solo).is('deleted_at', null).is('centro_id', null).is('a_cuenta_de', null),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e }),
    ctx.api.from('fin_proveedores').select('tercero_id').eq('empresa_id', e).eq('modalidad', 'cuenta')]);
  if (error) throw error;
  // (2026-11-24, Enzo) Contratistas con cuenta corriente (ej.: D&P): sus trabajos no se pagan uno a uno, van al saldo de
  // su cuenta (lo que nos cobra menos las compras a su cuenta y los abonos). No son "por pagar" en Gastos.
  const conCuenta = new Set((ctas.data ?? []).map((c) => c.tercero_id));
  const aSuCuenta = (r) => r.tipo === 'gasto' && r.estado_pago !== 'pagado' && conCuenta.has(r.tercero_id);
  const data = pendientes ? datos.filter((r) => !aSuCuenta(r)) : datos;
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  // Faenas de los registros (para mostrar su nombre)
  const idsFaena = [...new Set(data.map((r) => r.faena_id).filter(Boolean))];
  const faenaDe = new Map(idsFaena.length && ctx.puede('ope', 'ver')
    ? ((await ctx.api.from('ope_faenas').select('id, titulo').in('id', idsFaena)).data ?? []).map((f) => [f.id, f.titulo]) : []);

  const suma = (l, f) => l.reduce((s, r) => s + (f ? f(r) : r), 0);
  const delMes = sinMes ? [] : data;
  const gastosNeto = suma(delMes.filter((r) => r.tipo === 'gasto' && base.categoriaDe.get(r.categoria_id)?.clase !== 'inventario'), (r) => r.neto);
  const comprasInv = suma(delMes.filter((r) => base.categoriaDe.get(r.categoria_id)?.clase === 'inventario'), (r) => r.neto);
  const ingresosNeto = suma(delMes.filter((r) => r.tipo === 'ingreso'), (r) => r.neto);
  const porPagar = suma((pend.data ?? []).filter((r) => r.tipo === 'gasto' && !aSuCuenta(r)), (r) => r.total);
  const enCuentas = suma((pend.data ?? []).filter(aSuCuenta), (r) => r.total);
  const porCobrar = suma((pend.data ?? []).filter((r) => r.tipo === 'ingreso'), (r) => r.total);

  const cambiarEstado = async (r, sel) => {
    if (sel.value === 'pagado') { sel.value = r.estado_pago; marcarPagado(r); return; }
    const { error: er } = await ctx.api.from('fin_registros').update({ estado_pago: sel.value }).eq('id', r.id);
    if (er) { avisar(er.message, 'error'); sel.value = r.estado_pago; return; }
    avisar(`${r.concepto}: ${Object.fromEntries(estadosDe(r.tipo))[sel.value].toLowerCase()}.`); ctx.refrescar();
  };
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

  // Contadores que filtran (todos los meses), como Finanzas de InnovaGestión
  const contador = (k, n, texto, clase) => el('button', { type: 'button', class: `chip ${clase} chip-boton`, 'aria-pressed': String(estado.vista === k), onclick: () => { estado.vista = estado.vista === k ? 'recientes' : k; ctx.refrescar(); } }, `${texto} `, el('strong', {}, String(n ?? 0)));
  const contadores = el('div', { class: 'resumen-chips' },
    contador('revisar', nRevisar.count, 'Por revisar', nRevisar.count ? 'chip-pend' : 'chip-ok'),
    ctx.config?.centros ? contador('sincentro', nSinCentro.count, 'Sin centro de costo', nSinCentro.count ? 'chip-prox' : 'chip-ok') : null,
    revisar || sinCentro ? el('span', { class: 'texto-suave texto-chico' }, 'Todos los meses · toca de nuevo para quitar el filtro') : null);
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    VISTAS[solo].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.vista === k), onclick: async () => { await hoja?.terminar(); estado.vista = k; ctx.refrescar(); } }, n)));
  const selCat = el('select', { class: 'campo', 'aria-label': 'Categoría' }, el('option', { value: '' }, 'Todas las categorías'),
    base.categorias.filter((c) => (c.clase === 'ingreso') === !esGasto).map((c) => el('option', { value: c.id, selected: c.id === estado.categoria }, c.nombre)));
  selCat.addEventListener('change', () => { estado.categoria = selCat.value; ctx.refrescar(); });
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const selDec = el('select', { class: 'campo', 'aria-label': 'Declarado' },
    [['', 'Declarados y no declarados'], ['si', 'Declarados (factura a nuestro RUT)'], ['no', 'No declarados (boletas, sin papel)']].map(([v, t]) => el('option', { value: v, selected: estado.declarado === v }, t)));
  selDec.addEventListener('change', () => { estado.declarado = selDec.value; ctx.refrescar(); });
  const acciones = [segmento, selCat, esGasto ? selDec : null].filter(Boolean);
  if (!sinMes) acciones.push(el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha'))));
  if (ctx.puede('costos', 'exportar') && data.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => import('../../../core/excel.js?v=5f7c89a').then(({ exportarExcel }) => exportarExcel(ctx, {
    titulo: pendientes ? `${nombre} pendientes` : revisar ? `${nombre} por revisar` : sinCentro ? `${nombre} sin centro de costo` : recientes ? `${nombre} recientes` : `${nombre} · ${nombreMes(estado.mes)}`, nombre: `${esGasto ? 'gastos' : 'otros-ingresos'}-${pendientes ? 'pendientes' : recientes ? 'recientes' : estado.mes}`,
    columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Tipo', 'Concepto', 'Categoría', ...(ctx.config?.centros ? ['Centro'] : []), 'Proveedor o cliente', 'Documento', 'N°', { t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, 'Estado', { t: 'Fecha de pago', tipo: 'fecha' }, 'Medio', 'Patente'],
    filas: data.map((r) => [r.fecha, r.tipo === 'gasto' ? 'Gasto' : 'Ingreso', r.concepto, base.categoriaDe.get(r.categoria_id)?.nombre ?? '', ...(ctx.config?.centros ? [base.centroDe.get(r.centro_id)?.nombre ?? ''] : []), nombreTercero(r.terceros),
      nombreDoc[r.doc_tipo], r.doc_numero ?? '', r.neto, r.iva, r.total, nombreEstado(r), r.fecha_pago ?? '', r.medio_pago ? nombreMedio[r.medio_pago] : '', r.patente ?? '']),
  })).catch((e) => avisar(e.message, 'error')) }));
  // Planilla: editar las celdas como en Excel (solo con permiso de edición)
  let hoja = null;
  if (ctx.puede('costos', 'editar') && data.length) acciones.push(boton(estado.editar ? 'Listo' : 'Editar como planilla', { icono: estado.editar ? 'check' : 'editar', tipo: estado.editar ? 'primario' : 'secundario', onclick: async () => {
    if (estado.editar) { await hoja?.terminar(); avisar('Cambios guardados.'); }
    estado.editar = !estado.editar; ctx.refrescar();
  } }));
  if (ctx.puede('costos', 'crear')) {
    if (esGasto && ctx.puede('inventario', 'ver')) acciones.push(boton('Traer compras de Inventario', { icono: 'caja', onclick: (ev) => traer(ev.currentTarget) }));
    // Una sola entrada: la Bandeja (ahí se suben fotos, se registra sin papel o a mano)
    if (esGasto) acciones.push(boton('Subir documentos', { icono: 'camara', tipo: 'primario', onclick: () => { location.hash = ctx.ruta('costos.bandeja'); } }));
    else acciones.push(boton('Nuevo ingreso', { icono: 'mas', tipo: 'primario', onclick: () => { location.hash = ctx.ruta('costos.registro', { tipo: 'ingreso' }); } }));
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
    titulo: nombre,
    filas: data,
    claseFila: (r) => (r.tipo === 'ingreso' ? 'fila-suma' : 'fila-resta'),   // franja: verde suma, roja resta
    acciones,
    vacio: pendientes ? (esGasto ? 'No hay nada por pagar (los trabajos de contratistas con cuenta corriente van a su saldo, en Proveedores y cuentas).' : 'No hay nada por cobrar.') : revisar ? 'No hay nada por revisar.' : sinCentro ? 'Todo tiene centro de costo.' : recientes ? 'Aún no hay registros.' : 'Sin registros en el mes.',
    columnas: [
      { titulo: 'Fecha', valor: (r) => fechaLarga(r.fecha) },
      { titulo: 'Concepto', valor: (r) => el('div', {}, el('a', { href: ctx.ruta('costos.registro', { id: r.id }) }, el('strong', {}, r.concepto)),
        el('div', { class: 'texto-suave texto-chico' }, [nombreTercero(r.terceros), r.faena_id ? faenaDe.get(r.faena_id) ?? 'faena' : null, r.patente ? patenteNodo(r.patente) : null, r.recurrente_id ? 'recurrente' : null, r.documento_id ? 'de Inventario' : null, r.declarable === false ? 'no declarado' : null, r.espera_factura ? el('span', { class: 'texto-error' }, 'falta la factura') : null].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x])))) },
      { titulo: 'Categoría', valor: (r) => {
        const c = base.categoriaDe.get(r.categoria_id);
        return el('div', {}, el('span', { class: `chip ${r.tipo === 'ingreso' ? 'chip-ok' : c?.clase === 'inventario' ? 'chip-pend' : 'chip-prox'}` }, c?.nombre ?? ''),
          r.centro_id && ctx.config?.centros ? el('div', { class: 'texto-suave texto-chico' }, base.centroDe.get(r.centro_id)?.nombre) : null);
      } },
      { titulo: 'Documento', valor: (r) => {
        const ruta = r.archivo ?? r.adjuntos?.[0];
        return el('span', {}, `${nombreDoc[r.doc_tipo]}${r.doc_numero ? ` ${r.doc_numero}` : ''}`, ruta ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver respaldo', 'aria-label': 'Ver respaldo',
          onclick: async () => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }, icono('ojo', { tam: 16 })) : null);
      } },
      { titulo: 'Neto', valor: (r) => dinero(r.neto) },
      { titulo: 'Total', valor: (r) => el('strong', {}, `${r.tipo === 'ingreso' ? '+' : ''}${dinero(r.total)}`) },
      { titulo: 'Estado', valor: (r) => {
        if (aSuCuenta(r)) return el('div', {}, el('a', { class: 'chip chip-prox', href: ctx.ruta('costos.cuenta', { t: r.tercero_id }), title: 'Contratista con cuenta corriente: este trabajo suma a su saldo y se paga con abonos' }, 'A su cuenta'),
          el('div', { class: 'texto-chico texto-suave' }, 'va a su saldo'));
        if (!ctx.puede('costos', 'editar')) return el('span', { class: `chip ${CHIP_ESTADO[r.estado_pago]}` }, nombreEstado(r));
        const sel = el('select', { class: `campo campo-estado estado-${r.estado_pago}`, 'aria-label': 'Estado', title: r.estado_pago === 'pagado' && r.medio_pago ? nombreMedio[r.medio_pago] : '' },
          estadosDe(r.tipo).map(([k, n]) => el('option', { value: k, selected: k === r.estado_pago }, k === 'pagado' && r.estado_pago === 'pagado' ? `${n} ${fechaLarga(r.fecha_pago)}` : n)));
        sel.addEventListener('change', () => cambiarEstado(r, sel));
        return el('div', {}, sel, r.estado_pago !== 'pagado' && r.vence ? el('div', { class: `texto-chico ${r.vence < hoyISO() ? 'texto-error' : 'texto-suave'}` }, `Vence ${fechaLarga(r.vence)}`) : null);
      } },
      { titulo: 'Cargó', valor: (r) => el('span', { class: 'texto-chico texto-suave' },
        r.remu_ref ? 'Remuneraciones' : r.recurrente_id ? 'Sistema (gasto fijo)' : r.documento_id ? 'Inventario' : quien.get(r.created_by) ?? '—', el('br'), fechaLarga(diaLocal(r.created_at)),
        r.updated_by && r.updated_by !== r.created_by ? el('span', {}, el('br'), `Editó ${quien.get(r.updated_by) ?? '—'}`) : null) },
    ],
  });
  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const resumen = el('div', { class: 'fin-tarjetas' },
    sinMes || !esGasto ? null : tarjeta(`Gastos de ${nombreMes(estado.mes)}`, gastosNeto, 'neto, sin compras de inventario'),
    sinMes || !comprasInv || !esGasto ? null : tarjeta('Compras de inventario', comprasInv, 'neto, es stock: no va al resultado'),
    sinMes || esGasto ? null : tarjeta(`Otros ingresos de ${nombreMes(estado.mes)}`, ingresosNeto, 'neto'),
    esGasto ? tarjeta('Por pagar', porPagar, enCuentas ? `total, todos los meses · sin ${dinero(enCuentas)} de cuentas corrientes (van a su saldo)` : 'total, todos los meses', porPagar ? 'fin-alerta' : '') : tarjeta('Por cobrar', porCobrar, 'total, todos los meses'));
  // Quien solo carga (sin "aprobar") ve cantidades, no los montos totales
  tabla.querySelector('.listado-cabecera').after(contadores, ...(ctx.puede('costos', 'aprobar') ? [resumen] : []));
  tabla.classList.add('fin-lista');
  if (recientes) resumen.after(el('p', { class: 'texto-suave texto-chico' }, `Los ${RECIENTES} últimos cargados, de cualquier mes. Para ver un mes completo usa "Del mes".`));
  if (esGasto && ctx.puede('costos', 'crear')) tabla.querySelector('.listado-cabecera').after(avisoBandeja(ctx));
  if (esGasto) tabla.querySelector('.listado-cabecera').after(avisoDuplicados(ctx, quien));
  if (estado.editar && data.length) {
    hoja = planilla(ctx, data, base);
    tabla.querySelector('.tabla-contenedor').replaceWith(hoja.nodo);
    tabla.querySelector('.buscador')?.remove();
    setTimeout(() => hoja.enfocar(0, 1));
  }
  return tabla;
}

// Posibles duplicados (Costos 014, 2026-11-24, pedido de Enzo): dos gastos con el mismo total, fechas a 3 días o menos y
// el mismo proveedor (o alguno sin proveedor). Plegado; cada par se abre, se elimina el repetido desde su registro o se
// marca "No es duplicado" (quien edita Costos) y no vuelve a salir.
function avisoDuplicados(ctx, quien) {
  const caja = el('div', {});
  ctx.api.rpc('fin_gastos_duplicados', { p_empresa: ctx.empresa.id }).then(({ data }) => {
    const pares = data ?? [];
    if (!pares.length) return;
    const lado = (id, fecha, concepto, doc, cargo) => el('div', { class: 'dup-lado' },
      el('a', { href: ctx.ruta('costos.registro', { id }) }, el('strong', {}, concepto)),
      el('span', { class: 'texto-suave texto-chico' }, [fechaLarga(fecha), doc, quien.get(cargo) ? `cargó ${quien.get(cargo)}` : null].filter(Boolean).join(' · ')));
    const noEs = async (ev, x) => {
      const b = ev.currentTarget; b.disabled = true;
      const { error } = await ctx.api.rpc('fin_no_es_duplicado', { p_a: x.a_id, p_b: x.b_id });
      if (error) { avisar(error.message, 'error'); b.disabled = false; return; }
      b.closest('.dup-par').remove(); avisar('Anotado: no vuelve a salir.');
    };
    caja.replaceChildren(el('details', { class: 'ficha doc-grupo dup-caja' },
      el('summary', {}, icono('alerta', { tam: 15 }), el('strong', {}, ` ${pares.length} ${pares.length === 1 ? 'posible gasto repetido' : 'posibles gastos repetidos'}`),
        el('span', { class: 'texto-suave texto-chico' }, ' · mismo monto, fechas cercanas y mismo proveedor (o sin proveedor)')),
      el('p', { class: 'texto-suave texto-chico' }, 'Abre los dos. Si es el mismo gasto, elimina el que sobra desde su registro (deja el que tiene factura o foto). Si son distintos, marca "No es duplicado".'),
      pares.map((x) => el('div', { class: 'dup-par' },
        lado(x.a_id, x.a_fecha, x.a_concepto, x.a_doc, x.a_cargo),
        lado(x.b_id, x.b_fecha, x.b_concepto, x.b_doc, x.b_cargo),
        el('div', { class: 'dup-acciones' }, el('strong', {}, dinero(x.total)),
          x.a_cuenta ? el('span', { class: 'chip chip-prox' }, 'a cuenta de un tercero') : null,
          ctx.puede('costos', 'editar') ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: (ev) => noEs(ev, x) }, 'No es duplicado') : null)))));
  });
  return caja;
}

// Lo que falta cargar está en la Bandeja (2026-11-24: antes aquí se repetían las facturas del SII por cargar)
function avisoBandeja(ctx) {
  const caja = el('div', {});
  pendientesBandeja(ctx).then(({ data }) => {
    const n = (data ?? []).length;
    if (!n) return;
    caja.replaceChildren(el('p', { class: 'texto-suave texto-chico' }, icono('lista', { tam: 14 }), ` Hay ${n} ${n === 1 ? 'documento' : 'documentos'} por cargar en la `,
      el('a', { href: ctx.ruta('costos.bandeja') }, 'Bandeja'), '.'));
  });
  return caja;
}
