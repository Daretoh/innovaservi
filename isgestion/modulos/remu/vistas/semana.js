// Pago semanal (lunes a domingo): totales por día y por trabajador.
// Confirmar el pago (Remuneraciones 008, 2026-11-02): la semana se paga la semana siguiente; al pagar se confirma y
// queda lo pagado a cada uno. Si después cambia algo de esa semana o faltó un saldo, la diferencia se lleva a la semana
// actual o a la siguiente como extra o descuento con su motivo (remu_items.origen_semana), y la semana queda cuadrada.
import { el } from '../../../core/ui/dom.js?v=bd56179';
import { icono } from '../../../core/ui/iconos.js?v=bd56179';
import { boton } from '../../../core/ui/tabla.js?v=bd56179';
import { abrirFormulario } from '../../../core/ui/modal.js?v=bd56179';
import { avisar } from '../../../core/ui/aviso.js?v=bd56179';
import { dinero, horas, hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, fechaLarga, numSemana } from '../../../core/ui/formato.js?v=bd56179';
import { cargarBase, calcularRango, nombreCompleto } from '../datos.js?v=bd56179';
import { coloresFaenas } from '../../../core/ui/faena-color.js?v=bd56179';

const estado = { lunes: lunesDe(hoyISO()) };

export default async function vista(ctx) {
  if (ctx.params.s) { estado.lunes = lunesDe(ctx.params.s); history.replaceState(null, '', ctx.ruta('remu.semana')); }
  const lunes = estado.lunes;
  const domingo = sumarDias(lunes, 6);
  const base = await cargarBase(ctx);
  const hoyLunes = lunesDe(hoyISO());
  // La semana, sus pagos y (al mirar la actual) si la pasada quedó sin confirmar, en paralelo
  const [R, pagos, pasada] = await Promise.all([
    calcularRango(ctx, base, { desde: lunes, hasta: domingo }),
    cargarPagos(ctx, lunes),
    lunes === hoyLunes ? pendientesDe(ctx, base, sumarDias(lunes, -7)) : 0,
  ]);
  const editar = ctx.puede('remu', 'editar');
  const estadoPago = (f) => {
    const p = pagos.pago.get(f.vinculo.persona_id);
    if (!p) return { p: null, dif: 0 };
    return { p, dif: f.total - p.monto - (pagos.llevado.get(f.vinculo.persona_id) ?? 0) };
  };

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); ctx.refrescar(); };
  // Como InnovaGestión: la semana en una tarjeta, la franja con el total a pagar, los 7 días y una sola tabla
  // (spot primero y fijos al final, con su fila destacada).
  const nav = el('div', { class: 'rs-semana' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
    el('div', { class: 'rs-semana-txt' }, el('span', {}, `Semana ${numSemana(lunes)}`), el('strong', {}, `${fechaCorta(lunes)} – ${fechaCorta(domingo)}`)),
    boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); ctx.refrescar(); } }),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')));

  const totalBanda = el('div', { class: 'rs-total' }, el('span', {}, 'Total a pagar'), el('strong', {}, dinero(R.total)));

  const dias = el('div', { class: 'rs-dias' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const f = sumarDias(lunes, i);
    const d = R.porDia[f];
    const feriado = R.feriados.get(f);
    return el('a', { class: `rs-dia${f === hoyISO() ? ' hoy' : ''}${d?.monto ? '' : ' cero'}${feriado ? ' feriado' : ''}`, href: ctx.ruta('remu.dia', { f }), title: `${feriado ? `${feriado} · ` : ''}Ver el detalle del día` },
      el('span', { class: 'rs-dia-nom' }, nombreDia(f), el('b', {}, String(Number(f.slice(8))))),
      el('span', { class: 'rs-dia-monto' }, d?.monto ? dinero(d.monto) : '—'),
      feriado ? el('span', { class: 'rs-dia-h' }, 'Feriado') : d?.min ? el('span', { class: 'rs-dia-h' }, horas(d.min)) : null);
  }));

  // Faenas del trabajador en la semana (plegadas): una tarjeta por faena con el color de la faena, días y horas
  const colorFaena = coloresFaenas(R.filas.flatMap((f) => f.detalle.flatMap((d) => (d.faenas ?? []).map((x) => x.faena))));
  const faenasDe = (f) => {
    const por = new Map();
    for (const d of f.detalle) for (const x of d.faenas ?? []) { const o = por.get(x.faena) ?? []; o.push(`${nombreDia(d.fecha)} ${Number(d.fecha.slice(8))} · ${horas(x.min)}`); por.set(x.faena, o); }
    if (!por.size) return null;
    return el('details', { class: 'rs-faenas', onclick: (ev) => ev.stopPropagation() },
      el('summary', {}, icono('abajo', { tam: 12 }), `ver ${por.size} faena${por.size > 1 ? 's' : ''}`),
      el('div', { class: 'rs-faenas-lista' }, [...por].map(([fa, ds]) => el('div', { class: 'rs-faena', style: `--faena:${colorFaena(fa)}` },
        el('strong', {}, fa || 'Sin faena'), el('span', {}, ds.join('  ·  '))))));
  };
  const m = (v, neg) => (v ? `${neg ? '−' : ''}${dinero(v)}` : el('span', { class: 'rs-cero' }, '—'));

  const filas = R.filas.map((f) => {
    const href = ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, s: lunes });
    const fijo = f.modo === 'fijo';
    const desc = [f.cargo?.nombre ?? f.vinculo.cargo, fijo ? `fijo${f.ventana ? ` ${f.ventana}` : f.jornadaHoras ? ` ${f.jornadaHoras}h/día` : ''}` : null].filter(Boolean).join(' · ');
    const fila = el('tr', { class: fijo ? 'rs-fijo' : '', title: 'Ver el detalle, ajustar días y extras' },
      el('td', { class: 'rs-nombre' },
        el('div', { class: 'rs-persona' },
          el('div', {}, el('a', { href }, nombreCompleto(f.persona)),
            el('div', { class: 'rs-sub' }, desc || '—', f.vh ? null : el('span', { class: 'pct-mal', title: 'Sin trato ni valor hora' }, ' · sin valor hora')))),
        faenasDe(f)),
      el('td', {}, String(f.dias)),
      el('td', {}, horas(f.totMin), fijo ? el('div', { class: 'rs-sub rs-sub-fijo' }, `− ${horas(f.totMin - f.pagoMin)} = ${horas(f.pagoMin)} extra`) : null),
      el('td', {}, m(f.baseContable)),
      el('td', {}, m(f.montoVueltas)),
      el('td', { class: 'pct-bien' }, m(f.extra)),
      el('td', { class: 'pct-mal' }, m(f.descuento, true)),
      el('td', { class: 'rs-tot' }, dinero(f.total), f.hayAjuste ? el('div', { class: 'rs-sub', title: 'Hay días con ajuste contable' }, `real ${dinero(f.real)}`) : null),
      el('td', { class: 'rs-pago' }, celdaPago(ctx, f, estadoPago(f), lunes, editar)));
    fila.addEventListener('click', (ev) => { if (!ev.target.closest('a, button, input, details')) location.hash = href; });
    return fila;
  });

  const acciones = [];
  const porPagar = R.filas.filter((f) => !pagos.pago.has(f.vinculo.persona_id) && f.total !== 0);
  if (editar && !pagos.sinTabla && porPagar.length) acciones.push(boton(`Confirmar pago (${porPagar.length})`, { icono: 'check', tipo: 'primario', onclick: () => confirmar(ctx, porPagar, lunes) }));
  const pagadas = R.filas.filter((f) => pagos.pago.has(f.vinculo.persona_id));
  const conDif = R.filas.filter((f) => estadoPago(f).dif !== 0);
  if (ctx.puede('remu', 'exportar') && R.filas.length) {
    acciones.push(boton('PDF', { icono: 'descargar', onclick: (ev) => exportarPdf(ctx, R, lunes, domingo, ev.currentTarget) }));
  }

  return el('section', { class: 'listado remu-semanal' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Remuneraciones', el('span', { class: 'rs-cnt' }, `${R.filas.length} ${R.filas.length === 1 ? 'trabajador' : 'trabajadores'}`)),
      el('div', { class: 'listado-acciones' }, acciones)),
    base.config.periodo === 'mensual' ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Esta empresa paga mensual: el pago (con bono por autos y extras del mes) está en ', ctx.hayVista?.('remu.pagomes') ? el('a', { href: ctx.ruta('remu.pagomes') }, 'Pago mensual') : el('a', { href: ctx.ruta('remu.mes') }, 'Cierre del mes'), '.') : null,
    nav,
    totalBanda,
    pasada ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `La semana pasada tiene ${pasada} pago${pasada === 1 ? '' : 's'} sin confirmar. `,
      el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); mover(-1); } }, 'Ver semana pasada')) : null,
    pagadas.length ? el('p', { class: `aviso-bandeja${conDif.length ? '' : ' aviso-ok'}` }, icono(conDif.length ? 'alerta' : 'check', { tam: 16 }),
      `Pago confirmado a ${pagadas.length} de ${R.filas.length}${pagos.pagadoEl ? ` (pagado el ${fechaLarga(pagos.pagadoEl)})` : ''}`,
      conDif.length ? ` · ${conDif.length} con diferencia por llevar a otra semana.` : '.') : null,
    dias,
    R.diasRepetidos ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `${R.diasRepetidos} ${R.diasRepetidos === 1 ? 'día con horas repetidas o solapadas' : 'días con horas repetidas o solapadas'} (contadas una vez).`) : null,
    filas.length
      ? el('div', { class: 'rs-scroll' }, el('table', { class: 'rs-tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Días', 'Horas', 'Base', 'Vueltas', 'Extras', 'Desc.', 'Total', 'Pago'].map((t) => el('th', {}, t)))),
        el('tbody', {}, filas)))
      : el('div', { class: 'rs-vacio' }, 'Sin horas ni pagos esta semana.', el('span', {}, 'Cambia de semana o revisa las horas en Asistencia → Registro de horas.')),
  );
}

