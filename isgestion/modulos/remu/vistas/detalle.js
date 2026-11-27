// Detalle del pago de una persona en una semana o un mes: día a día, ajustes contables, extras y descuentos.
// Como en InnovaGestión: el monto contable y su motivo se escriben directo en cada día (o en cada faena, si el día
// tiene varias y la suma cuadra) y se guardan al salir del campo; extras y descuentos se editan en la lista.
// El ajuste contable (real vs. contable) es una opción de la empresa (Parámetros); apagada, se paga lo calculado.
// Rutas: #/remu.detalle?p=<persona_id>&s=<lunes> (semanal) · #/remu.detalle?p=<persona_id>&m=<aaaa-mm> (mensual)
import { el } from '../../../core/ui/dom.js?v=c3310e4';
import { icono } from '../../../core/ui/iconos.js?v=c3310e4';
import { boton } from '../../../core/ui/tabla.js?v=c3310e4';
import { avisar } from '../../../core/ui/aviso.js?v=c3310e4';
import { dinero, horas, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, hhmm, hoyISO, rangoMes, moverMes, nombreMes } from '../../../core/ui/formato.js?v=c3310e4';
import { cargarBase, calcularRango, pagoMensual, nombreCompleto } from '../datos.js?v=c3310e4';
import { sueldoDelMes, semanaEnMes } from '../calculo.js?v=c3310e4';
import { coloresFaenas } from '../../../core/ui/faena-color.js?v=c3310e4';

