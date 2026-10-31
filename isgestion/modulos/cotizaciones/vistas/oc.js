// Cotizaciones → OC y facturas (005, 2026-10-30): todas las cotizaciones enviadas o aceptadas con su etapa
// (sin OC, OC sin facturar, facturada por cobrar, cobrada), para seguir a un cliente como Guillermo Morales, que
// manda una OC por cada cotización de vehículo. La cotización del mes ya dividida no aparece (aparecen sus hijas).
// Por ahora solo clientes "siempre por cotizar" (terceros.por_cotizar: Guillermo Morales).
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { listado, boton } from '../../../core/ui/tabla.js?v=a7f53fa';
import { avisar } from '../../../core/ui/aviso.js?v=a7f53fa';
import { dinero, fechaCorta, diaLocal, hoyISO } from '../../../core/ui/formato.js?v=a7f53fa';
import { totales, numeroTexto, nombreTercero, verPatente } from '../datos.js?v=a7f53fa';
import { ETAPAS, etapa, chipEtapa, verArchivo } from '../seguimiento.js?v=a7f53fa';

const filtro = { etapa: 'pendientes', cliente: '', buscar: '' };
const dias = (desde) => (desde ? Math.max(0, Math.round((new Date(hoyISO()) - new Date(desde)) / 86400000)) : null);

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [{ data, error }, madres, clientes] = await Promise.all([
    ctx.api.from('cot_cotizaciones').select('*, cot_grupos(*), cot_lineas(*)').eq('empresa_id', e).is('deleted_at', null)
      .in('estado', ['enviada', 'aceptada']).order('numero', { ascending: false }).limit(1000),
    ctx.api.from('cot_cotizaciones').select('origen_id').eq('empresa_id', e).is('deleted_at', null).not('origen_id', 'is', null),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).eq('por_cotizar', true).order('razon_social'),
  ]);
  if (error) throw error;
  const divididas = new Set((madres.data ?? []).map((x) => x.origen_id));
  const conOC = new Set((clientes.data ?? []).map((t) => t.id));
  const todas = data.filter((c) => conOC.has(c.tercero_id) && !(divididas.has(c.id) && c.cot_grupos.length > 1))
    .map((c) => ({ ...c, t: totales(c, c.cot_grupos, c.cot_lineas), etapa: etapa(c) }));
  const delCliente = todas.filter((c) => !filtro.cliente || c.tercero_id === filtro.cliente);
  const b = filtro.buscar.trim().toLowerCase();
  const filas = delCliente
    .filter((c) => filtro.etapa === 'todas' || (filtro.etapa === 'pendientes' ? c.etapa !== 'cobrada' : c.etapa === filtro.etapa))
    .filter((c) => !b || [numeroTexto(c.numero), c.cliente_nombre, c.oc_numero, c.factura_numero, ...c.cot_grupos.map((g) => `${g.titulo ?? ''} ${g.patente ?? ''} ${verPatente(g.patente)}`)]
      .join(' ').toLowerCase().includes(b));

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Etapa' },
    [['pendientes', 'Por cobrar'], ...ETAPAS.map(([k, n]) => [k, n]), ['todas', 'Todas']].map(([k, n]) =>
      el('button', { type: 'button', 'aria-pressed': String(filtro.etapa === k), onclick: () => { filtro.etapa = k; ctx.refrescar(); } }, n)));
  const conCot = new Set(todas.map((c) => c.tercero_id));
  const selCliente = el('select', { class: 'campo campo-filtro', 'aria-label': 'Cliente' },
    el('option', { value: '' }, 'Todos los clientes'),
    (clientes.data ?? []).filter((t) => conCot.has(t.id)).map((t) => el('option', { value: t.id, selected: t.id === filtro.cliente }, nombreTercero(t))));
  selCliente.addEventListener('change', () => { filtro.cliente = selCliente.value; ctx.refrescar(); });
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'N°, patente, OC o factura…', value: filtro.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { filtro.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const acciones = [selCliente, buscador];
  if (ctx.puede('cotizaciones', 'exportar') && filas.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    try { await excel(ctx, filas, selCliente.selectedOptions[0]?.textContent); } catch (err) { avisar(err.message, 'error'); } finally { btn.disabled = false; }
  } }));

  const vehiculo = (c) => c.cot_grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' · ')).join(', ');
  const doc = (n, f) => (n || f ? el('span', {}, n ? `N° ${n}` : 'Sin N°', f ? el('span', { class: 'texto-chico texto-suave' }, el('br'), fechaCorta(f)) : null) : el('span', { class: 'texto-suave' }, '—'));
  const lista = listado({
    titulo: 'OC y facturas',
    filas,
    acciones,
    vacio: conOC.size ? 'No hay cotizaciones en esta etapa.' : 'El seguimiento de OC es para clientes marcados "siempre por cotizar" (Clientes y proveedores).',
    columnas: [
      { titulo: 'N°', valor: (c) => el('a', { href: ctx.ruta('cotizaciones.editor', { id: c.id }) }, el('strong', {}, numeroTexto(c.numero))) },
      { titulo: 'Enviada', valor: (c) => el('span', {}, fechaCorta(diaLocal(c.enviada_at) || c.fecha),
        c.etapa !== 'cobrada' ? el('span', { class: 'texto-chico texto-suave' }, el('br'), `hace ${dias(diaLocal(c.enviada_at) || c.fecha)} d`) : null) },
      { titulo: 'Cliente', valor: (c) => c.cliente_nombre ?? '' },
      { titulo: 'Vehículo', valor: (c) => vehiculo(c) },
      { titulo: 'Total', valor: (c) => el('strong', {}, dinero(c.t.total)) },
      { titulo: 'Etapa', valor: (c) => chipEtapa(c) },
      { titulo: 'OC', valor: (c) => el('span', {}, doc(c.oc_numero, c.oc_fecha), c.oc_archivo ? el('br') : null, verArchivo(ctx, c.oc_archivo, 'Ver')) },
      { titulo: 'Factura', valor: (c) => el('span', {}, doc(c.factura_numero, c.factura_fecha), c.factura_archivo ? el('br') : null, verArchivo(ctx, c.factura_archivo, 'Ver')) },
      { titulo: 'Cobro', valor: (c) => (c.cobro_fecha ? el('span', {}, dinero(c.cobro_monto), el('span', { class: 'texto-chico texto-suave' }, el('br'), fechaCorta(c.cobro_fecha))) : el('span', { class: 'texto-suave' }, '—')) },
    ],
  });
  // Resumen del cliente elegido (o de todos): cuántas y cuánto en cada etapa
  if (delCliente.length) {
    const suma = (k) => delCliente.filter((c) => c.etapa === k);
    lista.insertBefore(el('div', {},
      segmento,
      el('div', { class: 'resumen-chips' }, ETAPAS.map(([k, n, chip]) => el('span', { class: `chip ${chip}` }, `${n}: ${suma(k).length} · ${dinero(suma(k).reduce((s, c) => s + c.t.total, 0))}`)))), lista.children[1]);
  } else lista.insertBefore(segmento, lista.children[1]);
  return lista;
}

