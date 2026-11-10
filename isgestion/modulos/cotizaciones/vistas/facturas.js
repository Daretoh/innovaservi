// Cotizaciones → Facturas (007, 2026-11-03): registro de facturas como la planilla "Control de facturas" de IS
// Performance: N° de factura y su cotización al lado, emisión, pago estimado y real, ejecución, OC u orden de servicio,
// cliente, detalle, estado de pago, neto, IVA y total, y los respaldos (factura, OC, comprobante) con botón para subir
// lo que falta. Filtros por estado, cliente, año y "sin respaldo"; totales y Excel. La fila abre la factura.
// Busca también por patente y RUT. Arriba, los vehículos que pidieron factura y falta registrarla (008).
import { el } from '../../../core/ui/dom.js?v=c16a35c';
import { icono } from '../../../core/ui/iconos.js?v=c16a35c';
import { boton } from '../../../core/ui/tabla.js?v=c16a35c';
import { avisar } from '../../../core/ui/aviso.js?v=c16a35c';
import { dinero, fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=c16a35c';
import { normalizar } from '../../../core/ui/combo.js?v=c16a35c';
import { urlFirmada } from '../../../core/adjuntos.js?v=c16a35c';
import { numeroTexto, nombreTercero, verPatente, IVA } from '../datos.js?v=c16a35c';
import { totales } from '../../taller/datos.js?v=c16a35c';
import { ordenesExternas } from '../../taller/vistas/cobros.js?v=c16a35c';
import { estadoPago, ESTADOS_PAGO, RESPALDOS, formFactura, formPago, anularPago, eliminarFactura, subirRespaldo } from '../facturas.js?v=c16a35c';

const filtro = { estado: 'todas', cliente: '', anio: '', sinRespaldo: false, buscar: '' };
const fecha = (d) => (d ? fechaLarga(d) : '');
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);

