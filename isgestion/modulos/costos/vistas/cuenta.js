// Cuenta corriente con un proveedor (2026-10-28; ej.: desabolladura y pintura, o colaciones que se pagan antes y se
// facturan a fin de mes, 2026-11-03): sus facturas o trabajos, menos
// las compras que la empresa hizo por su cuenta (se pagan al local y se le descuentan) y los abonos que se le pagan.
// Pestañas: Resumen mensual (solo lectura, como la planilla "Resumen D&P": por mes sus trabajos, compras y pagos con
// saldo acumulado) y Movimientos (registrar pago, dejar al día). Se abre desde Pagos (sin opción nueva en el menú).
// Ruta: #/costos.cuenta?t=<tercero>
import { el } from '../../../core/ui/dom.js?v=11a5492';
import { icono } from '../../../core/ui/iconos.js?v=11a5492';
import { boton } from '../../../core/ui/tabla.js?v=11a5492';
import { abrirFormulario } from '../../../core/ui/modal.js?v=11a5492';
import { avisar } from '../../../core/ui/aviso.js?v=11a5492';
import { subirArchivo } from '../../../core/adjuntos.js?v=11a5492';
import { dinero, fechaLarga, hoyISO, nombreMes } from '../../../core/ui/formato.js?v=11a5492';
import { nombreTercero, nombreMedio, MEDIOS } from '../datos.js?v=11a5492';