// ---------------------------------------------------------------- Pagos confirmados

const MEDIOS = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque'], ['otro', 'Otro']];
const conSigno = (it) => (it.tipo === 'extra' ? it.monto : -it.monto);
const rango = (lunes) => `${fechaCorta(lunes)} al ${fechaCorta(sumarDias(lunes, 6))}`;

// Pagos confirmados de una semana y lo ya llevado a otras semanas (por persona)
async function cargarPagos(ctx, lunes) {
  const e = ctx.empresa.id;
  const [pg, it] = await Promise.all([
    ctx.api.from('remu_pagos_semana').select('*').eq('empresa_id', e).eq('semana', lunes).is('anulado_at', null),
    ctx.api.from('remu_items').select('persona_id, tipo, monto').eq('empresa_id', e).eq('origen_semana', lunes),
  ]);
  const pago = new Map((pg.data ?? []).map((p) => [p.persona_id, p]));
  const llevado = new Map();
  for (const x of it.data ?? []) llevado.set(x.persona_id, (llevado.get(x.persona_id) ?? 0) + conSigno(x));
  const fechas = [...new Set((pg.data ?? []).map((p) => p.pagado_el))];
  return { pago, llevado, pagadoEl: fechas.length === 1 ? fechas[0] : null, sinTabla: !!pg.error };
}