// Órdenes del taller que se pueden facturar: sin cobrar, sin anular, sin cierre ni cuenta corriente y sin cotización
const SELECT_OT = 'id, numero, estado, cobrado, doc_tipo, tipo_venta, descuento, abono, tercero_id, factura_tercero_id, termino_at, entregado_at, tal_vehiculos(patente, marca, modelo), terceros(razon_social, nombre_fantasia), tal_orden_servicios(precio)';
const sinSignos = (t) => normalizar(t).replace(/[^a-z0-9ñ ]/g, '');

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const verTaller = ctx.puede('taller', 'ver');
  const [rf, rc, rt, ro] = await Promise.all([
    ctx.api.from('cot_facturas').select('*').eq('empresa_id', e).is('deleted_at', null).order('fecha_emision', { ascending: false }).order('numero', { ascending: false }).limit(5000),
    // Cotizaciones enviadas o aceptadas (para ligar una factura nueva y mostrar su N°)
    ctx.api.from('cot_cotizaciones').select('*, cot_grupos(*), cot_lineas(*)').eq('empresa_id', e).is('deleted_at', null).is('madre_id', null).in('estado', ['enviada', 'aceptada'])
      .order('numero', { ascending: false }).limit(1000),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, rut').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social').limit(5000),
    verTaller ? ctx.api.from('tal_ordenes').select(SELECT_OT).eq('empresa_id', e).eq('cobrado', false).eq('tipo_venta', 'normal').in('estado', ['espera', 'proceso', 'terminado', 'entregado']).order('numero', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
  ]);
  if (rf.error) throw rf.error;
  if (rc.error) throw rc.error;
  const facturas = rf.data.map((f) => ({ ...f, estado: estadoPago(f, hoy) }));
  const cots = rc.data ?? [];
  const numCot = new Map(cots.map((c) => [c.id, c]));
  const clientes = rt.data ?? [];
  const conFactura = new Set(facturas.map((f) => f.cotizacion_id).filter(Boolean));
  const porFacturar = cots.filter((c) => !conFactura.has(c.id));
  const editar = ctx.puede('cotizaciones', 'editar');
  const crear = ctx.puede('cotizaciones', 'crear');
  const refrescar = () => ctx.refrescar();

  // Órdenes ligadas a una factura (también las ya cobradas) y órdenes disponibles para facturar
  const idsLigadas = facturas.map((f) => f.orden_id).filter(Boolean);
  const { data: ligadas } = verTaller && idsLigadas.length ? await ctx.api.from('tal_ordenes').select(SELECT_OT).in('id', idsLigadas) : { data: [] };
  const ordenDe = new Map((ligadas ?? []).map((o) => [o.id, o]));
  const externas = ctx.puede('cierres', 'ver') ? await ordenesExternas(ctx, ro.data ?? []) : new Map();
  const conCot = new Set(cots.flatMap((c) => c.cot_grupos.map((g) => g.orden_id)).filter(Boolean));
  const ligadasIds = new Set(idsLigadas);
  const armarOrden = (o) => {
    const v = o.tal_vehiculos; const t = totales(o, o.tal_orden_servicios);
    const auto = [v?.marca, v?.modelo].filter(Boolean).join(' ');
    return { id: o.id, numero: o.numero, neto: t.neto, total: t.neto + Math.round(t.neto * IVA), tercero: o.factura_tercero_id ?? o.tercero_id ?? '', pedida: !!o.factura_tercero_id, estado: o.estado,
      patente: v?.patente ?? '', auto, cliente: nombreTercero(clientes.find((c) => c.id === o.factura_tercero_id)) || nombreTercero(o.terceros),
      fecha: diaLocal(o.termino_at ?? o.entregado_at) || '', detalle: [auto, verPatente(v?.patente)].filter(Boolean).join(' · '),
      texto: `${verPatente(v?.patente) || 'S/P'} · ${auto || 'Vehículo'} · N° ${o.numero} · ${nombreTercero(o.terceros) || 'Sin cliente'}` };
  };
  const ordenes = (ro.data ?? []).filter((o) => !ligadasIds.has(o.id) && !externas.has(o.id) && !conCot.has(o.id)).map(armarOrden);
  const pedidas = ordenes.filter((o) => o.pedida);
  const abrir = (f) => (editar ? formFactura(ctx, { f, cotizaciones: porFacturar, clientes, ordenes, alGuardar: refrescar }) : null);

  // Filtros
  const nombreCliente = (f) => f.cliente_nombre || nombreTercero(clientes.find((t) => t.id === f.tercero_id)) || '';
  const faltan = (f) => RESPALDOS.filter(([k]) => (k !== 'pago_archivo' || f.fecha_pago) && (k !== 'oc_archivo' || f.oc_numero) && !f[k]);
  const anios = [...new Set(facturas.map((f) => f.fecha_emision.slice(0, 4)))].sort().reverse();
  // Texto donde se busca: N°, OC, cliente, RUT, detalle, cotización y patentes (de la orden y de la cotización)
  const textoBusqueda = new Map(facturas.map((f) => {
    const c = numCot.get(f.cotizacion_id); const o = ordenDe.get(f.orden_id);
    return [f.id, sinSignos([f.numero, f.oc_numero, nombreCliente(f), clientes.find((t) => t.id === f.tercero_id)?.rut, f.detalle, c ? numeroTexto(c.numero) : '', o ? `${o.tal_vehiculos?.patente ?? ''} ${o.numero}` : '', ...(c?.cot_grupos ?? []).flatMap((g) => [g.patente, g.titulo])].filter(Boolean).join(' '))];
  }));
  const palabras = () => sinSignos(filtro.buscar).split(/\s+/).filter(Boolean);
  const coincide = (texto) => palabras().every((w) => texto.includes(w));
  const calcular = () => {
    const base = facturas.filter((f) => (!filtro.cliente || (f.tercero_id ?? `t:${f.cliente_nombre}`) === filtro.cliente)
      && (!filtro.anio || f.fecha_emision.startsWith(filtro.anio))
      && (!filtro.sinRespaldo || faltan(f).length)
      && coincide(textoBusqueda.get(f.id)));
    return { base, filas: base.filter((f) => filtro.estado === 'todas' || (filtro.estado === 'por_cobrar' ? f.estado !== 'pagada' : f.estado === filtro.estado)) };
  };
  const suma = (lista, k = 'total') => lista.reduce((s, f) => s + Number(f[k] || 0), 0);

  // Celdas
  const verArchivo = async (ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };
  const corto = (n) => (n === 'Comprobante de pago' ? 'Pago' : n === 'Factura' ? 'Fac.' : n);
  const respaldos = (f) => el('div', { class: 'fac-respaldos' }, RESPALDOS.map(([k, n]) => {
    if (f[k]) return el('button', { type: 'button', class: 'fac-respaldo fac-ok', title: `Ver ${n.toLowerCase()}`, onclick: (ev) => { ev.stopPropagation(); verArchivo(f[k]); } }, corto(n));
    const falta = (k !== 'pago_archivo' || f.fecha_pago) && (k !== 'oc_archivo' || f.oc_numero);
    if (!falta || !editar) return null;
    return el('button', { type: 'button', class: 'fac-respaldo fac-falta', title: `Subir ${n.toLowerCase()}`, onclick: (ev) => { ev.stopPropagation(); subirRespaldo(ctx, f, k, { alGuardar: refrescar }); } }, icono('mas', { tam: 12 }), corto(n));
  }));
  const estado = (f) => {
    const [, n, chip] = ESTADOS_PAGO.find(([k]) => k === f.estado);
    const atraso = f.estado === 'vencida' ? diasEntre(f.fecha_pago_estimada, hoy) : null;
    return el('div', { class: 'fac-estado' }, el('span', { class: `chip ${chip}` }, n, atraso ? ` · ${atraso} d` : ''),
      editar && f.estado !== 'pagada' ? boton('Pagar', { icono: 'dinero', class: 'boton boton-secundario boton-chico', onclick: (ev) => { ev.stopPropagation(); formPago(ctx, f, { alGuardar: refrescar }); } }) : null);
  };
  const cot = (f) => {
    const c = numCot.get(f.cotizacion_id);
    if (!f.cotizacion_id) return el('span', { class: 'texto-suave' }, '—');
    return el('a', { href: ctx.ruta('cotizaciones.editor', { id: f.cotizacion_id }), onclick: (ev) => ev.stopPropagation() }, c ? numeroTexto(c.numero) : 'Ver');
  };
  const num = (n) => el('td', { class: 'num' }, dinero(n));
  const celdaCliente = (f) => {
    const o = ordenDe.get(f.orden_id);
    return el('td', { class: 'fac-cliente' }, el('strong', {}, nombreCliente(f)),
      o ? el('a', { class: 'fac-orden', href: ctx.ruta('taller.orden', { id: o.id }), onclick: (ev) => ev.stopPropagation(), title: 'Ver la orden' }, `${verPatente(o.tal_vehiculos?.patente) || 'S/P'} · N° ${o.numero}`) : null,
      f.detalle ? el('span', { class: 'fac-detalle', title: f.detalle }, f.detalle) : null);
  };
  const fila = (f) => el('tr', { class: `fila-enlace fac-${f.estado}`, title: editar ? 'Abrir factura' : null, onclick: () => abrir(f) },
    el('td', {}, el('strong', {}, f.numero)), el('td', {}, cot(f)),
    el('td', { class: 'fac-fecha' }, fecha(f.fecha_emision)), el('td', { class: 'fac-fecha' }, fecha(f.fecha_pago_estimada)),
    el('td', { class: `fac-fecha${f.fecha_pago ? ' fac-pagado' : ''}` }, f.fecha_pago ? fecha(f.fecha_pago) : el('span', { class: 'texto-suave' }, '—')),
    el('td', { class: 'fac-fecha' }, fecha(f.fecha_ejecucion)),
    el('td', { class: 'fac-oc' }, f.oc_numero ?? el('span', { class: 'texto-suave' }, 'N/A')),
    celdaCliente(f),
    el('td', {}, estado(f)), num(f.neto), num(f.iva), el('td', { class: 'num' }, el('strong', {}, dinero(f.total))),
    el('td', {}, respaldos(f)));

  const columnas = ['N° fac.', 'Cot.', 'Emisión', 'Pago est.', 'Pago real', 'Ejecución', 'OC', 'Cliente', 'Estado', 'Neto', 'IVA', 'Total', 'Respaldos'];
  const tablaDe = (filas) => el('div', { class: 'tabla-contenedor fac-tabla' },
    el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, columnas.map((c, i) => el('th', { class: i >= 9 && i <= 11 ? 'num' : null }, c)))),
      el('tbody', {}, filas.length ? filas.map(fila) : el('tr', {}, el('td', { colspan: columnas.length, class: 'tabla-vacia' }, icono('carpeta', { tam: 28 }),
        facturas.length ? 'Ninguna factura coincide con los filtros.' : 'Todavía no hay facturas. Registra la primera con "Nueva factura".'))),
      filas.length ? el('tfoot', {}, el('tr', {}, el('th', { colspan: 9 }, `Total (${filas.length})`), el('th', { class: 'num' }, dinero(suma(filas, 'neto'))),
        el('th', { class: 'num' }, dinero(suma(filas, 'iva'))), el('th', { class: 'num' }, dinero(suma(filas))), el('th', {}))) : null));

  // Vehículos que pidieron factura y todavía no la tienen
  const bandaPedidas = () => {
    const lista = pedidas.filter((o) => coincide(sinSignos(`${o.texto} ${o.cliente}`)));
    if (!lista.length) return null;
    return el('div', { class: 'ficha doc-grupo fac-por-facturar' },
      el('h2', {}, `Pidieron factura y falta registrarla (${lista.length})`),
      lista.map((o) => el('div', { class: 'doc-fila' },
        el('span', { class: 'doc-nombre' }, el('strong', {}, `${verPatente(o.patente) || 'S/P'} · ${o.auto || 'Vehículo'}`),
          el('span', { class: 'texto-suave texto-chico' }, `${o.cliente} · N° ${o.numero} · ${dinero(o.total)} con IVA · ${o.estado === 'entregado' ? 'Ya entregado' : 'No se entrega hasta el pago'}`)),
        crear ? boton('Registrar factura', { icono: 'mas', onclick: () => formFactura(ctx, { orden: o, cotizaciones: porFacturar, clientes, ordenes, alGuardar: refrescar }) }) : null)));
  };

  // Lo que cambia con los filtros se repinta sin recargar ni perder el cursor del buscador
  const zona = el('div', { class: 'fac-zona' });
  const segmentoDe = (base) => el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado de pago' },
    [['todas', 'Todas'], ['por_cobrar', 'Por cobrar'], ['vencida', 'Vencidas'], ['pagada', 'Pagadas']].map(([k, n]) => {
      const lista = k === 'todas' ? base : k === 'por_cobrar' ? base.filter((f) => f.estado !== 'pagada') : base.filter((f) => f.estado === k);
      return el('button', { type: 'button', 'aria-pressed': String(filtro.estado === k), onclick: () => { filtro.estado = k; pintar(); } }, `${n} (${lista.length})`);
    }));
  const resumenDe = (base) => {
    const porCobrar = base.filter((f) => f.estado !== 'pagada');
    const vencidas = base.filter((f) => f.estado === 'vencida');
    const pagadas = base.filter((f) => f.estado === 'pagada');
    const sinResp = base.filter((f) => faltan(f).length).length;
    const ocSinFactura = porFacturar.filter((c) => c.oc_numero || c.oc_fecha).length;
    return el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-prox' }, `Por cobrar: ${dinero(suma(porCobrar))} (${porCobrar.length})`),
      vencidas.length ? el('span', { class: 'chip chip-venc' }, `Vencido: ${dinero(suma(vencidas))} (${vencidas.length})`) : null,
      el('span', { class: 'chip chip-ok' }, `Pagado: ${dinero(suma(pagadas, 'pago_monto'))} (${pagadas.length})`),
      sinResp ? el('span', { class: 'chip chip-pend' }, `Respaldos por subir: ${sinResp}`) : null,
      ocSinFactura ? el('span', { class: 'chip chip-pend' }, `Cotizaciones con OC sin factura: ${ocSinFactura}`) : null);
  };
  function pintar() {
    const { base, filas } = calcular();
    zona.replaceChildren(...[bandaPedidas(), el('div', { class: 'fac-estados' }, segmentoDe(base), resumenDe(base)), tablaDe(filas)].filter(Boolean));
  }

  const sel = (opciones, valor, etiqueta, al) => { const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t))); s.addEventListener('change', () => al(s.value)); return s; };
  const opcionesCliente = [...new Map(facturas.map((f) => [f.tercero_id ?? `t:${f.cliente_nombre}`, nombreCliente(f)])).entries()].sort((a, c) => a[1].localeCompare(c[1]));
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'Patente, N° factura, OC, cotización, cliente, RUT…', value: filtro.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { filtro.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(pintar, 150); });

  const excel = async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const { filas } = calcular();
    try {
      const { exportarExcel } = await import('../../../core/excel.js?v=c16a35c');
      await exportarExcel(ctx, {
        titulo: 'Control de facturas', subtitulo: [filtro.anio || 'Todos los años', `${filas.length} facturas`].join(' · '), nombre: 'control-facturas',
        columnas: ['N° factura', 'Cotización', { t: 'Emisión', tipo: 'fecha' }, { t: 'Pago estimado', tipo: 'fecha' }, { t: 'Pago real', tipo: 'fecha' }, { t: 'Ejecución', tipo: 'fecha' },
          'OC / orden de servicio', 'Cliente', 'Vehículo', 'Detalle de trabajos', 'Estado de pago', { t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, { t: 'Pagado', tipo: 'dinero' }],
        filas: filas.map((f) => [f.numero, numCot.get(f.cotizacion_id) ? numeroTexto(numCot.get(f.cotizacion_id).numero) : '', f.fecha_emision, f.fecha_pago_estimada ?? '', f.fecha_pago ?? '',
          f.fecha_ejecucion ?? '', f.oc_numero ?? 'N/A', nombreCliente(f), verPatente(ordenDe.get(f.orden_id)?.tal_vehiculos?.patente), f.detalle ?? '', ESTADOS_PAGO.find(([k]) => k === f.estado)[1],
          Number(f.neto), Number(f.iva), Number(f.total), f.pago_monto ? Number(f.pago_monto) : null]),
        total: ['TOTAL', '', '', '', '', '', '', '', '', '', '', suma(filas, 'neto'), suma(filas, 'iva'), suma(filas), suma(filas, 'pago_monto')],
      });
    } catch (err) { avisar(err.message, 'error'); } finally { btn.disabled = false; }
  };

  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Facturas'),
      el('div', { class: 'listado-acciones' },
        ctx.puede('cotizaciones', 'exportar') && facturas.length ? boton('Excel', { icono: 'descargar', onclick: excel }) : null,
        crear ? boton('Nueva factura', { icono: 'mas', tipo: 'primario', onclick: () => formFactura(ctx, { cotizaciones: porFacturar, clientes, ordenes, alGuardar: refrescar }) }) : null)),
    el('div', { class: 'listado-acciones fac-filtros' },
      el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador),
      sel([['', 'Todos los clientes'], ...opcionesCliente], filtro.cliente, 'Cliente', (v) => { filtro.cliente = v; pintar(); }),
      sel([['', 'Todos los años'], ...anios.map((a) => [a, a])], filtro.anio, 'Año', (v) => { filtro.anio = v; pintar(); }),
      el('label', { class: 'casilla' }, el('input', { type: 'checkbox', checked: filtro.sinRespaldo, onchange: (ev) => { filtro.sinRespaldo = ev.target.checked; pintar(); } }), 'Solo con respaldos por subir')),
    zona,
    editar ? el('p', { class: 'texto-suave texto-chico' }, 'Toca una factura para editarla. En Respaldos, lo verde se abre y lo gris con + se sube (la OC solo si tiene número; el comprobante, cuando está pagada).') : null,
    editar ? el('div', { class: 'listado-acciones' }, ...accionesFila(ctx, facturas, refrescar)) : null);
}

