// Cierre mensual de un cliente: líneas (órdenes del mes y manuales), emitir, OC, factura, cobro, PDF e historial.
// Ruta: #/cierres.cierre?id=<id>
import { el } from '../../../core/ui/dom.js?v=0e371c2';
import { icono } from '../../../core/ui/iconos.js?v=0e371c2';
import { boton } from '../../../core/ui/tabla.js?v=0e371c2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=0e371c2';
import { avisar } from '../../../core/ui/aviso.js?v=0e371c2';
import { subirArchivo, urlFirmada } from '../../../core/adjuntos.js?v=0e371c2';
import { dinero, fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=0e371c2';
import {
  nombreTercero, nombreEstado, CHIP_ESTADO, indiceEstado, MEDIOS, nombreMedio, ARCHIVOS, verPatente, numeroTexto, nombreMesLargo,
  totalesCierre, verHistorial, archivoSeguro,
} from '../datos.js?v=0e371c2';

const SELECT = '*, terceros(*), cie_lineas(*, tal_ordenes(id, numero, estado))';

export default async function vista(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('cierres.mensuales') }, icono('volver', { tam: 16 }), 'Cierres mensuales');
  let { data: c, error } = await ctx.api.from('cie_cierres').select(SELECT).eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!c) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Cierre no encontrado'));
  const editar = ctx.puede('cierres', 'editar');
  const conTaller = ctx.puede('taller', 'ver');

  // Borrador: entran solas las órdenes nuevas del mes y se actualizan los montos
  let agregadas = 0;
  if (c.estado === 'borrador' && editar) {
    const r = await ctx.api.rpc('cie_sincronizar', { p_cierre: c.id });
    if (r.error) avisar(r.error.message, 'error');
    agregadas = r.data ?? 0;
    ({ data: c } = await ctx.api.from('cie_cierres').select(SELECT).eq('id', ctx.params.id).single());
  }
  const borrador = c.estado === 'borrador';
  const i = indiceEstado(c.estado);
  const lineas = [...c.cie_lineas].sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at));
  const vivas = lineas.filter((l) => !l.excluida);
  const excluidas = lineas.filter((l) => l.excluida);
  const t = totalesCierre(c, lineas);
  const [cliCfg, nuevas] = await Promise.all([
    ctx.api.from('cie_clientes').select('nota').eq('empresa_id', c.empresa_id).eq('tercero_id', c.tercero_id).maybeSingle(),
    // Emitido: órdenes del mes que quedaron fuera (no entran solas a un cierre emitido)
    !borrador && conTaller ? ordenesFuera(ctx, c) : Promise.resolve([]),
  ]);

  const rpc = async (fn, args, aviso) => {
    const { error: e } = await ctx.api.rpc(fn, args);
    if (e) throw new Error(e.message);
    if (aviso) avisar(aviso);
    ctx.refrescar();
  };
  const actualizar = async (l, cambios) => {
    const { error: e } = await ctx.api.from('cie_lineas').update(cambios).eq('id', l.id);
    if (e) { avisar(e.message, 'error'); return false; }
    return true;
  };

  // ---- Líneas
  const filaLinea = (l, n) => {
    const monto = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: l.monto, disabled: !borrador || !editar, 'aria-label': 'Monto neto' });
    monto.addEventListener('change', async () => { if (await actualizar(l, { monto: Math.max(0, Math.round(Number(monto.value) || 0)), monto_manual: !!l.orden_id })) ctx.refrescar(); });
    const notas = Object.assign(el('input', { class: 'campo', placeholder: 'Notas u observación', disabled: !borrador || !editar, 'aria-label': 'Notas' }), { value: l.notas ?? '' });
    notas.addEventListener('change', () => actualizar(l, { notas: notas.value.trim() || null }));
    const quitar = borrador && editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar del cierre', 'aria-label': 'Quitar del cierre', onclick: async () => {
      const r = l.orden_id ? await ctx.api.from('cie_lineas').update({ excluida: true }).eq('id', l.id) : await ctx.api.from('cie_lineas').delete().eq('id', l.id);
      if (r.error) avisar(r.error.message, 'error'); else ctx.refrescar();
    } }, icono('basura', { tam: 16 })) : null;
    return el('div', { class: 'cie-linea' },
      el('span', { class: 'texto-suave' }, String(n + 1)),
      el('div', { class: 'doc-nombre' },
        l.orden_id && conTaller ? el('a', { href: ctx.ruta('taller.orden', { id: l.orden_id }) }, el('strong', {}, l.descripcion || 'Vehículo')) : el('strong', {}, l.descripcion || 'Línea manual'),
        el('span', { class: 'texto-suave texto-chico' }, [verPatente(l.patente), l.tal_ordenes ? `orden N° ${l.tal_ordenes.numero}` : l.plan_id ? 'faena-día' : 'manual', l.monto_manual ? 'monto ajustado' : null].filter(Boolean).join(' · ')),
        l.detalle ? el('span', { class: 'texto-chico cie-detalle' }, l.detalle) : null),
      el('div', { class: 'cie-linea-monto' }, monto,
        borrador && editar && l.orden_id && l.monto_manual ? el('button', { type: 'button', class: 'enlace texto-chico', onclick: async () => {
          if (await actualizar(l, { monto_manual: false })) { await ctx.api.rpc('cie_sincronizar', { p_cierre: c.id }); ctx.refrescar(); }
        } }, 'usar el de la orden') : null),
      notas, quitar ?? el('span'));
  };

  const agregarManual = () => abrirFormulario({
    titulo: 'Línea manual', mensaje: 'Para un vehículo o servicio que no tiene orden de trabajo ni faena.',
    campos: [{ id: 'descripcion', etiqueta: 'Vehículo o descripción', requerido: true }, { id: 'patente', etiqueta: 'Patente' },
      { id: 'detalle', etiqueta: 'Detalle (servicios)' }, { id: 'monto', etiqueta: 'Monto neto ($)', tipo: 'number', requerido: true }],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const { error: e } = await ctx.api.from('cie_lineas').insert({ cierre_id: c.id, empresa_id: c.empresa_id, descripcion: v.descripcion.trim(), patente: v.patente || null,
        detalle: v.detalle.trim() || null, monto: Math.max(0, Math.round(Number(v.monto) || 0)), orden: 9999 });
      if (e) throw new Error(e.message);
      avisar('Línea agregada.'); ctx.refrescar();
    },
  });
  const agregarOrden = async () => {
    const { data: ords } = await ctx.api.from('tal_ordenes').select('id, numero, fecha_cita, tal_vehiculos(patente, marca, modelo)')
      .eq('empresa_id', c.empresa_id).eq('tercero_id', c.tercero_id).eq('cobrado', false).neq('estado', 'anulada').order('numero', { ascending: false }).limit(200);
    const { data: tomadas } = await ctx.api.from('cie_lineas').select('orden_id').in('orden_id', (ords ?? []).map((o) => o.id)).eq('excluida', false);
    const libres = (ords ?? []).filter((o) => !(tomadas ?? []).some((x) => x.orden_id === o.id));
    if (!libres.length) { avisar('No hay otras órdenes de este cliente sin cierre.'); return; }
    abrirFormulario({
      titulo: 'Agregar orden de otro mes',
      campos: [{ id: 'orden', etiqueta: 'Orden', opciones: libres.map((o) => [o.id, `N° ${o.numero} · ${[verPatente(o.tal_vehiculos?.patente), o.tal_vehiculos?.marca, o.tal_vehiculos?.modelo].filter(Boolean).join(' ')} · ${fechaLarga(o.fecha_cita)}`]) }],
      textoGuardar: 'Agregar',
      alGuardar: async (v) => {
        // Si estaba excluida de este cierre, se vuelve a incluir
        const prev = lineas.find((l) => l.orden_id === v.orden);
        const r = prev ? await ctx.api.from('cie_lineas').update({ excluida: false }).eq('id', prev.id)
          : await ctx.api.from('cie_lineas').insert({ cierre_id: c.id, empresa_id: c.empresa_id, orden_id: v.orden });
        if (r.error) throw new Error(r.error.message);
        await ctx.api.rpc('cie_sincronizar', { p_cierre: c.id });
        avisar('Orden agregada.'); ctx.refrescar();
      },
    });
  };

  // ---- Pasos
  const archivoBtn = (ruta, texto) => (ruta ? boton(texto, { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }) : null);
  const subir = async (archivo) => (archivo ? (await subirArchivo(ctx.api, { empresaId: c.empresa_id, modulo: 'cierres', archivo, tabla: 'cie_cierres', registroId: c.id, tipos: ARCHIVOS })).ruta : null);
  const pasoDoc = (paso, titulo, numero, fecha) => abrirFormulario({
    titulo,
    campos: [{ id: 'numero', etiqueta: paso === 'oc' ? 'N° de orden de compra' : 'N° de factura', requerido: paso === 'factura', valor: numero ?? '' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: fecha ?? hoyISO() },
      { id: 'archivo', etiqueta: 'Archivo (PDF o imagen, opcional)', tipo: 'file', accept: ARCHIVOS.join(',') }],
    alGuardar: async (v) => {
      const ruta = await subir(v.archivo?.size ? v.archivo : null);
      await rpc('cie_paso', { p_cierre: c.id, p_paso: paso, p_numero: v.numero || null, p_fecha: v.fecha, p_archivo: ruta }, paso === 'oc' ? 'Orden de compra registrada.' : 'Factura registrada.');
    },
  });
  const cobrar = () => abrirFormulario({
    titulo: `Registrar cobro · ${nombreMesLargo(c.mes)}`,
    campos: [{ id: 'monto', etiqueta: 'Monto cobrado ($, total con IVA)', tipo: 'number', requerido: true, valor: c.total },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() }, { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' }],
    textoGuardar: 'Registrar cobro',
    alGuardar: (v) => rpc('cie_paso', { p_cierre: c.id, p_paso: 'cobro', p_monto: Math.round(Number(v.monto)), p_fecha: v.fecha, p_medio: v.medio }, 'Cobro registrado: el cierre suma al Estado de resultados.'),
  });
  const emitir = () => abrirFormulario({
    titulo: `Emitir cierre de ${nombreMesLargo(c.mes)}`,
    mensaje: `Se congelan ${vivas.length} líneas por ${dinero(t.total)}${c.afecto_iva ? ' (con IVA)' : ''} y se asigna el número. Las órdenes nuevas del mes ya no entran solas.`,
    campos: [], textoGuardar: 'Emitir',
    alGuardar: () => rpc('cie_emitir', { p_cierre: c.id }, 'Cierre emitido.'),
  });

  const paso = (n, titulo, hecho, activo, cuerpo, botones) => el('div', { class: `cie-paso${hecho ? ' cie-hecho' : activo ? ' cie-activo' : ''}` },
    el('div', { class: 'cie-paso-cab' }, el('span', { class: 'cie-paso-n' }, hecho ? icono('check', { tam: 14 }) : String(n)), el('strong', {}, titulo)),
    el('div', { class: 'texto-chico' }, cuerpo), el('div', { class: 'cie-paso-acc' }, botones.filter(Boolean)));
  const pasos = el('div', { class: 'cie-pasos' },
    paso(1, 'Emisión', i >= 1, i === 0,
      c.emitido_at ? `N° ${numeroTexto(c.numero)} · ${fechaLarga(diaLocal(c.emitido_at))}` : 'Revisa las líneas y emite: se congela y numera.',
      [editar && borrador ? boton('Emitir', { icono: 'check', tipo: 'primario', onclick: emitir }) : null,
        editar && (c.estado === 'emitido' || c.estado === 'oc') ? boton('Reabrir', { icono: 'editar', onclick: () => abrirFormulario({ titulo: 'Reabrir cierre', mensaje: 'Vuelve a borrador para editar (mantiene el número).', campos: [], textoGuardar: 'Reabrir', alGuardar: () => rpc('cie_reabrir', { p_cierre: c.id }, 'Cierre reabierto.') }) }) : null]),
    paso(2, 'Orden de compra', !!c.oc_fecha, i === 1,
      c.oc_fecha ? `${c.oc_numero ? `N° ${c.oc_numero} · ` : ''}${fechaLarga(c.oc_fecha)}` : 'Opcional, si el cliente la envía.',
      [editar && i >= 1 && i <= 3 ? boton(c.oc_fecha ? 'Cambiar' : 'Registrar OC', { onclick: () => pasoDoc('oc', 'Orden de compra', c.oc_numero, c.oc_fecha) }) : null, archivoBtn(c.oc_archivo, 'Ver OC')]),
    paso(3, 'Factura', !!c.factura_numero, i === 1 || i === 2,
      c.factura_numero ? `N° ${c.factura_numero} · ${fechaLarga(c.factura_fecha)}` : 'Registra la factura emitida al cliente.',
      [editar && i >= 1 && i <= 3 ? boton(c.factura_numero ? 'Cambiar' : 'Registrar factura', { tipo: i >= 1 && !c.factura_numero ? 'primario' : 'secundario', onclick: () => pasoDoc('factura', 'Factura', c.factura_numero, c.factura_fecha) }) : null, archivoBtn(c.factura_archivo, 'Ver factura')]),
    paso(4, 'Cobro', i === 4, i === 3,
      c.cobro_fecha ? `${dinero(c.cobro_monto)} · ${fechaLarga(c.cobro_fecha)} · ${nombreMedio[c.cobro_medio] ?? ''}` : i >= 1 ? `Por cobrar: ${dinero(c.total)}` : '—',
      [editar && i >= 1 && i < 4 ? boton('Registrar cobro', { icono: 'dinero', tipo: i === 3 ? 'primario' : 'secundario', onclick: cobrar }) : null,
        editar && i === 4 ? boton('Anular cobro', { onclick: () => abrirFormulario({ titulo: 'Anular cobro', mensaje: 'El cierre vuelve a estar por cobrar y sale del Estado de resultados.', campos: [], textoGuardar: 'Anular cobro', alGuardar: () => rpc('cie_paso', { p_cierre: c.id, p_paso: 'anular_cobro' }, 'Cobro anulado.') }) }) : null]));

  // ---- Totales
  const iva = el('input', { type: 'checkbox', checked: c.afecto_iva, disabled: !borrador || !editar });
  iva.addEventListener('change', async () => {
    const { error: e } = await ctx.api.from('cie_cierres').update({ afecto_iva: iva.checked }).eq('id', c.id);
    if (e) avisar(e.message, 'error'); else ctx.refrescar();
  });
  const pdf = async (b) => {
    b.disabled = true;
    try {
      const { pdfCierre } = await import('../documentos.js?v=0e371c2');
      const doc = await pdfCierre(ctx, c, lineas, c.terceros, cliCfg.data?.nota);
      doc.save(`cierre-${c.mes}-${archivoSeguro(nombreTercero(c.terceros) || 'cliente')}.pdf`);
    } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
  };

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `${nombreTercero(c.terceros)} · ${nombreMesLargo(c.mes)}`),
        el('p', { class: 'texto-suave' }, [c.numero ? `Cierre N° ${numeroTexto(c.numero)}` : 'Sin emitir', `${vivas.length} ${vivas.length === 1 ? 'línea' : 'líneas'}`].join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${CHIP_ESTADO[c.estado]}` }, nombreEstado[c.estado]),
        boton(borrador ? 'PDF de prueba' : 'PDF', { icono: 'descargar', onclick: (ev) => pdf(ev.currentTarget) }),
        ctx.puede('cierres', 'exportar') ? boton('Excel detalle', { icono: 'descargar', onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; try { const { excelDetalleCierre } = await import('../excel.js?v=0e371c2'); await excelDetalleCierre(ctx, c, lineas); } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; } } }) : null,
        boton('Historial', { icono: 'reloj', onclick: () => verHistorial(ctx, c.id, `${nombreTercero(c.terceros)} ${c.mes}`) }))),
    agregadas ? el('p', { class: 'aviso-bandeja' }, icono('check', { tam: 16 }), `${agregadas} ${agregadas === 1 ? 'línea nueva entró' : 'líneas nuevas entraron'} al cierre (órdenes o faenas del mes).`) : null,
    nuevas.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `El cierre está emitido y hay ${nuevas.length} ${nuevas.length === 1 ? 'orden' : 'órdenes'} del mes fuera: ${nuevas.map((o) => `N° ${o.numero} ${verPatente(o.tal_vehiculos?.patente)}`).join(', ')}. Reábrelo para incluirlas o déjalas para el mes siguiente.`) : null,
    pasos,
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Líneas del cierre'),
        borrador && editar ? el('div', { class: 'listado-acciones' },
          conTaller ? boton('Orden de otro mes', { icono: 'mas', onclick: agregarOrden }) : null,
          boton('Línea manual', { icono: 'mas', onclick: agregarManual })) : null),
      vivas.length ? vivas.map(filaLinea) : el('p', { class: 'texto-suave' }, 'Sin líneas. Las órdenes del taller y las faenas enviadas del cliente en el mes entran solas; también puedes agregar líneas manuales.'),
      el('div', { class: 'cobro-resumen' },
        el('div', {}, el('span', {}, 'Neto'), el('span', {}, dinero(t.neto))),
        el('div', {}, el('label', { class: 'casilla' }, iva, 'Afecto a IVA 19 %'), el('span', {}, dinero(t.iva))),
        el('div', { class: 'cobro-saldo' }, el('strong', {}, 'Total'), el('strong', {}, dinero(t.total)))),
      excluidas.length ? el('details', {}, el('summary', { class: 'texto-suave texto-chico' }, `Órdenes quitadas de este cierre (${excluidas.length})`),
        excluidas.map((l) => el('div', { class: 'doc-fila' }, el('span', { class: 'doc-nombre' }, `${l.descripcion} ${verPatente(l.patente)}`),
          borrador && editar ? boton('Volver a incluir', { onclick: async () => { if (await actualizar(l, { excluida: false })) ctx.refrescar(); } }) : null))) : null),
    c.notas || editar ? notasCierre(ctx, c, editar) : null);
}

function notasCierre(ctx, c, editar) {
  const n = Object.assign(el('textarea', { class: 'campo', rows: 2, disabled: !editar, id: 'cie-notas' }), { value: c.notas ?? '' });
  n.addEventListener('change', async () => {
    const { error } = await ctx.api.from('cie_cierres').update({ notas: n.value.trim() || null }).eq('id', c.id);
    if (error) avisar(error.message, 'error'); else avisar('Notas guardadas.');
  });
  return el('div', { class: 'form-fila' }, el('label', { for: 'cie-notas' }, 'Notas internas'), n);
}

// Órdenes del cliente en el mes que no están en ningún cierre
async function ordenesFuera(ctx, c) {
  const desde = `${c.mes}-01`;
  const [a, m] = c.mes.split('-').map(Number);
  const hasta = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  const { data: ords } = await ctx.api.from('tal_ordenes').select('id, numero, fecha_cita, ingreso_at, tal_vehiculos(patente)')
    .eq('empresa_id', c.empresa_id).eq('tercero_id', c.tercero_id).eq('cobrado', false).neq('estado', 'anulada')
    .gte('fecha_cita', desde).lt('fecha_cita', hasta);
  if (!ords?.length) return [];
  const { data: tomadas } = await ctx.api.from('cie_lineas').select('orden_id').in('orden_id', ords.map((o) => o.id));
  return ords.filter((o) => !(tomadas ?? []).some((x) => x.orden_id === o.id));
}
