// Gastos e ingresos: los recientes (últimos cargados, de cualquier mes), los del mes, pendientes de pago o cobro (de todos
// los meses), resumen y Excel. "Editar como planilla" cambia la tabla por la planilla del OS (planilla.js). En el teléfono
// las filas se ven como tarjetas.
import { el } from '../../../core/ui/dom.js?v=6df4ca6';
import { icono } from '../../../core/ui/iconos.js?v=6df4ca6';
import { listado, boton } from '../../../core/ui/tabla.js?v=6df4ca6';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6df4ca6';
import { avisar } from '../../../core/ui/aviso.js?v=6df4ca6';
import { dinero, fechaLarga, hoyISO, nombreMes, moverMes, rangoMes, diaLocal } from '../../../core/ui/formato.js?v=6df4ca6';
import { cargarBase, nombreTercero, nombreDoc, nombreMedio, MEDIOS, traerComprasInventario, estadosDe, nombreEstado, CHIP_ESTADO, generarAutomatico } from '../datos.js?v=6df4ca6';
import { planilla } from '../planilla.js?v=6df4ca6';
import { urlFirmada } from '../../../core/adjuntos.js?v=6df4ca6';
import { pendientesBandeja, traerSiHaceFalta } from './bandeja.js?v=6df4ca6';
import { NOMBRE_DTE } from '../../../core/dte.js?v=6df4ca6';

