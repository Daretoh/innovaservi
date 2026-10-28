// Caja del día: abrir con efectivo inicial, ver el efectivo que entró (ventas del POS y cobros del Taller),
// cerrar contando el efectivo (la base calcula el esperado y la diferencia) y reabrir (permiso aprobar).
// Abajo, las cajas del mes con su diferencia.
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { boton } from '../../../core/ui/tabla.js?v=cb36eb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { dinero, fechaLarga, hoyISO, diaLocal, rangoMes } from '../../../core/ui/formato.js?v=cb36eb2';

const estado = { dia: hoyISO() };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const { desde, hasta } = rangoMes(estado.dia.slice(0, 7));
  const [caja, efectivo, mes] = await Promise.all([
    ctx.api.from('pos_cajas').select('*').eq('empresa_id', e).eq('fecha', estado.dia).maybeSingle(),
    ctx.api.rpc('pos_caja_efectivo', { p_empresa: e, p_fecha: estado.dia }),
    ctx.api.from('pos_cajas').select('*').eq('empresa_id', e).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
  ]);
  if (caja.error) throw caja.error;
  if (efectivo.error) throw new Error(efectivo.error.message);
  const c = caja.data;
  const movs = efectivo.data ?? [];
  const entrado = movs.reduce((s, m) => s + m.monto, 0);

  const dia = el('input', { class: 'campo', type: 'date', value: estado.dia, max: hoyISO(), 'aria-label': 'Día de la caja' });
  dia.addEventListener('change', () => { if (dia.value) { estado.dia = dia.value; ctx.refrescar(); } });

  const rpc = async (fn, args, ok) => {
    const { error } = await ctx.api.rpc(fn, args);
    if (error) throw new Error(error.message);
    avisar(ok); ctx.refrescar();
  };
  const acciones = [];
  if (!c && ctx.puede('pos', 'crear')) acciones.push(boton('Abrir caja', { icono: 'mas', tipo: 'primario', onclick: () => abrirFormulario({
    titulo: `Abrir caja · ${fechaLarga(estado.dia)}`,
    campos: [{ id: 'inicial', etiqueta: 'Efectivo inicial ($)', tipo: 'number', requerido: true, valor: '0' }],
    textoGuardar: 'Abrir caja',
    alGuardar: (v) => rpc('pos_abrir_caja', { p_empresa: e, p_fecha: estado.dia, p_inicial: Math.round(Number(v.inicial)) }, 'Caja abierta.'),
  }) }));
  if (c && !c.cerrada_at && ctx.puede('pos', 'crear')) acciones.push(boton('Cerrar caja', { icono: 'check', tipo: 'primario', onclick: () => abrirFormulario({
    titulo: `Cerrar caja · ${fechaLarga(estado.dia)}`,
    mensaje: `Cuenta el efectivo de la caja. Esperado ahora: ${dinero(c.inicial + entrado)}. Si hay diferencia, explica el motivo.`,
    campos: [{ id: 'contado', etiqueta: 'Efectivo contado ($)', tipo: 'number', requerido: true },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea' }],
    textoGuardar: 'Cerrar caja',
    alGuardar: (v) => rpc('pos_cerrar_caja', { p_caja: c.id, p_contado: Math.round(Number(v.contado)), p_notas: v.notas || null }, 'Caja cerrada.'),
  }) }));
  if (c?.cerrada_at && ctx.puede('pos', 'aprobar')) acciones.push(boton('Reabrir', { icono: 'editar', onclick: () => abrirFormulario({
    titulo: 'Reabrir la caja',
    mensaje: 'La caja vuelve a quedar abierta y se borra el conteo. Al cerrarla de nuevo se recalcula el esperado.',
    campos: [], textoGuardar: 'Reabrir',
    alGuardar: () => rpc('pos_reabrir_caja', { p_caja: c.id }, 'Caja reabierta.'),
  }) }));

  const fila = (k, v, fuerte) => el('div', { class: `pos-cuadre-fila${fuerte ? ' pos-cuadre-total' : ''}` }, fuerte ? el('strong', {}, k) : el('span', {}, k), fuerte ? el('strong', {}, v) : el('span', {}, v));
  const difChip = (d) => el('span', { class: `chip ${d === 0 ? 'chip-ok' : 'chip-venc'}` }, d === 0 ? 'Cuadra' : `${d > 0 ? 'Sobra' : 'Falta'} ${dinero(Math.abs(d))}`);

  const resumen = !c
    ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'La caja de este día no está abierta. Igual se puede vender; el efectivo de abajo se cuenta al abrirla y cerrarla.')
    : el('div', { class: 'ficha doc-grupo pos-cuadre' },
        el('h2', {}, c.cerrada_at ? 'Caja cerrada' : 'Caja abierta'),
        fila('Efectivo inicial', dinero(c.inicial)),
        fila('Entró en efectivo', dinero(c.cerrada_at ? c.esperado - c.inicial : entrado)),
        fila('Esperado en caja', dinero(c.cerrada_at ? c.esperado : c.inicial + entrado), true),
        c.cerrada_at ? fila('Contado', dinero(c.contado)) : null,
        c.cerrada_at ? el('div', { class: 'pos-cuadre-fila' }, el('span', {}, 'Diferencia'), difChip(c.diferencia)) : null,
        c.cerrada_at && c.esperado - c.inicial !== entrado
          ? el('p', { class: 'texto-suave texto-chico' }, `Después del cierre cambió el efectivo del día (hoy suma ${dinero(entrado)}). Reabre y cierra para recalcular.`) : null,
        c.notas ? el('p', { class: 'texto-suave' }, c.notas) : null,
        el('p', { class: 'texto-suave texto-chico' }, `Abierta ${diaLocal(c.abierta_at) === c.fecha ? 'el mismo día' : `el ${fechaLarga(diaLocal(c.abierta_at))}`}${c.cerrada_at ? ` · cerrada el ${fechaLarga(diaLocal(c.cerrada_at))} ${new Date(c.cerrada_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}`));

  const enlace = (m) => (m.origen === 'pos'
    ? el('a', { href: ctx.ruta('pos.detalle', { id: m.id }) }, `Venta N° ${m.numero}`)
    : ctx.puede('taller', 'ver') ? el('a', { href: ctx.ruta('taller.orden', { id: m.id }) }, `Orden N° ${m.numero}`) : el('span', {}, `Orden del taller N° ${m.numero}`));
  const detalle = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, `Efectivo del día (${movs.length})`),
    movs.length ? movs.map((m) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, enlace(m), el('span', { class: 'texto-suave texto-chico' }, m.origen === 'pos' ? 'Venta en mesón' : 'Cobro del taller')),
      el('strong', {}, dinero(m.monto)))) : el('p', { class: 'texto-suave' }, 'Sin ingresos en efectivo este día.'),
    el('p', { class: 'texto-suave texto-chico' }, 'Ventas del POS vigentes en efectivo y órdenes del taller cobradas en efectivo ese día (servicios − descuento − abono).'));

  const historial = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Cajas del mes'),
    (mes.data ?? []).length ? mes.data.map((x) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); estado.dia = x.fecha; ctx.refrescar(); } }, fechaLarga(x.fecha)),
        el('span', { class: 'texto-suave texto-chico' }, `Inicial ${dinero(x.inicial)}${x.cerrada_at ? ` · esperado ${dinero(x.esperado)} · contado ${dinero(x.contado)}` : ''}`)),
      x.cerrada_at ? difChip(x.diferencia) : el('span', { class: 'chip chip-pend' }, 'Abierta'))) : el('p', { class: 'texto-suave' }, 'Sin cajas este mes.'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Caja'),
      el('div', { class: 'listado-acciones' }, dia, acciones)),
    el('div', { class: 'pos-cuadres pos-caja' }, resumen, detalle),
    historial);
}
