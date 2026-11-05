// Cotizaciones → Facturas (007, 2026-11-03): registro de facturas como la planilla "Control de facturas" de IS
// Performance: N° de factura y su cotización al lado, emisión, pago estimado y real, ejecución, OC u orden de servicio,
// cliente, detalle, estado de pago, neto, IVA y total, y los respaldos (factura, OC, comprobante) con botón para subir
// lo que falta. Filtros por estado, cliente, año y "sin respaldo"; totales y Excel. La fila abre la factura.
import { el } from '../../../core/ui/dom.js?v=3af27b3';
import { icono } from '../../../core/ui/iconos.js?v=3af27b3';
import { boton } from '../../../core/ui/tabla.js?v=3af27b3';
import { avisar } from '../../../core/ui/aviso.js?v=3af27b3';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=3af27b3';
import { urlFirmada } from '../../../core/adjuntos.js?v=3af27b3';
import { numeroTexto, nombreTercero } from '../datos.js?v=3af27b3';
import { estadoPago, ESTADOS_PAGO, RESPALDOS, formFactura, formPago, anularPago, eliminarFactura, subirRespaldo } from '../facturas.js?v=3af27b3';

const filtro = { estado: 'todas', cliente: '', anio: '', sinRespaldo: false, buscar: '' };
const fecha = (d) => (d ? fechaLarga(d) : '');
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const [rf, rc, rt] = await Promise.all([
    ctx.api.from('cot_facturas').select('*').eq('empresa_id', e).is('deleted_at', null).order('fecha_emision', { ascending: false }).order('numero', { ascending: false }).limit(5000),
    // Cotizaciones enviadas o aceptadas (para ligar una factura nueva y mostrar su N°)
    ctx.api.from('cot_cotizaciones').select('*, cot_grupos(*), cot_lineas(*)').eq('empresa_id', e).is('deleted_at', null).in('estado', ['enviada', 'aceptada'])
      .order('numero', { ascending: false }).limit(1000),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social').limit(5000),
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
  const abrir = (f) => (editar ? formFactura(ctx, { f, cotizaciones: porFacturar, clientes, alGuardar: refrescar }) : null);

  // Filtros
  const nombreCliente = (f) => f.cliente_nombre || nombreTercero(clientes.find((t) => t.id === f.tercero_id)) || '';
  const faltan = (f) => RESPALDOS.filter(([k]) => (k !== 'pago_archivo' || f.fecha_pago) && (k !== 'oc_archivo' || f.oc_numero) && !f[k]);
  const anios = [...new Set(facturas.map((f) => f.fecha_emision.slice(0, 4)))].sort().reverse();
  const b = filtro.buscar.trim().toLowerCase();
  const base = facturas.filter((f) => (!filtro.cliente || (f.tercero_id ?? `t:${f.cliente_nombre}`) === filtro.cliente)
    && (!filtro.anio || f.fecha_emision.startsWith(filtro.anio))
    && (!filtro.sinRespaldo || faltan(f).length)
    && (!b || [f.numero, f.oc_numero, nombreCliente(f), f.detalle, numCot.get(f.cotizacion_id) ? numeroTexto(numCot.get(f.cotizacion_id).numero) : ''].join(' ').toLowerCase().includes(b)));
  const filas = base.filter((f) => filtro.estado === 'todas' || (filtro.estado === 'por_cobrar' ? f.estado !== 'pagada' : f.estado === filtro.estado));

  const suma = (lista, k = 'total') => lista.reduce((s, f) => s + Number(f[k] || 0), 0);
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado de pago' },
    [['todas', 'Todas'], ['por_cobrar', 'Por cobrar'], ['vencida', 'Vencidas'], ['pagada', 'Pagadas']].map(([k, n]) => {
      const lista = k === 'todas' ? base : k === 'por_cobrar' ? base.filter((f) => f.estado !== 'pagada') : base.filter((f) => f.estado === k);
      return el('button', { type: 'button', 'aria-pressed': String(filtro.estado === k), onclick: () => { filtro.estado = k; refrescar(); } }, `${n} (${lista.length})`);
    }));
  const opcionesCliente = [...new Map(facturas.map((f) => [f.tercero_id ?? `t:${f.cliente_nombre}`, nombreCliente(f)])).entries()].sort((a, c) => a[1].localeCompare(c[1]));
  const sel = (opciones, valor, etiqueta, al) => { const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t))); s.addEventListener('change', () => al(s.value)); return s; };
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'N° factura, OC, cotización, cliente, detalle…', value: filtro.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { filtro.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(refrescar, 300); });

  // Celdas
  const verArchivo = async (ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };
  const respaldos = (f) => el('div', { class: 'fac-respaldos' }, RESPALDOS.map(([k, n]) => {
    if (f[k]) return el('button', { type: 'button', class: 'fac-respaldo fac-ok', title: `Ver ${n.toLowerCase()}`, onclick: (ev) => { ev.stopPropagation(); verArchivo(f[k]); } }, icono('documento', { tam: 13 }), n === 'Comprobante de pago' ? 'Pago' : n);
    const falta = (k !== 'pago_archivo' || f.fecha_pago) && (k !== 'oc_archivo' || f.oc_numero);
    if (!falta || !editar) return null;
    return el('button', { type: 'button', class: 'fac-respaldo fac-falta', title: `Subir ${n.toLowerCase()}`, onclick: (ev) => { ev.stopPropagation(); subirRespaldo(ctx, f, k, { alGuardar: refrescar }); } }, icono('mas', { tam: 13 }), n === 'Comprobante de pago' ? 'Pago' : n);
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
  const fila = (f) => el('tr', { class: `fila-enlace fac-${f.estado}`, title: editar ? 'Abrir factura' : null, onclick: () => abrir(f) },
    el('td', {}, el('strong', {}, f.numero)), el('td', {}, cot(f)),
    el('td', { class: 'fac-fecha' }, fecha(f.fecha_emision)), el('td', { class: 'fac-fecha' }, fecha(f.fecha_pago_estimada)),
    el('td', { class: `fac-fecha${f.fecha_pago ? ' fac-pagado' : ''}` }, f.fecha_pago ? fecha(f.fecha_pago) : el('span', { class: 'texto-suave' }, '—')),
    el('td', { class: 'fac-fecha' }, fecha(f.fecha_ejecucion)),
    el('td', {}, f.oc_numero ?? el('span', { class: 'texto-suave' }, 'N/A')),
    el('td', {}, nombreCliente(f)), el('td', { class: 'fac-detalle' }, f.detalle ?? ''),
    el('td', {}, estado(f)), num(f.neto), num(f.iva), el('td', { class: 'num' }, el('strong', {}, dinero(f.total))),
    el('td', {}, respaldos(f)));

  const columnas = ['N° factura', 'Cotización', 'Emisión', 'Pago estimado', 'Pago real', 'Ejecución', 'OC / orden de servicio', 'Cliente', 'Detalle de trabajos', 'Estado de pago', 'Neto', 'IVA', 'Total', 'Respaldos'];
  const tabla = el('div', { class: 'tabla-contenedor fac-tabla' },
    el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, columnas.map((c, i) => el('th', { class: i >= 10 && i <= 12 ? 'num' : null }, c)))),
      el('tbody', {}, filas.length ? filas.map(fila) : el('tr', {}, el('td', { colspan: columnas.length, class: 'tabla-vacia' }, icono('carpeta', { tam: 28 }),
        facturas.length ? 'Ninguna factura coincide con los filtros.' : 'Todavía no hay facturas. Registra la primera con "Nueva factura".'))),
      filas.length ? el('tfoot', {}, el('tr', {}, el('th', { colspan: 10 }, `Total (${filas.length})`), el('th', { class: 'num' }, dinero(suma(filas, 'neto'))),
        el('th', { class: 'num' }, dinero(suma(filas, 'iva'))), el('th', { class: 'num' }, dinero(suma(filas))), el('th', {}))) : null));

  const porCobrar = base.filter((f) => f.estado !== 'pagada');
  const vencidas = base.filter((f) => f.estado === 'vencida');
  const pagadas = base.filter((f) => f.estado === 'pagada');
  const sinResp = base.filter((f) => faltan(f).length).length;
  const resumen = el('div', { class: 'resumen-chips' },
    el('span', { class: 'chip chip-prox' }, `Por cobrar: ${dinero(suma(porCobrar))} (${porCobrar.length})`),
    vencidas.length ? el('span', { class: 'chip chip-venc' }, `Vencido: ${dinero(suma(vencidas))} (${vencidas.length})`) : null,
    el('span', { class: 'chip chip-ok' }, `Pagado: ${dinero(suma(pagadas, 'pago_monto'))} (${pagadas.length})`),
    sinResp ? el('span', { class: 'chip chip-pend' }, `Respaldos por subir: ${sinResp}`) : null,
    porFacturar.filter((c) => c.oc_numero || c.oc_fecha).length ? el('span', { class: 'chip chip-pend' }, `Cotizaciones con OC sin factura: ${porFacturar.filter((c) => c.oc_numero || c.oc_fecha).length}`) : null);

  const excel = async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      const { exportarExcel } = await import('../../../core/excel.js?v=3af27b3');
      await exportarExcel(ctx, {
        titulo: 'Control de facturas', subtitulo: [filtro.anio || 'Todos los años', `${filas.length} facturas`].join(' · '), nombre: 'control-facturas',
        columnas: ['N° factura', 'Cotización', { t: 'Emisión', tipo: 'fecha' }, { t: 'Pago estimado', tipo: 'fecha' }, { t: 'Pago real', tipo: 'fecha' }, { t: 'Ejecución', tipo: 'fecha' },
          'OC / orden de servicio', 'Cliente', 'Detalle de trabajos', 'Estado de pago', { t: 'Neto', tipo: 'dinero' }, { t: 'IVA', tipo: 'dinero' }, { t: 'Total', tipo: 'dinero' }, { t: 'Pagado', tipo: 'dinero' }],
        filas: filas.map((f) => [f.numero, numCot.get(f.cotizacion_id) ? numeroTexto(numCot.get(f.cotizacion_id).numero) : '', f.fecha_emision, f.fecha_pago_estimada ?? '', f.fecha_pago ?? '',
          f.fecha_ejecucion ?? '', f.oc_numero ?? 'N/A', nombreCliente(f), f.detalle ?? '', ESTADOS_PAGO.find(([k]) => k === f.estado)[1],
          Number(f.neto), Number(f.iva), Number(f.total), f.pago_monto ? Number(f.pago_monto) : null]),
        total: ['TOTAL', '', '', '', '', '', '', '', '', '', suma(filas, 'neto'), suma(filas, 'iva'), suma(filas), suma(filas, 'pago_monto')],
      });
    } catch (err) { avisar(err.message, 'error'); } finally { btn.disabled = false; }
  };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Facturas'),
      el('div', { class: 'listado-acciones' },
        ctx.puede('cotizaciones', 'exportar') && filas.length ? boton('Excel', { icono: 'descargar', onclick: excel }) : null,
        crear ? boton('Nueva factura', { icono: 'mas', tipo: 'primario', onclick: () => formFactura(ctx, { cotizaciones: porFacturar, clientes, alGuardar: refrescar }) }) : null)),
    el('div', { class: 'listado-acciones fac-filtros' }, segmento,
      sel([['', 'Todos los clientes'], ...opcionesCliente], filtro.cliente, 'Cliente', (v) => { filtro.cliente = v; refrescar(); }),
      sel([['', 'Todos los años'], ...anios.map((a) => [a, a])], filtro.anio, 'Año', (v) => { filtro.anio = v; refrescar(); }),
      el('label', { class: 'casilla' }, el('input', { type: 'checkbox', checked: filtro.sinRespaldo, onchange: (ev) => { filtro.sinRespaldo = ev.target.checked; refrescar(); } }), 'Solo con respaldos por subir'),
      el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador)),
    resumen,
    tabla,
    editar ? el('p', { class: 'texto-suave texto-chico' }, 'Toca una factura para editarla. En Respaldos, lo verde se abre y lo gris con + se sube (la OC solo si tiene número; el comprobante, cuando está pagada).') : null,
    editar ? el('div', { class: 'listado-acciones' }, ...accionesFila(ctx, facturas, refrescar)) : null);
}

