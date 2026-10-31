// Detalle de un día (como en InnovaGestión al tocar un día de la semana): faenas planificadas, trabajadores
// agrupados por faena con sus horarios, horas y monto (real y contable editable si la empresa usa ajuste contable),
// y totales del día. Ruta: #/remu.dia?f=<aaaa-mm-dd>
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { icono } from '../../../core/ui/iconos.js?v=a7f53fa';
import { dinero, horas, lunesDe, sumarDias, nombreDia, fechaCorta, fechaLarga, numSemana, hhmm, hoyISO } from '../../../core/ui/formato.js?v=a7f53fa';
import { cargarBase, calcularRango, nombreCompleto } from '../datos.js?v=a7f53fa';
import { campoContable } from './detalle.js?v=a7f53fa';

export default async function vista(ctx) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.f ?? '') ? ctx.params.f : hoyISO();
  const lunes = lunesDe(fecha);
  const volver = el('a', { class: 'volver', href: ctx.ruta('remu.semana', { s: lunes }) }, icono('volver', { tam: 16 }), `Semana ${numSemana(lunes)}`);
  const base = await cargarBase(ctx);
  const [R, faenasPlan] = await Promise.all([
    calcularRango(ctx, base, { desde: lunes, hasta: sumarDias(lunes, 6) }),
    ctx.puede('ope', 'ver')
      ? ctx.api.from('ope_faenas').select('id, titulo, hora_inicio, hora_fin, dias, terceros(nombre_fantasia, razon_social)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
        .lte('fecha_inicio', fecha).or(`fecha_fin.gte.${fecha},and(fecha_fin.is.null,fecha_inicio.eq.${fecha})`).order('hora_inicio', { nullsFirst: false })
      : Promise.resolve({ data: null }),
  ]);
  const contable = !!base.config.ajuste_contable;
  const puedeEditar = ctx.puede('remu', 'editar') && ctx.puede('remu', 'crear');
  const feriado = R.feriados.get(fecha);

  // Quién trabajó ese día, agrupados por su primera faena (como InnovaGestión)
  const filas = R.filas.map((f) => ({ f, d: f.detalle.find((x) => x.fecha === fecha) })).filter((x) => x.d && (x.d.min > 0 || x.d.vueltas));
  const grupos = new Map();
  for (const x of filas) { const k = x.d.faenas[0]?.faena || 'Sin faena asignada'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); }
  const orden = [...grupos.keys()].sort((a, b) => (a === 'Sin faena asignada') - (b === 'Sin faena asignada') || a.localeCompare(b));

  const persona = ({ f, d }) => {
    const varias = d.faenas.length > 1;
    const porFaena = contable && varias && d.porFaena;
    const fijo = f.modo === 'fijo' && !d.especial && d.pagoMin < d.min;
    let monto;
    if (contable && puedeEditar && !porFaena) monto = campoContable(ctx, f.vinculo.persona_id, fecha, '', d.real, d.ajuste);
    else monto = el('div', {}, el('strong', { class: contable && d.contable !== d.real ? 'pct-medio' : '' }, dinero(contable ? d.contable : d.real)),
      porFaena ? el('div', {}, el('a', { class: 'texto-chico', href: ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, s: lunes }) }, 'ajustar por faena')) : null);
    return el('div', { class: 'doc-fila remu-dia-fila' },
      el('div', { class: 'doc-nombre' },
        el('a', { href: ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, s: lunes }) }, el('strong', {}, nombreCompleto(f.persona))),
        el('span', { class: 'texto-suave texto-chico' }, [f.cargo?.nombre ?? f.vinculo.cargo, f.modo === 'fijo' ? 'fijo' : 'por hora'].filter(Boolean).join(' · ')),
        el('div', { class: 'remu-dia-horario texto-chico' },
          d.registros.map((r) => `${hhmm(r.entrada)}–${hhmm(r.salida)}${r.vueltas ? ` · ${r.vueltas} vuelta${r.vueltas > 1 ? 's' : ''}` : ''}`).join(', '), d.min ? ` · ${horas(d.min)}` : '',
          d.vueltasFlota.map((x) => el('span', { class: 'texto-suave' }, ` · ${x.cantidad} vuelta${x.cantidad > 1 ? 's' : ''} en ${x.vehiculo}`)),
          fijo ? el('span', { class: 'texto-suave' }, ` · fijo: ${horas(d.pagoMin)} pagables`) : null,
          varias ? el('span', { class: 'texto-suave' }, ` · también: ${d.faenas.slice(1).map((x) => x.faena || 'sin faena').join(' · ')}`) : null)),
      el('div', { class: 'remu-dia-monto' }, contable ? el('span', { class: 'texto-suave texto-chico' }, `real ${dinero(d.real)}`) : null, monto));
  };

  const totMin = filas.reduce((a, x) => a + x.d.min, 0);
  const totMonto = filas.reduce((a, x) => a + (contable ? x.d.contable : x.d.real), 0);
  const totVueltas = filas.reduce((a, x) => a + x.d.vueltas, 0);
  const clienteDe = (x) => x.terceros?.nombre_fantasia || x.terceros?.razon_social;

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `${nombreDia(fecha)} ${fechaLarga(fecha)}`),
        el('p', { class: 'texto-suave' }, `Semana ${numSemana(lunes)}${feriado ? ` · Feriado: ${feriado}` : ''}`)),
      el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande' }, dinero(totMonto)))),
    el('div', { class: 'nav-periodo' },
      el('a', { class: 'boton-icono', href: ctx.ruta('remu.dia', { f: sumarDias(fecha, -1) }), 'aria-label': 'Día anterior' }, icono('volver')),
      el('strong', {}, fechaCorta(fecha)),
      el('a', { class: 'boton-icono', href: ctx.ruta('remu.dia', { f: sumarDias(fecha, 1) }), 'aria-label': 'Día siguiente' }, icono('derecha'))),
    faenasPlan.data ? el('div', { class: 'ficha' },
      el('h2', {}, 'Faenas del día (Planificación)'),
      (faenasPlan.data = faenasPlan.data.filter((x) => !x.dias?.length || x.dias.includes(fecha))).length
        ? el('div', { class: 'chips-fila' }, faenasPlan.data.map((x) => el('span', { class: 'chip chip-na' }, icono('calendario', { tam: 12 }),
          ` ${x.titulo || 'Faena'}${clienteDe(x) ? ` · ${clienteDe(x)}` : ''}${x.hora_inicio ? ` · ${hhmm(x.hora_inicio)}` : ''}`)))
        : el('p', { class: 'texto-suave' }, 'Sin faenas en Planificación para este día.')) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Trabajadores por faena (${filas.length})`),
      filas.length ? orden.map((k) => {
        const g = grupos.get(k);
        return el('div', { class: 'remu-dia-grupo' },
          el('div', { class: 'remu-dia-cabeza' }, el('strong', {}, k), el('span', { class: 'chip chip-na' }, `${g.length} pers.`),
            el('span', { class: 'texto-suave texto-chico' }, `${horas(g.reduce((a, x) => a + x.d.min, 0))} · ${dinero(g.reduce((a, x) => a + (contable ? x.d.contable : x.d.real), 0))}`)),
          g.map(persona));
      }) : el('p', { class: 'texto-suave' }, 'Nadie registró horas este día.')),
    el('div', { class: 'ficha' },
      el('dl', { class: 'datos-lista' },
        el('dt', {}, 'Total horas del día'), el('dd', {}, horas(totMin)),
        el('dt', {}, el('strong', {}, contable ? 'Total pago del día (contable)' : 'Total pago del día')), el('dd', {}, el('strong', {}, dinero(totMonto))),
        totVueltas ? el('dt', {}, 'Vueltas del día') : null, totVueltas ? el('dd', {}, String(totVueltas)) : null)),
  );
}