export default async function vista(ctx) {
  const personaId = ctx.params.p;
  const mes = /^\d{4}-\d{2}$/.test(ctx.params.m ?? '') ? ctx.params.m : null;
  const lunes = lunesDe(ctx.params.s || hoyISO());
  const domingo = sumarDias(lunes, 6);
  const base = await cargarBase(ctx);
  const v = base.vinculos.find((x) => x.persona_id === personaId);
  // Mes de una persona: en empresas de pago mensual, el pago del mes (con bono por autos y extras del mes); en las de pago
  // semanal, todos sus trabajos del mes (como "ver todos sus trabajos del mes" de InnovaGestión) con las semanas que le tocan.
  const mensualEmpresa = base.config.periodo === 'mensual';
  // Vuelve a Pago mensual solo si la empresa lo ve (Performance e Innova usan el Resumen mensual)
  const aPagoMes = mensualEmpresa && ctx.hayVista?.('remu.pagomes');
  // Si la empresa no ve esa pantalla (el Cierre está en el Grupo), Volver regresa a donde se venía
  const destino = mes ? (aPagoMes ? 'remu.pagomes' : 'remu.mes') : 'remu.semana';
  const atras = ctx.hayVista && !ctx.hayVista(destino) ? (ev) => { ev.preventDefault(); history.back(); } : null;
  const volver = mes ? el('a', { class: 'volver', href: ctx.ruta(destino), onclick: atras }, icono('volver', { tam: 16 }), atras ? 'Volver' : aPagoMes ? 'Pago mensual' : 'Cierre del mes')
    : el('a', { class: 'volver', href: ctx.ruta('remu.semana', { s: lunes }), onclick: atras }, icono('volver', { tam: 16 }), atras ? 'Volver' : 'Pago semanal');
  if (!v) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Persona no encontrada'));

  // Solo esta persona (incluye fijos sin actividad para mostrar su ficha igual)
  const unico = { ...base, vinculos: [v] };
  const P = mes && mensualEmpresa ? await pagoMensual(ctx, unico, mes) : null;
  const rm = mes ? rangoMes(mes) : null;
  const R = P ? P.R : mes
    ? await calcularRango(ctx, unico, { desde: rm.desde, hasta: rm.hasta, incluirFijosSinActividad: true, itemsDesde: lunesDe(sumarDias(rm.desde, -6)), itemsHasta: rm.hasta, filtroItems: (it) => semanaEnMes(it.semana, mes) })
    : await calcularRango(ctx, unico, { desde: lunes, hasta: domingo, incluirFijosSinActividad: true });
  const f0 = P ? P.filas[0] ?? null : R.filas[0] ?? null;
  const f = f0 && mes && !P ? { ...f0, sueldo: sueldoDelMes(f0, mes), totalMes: f0.total + sueldoDelMes(f0, mes) } : f0;
  const totalPago = mes ? f?.totalMes ?? 0 : f?.total ?? 0;
  const porFecha = new Map((f?.detalle ?? []).map((d) => [d.fecha, d]));
  const puedeEditar = ctx.puede('remu', 'editar') && ctx.puede('remu', 'crear');
  const contable = !!base.config.ajuste_contable;
  const c = v.condicion;
  // Fijo: lo pagable son las horas fuera del turno (o fines de semana y feriados), es decir, horas extra
  const esFijo = f?.modo === 'fijo';
  const pagables = esFijo ? 'Fuera de su turno' : 'Pagables';
  const cargo = c?.cargo_id ? base.cargos.get(c.cargo_id) : null;
  // Quién corrigió a mano cada monto (para mostrarlo junto al naranjo)
  const nombresQuien = new Map();
  if (contable && (f?.detalle ?? []).some((d) => d.ajuste || d.faenas.some((x) => x.ajuste))) {
    const { data } = await ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id });
    for (const x of data ?? []) nombresQuien.set(x.user_id, x.nombre);
  }
  const quien = (aj) => (aj?.created_by ? nombresQuien.get(aj.created_by) ?? null : null);
  const sinTurno = esFijo && !c?.jornada_ini && !c?.art22;
  // Periodo (o parte) anterior a "turno desde": esos días se calculan con la jornada en horas
  const antesDelTurno = esFijo && !c?.art22 && c?.jornada_ini && c?.turno_desde && (mes ? rm.desde : lunes) < c.turno_desde;

  const irSemana = (n) => { location.hash = mes ? ctx.ruta('remu.detalle', { p: personaId, m: moverMes(mes, n) }) : ctx.ruta('remu.detalle', { p: personaId, s: sumarDias(lunes, n * 7) }); };
  const condTexto = [
    (c?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora')) === 'fijo'
      ? `Fijo${c?.sueldo_base ? ` · sueldo ${dinero(c.sueldo_base)}` : ''}${c?.jornada_ini ? ` · turno ${hhmm(c.jornada_ini)}–${hhmm(c.jornada_fin)}${c.salida_viernes ? ` (viernes hasta ${hhmm(c.salida_viernes)})` : ''}${c.turno_desde ? ` desde el ${fechaCorta(c.turno_desde)}${c.jornada_horas ? ` (antes ${Number(c.jornada_horas)} h/día)` : ''}` : ''}` : c?.jornada_horas ? ` · ${Number(c.jornada_horas)} h/día, sin turno` : ' · sin jornada (todas sus horas se pagan)'}`
      : 'Por hora (spot)',
    cargo ? cargo.nombre : null,
    f ? `valor hora ${dinero(f.vh)}` : null,
    c?.valor_vuelta != null ? `vuelta ${dinero(c.valor_vuelta)}` : null,
  ].filter(Boolean).join(' · ');
  // Qué se paga, en palabras (fijos)
  const queSePaga = !esFijo || !f ? null
    : c?.art22 ? 'Artículo 22: solo el sueldo. No se pagan horas aparte, tampoco fines de semana ni feriados.'
      : `El sueldo ya incluye su turno. Se paga aparte, a ${dinero(f.vh)} la hora: lo que trabaje fuera del turno, los fines de semana y los feriados.`;

  // Como InnovaGestión: solo los días con registros (cada uno con sus faenas y el monto a la derecha), después el
  // Desglose y al final los montos, extras y descuentos.
  const fechas = (f?.detalle ?? []).map((d) => d.fecha);
  // Un color por faena (en el orden en que aparecen) para distinguirlas
  const colorFaena = coloresFaenas((f?.detalle ?? []).flatMap((d) => d.registros.map((r) => r.faena)));
  const campoAjuste = (d, faena, real, ajuste) => campoContable(ctx, personaId, d.fecha, faena, real, ajuste, quien(ajuste));
  const plural = (n) => (n > 1 ? 's' : '');
  const vh = f?.vh || 0;
  const filasDias = fechas.map((fecha) => {
    const d = porFecha.get(fecha);
    const feriado = R.feriados.get(fecha);
    const editarFaenas = contable && puedeEditar && d.faenas.length > 1 && d.porFaena;
    const faenas = d.faenas.map((x) => {
      const regs = d.registros.filter((r) => String(r.faena ?? '').trim() === x.faena);
      const horarios = regs.map((r) => `${hhmm(r.entrada)}→${hhmm(r.salida)}${r.vueltas ? ` (${r.vueltas} vuelta${plural(r.vueltas)})` : ''}`).join(', ');
      const completo = Math.round((x.min / 60) * vh);
      return el('div', { class: 'rd-faena', style: `--faena:${colorFaena(x.faena)}` },
        el('div', { class: 'rd-faena-txt' },
          el('strong', {}, x.faena || 'Sin faena asignada'),
          el('span', {}, `${horarios} · ${horas(x.min)}`),
          esFijo && completo > x.real ? el('span', { class: 'rd-faena-fijo' }, `valor trato ${dinero(completo)} · ${x.real ? `se paga ${dinero(x.real)} (horas fuera del turno)` : 'cubierto por el sueldo'}`) : null),
        editarFaenas
          ? el('div', { class: 'rd-faena-monto' }, el('span', { class: 'texto-suave texto-chico' }, `real ${dinero(x.real)}`), campoAjuste(d, x.faena, x.real, x.ajuste))
          : el('strong', { class: 'rd-faena-monto' }, dinero(contable ? x.contable : x.real)));
    });
    const flota = d.vueltasFlota.map((x) => el('div', { class: 'rd-nota' }, `${x.cantidad} vuelta${plural(x.cantidad)} en ${x.vehiculo} (registradas por el chofer)`));
    // Fijo: cuánto del día se paga aparte del sueldo
    const completoDia = Math.round((d.min / 60) * vh);
    const notaFijo = !esFijo ? null : d.especial
      ? el('div', { class: 'rd-nota rd-nota-fijo' }, `${feriado ? 'feriado' : 'fin de semana'} · ${horas(d.min)} como trato · ${dinero(d.real)}`)
      : el('div', { class: 'rd-nota rd-nota-fijo' }, `fijo · ${horas(d.min)} − ${horas(d.min - d.pagoMin)} ${c?.jornada_ini ? 'en turno' : 'de jornada'} = ${horas(d.pagoMin)} trato · real ${dinero(d.real)} `,
        el('span', { class: 'texto-suave' }, `(si spot ${dinero(completoDia)} · −${dinero(completoDia - d.real)})`));
    let derecha;
    if (contable && puedeEditar && !editarFaenas) {
      derecha = el('div', { class: 'rd-col' }, el('span', { class: `rd-real${d.contable !== d.real ? ' rd-ajustado' : ''}` }, `real ${dinero(d.real)}`), campoAjuste(d, '', d.real, d.ajuste));
    } else {
      derecha = el('div', { class: 'rd-col' },
        contable && d.contable !== d.real ? el('span', { class: 'rd-real rd-ajustado' }, `real ${dinero(d.real)}`) : null,
        el('strong', { class: 'rd-monto' }, dinero(contable ? d.contable : d.real)),
        editarFaenas ? el('span', { class: 'texto-suave texto-chico' }, 'suma de las faenas')
          : contable && d.ajuste ? el('span', { class: 'texto-suave texto-chico' }, [`Corregido a mano${quien(d.ajuste) ? ` por ${quien(d.ajuste)}` : ''}`, d.ajuste.obs].filter(Boolean).join(': ')) : null);
    }
    return el('div', { class: 'rd-dia' },
      el('div', { class: 'rd-dia-cuerpo' },
        el('div', { class: 'rd-dia-cabeza' }, el('strong', {}, `${nombreDia(fecha)} ${fechaCorta(fecha)}`), el('span', { class: 'texto-suave' }, ` · ${horas(d.min)}`),
          d.vueltas ? el('span', { class: 'rd-vueltas' }, `${d.vueltas} vuelta${plural(d.vueltas)}`) : null,
          feriado ? el('span', { class: 'texto-suave texto-chico' }, ` · ${feriado}`) : null),
        faenas.length ? el('div', { class: 'rd-faenas' }, faenas) : null, flota, notaFijo,
        contable && d.ajDiaManda && d.faenas.length > 1 ? el('div', { class: 'rd-nota pct-medio' }, `Monto del día ajustado a ${dinero(d.contable)}${d.ajuste?.obs ? ` · ${d.ajuste.obs}` : ''}: no cuadra con la suma de las faenas.`) : null),
      derecha);
  });

  const editarItems = ctx.puede('remu', 'editar');
  const items = (f?.items ?? []).map((it) => {
    const neg = it.tipo === 'descuento';
    const tipo = el('span', { class: 'texto-suave texto-chico' }, neg ? 'Descuento' : 'Extra');
    if (!editarItems) {
      return el('div', { class: 'rd-item' }, el('div', { class: 'rd-item-txt' }, el('strong', { class: neg ? 'pct-mal' : 'pct-bien' }, `${neg ? '− ' : ''}${dinero(it.monto)}`), ' ', tipo,
        el('div', { class: 'texto-suave texto-chico' }, it.concepto, it.nota ? ` · ${it.nota}` : '')));
    }
    const concepto = el('input', { type: 'text', class: 'campo', value: it.concepto, 'aria-label': 'Concepto' });
    const monto = el('input', { type: 'number', min: '1', step: '1', class: 'campo campo-num', value: String(it.monto), 'aria-label': `Monto de ${it.concepto}` });
    const guardar = () => guardarItem(ctx, it, concepto.value, monto.value);
    concepto.addEventListener('change', guardar); monto.addEventListener('change', guardar);
    return el('div', { class: 'rd-item' },
      el('div', { class: 'rd-item-txt' }, el('span', { class: `chip ${neg ? 'chip-venc' : 'chip-ok'}` }, neg ? 'Descuento' : 'Extra'), concepto, it.nota ? el('span', { class: 'texto-suave texto-chico', title: 'Motivo' }, it.nota) : null),
      el('div', { class: 'remu-item-monto' }, neg ? el('span', { class: 'texto-suave' }, '−') : null, monto),
      ctx.puede('remu', 'eliminar') ? el('button', {
        type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${it.concepto}`, onclick: () => quitarItem(ctx, it),
      }, icono('basura', { tam: 16 })) : null);
  });
  // Agregar en la misma tarjeta (como InnovaGestión): tipo, monto y observación
  const puedeAgregar = ctx.puede('remu', 'crear') && (!mes || P);
  const formItem = puedeAgregar ? (() => {
    const tipo = el('select', { class: 'campo', 'aria-label': 'Tipo' }, el('option', { value: 'extra' }, 'Extra'), el('option', { value: 'descuento' }, 'Descuento'));
    const monto = el('input', { type: 'number', min: '1', step: '1', class: 'campo campo-num', placeholder: '0', 'aria-label': 'Monto ($)' });
    const obs = el('input', { type: 'text', class: 'campo', placeholder: 'Ej: anticipo, extra de producción, colación…', 'aria-label': 'Observación' });
    const agregar = boton('Agregar', { icono: 'mas', tipo: 'primario', onclick: async (ev) => {
      const b = ev.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      try { await insertarItem(ctx, personaId, mes ? { mes } : { semana: lunes }, tipo.value, obs.value, monto.value); } finally { b.disabled = false; }
    } });
    return el('div', { class: 'rd-item-form' },
      el('label', { class: 'campo-etiqueta' }, el('span', {}, 'Tipo'), tipo),
      el('label', { class: 'campo-etiqueta' }, el('span', {}, 'Monto ($)'), monto),
      el('label', { class: 'campo-etiqueta rd-item-obs' }, el('span', {}, 'Observación (por qué es este monto)'), obs),
      agregar);
  })() : null;

  // De dónde salen las vueltas: por día, del Registro de horas (con su faena) y de Vehículos (las que registró el chofer)
  const vueltasDia = (f?.detalle ?? []).filter((d) => d.vueltas).map((d) => el('div', { class: 'rd-vu-fila' },
    el('span', {}, el('strong', {}, `${nombreDia(d.fecha)} ${fechaCorta(d.fecha)}`), el('span', { class: 'texto-suave' }, ` · ${[...[...new Set(d.registros.filter((r) => r.vueltas).map((r) => `Registro de horas${r.faena ? ` (${r.faena})` : ''}`))],
      ...d.vueltasFlota.map((x) => `${x.cantidad} en Vehículos (${x.vehiculo})`)].join(' + ')}`)),
    el('strong', {}, String(d.vueltas))));

  // Por faena (en el mes): días, horas y monto de cada faena
  const porFaena = new Map();
  if (mes) for (const d of f?.detalle ?? []) for (const x of d.faenas ?? []) {
    const o = porFaena.get(x.faena) ?? { dias: new Set(), min: 0, monto: 0 };
    o.dias.add(d.fecha); o.min += x.min; o.monto += base.config.ajuste_contable ? x.contable : x.real; porFaena.set(x.faena, o);
  }
  const resumenFaenas = porFaena.size ? el('div', { class: 'ficha rd-tarjeta' }, el('h2', {}, 'Por faena'),
    [...porFaena].sort((a, b) => b[1].min - a[1].min).map(([fa, o]) => el('div', { class: 'rd-lin' },
      el('span', {}, el('strong', {}, fa || 'Sin faena'), el('span', { class: 'texto-suave texto-chico' }, ` · ${o.dias.size} día${o.dias.size > 1 ? 's' : ''} · ${horas(o.min)}`)),
      el('strong', {}, dinero(o.monto))))) : null;

  // Desglose (como InnovaGestión): en fijos, el trato completo si fuera spot y lo que cubre el sueldo
  const lin = (txt, valor, clase = '') => el('div', { class: `rd-lin ${clase}` }, el('span', {}, txt), el('strong', {}, valor));
  const completoTot = Math.round(((f?.totMin || 0) / 60) * vh);
  const desglose = [
    ...(esFijo && f ? [
      el('div', { class: 'rd-lin rd-lin-titulo' }, el('strong', { class: 'pct-bien' }, c?.art22 ? 'Contrato fijo · Artículo 22' : 'Contrato fijo · renta fija')),
      queSePaga ? el('p', { class: 'texto-suave texto-chico rd-lin-nota' }, queSePaga) : null,
      lin(`Trato completo (si fuera spot · ${horas(f.totMin)})`, el('span', { class: 'texto-suave' }, dinero(completoTot))),
      lin(c?.jornada_ini ? 'Cubierto por el sueldo (horas del turno)' : 'Descontado por jornada fija', el('span', { class: 'pct-mal' }, `− ${dinero(completoTot - f.base)}`)),
    ] : []),
    ...(mes ? [lin('Sueldo base', f?.sueldo ? dinero(f.sueldo) : '—')] : []),
    ...(P ? [el('div', { class: 'rd-lin' }, el('span', {}, 'Bono por autos'), el('strong', {}, !P.valorAuto ? 'Sin bono' : f?.sinBono ? 'Excluido este mes' : (f?.dias || f?.condicion?.art22) ? `${P.autos.length} × ${dinero(P.valorAuto)} = ${dinero(f.bonoAutos)}` : 'No trabajó este mes',
      P.valorAuto && ctx.puede('remu', 'editar') ? el('button', { type: 'button', class: 'boton-enlace', onclick: () => alternarBono(ctx, personaId, mes, f?.sinBono) }, f?.sinBono ? ' Incluir' : ' Excluir') : null))] : []),
    lin(`${esFijo ? 'Horas extra pagadas' : 'Horas'} (${horas(f?.pagoMin ?? 0)}${vh ? ` × ${dinero(vh)}` : ''})`, dinero(f?.base ?? 0)),
    contable && f?.hayAjuste && f.baseContable !== f.base ? lin('Corregido a mano (días o faenas)', dinero(f.baseContable - f.base)) : null,
    f?.vueltas ? lin(`${f.vueltas} vuelta${plural(f.vueltas)} × ${dinero(f.vv)}`, dinero(f.montoVueltas)) : null,
    vueltasDia.length ? el('div', { class: 'rd-vu' }, vueltasDia) : null,
    f?.extra ? lin('Extras', el('span', { class: 'pct-bien' }, dinero(f.extra))) : null,
    f?.descuento ? lin('Descuentos', el('span', { class: 'pct-mal' }, `− ${dinero(f.descuento)}`)) : null,
    contable ? lin('Total real (por horas)', dinero(mes ? f?.realMes ?? ((f?.real ?? 0) + (f?.sueldo ?? 0)) : f?.real ?? 0)) : null,
    lin(contable ? 'Total a pagar (contable)' : 'Total a pagar', el('span', { class: 'rd-total-valor' }, dinero(totalPago)), 'rd-lin-total'),
  ];

  const liquidacion = !mes && f ? boton('Liquidación PDF', { icono: 'descargar', title: 'Descargar la liquidación de la semana en PDF', onclick: async (ev) => {
    const b = ev.currentTarget; b.classList.add('cargando');
    try {
      const { liquidacionPdf } = await import('../liquidacion.js?v=c3310e4');
      await liquidacionPdf(ctx, { f, persona: v.personas, cargo: cargo?.nombre ?? v.cargo, lunes, domingo, contable });
    } catch (e) { avisar(`No se pudo generar el PDF: ${e.message}`, 'error'); } finally { b.classList.remove('cargando'); }
  } }) : null;

  return el('section', { class: 'listado remu-detalle' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {},
        el('h1', {}, `${nombreCompleto(v.personas)} · ${mes ? nombreMes(mes) : `Semana ${numSemana(lunes)}`}`),
        el('p', { class: 'texto-suave' }, condTexto)),
      el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande' }, dinero(totalPago)))),
    el('div', { class: 'rs-semana' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': mes ? 'Mes anterior' : 'Semana anterior', onclick: () => irSemana(-1) }, icono('volver')),
      el('div', { class: 'rs-semana-txt' }, el('span', {}, mes ? 'Mes' : `Semana ${numSemana(lunes)}`), el('strong', {}, mes ? nombreMes(mes) : `${fechaCorta(lunes)} – ${fechaCorta(domingo)}`)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': mes ? 'Mes siguiente' : 'Semana siguiente', onclick: () => irSemana(1) }, icono('derecha'))),
    !c ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Esta persona no tiene condiciones de pago: se usan los valores generales. Configúralas en "Condiciones de pago".') : null,
    sinTurno && c ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      c.jornada_horas
        ? `No tiene turno (hora de entrada y salida), solo ${Number(c.jornada_horas)} h por día. En días hábiles solo se paga lo que pase de ${Number(c.jornada_horas)} h en el día: las horas de la tarde o la noche después de su horario no se cuentan como extra. `
        : 'No tiene turno ni jornada: en días hábiles se pagan todas sus horas. ',
      ctx.hayVista?.('remu.condiciones') === false ? null : el('a', { href: ctx.ruta('remu.condiciones') }, 'Poner su turno en Condiciones de pago')) : null,
    antesDelTurno ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `Su turno rige desde el ${fechaCorta(c.turno_desde)}. Los días anteriores se calculan como antes${c.jornada_horas ? ` (${Number(c.jornada_horas)} h por día: solo se paga lo que pase de ${Number(c.jornada_horas)} h en el día)` : ' (todas sus horas se pagan)'}.`) : null,
    el('div', { class: 'ficha rd-tarjeta' },
      el('h2', {}, icono('calendario', { tam: 18 }), ' Días trabajados', contable && puedeEditar ? el('span', { class: 'texto-suave texto-chico rd-h2-nota' }, ' · editas el monto a pagar por día →') : null),
      filasDias.length ? filasDias : el('p', { class: 'texto-suave' }, mes ? 'Sin días registrados este mes.' : 'Sin días registrados esta semana.')),
    el('div', { class: 'ficha rd-tarjeta' },
      el('div', { class: 'rd-tarjeta-cabeza' }, el('h2', {}, icono('dinero', { tam: 18 }), ' Desglose'), liquidacion),
      desglose),
    resumenFaenas,
    el('div', { class: 'ficha rd-tarjeta' },
      el('h2', {}, P ? 'Montos, extras y descuentos del mes' : mes ? 'Montos, extras y descuentos de las semanas del mes' : 'Montos, extras y descuentos'),
      items.length ? items : el('p', { class: 'texto-suave' }, P || !mes ? `Sin montos adicionales ${mes ? 'este mes' : 'esta semana'}.` : 'Sin extras ni descuentos.'),
      formItem),
  );
}

// Campo de monto contable + motivo de un día (faena '') o de una faena; guarda al salir del campo
export function campoContable(ctx, personaId, fecha, faena, real, ajuste, quien = null) {
  const monto = el('input', { type: 'number', min: '0', step: '1', class: `campo campo-num${ajuste ? ' campo-ajustado' : ''}`, value: String(ajuste ? ajuste.monto : real),
    'aria-label': `Monto a pagar ${faena || 'del día'} ${fechaCorta(fecha)}`, title: `Calculado ${dinero(real)}` });
  const obs = el('input', { type: 'text', class: 'campo campo-motivo', value: ajuste?.obs ?? '', placeholder: ajuste ? 'motivo de la corrección' : 'motivo (si lo cambias)', 'aria-label': `Motivo ${faena || 'del día'} ${fechaCorta(fecha)}` });
  const guardar = () => guardarAjuste(ctx, personaId, fecha, faena, real, ajuste, monto.value, obs.value);
  monto.addEventListener('change', guardar); obs.addEventListener('change', guardar);
  const nota = ajuste && ajuste.monto !== real
    ? el('div', { class: 'texto-chico pct-medio remu-ajuste-nota' }, `Corregido a mano${quien ? ` por ${quien}` : ''}${ajuste.obs ? '' : ', sin motivo'}`) : null;
  return el('div', { class: 'remu-ajuste' }, monto, obs, nota);
}

// Guarda el monto contable de un día (faena '') o de una faena: igual al real y sin motivo = se quita el ajuste
export async function guardarAjuste(ctx, personaId, fecha, faena, real, ajuste, valorMonto, valorObs) {
  const monto = valorMonto === '' ? real : Math.round(Number(valorMonto));
  if (!Number.isFinite(monto) || monto < 0) { avisar('Monto inválido.', 'error'); return; }
  const obs = valorObs.trim() || null;
  let r;
  if (monto === real && !obs) {
    if (!ajuste) return;
    r = await ctx.api.from('remu_ajustes').delete().eq('id', ajuste.id).select('id');
  } else if (ajuste) {
    if (ajuste.monto === monto && (ajuste.obs ?? null) === obs) return;
    r = await ctx.api.from('remu_ajustes').update({ monto, obs }).eq('id', ajuste.id).select('id');
  } else {
    r = await ctx.api.from('remu_ajustes').insert({ empresa_id: ctx.empresa.id, persona_id: personaId, fecha, faena, monto, obs }).select('id');
  }
  if (r.error) { avisar(r.error.message, 'error'); return; }
  if (!r.data?.length) { avisar('No tienes permiso para ajustar.', 'error'); return; }
  avisar(monto === real && !obs ? 'Ajuste quitado: vuelve al monto real.' : 'Monto contable guardado.');
  ctx.refrescar();
}

async function guardarItem(ctx, it, concepto, valorMonto) {
  const monto = Math.round(Number(valorMonto));
  if (!concepto.trim()) { avisar('Escribe el concepto.', 'error'); return; }
  if (!(monto > 0)) { avisar('El monto debe ser mayor que cero.', 'error'); return; }
  if (concepto.trim() === it.concepto && monto === it.monto) return;
  const { data, error } = await ctx.api.from('remu_items').update({ concepto: concepto.trim(), monto }).eq('id', it.id).select('id');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso.', 'error'); return; }
  avisar('Guardado.');
  ctx.refrescar();
}

async function alternarBono(ctx, personaId, mes, excluido) {
  const r = excluido
    ? await ctx.api.from('remu_sin_bono').delete().eq('empresa_id', ctx.empresa.id).eq('persona_id', personaId).eq('mes', mes)
    : await ctx.api.from('remu_sin_bono').insert({ empresa_id: ctx.empresa.id, persona_id: personaId, mes });
  if (r.error) { avisar(r.error.message, 'error'); return; }
  avisar(excluido ? 'Vuelve a recibir el bono por autos.' : 'Excluido del bono por autos este mes.');
  ctx.refrescar();
}

// Agrega un extra o descuento desde el formulario de la tarjeta (como InnovaGestión)
async function insertarItem(ctx, personaId, periodo, tipo, concepto, valorMonto) {
  const monto = Math.round(Number(valorMonto));
  if (!(monto > 0)) { avisar('Pon el monto.', 'error'); return; }
  if (!concepto.trim()) { avisar('Escribe la observación (por qué es este monto).', 'error'); return; }
  const { error } = await ctx.api.from('remu_items').insert({ empresa_id: ctx.empresa.id, persona_id: personaId, ...periodo, tipo, concepto: concepto.trim(), monto });
  if (error) { avisar(error.message, 'error'); return; }
  avisar('Agregado.');
  ctx.refrescar();
}

async function quitarItem(ctx, it) {
  const { data, error } = await ctx.api.from('remu_items').delete().eq('id', it.id).select('id');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso.', 'error'); return; }
  avisar('Eliminado.');
  ctx.refrescar();
}
