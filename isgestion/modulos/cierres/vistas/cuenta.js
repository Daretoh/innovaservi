// Cuenta corriente: cotizaciones aceptadas del cliente, abonos con saldo corriente, OC y factura,
// cerrar o reabrir, estado de cuenta en PDF, texto para el correo e historial.
// Ruta: #/cierres.cuenta?id=<id>
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { boton } from '../../../core/ui/tabla.js?v=cb36eb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { subirArchivo, urlFirmada } from '../../../core/adjuntos.js?v=cb36eb2';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=cb36eb2';
import { nombreTercero, MEDIOS, nombreMedio, ARCHIVOS, verPatente, numeroTexto, totalesCuenta, estadoCuenta, totalCotizacion, verHistorial, archivoSeguro } from '../datos.js?v=cb36eb2';
import { SELECT_CUENTA } from './cuentas.js?v=cb36eb2';

const ESTADO_ORDEN = { agendado: 'Agendado', espera: 'En espera', proceso: 'En proceso', terminado: 'Terminado', entregado: 'Entregado', anulada: 'Anulada' };

export default async function vista(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('cierres.cuentas') }, icono('volver', { tam: 16 }), 'Cuentas corrientes');
  const { data: k, error } = await ctx.api.from('cie_cuentas').select(SELECT_CUENTA).eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!k) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Cuenta no encontrada'));
  const items = [...k.cie_cuenta_cotizaciones].sort((a, b) => (a.cot_cotizaciones?.numero ?? 0) - (b.cot_cotizaciones?.numero ?? 0));
  const abonos = [...k.cie_abonos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  const vivos = abonos.filter((a) => !a.deleted_at);
  const t = totalesCuenta(items, abonos);
  const [estadoTxt, estadoChip] = estadoCuenta(k, t);
  const abierta = k.estado === 'abierta';
  const editar = ctx.puede('cierres', 'editar') && abierta;
  const conTaller = ctx.puede('taller', 'ver');

  // Estado de las órdenes ligadas a las cotizaciones (avance del trabajo)
  const ordenIds = items.flatMap((i) => (i.cot_cotizaciones?.cot_grupos ?? []).map((g) => g.orden_id)).filter(Boolean);
  const ordenes = conTaller && ordenIds.length
    ? new Map(((await ctx.api.from('tal_ordenes').select('id, numero, estado').in('id', ordenIds)).data ?? []).map((o) => [o.id, o])) : new Map();

  const subir = async (archivo, registroId) => (archivo?.size ? (await subirArchivo(ctx.api, { empresaId: k.empresa_id, modulo: 'cierres', archivo, tabla: 'cie_cuentas', registroId, tipos: ARCHIVOS })).ruta : null);
  const verArchivo = (ruta, texto) => (ruta ? boton(texto, { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }) : null);

  // ---- Cotizaciones
  const agregarCot = async () => {
    const [{ data: cots }, { data: tomadas }] = await Promise.all([
      ctx.api.from('cot_cotizaciones').select('id, numero, fecha, con_iva, desc_adic_pct, cot_grupos(titulo, patente), cot_lineas(tipo, cantidad, precio, desc_pct)')
        .eq('empresa_id', k.empresa_id).eq('tercero_id', k.tercero_id).eq('estado', 'aceptada').is('deleted_at', null).order('numero', { ascending: false }),
      ctx.api.from('cie_cuenta_cotizaciones').select('cotizacion_id').eq('empresa_id', k.empresa_id),
    ]);
    const libres = (cots ?? []).filter((c) => !(tomadas ?? []).some((x) => x.cotizacion_id === c.id));
    if (!libres.length) { avisar('No hay cotizaciones aceptadas de este cliente fuera de una cuenta.'); return; }
    abrirFormulario({
      titulo: 'Agregar cotización', mensaje: 'Solo cotizaciones aceptadas del cliente que no estén en otra cuenta.',
      campos: [{ id: 'cot', etiqueta: 'Cotización', opciones: libres.map((c) => [c.id, `N° ${numeroTexto(c.numero)} · ${fechaLarga(c.fecha)} · ${c.cot_grupos.map((g) => g.titulo).filter(Boolean).join(', ') || 'sin detalle'} · ${dinero(totalCotizacion(c))}`]) }],
      textoGuardar: 'Agregar',
      alGuardar: async (v) => {
        const { error: e } = await ctx.api.from('cie_cuenta_cotizaciones').insert({ cuenta_id: k.id, empresa_id: k.empresa_id, cotizacion_id: v.cot });
        if (e) throw new Error(e.message);
        avisar('Cotización agregada.'); ctx.refrescar();
      },
    });
  };
  const filaCot = (i) => {
    const c = i.cot_cotizaciones;
    const x = t.porCot.get(i.cotizacion_id);
    const grupos = c?.cot_grupos ?? [];
    const avances = grupos.map((g) => g.orden_id && ordenes.get(g.orden_id)).filter(Boolean);
    return el('tr', {},
      el('td', {}, c ? (ctx.puede('cotizaciones', 'ver') ? el('a', { href: ctx.ruta('cotizaciones.editor', { id: c.id }) }, el('strong', {}, `N° ${numeroTexto(c.numero)}`)) : el('strong', {}, `N° ${numeroTexto(c.numero)}`)) : '—',
        el('div', { class: 'texto-suave texto-chico' }, c ? fechaLarga(c.fecha) : '')),
      el('td', {}, grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' ')).join(', ') || '—',
        i.nota ? el('div', { class: 'texto-suave texto-chico' }, i.nota) : null),
      el('td', {}, avances.length ? avances.map((o) => el('a', { class: 'chip chip-prox', href: ctx.ruta('taller.orden', { id: o.id }) }, `N° ${o.numero} · ${ESTADO_ORDEN[o.estado] ?? o.estado}`))
        : el('span', { class: 'texto-suave texto-chico' }, 'sin orden')),
      el('td', { class: 'num' }, dinero(x.total), i.monto != null ? el('div', { class: 'texto-suave texto-chico' }, 'monto ajustado') : null),
      el('td', { class: 'num pct-bien' }, dinero(x.abonado)),
      el('td', { class: 'num' }, x.saldo <= 0 && x.total > 0 ? el('span', { class: 'chip chip-ok' }, 'Pagada') : el('strong', {}, dinero(x.saldo))),
      el('td', {}, editar ? el('div', { class: 'cot-acc' },
        el('button', { type: 'button', class: 'boton-icono', title: 'Ajustar monto o nota', 'aria-label': 'Ajustar', onclick: () => abrirFormulario({
          titulo: `Cotización N° ${numeroTexto(c?.numero)}`,
          campos: [{ id: 'monto', etiqueta: 'Monto en la cuenta ($, vacío = total de la cotización)', tipo: 'number', valor: i.monto ?? '' }, { id: 'nota', etiqueta: 'Nota', valor: i.nota ?? '' }],
          alGuardar: async (v) => {
            const { error: e } = await ctx.api.from('cie_cuenta_cotizaciones').update({ monto: v.monto === '' ? null : Math.max(0, Math.round(Number(v.monto))), nota: v.nota.trim() || null }).eq('id', i.id);
            if (e) throw new Error(e.message);
            ctx.refrescar();
          },
        }) }, icono('editar', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-icono', title: 'Quitar de la cuenta', 'aria-label': 'Quitar de la cuenta', onclick: () => abrirFormulario({
          titulo: 'Quitar cotización', mensaje: 'La cotización no se borra; solo sale de esta cuenta. Sus abonos quedan como generales.', campos: [], textoGuardar: 'Quitar',
          alGuardar: async () => {
            for (const a of vivos.filter((a) => a.cotizacion_id === i.cotizacion_id)) await ctx.api.from('cie_abonos').update({ cotizacion_id: null }).eq('id', a.id);
            const { error: e } = await ctx.api.from('cie_cuenta_cotizaciones').delete().eq('id', i.id);
            if (e) throw new Error(e.message);
            ctx.refrescar();
          },
        }) }, icono('basura', { tam: 16 }))) : null));
  };

  // ---- Abonos
  const opcionesCot = [['', 'General (sin asignar)'], ...items.map((i) => [i.cotizacion_id, `N° ${numeroTexto(i.cot_cotizaciones?.numero)}`])];
  const abonar = () => abrirFormulario({
    titulo: 'Registrar abono',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto ($)', tipo: 'number', requerido: true },
      { id: 'cot', etiqueta: 'Asignar a', opciones: opcionesCot, valor: '' },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'ref', etiqueta: 'Referencia o N° de comprobante' },
      { id: 'nota', etiqueta: 'Nota' },
      { id: 'archivo', etiqueta: 'Comprobante (opcional)', tipo: 'file', accept: ARCHIVOS.join(',') },
    ],
    textoGuardar: 'Registrar',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      const ruta = await subir(v.archivo, k.id);
      const { error: e } = await ctx.api.from('cie_abonos').insert({ cuenta_id: k.id, empresa_id: k.empresa_id, fecha: v.fecha, monto, medio: v.medio,
        referencia: v.ref.trim() || null, cotizacion_id: v.cot || null, nota: v.nota.trim() || null, archivo: ruta });
      if (e) throw new Error(e.message);
      avisar(`Abono de ${dinero(monto)} registrado.`); ctx.refrescar();
    },
  });
  let corre = t.total;
  const filasAbono = vivos.map((a) => {
    corre -= a.monto;
    const c = items.find((i) => i.cotizacion_id === a.cotizacion_id)?.cot_cotizaciones;
    return el('tr', {},
      el('td', {}, fechaLarga(a.fecha)),
      el('td', { class: 'num' }, el('strong', {}, dinero(a.monto))),
      el('td', {}, c ? `N° ${numeroTexto(c.numero)}` : 'General'),
      el('td', {}, nombreMedio[a.medio] ?? a.medio),
      el('td', {}, [a.referencia, a.nota].filter(Boolean).join(' · ')),
      el('td', { class: 'num' }, dinero(corre)),
      el('td', {}, el('div', { class: 'cot-acc' },
        a.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver comprobante', 'aria-label': 'Ver comprobante', onclick: async () => { try { window.open(await urlFirmada(ctx.api, a.archivo, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }, icono('ojo', { tam: 16 })) : null,
        editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Anular abono', 'aria-label': 'Anular abono', onclick: () => abrirFormulario({
          titulo: 'Anular abono', mensaje: `${dinero(a.monto)} del ${fechaLarga(a.fecha)}. Sale del saldo y del Estado de resultados; queda en el historial.`, campos: [], textoGuardar: 'Anular',
          alGuardar: async () => {
            const { error: e } = await ctx.api.from('cie_abonos').update({ deleted_at: new Date().toISOString() }).eq('id', a.id);
            if (e) throw new Error(e.message);
            ctx.refrescar();
          },
        }) }, icono('basura', { tam: 16 })) : null)));
  });

  // ---- OC, factura, cerrar
  const documento = (tipo) => abrirFormulario({
    titulo: tipo === 'oc' ? 'Orden de compra' : 'Factura',
    campos: [{ id: 'numero', etiqueta: 'N°', requerido: true, valor: k[`${tipo}_numero`] ?? '' }, { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: k[`${tipo}_fecha`] ?? hoyISO() },
      { id: 'archivo', etiqueta: 'Archivo (opcional)', tipo: 'file', accept: ARCHIVOS.join(',') }],
    alGuardar: async (v) => {
      const ruta = await subir(v.archivo, k.id);
      const { error: e } = await ctx.api.from('cie_cuentas').update({ [`${tipo}_numero`]: v.numero.trim(), [`${tipo}_fecha`]: v.fecha, ...(ruta ? { [`${tipo}_archivo`]: ruta } : {}) }).eq('id', k.id);
      if (e) throw new Error(e.message);
      ctx.refrescar();
    },
  });
  const cerrar = () => abrirFormulario({
    titulo: abierta ? 'Cerrar cuenta' : 'Reabrir cuenta',
    mensaje: abierta ? (t.saldo > 0 ? `Aún queda saldo de ${dinero(t.saldo)}. Al cerrarla sale de Por cobrar y no admite cambios.` : 'La cuenta queda archivada y no admite cambios.') : 'Vuelve a admitir abonos y cotizaciones.',
    campos: [], textoGuardar: abierta ? 'Cerrar cuenta' : 'Reabrir',
    alGuardar: async () => {
      const { error: e } = await ctx.api.from('cie_cuentas').update({ estado: abierta ? 'cerrada' : 'abierta' }).eq('id', k.id);
      if (e) throw new Error(e.message);
      ctx.refrescar();
    },
  });
  const pdf = async (b) => {
    b.disabled = true;
    try {
      const { pdfCuenta } = await import('../documentos.js?v=cb36eb2');
      const doc = await pdfCuenta(ctx, k, items, abonos, t, k.terceros);
      doc.save(`estado-de-cuenta-${archivoSeguro(k.nombre)}.pdf`);
    } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
  };
  const correo = () => {
    const txt = textoCorreo(ctx, k, items, t);
    abrirFormulario({ titulo: 'Texto para el correo', mensaje: 'Revísalo, cópialo y adjunta el PDF del estado de cuenta. La app no envía el correo.',
      campos: [{ id: 'texto', etiqueta: 'Texto', tipo: 'textarea', filas: 14, valor: txt }], textoGuardar: 'Copiar',
      alGuardar: async (v) => { await navigator.clipboard.writeText(v.texto); avisar('Texto copiado.'); } });
  };

  const pct = t.total ? Math.min(100, Math.round((t.abonado / t.total) * 100)) : 0;
  const tarjeta = (titulo, valor, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor));
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, k.nombre), el('p', { class: 'texto-suave' }, nombreTercero(k.terceros))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${estadoChip}` }, estadoTxt),
        boton('Estado de cuenta', { icono: 'descargar', onclick: (ev) => pdf(ev.currentTarget) }),
        boton('Texto para correo', { icono: 'copiar', onclick: correo }),
        boton('Historial', { icono: 'reloj', onclick: () => verHistorial(ctx, k.id, k.nombre) }),
        ctx.puede('cierres', 'editar') ? boton(abierta ? 'Cerrar cuenta' : 'Reabrir', { icono: abierta ? 'check' : 'editar', onclick: cerrar }) : null)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Total aprobado', dinero(t.total)), tarjeta('− Abonos', dinero(t.abonado), 'fin-bien'),
      t.saldo < 0 ? tarjeta('Saldo a favor', dinero(-t.saldo), 'fin-bien') : tarjeta('Total a pagar', dinero(t.saldo), t.saldo > 0 ? 'fin-alerta' : '')),
    el('div', { class: 'cie-barra', title: `${pct}% pagado` }, el('i', { style: `width:${pct}%` })),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `Cotizaciones (${items.length})`), editar ? boton('Agregar cotización', { icono: 'mas', onclick: agregarCot }) : null),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Cotización', 'Vehículos o trabajo', 'Avance', 'Total', 'Abonado', 'Saldo', ''].map((x, n) => el('th', { class: n >= 3 && n <= 5 ? 'num' : '' }, x)))),
        el('tbody', {}, items.length ? items.map(filaCot) : el('tr', {}, el('td', { colspan: 7, class: 'tabla-vacia' }, 'Sin cotizaciones.')))))),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `Abonos (${vivos.length})`), editar ? boton('Registrar abono', { icono: 'dinero', tipo: 'primario', onclick: abonar }) : null),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Fecha', 'Monto', 'Asignado a', 'Medio', 'Referencia', 'Saldo', ''].map((x, n) => el('th', { class: n === 1 || n === 5 ? 'num' : '' }, x)))),
        el('tbody', {}, filasAbono.length ? filasAbono : el('tr', {}, el('td', { colspan: 7, class: 'tabla-vacia' }, 'Sin abonos.'))))),
      t.general ? el('p', { class: 'texto-suave texto-chico' }, `${dinero(t.general)} en abonos generales (sin asignar a una cotización).`) : null),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Orden de compra y factura'),
      el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'Orden de compra'),
        el('span', { class: 'texto-suave texto-chico' }, k.oc_numero ? `N° ${k.oc_numero} · ${fechaLarga(k.oc_fecha)}` : 'Sin registrar')),
        verArchivo(k.oc_archivo, 'Ver'), editar ? boton(k.oc_numero ? 'Cambiar' : 'Registrar', { onclick: () => documento('oc') }) : null),
      el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'Factura'),
        el('span', { class: 'texto-suave texto-chico' }, k.factura_numero ? `N° ${k.factura_numero} · ${fechaLarga(k.factura_fecha)}` : 'Sin registrar')),
        verArchivo(k.factura_archivo, 'Ver'), editar ? boton(k.factura_numero ? 'Cambiar' : 'Registrar', { onclick: () => documento('factura') }) : null)),
    el('p', { class: 'texto-suave texto-chico' }, 'Los abonos suman al Estado de resultados en su fecha (neto). Las órdenes de estas cotizaciones no se cobran solas en Taller.'));
}

function textoCorreo(ctx, k, items, t) {
  const L = [`Estimado/a ${nombreTercero(k.terceros)}:`, '', 'Le compartimos el estado de cuenta de los trabajos aprobados:', ''];
  for (const i of items) {
    const c = i.cot_cotizaciones, x = t.porCot.get(i.cotizacion_id);
    const det = (c?.cot_grupos ?? []).map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' ')).join(', ');
    L.push(`- Cotización N° ${numeroTexto(c?.numero)}${det ? ` (${det})` : ''}: total ${dinero(x.total)}, abonado ${dinero(x.abonado)}, saldo ${dinero(x.saldo)}`);
  }
  L.push('', `Total aprobado: ${dinero(t.total)}`, `Abonos: -${dinero(t.abonado)}`, t.saldo < 0 ? `Saldo a favor: ${dinero(-t.saldo)}` : `Total a pagar: ${dinero(t.saldo)}`, '',
    'Adjuntamos el estado de cuenta en PDF.', '', 'Saludos,', ctx.usuario?.nombre || ctx.empresa.nombre_fantasia || ctx.empresa.razon_social);
  return L.join('\n');
}
