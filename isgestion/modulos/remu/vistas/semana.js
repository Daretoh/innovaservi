// Pago semanal (lunes a domingo): totales por día y por trabajador.
// Confirmar el pago (Remuneraciones 008, 2026-11-02): la semana se paga la semana siguiente; al pagar se confirma y
// queda lo pagado a cada uno. Si después cambia algo de esa semana o faltó un saldo, la diferencia se lleva a la semana
// actual o a la siguiente como extra o descuento con su motivo (remu_items.origen_semana), y la semana queda cuadrada.
import { el } from '../../../core/ui/dom.js?v=163dc56rf';
import { icono } from '../../../core/ui/iconos.js?v=163dc56rf';
import { boton } from '../../../core/ui/tabla.js?v=163dc56rf';
import { abrirFormulario } from '../../../core/ui/modal.js?v=163dc56rf';
import { avisar } from '../../../core/ui/aviso.js?v=163dc56rf';
import { dinero, horas, hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, fechaLarga, numSemana } from '../../../core/ui/formato.js?v=163dc56rf';
import { cargarBase, calcularRango, nombreCompleto } from '../datos.js?v=163dc56rf';

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
  const nav = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, `Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} – ${fechaCorta(domingo)}`),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')),
    boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); ctx.refrescar(); } }));

  const dias = el('div', { class: 'dias-semana' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const f = sumarDias(lunes, i);
    const d = R.porDia[f];
    const feriado = R.feriados.get(f);
    return el('a', { class: `dia-tarjeta dia-enlace ${f === hoyISO() ? 'hoy' : ''} ${feriado ? 'feriado' : ''}`, href: ctx.ruta('remu.dia', { f }), title: `${feriado ? `${feriado} · ` : ''}Ver el detalle del día` },
      el('span', {}, `${nombreDia(f)} ${Number(f.slice(8))}`),
      el('strong', {}, d?.monto ? dinero(d.monto) : '—'),
      el('span', { class: 'texto-suave texto-chico' }, feriado ? 'Feriado' : d?.min ? horas(d.min) : ''));
  }));

  // Faenas del trabajador en la semana (plegadas): faena, días y horas en cada una
  const faenasDe = (f) => {
    const por = new Map();
    for (const d of f.detalle) for (const x of d.faenas ?? []) { const o = por.get(x.faena) ?? []; o.push(`${nombreDia(d.fecha)} ${Number(d.fecha.slice(8))} · ${horas(x.min)}`); por.set(x.faena, o); }
    if (!por.size) return null;
    return el('details', { class: 'remu-faenas', onclick: (ev) => ev.stopPropagation() },
      el('summary', {}, `ver ${por.size} faena${por.size > 1 ? 's' : ''}`),
      [...por].map(([fa, ds]) => el('div', { class: 'remu-faenas-item' }, el('strong', {}, fa || 'Sin faena'), el('span', { class: 'texto-suave' }, ds.join(' · ')))));
  };

  const filas = R.filas.map((f) => {
    const href = ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, s: lunes });
    const desc = [f.cargo?.nombre ?? f.vinculo.cargo, f.modo === 'fijo' ? `fijo${f.ventana ? ` ${f.ventana}` : f.jornadaHoras ? ` ${f.jornadaHoras} h/día` : ''}` : 'por hora']
      .filter(Boolean).join(' · ');
    const fila = el('tr', { class: `fila-enlace${f.modo === 'fijo' ? ' fila-fijo' : ''}`, title: 'Ver el detalle, ajustar días y extras' },
      el('td', {}, el('a', { href }, nombreCompleto(f.persona)), f.modo === 'fijo' ? el('span', { class: 'chip chip-fijo' }, 'Fijo') : null, el('div', { class: 'texto-suave texto-chico' }, desc), faenasDe(f)),
      el('td', { class: 'centro' }, f.dias),
      el('td', {}, horas(f.totMin), f.modo === 'fijo' ? el('div', { class: 'texto-suave texto-chico' }, `${horas(f.pagoMin)} pagables`) : null),
      el('td', { class: 'num' }, f.vh ? dinero(f.vh) : el('span', { class: 'pct-mal', title: 'Sin trato ni valor hora' }, 'Sin valor')),
      el('td', { class: 'num' }, dinero(f.baseContable)),
      el('td', { class: 'num' }, f.montoVueltas ? dinero(f.montoVueltas) : '—'),
      el('td', { class: 'num pct-bien' }, f.extra ? dinero(f.extra) : '—'),
      el('td', { class: 'num pct-mal' }, f.descuento ? `−${dinero(f.descuento)}` : '—'),
      el('td', { class: 'num' }, el('strong', {}, dinero(f.total)),
        f.hayAjuste ? el('div', { class: 'texto-suave texto-chico', title: 'Hay días con ajuste contable' }, `real ${dinero(f.real)}`) : null),
      el('td', {}, celdaPago(ctx, f, estadoPago(f), lunes, editar)),
      el('td', { class: 'acciones-fila' }, el('a', { class: 'boton boton-secundario boton-chico', href }, icono('editar', { tam: 14 }), ctx.puede('remu', 'editar') ? 'Editar' : 'Ver')));
    fila.addEventListener('click', (ev) => { if (!ev.target.closest('a, button, input')) location.hash = href; });
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

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Pago semanal'),
      el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande' }, dinero(R.total)), acciones)),
    base.config.periodo === 'mensual' ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Esta empresa paga mensual: el pago (con bono por autos y extras del mes) está en ', ctx.hayVista?.('remu.pagomes') ? el('a', { href: ctx.ruta('remu.pagomes') }, 'Pago mensual') : el('a', { href: ctx.ruta('remu.mes') }, 'Cierre del mes'), '.') : null,
    nav,
    pasada ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `La semana pasada tiene ${pasada} pago${pasada === 1 ? '' : 's'} sin confirmar. `,
      el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); mover(-1); } }, 'Ver semana pasada')) : null,
    pagadas.length ? el('p', { class: `aviso-bandeja${conDif.length ? '' : ' aviso-ok'}` }, icono(conDif.length ? 'alerta' : 'check', { tam: 16 }),
      `Pago confirmado a ${pagadas.length} de ${R.filas.length}${pagos.pagadoEl ? ` (pagado el ${fechaLarga(pagos.pagadoEl)})` : ''}`,
      conDif.length ? ` · ${conDif.length} con diferencia por llevar a otra semana.` : '.') : null,
    dias,
    R.diasRepetidos ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `${R.diasRepetidos} ${R.diasRepetidos === 1 ? 'día con horas que se pisan' : 'días con horas que se pisan'}: se contaron una sola vez.`) : null,
    el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Días', 'Horas', 'Valor hora', 'Base', 'Vueltas', 'Extras', 'Desc.', 'Total', 'Pago', '']
          .map((t, i) => el('th', { class: i >= 3 ? 'num' : i === 1 ? 'centro' : '' }, t)))),
        el('tbody', {}, filas.length ? filas
          : el('tr', {}, el('td', { colspan: 11, class: 'tabla-vacia' }, 'Sin horas ni pagos esta semana. Las horas se cargan en Asistencia → Registro de horas.'))))),
    el('p', { class: 'texto-suave texto-chico' }, 'Pago: la semana se paga la semana siguiente. "Confirmar pago" deja registrado lo pagado a cada uno; si después cambia algo de la semana o faltó un saldo, "Llevar" o "Saldo" lo agrega como extra o descuento (con su motivo) a la semana en que se paga.'),
    el('p', { class: 'texto-suave texto-chico' }, 'Fijos: solo se pagan las horas fuera de su turno o sobre su jornada; fines de semana y feriados se pagan completos. Haz clic en una fila (o en Editar) para ver el detalle, ajustar días y agregar o editar extras y descuentos.'),
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
    const { nuevoPdf } = await import('../../../core/pdf.js?v=163dc56rf');
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