// Cuántos trabajadores con monto quedan sin pago confirmado en una semana
async function pendientesDe(ctx, base, lunes) {
  try {
    const [R, P] = await Promise.all([calcularRango(ctx, base, { desde: lunes, hasta: sumarDias(lunes, 6) }), cargarPagos(ctx, lunes)]);
    if (P.sinTabla) return 0;
    return R.filas.filter((f) => f.total !== 0 && !P.pago.has(f.vinculo.persona_id)).length;
  } catch { return 0; }
}

function celdaPago(ctx, f, { p, dif }, lunes, editar) {
  if (!p) return el('span', { class: 'chip chip-pend' }, 'Por pagar');
  return el('div', { class: 'remu-pago', onclick: (ev) => ev.stopPropagation() },
    el('button', { type: 'button', class: 'chip chip-ok remu-pago-chip', title: 'Ver el pago (o anularlo)', onclick: () => verPago(ctx, f, p, editar) }, `Pagado ${fechaCorta(p.pagado_el)}`),
    dif ? el('span', { class: `texto-chico ${dif > 0 ? 'pct-bien' : 'pct-mal'}`, title: 'Cambió después de pagar: llévalo a la semana en que se paga' }, `${dif > 0 ? 'Falta' : 'Sobra'} ${dinero(Math.abs(dif))}`) : null,
    editar ? boton(dif ? 'Llevar' : 'Saldo', { icono: 'mas', onclick: () => llevar(ctx, f, lunes, dif) }) : null);
}

