// Detalle del pago de una persona en una semana o un mes: día a día, ajustes contables, extras y descuentos.
// Como en InnovaGestión: el monto contable y su motivo se escriben directo en cada día (o en cada faena, si el día
// tiene varias y la suma cuadra) y se guardan al salir del campo; extras y descuentos se editan en la lista.
// El ajuste contable (real vs. contable) es una opción de la empresa (Parámetros); apagada, se paga lo calculado.
// Rutas: #/remu.detalle?p=<persona_id>&s=<lunes> (semanal) · #/remu.detalle?p=<persona_id>&m=<aaaa-mm> (mensual)
import { el } from '../../../core/ui/dom.js?v=245d3ab';
import { icono } from '../../../core/ui/iconos.js?v=245d3ab';
import { boton } from '../../../core/ui/tabla.js?v=245d3ab';
import { abrirFormulario } from '../../../core/ui/modal.js?v=245d3ab';
import { avisar } from '../../../core/ui/aviso.js?v=245d3ab';
import { dinero, horas, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, hhmm, hoyISO, rangoMes, moverMes, nombreMes } from '../../../core/ui/formato.js?v=245d3ab';
import { cargarBase, calcularRango, pagoMensual, nombreCompleto } from '../datos.js?v=245d3ab';
import { sueldoDelMes, semanaEnMes } from '../calculo.js?v=245d3ab';

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
  const volver = mes ? el('a', { class: 'volver', href: ctx.ruta(aPagoMes ? 'remu.pagomes' : 'remu.mes') }, icono('volver', { tam: 16 }), aPagoMes ? 'Pago mensual' : 'Resumen mensual')
    : el('a', { class: 'volver', href: ctx.ruta('remu.semana', { s: lunes }) }, icono('volver', { tam: 16 }), 'Pago semanal');
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
  const pagables = esFijo ? 'Horas extra' : 'Pagables';
  const cargo = c?.cargo_id ? base.cargos.get(c.cargo_id) : null;

  const irSemana = (n) => { location.hash = mes ? ctx.ruta('remu.detalle', { p: personaId, m: moverMes(mes, n) }) : ctx.ruta('remu.detalle', { p: personaId, s: sumarDias(lunes, n * 7) }); };
  const condTexto = [
    (c?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora')) === 'fijo'
      ? `Fijo${c?.jornada_ini ? ` · turno ${hhmm(c.jornada_ini)}–${hhmm(c.jornada_fin)}` : c?.jornada_horas ? ` · ${Number(c.jornada_horas)} h/día` : ' · sin jornada (todas sus horas se pagan)'}`
      : 'Por hora (spot)',
    cargo ? cargo.nombre : null,
    f ? `valor hora ${dinero(f.vh)}` : null,
    c?.valor_vuelta != null ? `vuelta ${dinero(c.valor_vuelta)}` : null,
  ].filter(Boolean).join(' · ');

  // Semana: los 7 días. Mes: solo los días con registros o feriados.
  const fechas = mes ? (() => { const { desde, hasta } = rangoMes(mes); const out = []; for (let x = desde; x <= hasta; x = sumarDias(x, 1)) if (porFecha.has(x) || R.feriados.has(x)) out.push(x); return out; })()
    : [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(lunes, i));
  const campoAjuste = (d, faena, real, ajuste) => campoContable(ctx, personaId, d.fecha, faena, real, ajuste);
  const plural = (n) => (n > 1 ? 's' : '');
  const filasDias = fechas.map((fecha) => {
    const d = porFecha.get(fecha);
    const feriado = R.feriados.get(fecha);
    const varias = d && d.faenas.length > 1;
    const editarFaenas = contable && puedeEditar && varias && d.porFaena;
    const registros = d ? (varias
      ? d.faenas.map((x) => el('div', { class: 'remu-faena' },
        el('div', {}, el('strong', { class: 'texto-chico' }, x.faena || 'Sin faena'),
          el('div', { class: 'texto-suave texto-chico' }, d.registros.filter((r) => String(r.faena ?? '').trim() === x.faena)
            .map((r) => `${hhmm(r.entrada)}–${hhmm(r.salida)}${r.vueltas ? ` · ${r.vueltas} vuelta${plural(r.vueltas)}` : ''}`).join(', '), ` · ${horas(x.min)}`)),
        editarFaenas ? el('div', { class: 'remu-faena-monto' }, el('span', { class: 'texto-suave texto-chico' }, `real ${dinero(x.real)}`), campoAjuste(d, x.faena, x.real, x.ajuste))
          : el('span', { class: 'texto-chico' }, dinero(contable ? x.contable : x.real))))
      : [...d.registros.map((r) => el('div', { class: 'texto-chico' }, `${hhmm(r.entrada)}–${hhmm(r.salida)}${r.faena ? ` · ${r.faena}` : ''}${r.vueltas ? ` · ${r.vueltas} vuelta${plural(r.vueltas)}` : ''}`)),
        ...d.vueltasFlota.map((x) => el('div', { class: 'texto-chico texto-suave' }, `${x.cantidad} vuelta${plural(x.cantidad)} en ${x.vehiculo} (chofer)`))])
      : el('span', { class: 'texto-suave' }, '—');
    let celdaContable = '';
    if (d && contable) {
      celdaContable = puedeEditar && !editarFaenas ? campoAjuste(d, '', d.real, d.ajuste)
        : el('div', {}, el('strong', { class: d.contable !== d.real ? 'pct-medio' : '' }, dinero(d.contable)),
          editarFaenas ? el('div', { class: 'texto-suave texto-chico' }, 'suma de las faenas') : d.ajuste?.obs ? el('div', { class: 'texto-suave texto-chico' }, d.ajuste.obs) : null);
      if (d.ajDiaManda && varias) celdaContable = el('div', {}, celdaContable, el('div', { class: 'texto-chico pct-medio' }, 'ajuste del día (no cuadra con las faenas)'));
    }
    return el('tr', { class: d?.especial ? 'fila-especial' : '' },
      el('td', {}, el('strong', {}, `${nombreDia(fecha)} ${fechaCorta(fecha)}`),
        feriado ? el('div', { class: 'texto-suave texto-chico' }, feriado) : null),
      el('td', {}, registros),
      el('td', {}, d ? horas(d.min) : ''),
      el('td', {}, d ? horas(d.pagoMin) : ''),
      el('td', { class: 'num' }, d ? el('span', { class: contable && d.contable !== d.real ? 'texto-suave' : '' }, dinero(d.real)) : ''),
      contable ? el('td', { class: 'num' }, celdaContable) : null);
  });

  const editarItems = ctx.puede('remu', 'editar');
  const items = (f?.items ?? []).map((it) => {
    const tipo = el('span', { class: `chip ${it.tipo === 'extra' ? 'chip-ok' : 'chip-venc'}` }, it.tipo === 'extra' ? 'Extra' : 'Descuento');
    if (!editarItems) {
      return el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, tipo, el('strong', {}, it.concepto)),
        el('strong', {}, `${it.tipo === 'descuento' ? '−' : ''}${dinero(it.monto)}`));
    }
    const concepto = el('input', { type: 'text', class: 'campo', value: it.concepto, 'aria-label': 'Concepto' });
    const monto = el('input', { type: 'number', min: '1', step: '1', class: 'campo campo-num', value: String(it.monto), 'aria-label': `Monto de ${it.concepto}` });
    const guardar = () => guardarItem(ctx, it, concepto.value, monto.value);
    concepto.addEventListener('change', guardar); monto.addEventListener('change', guardar);
    return el('div', { class: 'doc-fila remu-item' },
      el('div', { class: 'doc-nombre' }, tipo, concepto),
      el('div', { class: 'remu-item-monto' }, it.tipo === 'descuento' ? el('span', { class: 'texto-suave' }, '−') : null, monto),
      ctx.puede('remu', 'eliminar') ? el('div', { class: 'doc-acciones' }, el('button', {
        type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${it.concepto}`, onclick: () => quitarItem(ctx, it),
      }, icono('basura', { tam: 16 }))) : null);
  });

  // De dónde salen las vueltas: por día, del Registro de horas (con su faena) y de Vehículos (las que registró el chofer)
  const vueltasDia = (f?.detalle ?? []).filter((d) => d.vueltas).map((d) => el('div', { class: 'texto-chico' },
    el('strong', {}, `${nombreDia(d.fecha)} ${fechaCorta(d.fecha)}`), ` · ${d.vueltas} vuelta${plural(d.vueltas)} `,
    el('span', { class: 'texto-suave' }, `(${[...[...new Set(d.registros.filter((r) => r.vueltas).map((r) => `Registro de horas: ${r.faena || 'sin faena'}`))],
      ...d.vueltasFlota.map((x) => `Vehículos: ${x.cantidad} en ${x.vehiculo}`)].join(' · ')})`)));

  // Por faena (en el mes): días, horas y monto de cada faena
  const porFaena = new Map();
  if (mes) for (const d of f?.detalle ?? []) for (const x of d.faenas ?? []) {
    const o = porFaena.get(x.faena) ?? { dias: new Set(), min: 0, monto: 0 };
    o.dias.add(d.fecha); o.min += x.min; o.monto += base.config.ajuste_contable ? x.contable : x.real; porFaena.set(x.faena, o);
  }
  const resumenFaenas = porFaena.size ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Por faena'),
    [...porFaena].sort((a, b) => b[1].min - a[1].min).map(([fa, o]) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, fa || 'Sin faena')),
      el('span', { class: 'texto-suave texto-chico' }, `${o.dias.size} día${o.dias.size > 1 ? 's' : ''} · ${horas(o.min)}`),
      el('strong', {}, dinero(o.monto))))) : null;

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {},
        el('h1', {}, nombreCompleto(v.personas)),
        el('p', { class: 'texto-suave' }, condTexto)),
      el('div', { class: 'listado-acciones' },
        !mes && f ? boton('Liquidación PDF', { icono: 'descargar', title: 'Descargar la liquidación de la semana en PDF', onclick: async (ev) => {
          const b = ev.currentTarget; b.classList.add('cargando');
          try {
            const { liquidacionPdf } = await import('../liquidacion.js?v=245d3ab');
            await liquidacionPdf(ctx, { f, persona: v.personas, cargo: cargo?.nombre ?? v.cargo, lunes, domingo, contable });
          } catch (e) { avisar(`No se pudo generar el PDF: ${e.message}`, 'error'); } finally { b.classList.remove('cargando'); }
        } }) : null,
        el('span', { class: 'total-grande' }, dinero(totalPago)))),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': mes ? 'Mes anterior' : 'Semana anterior', onclick: () => irSemana(-1) }, icono('volver')),
      el('strong', {}, mes ? nombreMes(mes) : `Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} – ${fechaCorta(domingo)}`),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': mes ? 'Mes siguiente' : 'Semana siguiente', onclick: () => irSemana(1) }, icono('derecha'))),
    !c ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Esta persona no tiene condiciones de pago: se usan los valores generales. Configúralas en "Condiciones de pago".') : null,
    el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, (contable ? ['Día', 'Registros', 'Horas', pagables, 'Real', 'Contable'] : ['Día', 'Registros', 'Horas', pagables, 'Monto']).map((t, i) => el('th', { class: i >= 4 ? 'num' : '' }, t)))),
        el('tbody', {}, filasDias.length ? filasDias : el('tr', {}, el('td', { colspan: contable ? 6 : 5, class: 'tabla-vacia' }, 'Sin registros.'))))),
    el('div', { class: 'ficha resumen-pago' },
      el('h2', {}, 'Resumen'),
      el('dl', { class: 'datos-lista' },
        ...(mes ? [el('dt', {}, 'Sueldo base'), el('dd', {}, f?.sueldo ? dinero(f.sueldo) : '—'),
          ...(P ? [el('dt', {}, 'Bono por autos')] : []), ...(P ? [el('dd', {}, !P.valorAuto ? 'Sin bono' : f?.sinBono ? 'Excluido este mes' : f?.dias ? `${P.autos.length} × ${dinero(P.valorAuto)} = ${dinero(f.bonoAutos)}` : 'No trabajó este mes',
            P.valorAuto && ctx.puede('remu', 'editar') ? el('button', { type: 'button', class: 'boton-enlace', onclick: () => alternarBono(ctx, personaId, mes, f?.sinBono) }, f?.sinBono ? ' Incluir' : ' Excluir') : null)] : [])] : []),
        el('dt', {}, `${esFijo ? 'Horas extra' : 'Base'}${contable ? ' (contable)' : ''}`), el('dd', {}, esFijo && f?.pagoMin ? `${horas(f.pagoMin)} × ${dinero(f.vh)} = ` : '', dinero(f?.baseContable ?? 0), contable && f?.hayAjuste ? el('span', { class: 'texto-suave' }, ` · real ${dinero(f.base)}`) : null),
        el('dt', {}, esFijo ? 'Otros extras' : 'Extras'), el('dd', {}, dinero(f?.extra ?? 0)),
        el('dt', {}, 'Vueltas'), el('dd', {}, f?.vueltas ? `${f.vueltas} × ${dinero(f.vv)} = ${dinero(f.montoVueltas)}` : '—', vueltasDia.length ? el('div', { class: 'remu-vueltas' }, vueltasDia) : null),
        el('dt', {}, 'Descuentos'), el('dd', {}, f?.descuento ? `−${dinero(f.descuento)}` : dinero(0)),
        el('dt', {}, el('strong', {}, 'Total')), el('dd', {}, el('strong', {}, dinero(totalPago))))),
    resumenFaenas,
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, P ? 'Extras y descuentos del mes' : mes ? 'Extras y descuentos de las semanas del mes' : 'Extras y descuentos de la semana'),
        ctx.puede('remu', 'crear') && (!mes || P) ? boton('Agregar', { icono: 'mas', onclick: () => agregarItem(ctx, personaId, mes ? { mes } : { semana: lunes }) }) : null),
      items.length ? items : el('p', { class: 'texto-suave' }, 'Sin extras ni descuentos.')),
  );
}

// Campo de monto contable + motivo de un día (faena '') o de una faena; guarda al salir del campo
export function campoContable(ctx, personaId, fecha, faena, real, ajuste) {
  const monto = el('input', { type: 'number', min: '0', step: '1', class: `campo campo-num${ajuste ? ' campo-ajustado' : ''}`, value: String(ajuste ? ajuste.monto : real),
    'aria-label': `Monto contable ${faena || 'del día'} ${fechaCorta(fecha)}`, title: `Real ${dinero(real)}` });
  const obs = el('input', { type: 'text', class: 'campo campo-motivo', value: ajuste?.obs ?? '', placeholder: 'motivo (si ajustas)', 'aria-label': `Motivo ${faena || 'del día'} ${fechaCorta(fecha)}` });
  const guardar = () => guardarAjuste(ctx, personaId, fecha, faena, real, ajuste, monto.value, obs.value);
  monto.addEventListener('change', guardar); obs.addEventListener('change', guardar);
  return el('div', { class: 'remu-ajuste' }, monto, obs);
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

function agregarItem(ctx, personaId, periodo) {
  abrirFormulario({
    titulo: 'Agregar extra o descuento',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: [['extra', 'Extra (bono, viático…)'], ['descuento', 'Descuento (anticipo, préstamo…)']] },
      { id: 'concepto', etiqueta: 'Concepto', requerido: true },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const monto = Number(v.monto);
      if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.');
      const { error } = await ctx.api.from('remu_items').insert({ empresa_id: ctx.empresa.id, persona_id: personaId, ...periodo, tipo: v.tipo, concepto: v.concepto.trim(), monto });
      if (error) throw new Error(error.message);
      avisar('Agregado.');
      ctx.refrescar();
    },
  });
}

async function quitarItem(ctx, it) {
  const { data, error } = await ctx.api.from('remu_items').delete().eq('id', it.id).select('id');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso.', 'error'); return; }
  avisar('Eliminado.');
  ctx.refrescar();
}