let pestana = 'resumen', tercero = null, mesFiltro = '', buscar = '';   // vuelve al resumen (todos los meses) al abrir otra cuenta
const TIPO = { trabajo: ['Factura o trabajo', 'chip-ok'], compra: ['Compra a su cuenta', 'chip-prox'], abono: ['Pago', 'chip-pend'] };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const t = ctx.params.t;
  if (t !== tercero) { tercero = t; pestana = 'resumen'; mesFiltro = ''; buscar = ''; }
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.pagos') }, icono('volver', { tam: 16 }), 'Pagos');
  const [{ data: ter }, mov] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, rut').eq('id', t).maybeSingle(),
    ctx.api.rpc('fin_cuenta_tercero', { p_empresa: e, p_tercero: t }),
  ]);
  if (!ter) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Proveedor no encontrado'));
  if (mov.error) throw mov.error;
  const movs = mov.data ?? [];

  // Columnas de la planilla (solo lectura): cliente, vehículo y estado salen de la orden del taller; piezas, cliente
  // migrado, ubicación y destino de la compra, del registro (las compras migradas traen "Local: producto · destino").
  const ids = (k) => movs.filter((m) => m.tipo === k).map((m) => m.id);
  const ordenes = [...new Set(movs.map((m) => m.orden_id).filter(Boolean))];
  const [regs, pags, ords] = await Promise.all([
    ids('trabajo').length + ids('compra').length ? ctx.api.from('fin_registros').select('id, notas, terceros:tercero_id(razon_social, nombre_fantasia), fin_categorias(nombre)').in('id', [...ids('trabajo'), ...ids('compra')]) : { data: [] },
    ids('abono').length ? ctx.api.from('fin_pagos').select('id, medio').in('id', ids('abono')) : { data: [] },
    ordenes.length ? ctx.api.from('tal_ordenes').select('id, estado, terceros:tercero_id(razon_social, nombre_fantasia), tal_vehiculos:vehiculo_id(marca, modelo, patente)').in('id', ordenes) : { data: [] },
  ]);
  const porId = (r) => new Map((r.error ? [] : r.data ?? []).map((x) => [x.id, x]));   // sin Taller instalado, la orden no viene
  const reg = porId(regs), pag = porId(pags), ord = porId(ords);
  const cache = new Map();
  const info = (m) => {
    if (cache.has(m.id)) return cache.get(m.id);
    const r = reg.get(m.id) ?? {}, o = m.orden_id ? ord.get(m.orden_id) : null;
    const nota = (k) => r.notas?.match(new RegExp(`${k}:\\s*([^·]+)`))?.[1].trim() ?? '';
    let x;
    if (m.tipo === 'trabajo') {
      // Sin orden, el vehículo sale del inicio del concepto ("Marca Modelo PATENTE: trabajo")
      const [marcaTxt, ...modeloTxt] = (m.concepto.includes(': ') ? m.concepto.slice(0, m.concepto.indexOf(': ')) : '').replace(m.patente ?? '', '').trim().split(/\s+/);
      x = { estado: o?.estado ? o.estado[0].toUpperCase() + o.estado.slice(1).replace(/_/g, ' ') : '', cliente: nombreTercero(o?.terceros) || nota('Cliente'),
        marca: o?.tal_vehiculos?.marca || marcaTxt || '', modelo: o?.tal_vehiculos?.modelo || modeloTxt.join(' '), patente: o?.tal_vehiculos?.patente ?? m.patente ?? '',
        piezas: nota('Piezas'), detalle: m.concepto.includes(': ') ? m.concepto.slice(m.concepto.indexOf(': ') + 2) : m.concepto };
    } else if (m.tipo === 'compra') {
      const local = nombreTercero(r.terceros);
      const dos = !local && m.concepto.includes(': ') ? m.concepto.indexOf(': ') : -1;
      const resto = dos >= 0 ? m.concepto.slice(dos + 2) : m.concepto;
      const [producto, ...destino] = local ? [resto] : resto.split(' · ');
      x = { producto, ubicacion: local || (dos >= 0 ? m.concepto.slice(0, dos) : ''), destino: destino.join(' · ') || m.patente || '', categoria: r.fin_categorias?.nombre ?? '' };
    } else x = { medio: nombreMedio[pag.get(m.id)?.medio] ?? '' };
    cache.set(m.id, x);
    return x;
  };
  const suma =(k, l = movs) => l.filter((m) => m.tipo === k).reduce((s, m) => s + Number(m.monto), 0);
  const saldo = suma('trabajo') - suma('compra') - suma('abono');

  // Resumen por mes con saldo acumulado
  const meses = [...new Set(movs.map((m) => m.fecha.slice(0, 7)))].sort();
  let acumulado = 0;
  const resumen = meses.map((m) => {
    const l = movs.filter((x) => x.fecha.startsWith(m));
    const fila = { m, trabajos: suma('trabajo', l), compras: suma('compra', l), abonos: suma('abono', l) };
    fila.neto = fila.trabajos - fila.compras - fila.abonos; acumulado += fila.neto; fila.saldo = acumulado;
    return fila;
  });

  const abono = () => abrirFormulario({
    titulo: `Pago a ${nombreTercero(ter)}`,
    mensaje: saldo > 0 ? `Saldo a pagar hoy: ${dinero(saldo)} (facturas o trabajos menos compras a su cuenta y pagos anteriores).` : 'No hay saldo pendiente: el pago queda a cuenta de la próxima factura.',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true, valor: saldo > 0 ? String(saldo) : '' },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'notas', etiqueta: 'Detalle', valor: saldo > 0 ? 'Pago' : 'Pago a cuenta' },
      { id: 'archivo', etiqueta: 'Comprobante (opcional)', tipo: 'file', accept: 'image/*,application/pdf' },
    ],
    textoGuardar: 'Registrar pago',
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      const ruta = x.archivo?.size ? (await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo: x.archivo, tabla: 'fin_pagos' })).ruta : null;
      const { error } = await ctx.api.from('fin_pagos').insert({ empresa_id: e, fecha: x.fecha, monto, medio: x.medio, tercero_id: t, archivo: ruta, notas: x.notas.trim() || null,
        estado: ctx.puede('costos', 'aprobar') ? 'validado' : 'por_validar' });
      if (error) throw new Error(error.message);
      avisar(ctx.puede('costos', 'aprobar') ? 'Pago registrado.' : 'Pago registrado: queda por validar en Pagos.'); ctx.refrescar();
    },
  });
  // Al dejar la cuenta al día, sus trabajos dejan de figurar "por pagar" (el saldo no cambia)
  const alDia = () => abrirFormulario({
    titulo: 'Dejar las facturas o trabajos como pagados',
    mensaje: `Los ${movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').length} facturas o trabajos por pagar quedan pagados hoy (se pagaron con los pagos registrados y descuentos de compras). Úsalo cuando el saldo quedó en cero. El saldo de la cuenta no cambia.`,
    campos: [], textoGuardar: 'Dejar al día',
    alGuardar: async () => {
      const ids = movs.filter((m) => m.tipo === 'trabajo' && m.estado !== 'pagado').map((m) => m.id);
      if (!ids.length) return;
      const { error } = await ctx.api.from('fin_registros').update({ estado_pago: 'pagado', fecha_pago: hoyISO(), medio_pago: 'otro' }).in('id', ids);
      if (error) throw new Error(error.message);
      avisar('Cuenta al día.'); ctx.refrescar();
    },
  });
  const excel = () => import('../../../core/excel.js?v=11a5492').then(({ nuevoExcel }) => nuevoExcel(ctx, { titulo: `Cuenta de ${nombreTercero(ter)}`, subtitulo: `Saldo ${saldo >= 0 ? 'a pagarle' : 'a favor de la empresa'}: ${dinero(Math.abs(saldo))}` }))
    .then(async (x) => {
      x.tabla({ titulo: 'Resumen mensual (saldo)', columnas: ['Mes', { t: 'Saldo inicial', tipo: 'dinero' }, { t: 'Trabajos', tipo: 'dinero' }, { t: 'Compras a su cuenta', tipo: 'dinero' }, { t: 'Pagos', tipo: 'dinero' }, { t: 'Saldo final', tipo: 'dinero' }],
        filas: resumen.map((r) => [nombreMes(r.m), r.saldo - r.neto, r.trabajos, -r.compras, -r.abonos, r.saldo]) });
      const de = (k) => movs.filter((m) => m.tipo === k);
      const vacios = (n) => Array(n).fill('');
      x.tabla({ titulo: 'Trabajos', columnas: ['Estado', { t: 'Fecha', tipo: 'fecha' }, 'Mes', 'Cliente', 'Marca', 'Modelo', 'Patente', 'Piezas', 'Detalle del trabajo', { t: 'Monto cobrado', tipo: 'dinero' }],
        filas: de('trabajo').map((m) => { const i = info(m); return [i.estado, m.fecha, nombreMes(m.fecha.slice(0, 7)), i.cliente, i.marca, i.modelo, i.patente, i.piezas, i.detalle, Number(m.monto)]; }),
        total: ['Total', ...vacios(8), suma('trabajo')] });
      x.tabla({ titulo: 'Compras por su cuenta', columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Mes', 'Producto / ítem', 'Ubicación compra', 'Destino', 'Categoría', { t: 'Monto', tipo: 'dinero' }],
        filas: de('compra').map((m) => { const i = info(m); return [m.fecha, nombreMes(m.fecha.slice(0, 7)), i.producto, i.ubicacion, i.destino, i.categoria, Number(m.monto)]; }),
        total: ['Total', ...vacios(5), suma('compra')] });
      x.tabla({ titulo: 'Pagos', columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Mes', 'Detalle', 'Medio', { t: 'Monto', tipo: 'dinero' }],
        filas: de('abono').map((m) => [m.fecha, nombreMes(m.fecha.slice(0, 7)), m.concepto, info(m).medio, Number(m.monto)]), total: ['Total', ...vacios(3), suma('abono')] });
      await x.guardar(`cuenta-${nombreTercero(ter)}-${hoyISO()}`);
    }).catch((err) => avisar(err.message, 'error'));

  const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
    el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, dinero(valor)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  const fila = (m) => el(m.tipo === 'abono' ? 'div' : 'a', { class: 'doc-fila', ...(m.tipo === 'abono' ? {} : { href: ctx.ruta('costos.registro', { id: m.id }) }) },
    el('span', { class: `chip ${TIPO[m.tipo][1]}` }, TIPO[m.tipo][0]),
    el('span', { class: 'doc-nombre' }, el('strong', {}, m.concepto), el('span', { class: 'texto-suave texto-chico' }, [fechaLarga(m.fecha), m.patente,
      m.tipo === 'trabajo' && m.estado !== 'pagado' ? 'por pagar' : null, m.tipo === 'abono' && m.estado === 'por_validar' ? 'por validar' : null].filter(Boolean).join(' · '))),
    el('strong', { class: m.tipo === 'trabajo' ? '' : 'texto-suave' }, `${m.tipo === 'trabajo' ? '' : '−'}${dinero(m.monto)}`));

  // Pestañas de lectura, con las columnas de la planilla: un bloque por mes con su nombre centrado y el total abajo
  const menos = (n) => (n ? `−${dinero(n)}` : '—');
  // Filtro por mes (todas las pestañas salvo Movimientos; el saldo acumulado sigue contando los meses anteriores)
  if (mesFiltro && !resumen.some((r) => r.m === mesFiltro)) mesFiltro = '';
  const visibles = mesFiltro ? resumen.filter((r) => r.m === mesFiltro) : resumen;
  // Buscador: patente (con o sin puntos), vehículo, cliente, detalle del trabajo, producto, local, monto o fecha
  const plano = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sinSignos = (s) => s.replace(/[.\-\s]/g, '');
  const textoDe = new Map(movs.map((m) => [m.id, plano([m.concepto, m.patente, fechaLarga(m.fecha), String(m.monto), dinero(m.monto), ...Object.values(info(m))].filter(Boolean).join(' '))]));
  const coincide = (m) => {
    const q = plano(buscar.trim());
    if (!q) return true;
    const h = textoDe.get(m.id);
    return q.split(/\s+/).every((p) => h.includes(p) || sinSignos(h).includes(sinSignos(p)));
  };
  const enFiltro = (k) => movs.filter((m) => m.tipo === k && (!mesFiltro || m.fecha.startsWith(mesFiltro)) && coincide(m));
  const filtroMes = el('select', { class: 'campo campo-filtro', 'aria-label': 'Mes', onchange: (ev) => { mesFiltro = ev.target.value; ctx.refrescar(); } },
    el('option', { value: '' }, 'Todos los meses'),
    [...resumen].reverse().map((r) => el('option', { value: r.m, selected: r.m === mesFiltro }, nombreMes(r.m))));
  const porMes = (titulo, lista, columnas) => {
    const n = columnas.length;
    const meses = [...new Set(lista.map((m) => m.fecha.slice(0, 7)))].sort();
    return el('div', { class: 'ficha doc-grupo' }, el('h2', {}, titulo),
      !lista.length ? el('p', { class: 'texto-suave' }, 'Sin registros.') : el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, columnas.map(([h, , num]) => el('th', { class: num ? 'num' : null }, h)))),
        meses.map((mes) => el('tbody', {},
          el('tr', { class: 'cue-mes' }, el('td', { colspan: n }, nombreMes(mes))),
          lista.filter((m) => m.fecha.startsWith(mes)).map((m) => el('tr', {}, columnas.map(([, f, num]) => el('td', { class: num ? 'num' : null }, f(m) || '—')))))),
        el('tfoot', {}, el('tr', {}, el('th', { colspan: n - 1 }, `Total (${lista.length})`), el('th', { class: 'num' }, dinero(lista.reduce((x, m) => x + Number(m.monto), 0))))))));
  };
  const COL_TRABAJOS = [['Estado', (m) => info(m).estado], ['Fecha', (m) => fechaLarga(m.fecha)], ['Cliente', (m) => info(m).cliente], ['Marca', (m) => info(m).marca],
    ['Modelo', (m) => info(m).modelo], ['Patente', (m) => info(m).patente], ['Piezas', (m) => info(m).piezas], ['Detalle del trabajo', (m) => info(m).detalle],
    ['Monto cobrado', (m) => dinero(m.monto), true]];
  const COL_COMPRAS = [['Fecha', (m) => fechaLarga(m.fecha)], ['Producto / ítem', (m) => info(m).producto], ['Ubicación compra', (m) => info(m).ubicacion],
    ['Destino', (m) => info(m).destino], ['Categoría', (m) => info(m).categoria], ['Monto', (m) => dinero(m.monto), true]];
  const COL_PAGOS = [['Fecha', (m) => fechaLarga(m.fecha)], ['Detalle', (m) => m.concepto], ['Medio', (m) => info(m).medio],
    ['Estado', (m) => (m.estado === 'por_validar' ? 'Por validar' : 'Validado')], ['Monto', (m) => dinero(m.monto), true]];
  // Tabla de saldo (como una amortización): saldo inicial + trabajos − compras − pagos = saldo final de cada mes
  const cuantos = (m, k, s, p) => { const n = movs.filter((x) => x.tipo === k && x.fecha.startsWith(m)).length; return n ? `${n} ${n === 1 ? s : p}` : null; };
  const vistaResumen = () => el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Resumen mensual'),
    el('p', { class: 'texto-suave texto-chico' }, 'Lo que se le debe a fin de cada mes: saldo del mes anterior + trabajos hechos − compras a su nombre − pagos.'),
    !resumen.length ? el('p', { class: 'texto-suave' }, 'Sin movimientos.') : el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Mes'), ['Saldo inicial', '+ Trabajos', '− Compras a su nombre', '− Pagos', 'Saldo final'].map((h) => el('th', { class: 'num' }, h)), el('th', {}, 'Detalle'))),
      el('tbody', {}, visibles.map((r) => el('tr', {}, el('td', { class: 'cue-mes-celda' }, nombreMes(r.m)), el('td', { class: 'num texto-suave' }, dinero(r.saldo - r.neto)),
        el('td', { class: 'num' }, r.trabajos ? dinero(r.trabajos) : '—'), el('td', { class: 'num' }, menos(r.compras)), el('td', { class: 'num' }, menos(r.abonos)),
        el('td', { class: 'num' }, el('strong', {}, dinero(r.saldo))),
        el('td', { class: 'texto-suave texto-chico' }, [cuantos(r.m, 'trabajo', 'trabajo', 'trabajos'), cuantos(r.m, 'compra', 'compra', 'compras'), cuantos(r.m, 'abono', 'pago', 'pagos')].filter(Boolean).join(' · '))))),
      mesFiltro ? null : el('tfoot', {}, el('tr', {}, el('th', {}, 'Total'), el('th', { class: 'num' }, dinero(0)), el('th', { class: 'num' }, dinero(suma('trabajo'))), el('th', { class: 'num' }, menos(suma('compra'))),
        el('th', { class: 'num' }, menos(suma('abono'))), el('th', { class: 'num' }, dinero(saldo)), el('th', {}, ''))))));
  const vistaMovimientos = () => el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Movimientos'),
    buscar.trim() ? (movs.some(coincide) ? movs.filter(coincide).reverse().map(fila) : el('p', { class: 'texto-suave' }, 'Nada coincide con la búsqueda.')) :
    movs.length ? [...movs].reverse().map(fila) : el('p', { class: 'texto-suave' }, 'Sin movimientos. Las facturas se suben como gasto con este proveedor (Subir documentos); los pagos, con Registrar pago o como comprobante. Los trabajos de un contratista se registran desde la orden del taller (Costos con la patente → Trabajo de un tercero) o como gasto con este proveedor; las compras, marcando "por cuenta de" en el gasto o al leer la boleta.'));
  const VISTAS = {
    resumen: vistaResumen,
    trabajos: () => porMes('Trabajos', enFiltro('trabajo'), COL_TRABAJOS),
    compras: () => porMes('Compras por su cuenta', enFiltro('compra'), COL_COMPRAS),
    pagos: () => porMes('Pagos', enFiltro('abono'), COL_PAGOS),
    movimientos: vistaMovimientos,
  };

  // Las mismas acciones en todas las pestañas
  const acciones = [];
  if (ctx.puede('costos', 'exportar') && movs.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: excel }));
  if (ctx.puede('costos', 'editar') && movs.some((m) => m.tipo === 'trabajo' && m.estado !== 'pagado')) acciones.push(boton('Dejar al día', { icono: 'check', onclick: alDia }));
  if (ctx.puede('costos', 'crear')) acciones.push(boton('Registrar pago', { icono: 'mas', tipo: 'primario', onclick: abono }));
  // Al buscar desde el Resumen se ven las coincidencias de Trabajos, Compras y Pagos; se repinta sin perder el foco
  const contenido = () => (buscar.trim() && pestana === 'resumen' ? [VISTAS.trabajos(), VISTAS.compras(), VISTAS.pagos()] : (VISTAS[pestana] ?? vistaResumen)());
  const cuerpo = el('div', {}, contenido());
  const buscador = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar patente, vehículo, trabajo…', 'aria-label': 'Buscar en la cuenta', value: buscar,
    oninput: (ev) => { buscar = ev.target.value; cuerpo.replaceChildren(...[contenido()].flat()); } });
  const barra = el('div', { class: 'cue-barra' },
    el('div', { class: 'pestanas', role: 'tablist' }, [['resumen', 'Resumen mensual'], ['trabajos', 'Trabajos'], ['compras', 'Compras'], ['pagos', 'Pagos'], ['movimientos', 'Movimientos']].map(([id, txt]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(pestana === id), onclick: () => { pestana = id; ctx.refrescar(); } }, txt))),
    el('div', { class: 'listado-acciones' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), pestana !== 'movimientos' && resumen.length ? filtroMes : null));
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `Cuenta de ${nombreTercero(ter)}`), el('p', { class: 'texto-suave' }, 'Sus facturas o trabajos, menos las compras hechas por su cuenta y lo que ya se le pagó.')),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Facturas o trabajos', suma('trabajo'), `${movs.filter((m) => m.tipo === 'trabajo').length} documentos`),
      tarjeta('Compras por su cuenta', suma('compra'), 'se le descuentan'),
      tarjeta('Pagos', suma('abono'), 'transferencias y abonos'),
      tarjeta(saldo >= 0 ? 'Saldo a pagarle' : 'Pagado a cuenta (falta su factura)', Math.abs(saldo), 'facturas − compras − pagos', saldo > 0 ? 'fin-alerta' : '')),
    barra,
    cuerpo,
    el('p', { class: 'texto-suave texto-chico' }, 'Las compras por su cuenta se pagan al local como cualquier gasto, pero no son costo de la empresa: no entran al Estado de resultados ni a la utilidad por orden.'));
}