function confirmar(ctx, filas, lunes) {
  const total = filas.reduce((s, f) => s + f.total, 0);
  abrirFormulario({
    titulo: `Confirmar pago · semana ${numSemana(lunes)}`,
    mensaje: `${rango(lunes)}. Queda registrado lo pagado a cada uno con el detalle de hoy (${dinero(total)} en total). Si después cambia algo de la semana, la diferencia se lleva a otra semana con su motivo.`,
    campos: [
      { id: 'personas', etiqueta: 'Trabajadores pagados', tipo: 'checks', opciones: filas.map((f) => [f.vinculo.persona_id, `${nombreCompleto(f.persona)} · ${dinero(f.total)}`]), valor: filas.map((f) => f.vinculo.persona_id) },
      { id: 'fecha', etiqueta: 'Fecha de pago', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'medio', etiqueta: 'Medio', opciones: MEDIOS, valor: 'transferencia' },
      { id: 'nota', etiqueta: 'Nota (opcional)' },
    ],
    textoGuardar: 'Confirmar pago',
    alGuardar: async (v) => {
      const elegidas = filas.filter((f) => v.personas.includes(f.vinculo.persona_id));
      if (!elegidas.length) throw new Error('Marca al menos un trabajador.');
      const { error } = await ctx.api.from('remu_pagos_semana').insert(elegidas.map((f) => ({
        empresa_id: ctx.empresa.id, persona_id: f.vinculo.persona_id, semana: lunes, monto: f.total, pagado_el: v.fecha, medio: v.medio, nota: v.nota.trim() || null,
        detalle: { dias: f.dias, min: f.totMin, base: f.baseContable, vueltas: f.montoVueltas, extra: f.extra, descuento: f.descuento, real: f.real },
      })));
      if (error) throw new Error(error.message);
      avisar(`Pago confirmado: ${elegidas.length} trabajador${elegidas.length === 1 ? '' : 'es'}, ${dinero(elegidas.reduce((s, f) => s + f.total, 0))}.`);
      ctx.refrescar();
    },
  });
}