// Anular pago y eliminar quedan en un menú aparte (poco frecuentes): se elige la factura por número
function accionesFila(ctx, facturas, refrescar) {
  const pagadas = facturas.filter((f) => f.fecha_pago);
  const elegir = (titulo, lista, accion) => import('../../../core/ui/modal.js?v=c16a35c').then(({ abrirFormulario }) => abrirFormulario({
    titulo, textoGuardar: 'Seguir', campos: [{ id: 'f', etiqueta: 'Factura', requerido: true, opciones: [['', 'Elegir…'], ...lista.map((f) => [f.id, `N° ${f.numero} · ${f.cliente_nombre ?? ''} · ${dinero(f.total)}`])] }],
    alGuardar: (v) => { const f = lista.find((x) => x.id === v.f); if (f) setTimeout(() => accion(ctx, f, { alGuardar: refrescar }), 50); },
  }));
  return [
    pagadas.length ? boton('Anular un pago', { onclick: () => elegir('Anular un pago', pagadas, anularPago) }) : null,
    ctx.puede('cotizaciones', 'eliminar') && facturas.length ? boton('Eliminar una factura', { icono: 'basura', onclick: () => elegir('Eliminar una factura', facturas.filter((f) => !f.fecha_pago), eliminarFactura) }) : null,
  ];
}