// Anular pago y eliminar quedan en un menú aparte (poco frecuentes): se elige la factura por número
function accionesFila(ctx, facturas, refrescar) {
  const pagadas = facturas.filter((f) => f.fecha_pago);
  const elegir = (titulo, lista, accion) => import('../../../core/ui/modal.js?v=3af27b3').then(({ abrirFormulario }) => abrirFormulario({
    titulo, textoGuardar: 'Seguir', campos: [{ id: 'f', etiqueta: 'Factura', requerido: true, opciones: [['', 'Elegir…'], ...lista.map((f) => [f.id, `N° ${f.numero} · ${f.cliente_nombre ?? ''} · ${dinero(f.total)}`])] }],
    alGuardar: (v) => { const f = lista.find((x) => x.id === v.f); if (f) setTimeout(() => accion(ctx, f, { alGuardar: refrescar }), 50); },
  }));
  return [
    pagadas.length ? boton('Anular un pago', { onclick: () => elegir('Anular un pago', pagadas, anularPago) }) : null,
    ctx.puede('cotizaciones', 'eliminar') && facturas.length ? boton('Eliminar una factura', { icono: 'basura', onclick: () => elegir('Eliminar una factura', facturas.filter((f) => !f.fecha_pago), eliminarFactura) }) : null,
  ];
}