const estado = { vista: 'recientes', mes: hoyISO().slice(0, 7), categoria: '', editar: false };
const RECIENTES = 15;
const VISTAS = [['recientes', 'Recientes'], ['todos', 'Del mes'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['pendientes', 'Por pagar y cobrar']];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  // Gastos fijos del mes: se generan solos (una vez por sesión)
  const generados = await generarAutomatico(ctx);
  if (generados) avisar(`Se generaron ${generados} gasto${generados === 1 ? '' : 's'} fijo${generados === 1 ? '' : 's'} del mes.`);
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
  if (estado.vista === 'gasto' || estado.vista === 'ingreso') q = q.eq('tipo', estado.vista);
  if (estado.categoria) q = q.eq('categoria_id', estado.categoria);
  const [{ data, error }, base, pend, nRevisar, nSinCentro, us] = await Promise.all([q, cargarBase(ctx),
    ctx.api.from('fin_registros').select('tipo, total').eq('empresa_id', e).is('deleted_at', null).neq('estado_pago', 'pagado'),
    ctx.api.from('fin_registros').select('id', { count: 'exact', head: true }).eq('empresa_id', e).is('deleted_at', null).eq('estado_pago', 'pendiente'),
    ctx.api.from('fin_registros').select('id', { count: 'exact', head: true }).eq('empresa_id', e).is('deleted_at', null).is('centro_id', null).is('a_cuenta_de', null),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e })]);
  if (error) throw error;
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
  const porPagar = suma((pend.data ?? []).filter((r) => r.tipo === 'gasto'), (r) => r.total);
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
    VISTAS.map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.vista === k), onclick: async () => { await hoja?.terminar(); estado.vista = k; ctx.refrescar(); } }, n)));
  const selCat = el('select', { class: 'campo', 'aria-label': 'Categoría' }, el('option', { value: '' }, 'Todas las categorías'),
    base.categorias.map((c) => el('option', { value: c.id, selected: c.id === estado.categoria }, c.nombre)));
  selCat.addEventListener('change', () => { estado.categoria = selCat.value; ctx.refrescar(); });
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [segmento, selCat];
  if (!sinMes) acciones.push(el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha'))));
  if (ctx.puede('costos', 'exportar') && data.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => import('../../../core/excel.js?v=6df4ca6').then(({ exportarExcel }) => exportarExcel(ctx, {
    titulo: pendientes ? 'Gastos e ingresos pendientes' : revisar ? 'Gastos e ingresos por revisar' : sinCentro ? 'Gastos e ingresos sin centro de costo' : recientes ? 'Gastos e ingresos recientes' : `Gastos e ingresos · ${nombreMes(estado.mes)}`, nombre: `costos-${pendientes ? 'pendientes' : recientes ? 'recientes' : estado.mes}`,
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
    if (ctx.puede('inventario', 'ver')) acciones.push(boton('Traer compras de Inventario', { icono: 'caja', onclick: (ev) => traer(ev.currentTarget) }));
    // Una sola entrada (como InnovaGestión): Subir documento, con la IA que lee al agregar la foto; ahí también se registra a mano
    acciones.push(boton('Subir documento', { icono: 'camara', tipo: 'primario', onclick: () => { location.hash = ctx.ruta('costos.subir'); } }));
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
    claseFila: (r) => (r.tipo === 'ingreso' ? 'fila-suma' : 'fila-resta'),   // franja: verde suma, roja resta
    acciones,
    vacio: pendientes ? 'No hay nada por pagar ni por cobrar.' : revisar ? 'No hay nada por revisar.' : sinCentro ? 'Todo tiene centro de costo.' : recientes ? 'Aún no hay registros.' : 'Sin registros en el mes.',
    columnas: [
      { titulo: 'Fecha', valor: (r) => fechaLarga(r.fecha) },
      { titulo: 'Concepto', valor: (r) => el('div', {}, el('a', { href: ctx.ruta('costos.registro', { id: r.id }) }, el('strong', {}, r.concepto)),
        el('div', { class: 'texto-suave texto-chico' }, [nombreTercero(r.terceros), r.faena_id ? faenaDe.get(r.faena_id) ?? 'faena' : null, r.patente ? patenteNodo(r.patente) : null, r.recurrente_id ? 'recurrente' : null, r.documento_id ? 'de Inventario' : null, r.declarable === false ? 'no declarado' : null].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x])))) },
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
        if (!ctx.puede('costos', 'editar')) return el('span', { class: `chip ${CHIP_ESTADO[r.estado_pago]}` }, nombreEstado(r));
        const sel = el('select', { class: `campo campo-estado estado-${r.estado_pago}`, 'aria-label': 'Estado', title: r.estado_pago === 'pagado' && r.medio_pago ? nombreMedio[r.medio_pago] : '' },
          estadosDe(r.tipo).map(([k, n]) => el('option', { value: k, selected: k === r.estado_pago }, k === 'pagado' && r.estado_pago === 'pagado' ? `${n} ${fechaLarga(r.fecha_pago)}` : n)));
        sel.addEventListener('change', () => cambiarEstado(r, sel));
        return el('div', {}, sel, r.estado_pago !== 'pagado' && r.vence ? el('div', { class: `texto-chico ${r.vence < hoyISO() ? 'texto-error' : 'texto-suave'}` }, `Vence ${fechaLarga(r.vence)}`) : null);
      } },
      { titulo: 'Cargó', valor: (r) => el('span', { class: 'texto-chico texto-suave' },
        r.recurrente_id ? 'Sistema (gasto fijo)' : r.documento_id ? 'Inventario' : quien.get(r.created_by) ?? '—', el('br'), fechaLarga(diaLocal(r.created_at)),
        r.updated_by && r.updated_by !== r.created_by ? el('span', {}, el('br'), `Editó ${quien.get(r.updated_by) ?? '—'}`) : null) },
    ],
  });
  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const resumen = el('div', { class: 'fin-tarjetas' },
    sinMes ? null : tarjeta(`Gastos de ${nombreMes(estado.mes)}`, gastosNeto, 'neto, sin compras de inventario'),
    sinMes || !comprasInv ? null : tarjeta('Compras de inventario', comprasInv, 'neto, es stock: no va al resultado'),
    sinMes ? null : tarjeta('Otros ingresos', ingresosNeto, 'neto'),
    tarjeta('Por pagar', porPagar, 'total, todos los meses', porPagar ? 'fin-alerta' : ''),
    tarjeta('Por cobrar', porCobrar, 'total, todos los meses'));
  // Quien solo carga (sin "aprobar") ve cantidades, no los montos totales
  tabla.querySelector('.listado-cabecera').after(contadores, ...(ctx.puede('costos', 'aprobar') ? [resumen] : []));
  tabla.classList.add('fin-lista');
  if (recientes) resumen.after(el('p', { class: 'texto-suave texto-chico' }, `Los ${RECIENTES} últimos cargados, de cualquier mes. Para ver un mes completo usa "Del mes".`));
  if (ctx.puede('costos', 'crear')) tabla.querySelector('.listado-cabecera').after(comprasSii(ctx));
  if (estado.editar && data.length) {
    hoja = planilla(ctx, data, base);
    tabla.querySelector('.tabla-contenedor').replaceWith(hoja.nodo);
    tabla.querySelector('.buscador')?.remove();
    setTimeout(() => hoja.enfocar(0, 1));
  }
  return tabla;
}