// Lleva una diferencia (o un saldo que faltó) a la semana en que se paga, como extra o descuento con su motivo
function llevar(ctx, f, lunes, dif) {
  const hoyLunes = lunesDe(hoyISO());
  const primera = hoyLunes > lunes ? hoyLunes : sumarDias(lunes, 7);
  const semanas = [primera, sumarDias(primera, 7)].map((s) => [s, `Semana ${numSemana(s)} · ${rango(s)}${s === hoyLunes ? ' (esta semana)' : ''}`]);
  abrirFormulario({
    titulo: dif ? 'Llevar la diferencia a otro pago' : 'Agregar un saldo a otro pago',
    mensaje: `${nombreCompleto(f.persona)} · semana ${numSemana(lunes)} (${rango(lunes)}).${dif ? ` Después de pagar, la semana cambió en ${dif > 0 ? '+' : '−'}${dinero(Math.abs(dif))}.` : ''}`,
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: [['extra', 'Se le debe (se suma al pago)'], ['descuento', 'Se le pagó de más (se descuenta)']], valor: dif < 0 ? 'descuento' : 'extra' },
      { id: 'monto', etiqueta: 'Monto ($)', tipo: 'number', requerido: true, valor: dif ? String(Math.abs(dif)) : '' },
      { id: 'semana', etiqueta: 'Se paga en', opciones: semanas, valor: primera },
      { id: 'motivo', etiqueta: 'Motivo (queda en el detalle del pago)', tipo: 'textarea', requerido: true },
    ],
    textoGuardar: 'Agregar al pago',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica un monto mayor que cero.');
      if (!v.motivo.trim()) throw new Error('Indica el motivo.');
      const { error } = await ctx.api.from('remu_items').insert({
        empresa_id: ctx.empresa.id, persona_id: f.vinculo.persona_id, semana: v.semana, tipo: v.tipo, monto,
        concepto: `Saldo semana ${numSemana(lunes)} (${rango(lunes)})`, nota: v.motivo.trim(), origen_semana: lunes,
      });
      if (error) throw new Error(error.message);
      avisar(`Agregado al pago de la semana ${numSemana(v.semana)}.`);
      ctx.refrescar();
    },
  });
}

function verPago(ctx, f, p, editar) {
  const d = p.detalle ?? {};
  abrirFormulario({
    titulo: `Pago de ${nombreCompleto(f.persona)}`,
    mensaje: `Pagado el ${fechaLarga(p.pagado_el)}${p.medio ? ` por ${MEDIOS.find(([k]) => k === p.medio)?.[1].toLowerCase()}` : ''}: ${dinero(p.monto)}. `
      + `Al confirmar: ${d.dias ?? '—'} días, ${horas(d.min ?? 0)}, base ${dinero(d.base)}, vueltas ${dinero(d.vueltas)}, extras ${dinero(d.extra)}, descuentos ${dinero(d.descuento)}.`
      + `${p.nota ? ` Nota: ${p.nota}.` : ''}${editar ? ' Para anularlo (p. ej. si se confirmó por error), escribe el motivo.' : ''}`,
    campos: editar ? [{ id: 'motivo', etiqueta: 'Motivo para anular', tipo: 'textarea' }] : [],
    textoGuardar: editar ? 'Anular pago' : 'Cerrar',
    alGuardar: async (v) => {
      if (!editar) return;
      if (!v.motivo?.trim()) throw new Error('Para anular, escribe el motivo.');
      const { error } = await ctx.api.from('remu_pagos_semana').update({ anulado_at: new Date().toISOString(), anulado_motivo: v.motivo.trim() }).eq('id', p.id);
      if (error) throw new Error(error.message);
      avisar('Pago anulado: esa persona vuelve a quedar por pagar en la semana.');
      ctx.refrescar();
    },
  });
}

async function exportarPdf(ctx, R, lunes, domingo, b) {
  b.disabled = true;
  try {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=bd56179');
    const pdf = await nuevoPdf(ctx, { titulo: `Pago semanal · semana ${numSemana(lunes)}`, subtitulo: `${fechaCorta(lunes)} al ${fechaCorta(domingo)} · total ${dinero(R.total)}`, horizontal: true });
    pdf.tabla({
      columnas: ['Trabajador', 'RUT', 'Modo', 'Días', 'Horas', 'Base', 'Vueltas', 'Extras', 'Descuentos', 'Total'],
      filas: [...R.filas.map((f) => [nombreCompleto(f.persona), f.persona.rut, f.modo === 'fijo' ? 'Fijo' : 'Por hora', f.dias, horas(f.totMin),
        dinero(f.baseContable), dinero(f.montoVueltas), dinero(f.extra), dinero(f.descuento), dinero(f.total)]),
      ['Total', '', '', '', '', '', '', '', '', dinero(R.total)]],
    });
    pdf.guardar(`pago-semana-${lunes}`);
  } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}