async function excel(ctx, filas, cliente) {
  const { exportarExcel } = await import('../../../core/excel.js?v=a7f53fa');
  const nombreEtapa = Object.fromEntries(ETAPAS.map(([k, n]) => [k, n]));
  await exportarExcel(ctx, {
    titulo: 'Seguimiento de OC y facturas',
    subtitulo: [cliente && cliente !== 'Todos los clientes' ? cliente : 'Todos los clientes', `${filas.length} cotizaciones`].join(' · '),
    columnas: ['N°', 'Enviada', 'Cliente', 'Vehículo', 'Patente', { t: 'Total', tipo: 'dinero' }, 'Etapa', 'N° OC', 'Fecha OC', 'N° factura', 'Fecha factura', { t: 'Cobrado', tipo: 'dinero' }, 'Fecha cobro'],
    filas: filas.map((c) => [numeroTexto(c.numero), diaLocal(c.enviada_at) || c.fecha, c.cliente_nombre ?? '', c.cot_grupos.map((g) => g.titulo).filter(Boolean).join(', '),
      c.cot_grupos.map((g) => verPatente(g.patente)).filter(Boolean).join(', '), c.t.total, nombreEtapa[c.etapa], c.oc_numero ?? '', c.oc_fecha ?? '',
      c.factura_numero ?? '', c.factura_fecha ?? '', c.cobro_monto ?? null, c.cobro_fecha ?? '']),
    total: ['TOTAL', '', '', '', '', filas.reduce((s, c) => s + c.t.total, 0), '', '', '', '', '', filas.reduce((s, c) => s + Number(c.cobro_monto || 0), 0), ''],
    nombre: 'seguimiento-oc-facturas',
  });
}