// Facturas de compra recibidas en el SII que faltan en Costos (2026-11-18, pedido de Enzo): aparecen aquí solas, sin
// subirlas. Al abrir la pantalla se revisa el SII si pasaron 30 minutos y el recuadro se actualiza sin recargar.
// Cada una se carga en el lector con su PDF y su XML (categoría y a qué va); las fotos subidas siguen en la Bandeja.
function comprasSii(ctx) {
  const caja = el('div', {});
  const pintar = async (nota = '') => {
    const [{ data }, par] = await Promise.all([pendientesBandeja(ctx),
      ctx.puede('costos', 'editar') ? ctx.api.rpc('fin_bandeja_parecido', { p_empresa: ctx.empresa.id }) : Promise.resolve({ data: [] })]);
    // Posible duplicado: ya hay un gasto del mismo proveedor con el mismo total cerca de la fecha (aunque tenga otro N°)
    const parecido = new Map((par.data ?? []).map((x) => [x.bandeja_id, x]));
    const sii = (data ?? []).filter((f) => f.origen === 'sii' && f.dte);
    const dudosas = sii.filter((f) => parecido.has(f.id)).length;
    const otras = (data ?? []).length - sii.length;
    if (!sii.length && !nota) { caja.replaceChildren(); caja.className = ''; return; }
    caja.className = 'ficha doc-grupo fin-sii';
    caja.replaceChildren(...[
      el('div', { class: 'emi-cabecera' }, el('h2', {}, sii.length ? `Facturas de compra del SII por cargar (${sii.length})` : 'Facturas de compra del SII'),
        el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('costos.bandeja') }, `Bandeja${otras ? ` (+${otras} subidas)` : ''}`, icono('derecha', { tam: 14 }))),
      nota ? el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' }, nota) : null,
      dudosas ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), ` ${dudosas === 1 ? '1 parece estar' : `${dudosas} parecen estar`} ya en Costos con otro N° o tipo de documento: revísalas antes de cargarlas.`) : null,
      sii.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla ban-tabla' },
        el('thead', {}, el('tr', {}, ['Proveedor', 'Documento', 'Fecha', 'Total', ''].map((c, i) => el('th', { class: i === 3 ? 'num' : null }, c)))),
        el('tbody', {}, sii.slice(0, 10).map((f) => el('tr', {},
          el('td', {}, el('strong', {}, f.dte.razon ?? 'Sin nombre'), el('span', { class: 'texto-suave texto-chico ban-linea' }, f.dte.rut ?? ''),
            parecido.has(f.id) ? el('a', { class: 'ban-aviso texto-chico', href: ctx.ruta('costos.registro', { id: parecido.get(f.id).registro_id }) },
              icono('alerta', { tam: 14 }), ` Posible duplicado: ${parecido.get(f.id).concepto} (${fechaLarga(parecido.get(f.id).fecha)}${parecido.get(f.id).folio ? `, N° ${parecido.get(f.id).folio}` : ''})`) : null),
          el('td', {}, `${NOMBRE_DTE[Number(f.dte.td)] ?? 'Documento'} ${f.dte.folio ?? ''}`),
          el('td', {}, f.dte.fecha ? fechaLarga(f.dte.fecha) : ''),
          el('td', { class: 'num' }, f.dte.total != null ? dinero(Number(f.dte.total)) : ''),
          el('td', {}, el('a', { class: 'boton boton-primario boton-chico', href: ctx.ruta('costos.lector', { bandeja: f.id }) }, 'Cargar', icono('derecha', { tam: 14 })))))))) : null,
      sii.length > 10 ? el('p', { class: 'texto-suave texto-chico' }, `y ${sii.length - 10} más en la Bandeja.`) : null].filter(Boolean));
  };
  pintar().then(async () => {
    try {
      const texto = await traerSiHaceFalta(ctx);
      if (texto && caja.isConnected) await pintar(/^No hay/.test(texto) ? '' : texto);
    } catch (err) { if (caja.isConnected) pintar(`No se pudo revisar el SII: ${err.message}`); }
  });
  return caja;
}
