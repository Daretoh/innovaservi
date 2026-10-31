// Planificar una faena en un día: horario, dotación del día, cuadrilla, vehículos, notas,
// enviar / reabrir y generar las horas en Asistencia.
// Ruta: #/ope.plan?f=<faena_id>&d=<fecha>
import { el } from '../../../core/ui/dom.js?v=66a811d';
import { icono } from '../../../core/ui/iconos.js?v=66a811d';
import { boton } from '../../../core/ui/tabla.js?v=66a811d';
import { abrirFormulario } from '../../../core/ui/modal.js?v=66a811d';
import { avisar } from '../../../core/ui/aviso.js?v=66a811d';
import { hhmm, nombreDia, fechaLarga, hoyISO, sumarDias } from '../../../core/ui/formato.js?v=66a811d';
import { seccionPreparacion } from './preparacion.js?v=66a811d';
import { cargarBase, cargarSemana, etiquetaFaena, horarioDe, dotacionDe, dotTotal, dotTexto, ocupacion, ROLES, nombreRol, nombreCompleto, partesDeRango, estadoParte, pideInformeFaena } from '../datos.js?v=66a811d';

export default async function vista(ctx) {
  const { f: faenaId, d: fecha } = ctx.params;
  const [base, semana, partes, flota] = await Promise.all([cargarBase(ctx), cargarSemana(ctx, fecha, fecha), partesDeRango(ctx, fecha, fecha), cargarFlotaOpe(ctx)]);
  const f = semana.faenas.find((x) => x.id === faenaId);
  const volver = el('a', { class: 'volver', href: ctx.ruta('ope.planificacion') }, icono('volver', { tam: 16 }), 'Planificación semanal');
  if (!f) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Faena no encontrada para ese día'));

  const p = semana.planDe(f, fecha);
  const enviada = p?.estado === 'enviada';
  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear') && !enviada;
  const e = etiquetaFaena(f, base);
  const h = horarioDe(f, p);
  const dot = dotacionDe(f, p);
  const asignados = p?.ope_plan_personas ?? [];
  const ocup = ocupacion(semana, fecha);

  // Crea la planificación del día la primera vez que se cambia algo
  const asegurarPlan = async () => {
    if (p) return p.id;
    const { data, error } = await ctx.api.from('ope_plan').insert({
      empresa_id: ctx.empresa.id, faena_id: f.id, fecha, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
  };
  const accion = (fn, ok) => async (...a) => {
    try { await fn(...a); if (ok) avisar(ok); ctx.refrescar(); } catch (err) { avisar(err.message, 'error'); }
  };

  // ---- Cuadrilla
  const conteo = Object.fromEntries(ROLES.map(([k]) => [k, asignados.filter((x) => x.rol === k).length]));
  const filasCuadrilla = asignados.map((x) => {
    const v = base.personas.get(x.persona_id);
    const otras = (ocup.get(x.persona_id) ?? []).filter((o) => o.id !== f.id);
    const inic = v ? `${v.personas.nombres?.[0] ?? ''}${v.personas.apellido_paterno?.[0] ?? ''}`.toUpperCase() : '?';
    return el('div', { class: 'doc-fila' },
      el('span', { class: `mini-avatar rol-${x.rol}` }, inic),
      el('div', { class: 'doc-nombre' }, el('strong', {}, v ? nombreCompleto(v.personas) : 'Persona'),
        el('span', { class: 'etiqueta' }, nombreRol[x.rol]),
        otras.length ? el('span', { class: 'chip chip-venc', title: otras.map((o) => o.titulo).join(', ') }, `También en: ${otras.map((o) => o.titulo).join(', ')}`) : null),
      editable ? el('div', { class: 'doc-acciones' }, el('button', {
        type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar a ${v ? nombreCompleto(v.personas) : 'persona'}`,
        onclick: accion(async () => {
          const { error } = await ctx.api.from('ope_plan_personas').delete().eq('plan_id', p.id).eq('persona_id', x.persona_id);
          if (error) throw new Error(error.message);
        }, 'Persona quitada.'),
      }, icono('basura', { tam: 16 }))) : null);
  });

  const yaAsignados = new Set(asignados.map((x) => x.persona_id));
  const candidatos = base.activos.filter((v) => !yaAsignados.has(v.persona_id));
  // Postulantes en proceso (módulo Postulantes): como "en espera" de InnovaGestión; al asignarlos se contratan
  const postulantes = editable && ctx.puede('postulantes', 'ver') && ctx.puede('postulantes', 'editar') && ctx.puede('personas', 'crear')
    ? ((await ctx.api.from('sel_postulantes').select('id, nombres, apellido_paterno, apellido_materno, rut, cargo').eq('empresa_id', ctx.empresa.id).eq('estado', 'activo').is('deleted_at', null).order('nombres')).data ?? [])
    : [];
  const selector = el('select', { class: 'campo', 'aria-label': 'Persona para agregar' },
    el('option', { value: '' }, 'Agregar persona…'),
    el('optgroup', { label: 'Trabajadores' }, candidatos.map((v) => {
      const otras = ocup.get(v.persona_id) ?? [];
      return el('option', { value: v.persona_id }, `${nombreCompleto(v.personas)} · ${nombreRol[v.rol]}${otras.length ? ` · ocupado en ${otras.map((o) => o.titulo).join(', ')}` : ' · libre'}`);
    })),
    postulantes.length ? el('optgroup', { label: 'Postulantes (se contratan al asignarlos)' }, postulantes.map((x) => el('option', { value: `post:${x.id}` },
      `${[x.nombres, x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' ')}${x.rut ? '' : ' · sin RUT'}`))) : null);
  const asignarTrabajador = accion(async (v) => {
    const planId = await asegurarPlan();
    const { error } = await ctx.api.from('ope_plan_personas').insert({ plan_id: planId, empresa_id: ctx.empresa.id, persona_id: v.persona_id, rol: v.rol });
    if (error) throw new Error(error.message);
  }, 'Persona asignada.');
  selector.addEventListener('change', () => {
    if (selector.value.startsWith('post:')) {
      try { contratarYAsignar(ctx, postulantes.find((x) => `post:${x.id}` === selector.value), f, fecha, asegurarPlan); } catch (err) { avisar(err.message, 'error'); }
      selector.value = '';
      return;
    }
    const v = base.activos.find((x) => x.persona_id === selector.value);
    if (v) asignarTrabajador(v);
  });

  // ---- Vehículos
  const filasVeh = (p?.ope_plan_vehiculos ?? []).map((veh) => {
    const ch = veh.chofer_id ? base.personas.get(veh.chofer_id) : null;
    const fv = veh.vehiculo_id ? flota?.de.get(veh.vehiculo_id) : null;
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' },
        fv ? el('a', { href: ctx.ruta('flota.vehiculo', { id: fv.id }) }, el('strong', {}, veh.vehiculo)) : el('strong', {}, veh.vehiculo),
        ch ? el('span', { class: 'texto-suave' }, `Chofer: ${nombreCompleto(ch.personas)}`) : null,
        fv ? flota.avisos(fv).map((t) => el('span', { class: 'chip chip-venc' }, t)) : null),
      editable ? el('div', { class: 'doc-acciones' }, el('button', {
        type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${veh.vehiculo}`,
        onclick: accion(async () => { const { error } = await ctx.api.from('ope_plan_vehiculos').delete().eq('id', veh.id); if (error) throw new Error(error.message); }, 'Vehículo quitado.'),
      }, icono('basura', { tam: 16 }))) : null);
  });

  // ---- Horario y notas (se guardan al salir del campo)
  const ini = el('input', { type: 'time', class: 'campo', value: h.ini ? hhmm(h.ini) : '', disabled: !editable, 'aria-label': 'Hora de inicio' });
  const fin = el('input', { type: 'time', class: 'campo', value: h.fin ? hhmm(h.fin) : '', disabled: !editable, 'aria-label': 'Hora de término' });
  const notas = Object.assign(el('textarea', { class: 'campo', rows: 3, disabled: !editable, 'aria-label': 'Notas' }), { value: p?.notas ?? '' });
  const guardarCampos = accion(async () => {
    const planId = await asegurarPlan();
    const { error } = await ctx.api.from('ope_plan').update({ hora_inicio: ini.value || null, hora_fin: fin.value || null, notas: notas.value.trim() || null }).eq('id', planId);
    if (error) throw new Error(error.message);
  }, 'Guardado.');
  for (const c of [ini, fin]) c.addEventListener('change', guardarCampos);
  const enCuadrilla = asignados.map((x) => base.personas.get(x.persona_id)).filter(Boolean);
  const otros = base.activos.filter((v) => !yaAsignados.has(v.persona_id));
  const preparador = el('select', { class: 'campo', disabled: !editable, 'aria-label': 'Preparador' },
    el('option', { value: '' }, 'Sin preparador'),
    enCuadrilla.length ? el('optgroup', { label: 'De la cuadrilla' }, enCuadrilla.map((v) => el('option', { value: v.persona_id, selected: v.persona_id === p?.preparador_id }, nombreCompleto(v.personas)))) : null,
    el('optgroup', { label: 'Otras personas' }, otros.map((v) => el('option', { value: v.persona_id, selected: v.persona_id === p?.preparador_id }, nombreCompleto(v.personas)))));
  preparador.addEventListener('change', accion(async () => {
    const planId = await asegurarPlan();
    const { error } = await ctx.api.from('ope_plan').update({ preparador_id: preparador.value || null }).eq('id', planId);
    if (error) throw new Error(error.message);
  }, 'Preparador guardado.'));
  notas.addEventListener('change', guardarCampos);

  // ---- Acciones de estado
  const acciones = [];
  if (!enviada && ctx.puede('ope', 'editar') && asignados.length) {
    acciones.push(boton('Enviar planificación', { icono: 'check', tipo: 'primario', onclick: accion(async () => {
      const { error } = await ctx.api.from('ope_plan').update({ estado: 'enviada', enviada_at: new Date().toISOString(), enviada_por: ctx.usuario.id }).eq('id', p.id);
      if (error) throw new Error(error.message);
    }, 'Planificación enviada.') }));
  }
  if (enviada && ctx.puede('ope', 'editar')) {
    acciones.push(boton('Reabrir', { icono: 'editar', onclick: accion(async () => {
      const { error } = await ctx.api.from('ope_plan').update({ estado: 'borrador' }).eq('id', p.id);
      if (error) throw new Error(error.message);
    }, 'Planificación reabierta.') }));
  }
  if (enviada && ctx.puede('asistencia', 'crear')) {
    acciones.push(p.horas_generadas_at
      ? el('span', { class: 'chip chip-ok' }, icono('check', { tam: 14 }), `Horas generadas el ${new Date(p.horas_generadas_at).toLocaleDateString('es-CL')}`)
      : boton('Generar horas en Asistencia', { icono: 'reloj', onclick: () => generarHoras(ctx, f, p, e, base) }));
  }

  // Días de la misma faena (si dura más de un día)
  // Días a elección: solo esos; si no, todo el rango
  const diasFaena = f.dias?.length ? [...f.dias].sort() : (() => { const l = []; for (let d = f.fecha_inicio; d <= f.fecha_fin; d = sumarDias(d, 1)) l.push(d); return l; })();
  const iDia = diasFaena.indexOf(fecha);
  const irDia = (n) => { const d = diasFaena[iDia + n]; return iDia >= 0 && d ? ctx.ruta('ope.plan', { f: f.id, d }) : null; };
  const navDia = diasFaena.length > 1 ? el('div', { class: 'nav-periodo faena-dias' },
    irDia(-1) ? el('a', { class: 'boton-icono', href: irDia(-1), 'aria-label': 'Día anterior de la faena' }, icono('volver')) : el('span', { class: 'boton-icono' }),
    el('span', { class: 'texto-chico texto-suave' }, `Día ${iDia + 1} de ${diasFaena.length}${f.dias?.length ? ' (días a elección)' : ''}`),
    irDia(1) ? el('a', { class: 'boton-icono', href: irDia(1), 'aria-label': 'Día siguiente de la faena' }, icono('derecha')) : el('span', { class: 'boton-icono' })) : null;
  const nec = dotTotal(dot);
  const barra = el('div', { class: 'faena-dotacion', title: `${asignados.length} de ${nec || '?'} asignados` },
    el('i', { class: asignados.length >= nec && nec ? 'completa' : '', style: `width:${nec ? Math.min(100, Math.round((asignados.length / nec) * 100)) : 0}%` }));
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera faena-cabecera', style: `--c:${e.color}` },
      el('div', {},
        el('span', { class: 'faena-fecha' }, `${nombreDia(fecha)} ${fechaLarga(fecha)}${fecha === hoyISO() ? ' · hoy' : ''}`),
        el('h1', {}, f.titulo),
        el('p', { class: 'texto-suave' }, el('span', { class: 'punto', style: `background:${e.color}` }), ` ${e.texto}`), navDia),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${enviada ? 'chip-ok' : 'chip-pend'}` }, enviada ? 'Enviada' : 'Borrador'), acciones)),
    enviada ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Planificación enviada: está bloqueada. Para cambiarla, reábrela.') : null,
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' },
          el('h2', {}, `Cuadrilla (${asignados.length}/${dotTotal(dot) || '?'})`),
          editable ? boton('Ajustar dotación del día', { onclick: () => ajustarDotacion(ctx, f, p, asegurarPlan) }) : null),
        barra,
        el('p', { class: 'texto-suave' }, `Necesarios: ${dotTexto(dot)}${p?.dotacion ? ' (ajustado para este día)' : ''}. Asignados: `,
          ROLES.map(([k, s]) => `${conteo[k]} ${s.toLowerCase()}${conteo[k] === 1 ? '' : 's'}`).join(' · ')),
        filasCuadrilla.length ? filasCuadrilla : el('p', { class: 'texto-suave' }, 'Nadie asignado todavía.'),
        editable ? selector : null),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Horario del día'),
        el('div', { class: 'rejilla-campos' },
          el('div', { class: 'form-fila' }, el('label', {}, 'Inicio'), ini),
          el('div', { class: 'form-fila' }, el('label', {}, 'Término'), fin)),
        el('div', { class: 'form-fila' }, el('label', {}, 'Preparador (prepara la carga)'), preparador),
        el('h2', {}, 'Vehículos'),
        filasVeh.length ? filasVeh : el('p', { class: 'texto-suave' }, 'Sin vehículos.'),
        editable ? boton('Agregar vehículo', { icono: 'mas', onclick: () => agregarVehiculo(ctx, base, asignados, asegurarPlan, flota) }) : null,
        el('h2', {}, 'Notas'), notas),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Lo que pide la faena'),
        f.tareas?.length ? el('ol', {}, f.tareas.map((t) => { const ok = (f.tareas_check ?? []).some((x) => x.ok && String(x.t).trim().toLowerCase() === t.trim().toLowerCase()); return el('li', { class: ok ? 'tarea-ok' : '' }, t); })) : el('p', { class: 'texto-suave' }, 'Sin tareas.'),
        await observaciones(ctx, f),
        el('p', { class: 'texto-suave texto-chico' }, diasFaena.length > 1 ? (f.dias?.length ? `Faena de ${diasFaena.length} días a elección (${diasFaena.map((d) => fechaLarga(d)).join(', ')}): cada día se planifica por separado.` : `Faena del ${fechaLarga(f.fecha_inicio)} al ${fechaLarga(f.fecha_fin)}: cada día se planifica por separado.`) : ''),
        partes ? seccionParte(ctx, f, fecha, base, estadoParte(partes, f, fecha, base, hoyISO()), partes) : null)),
    await seccionPreparacion(ctx, { f, p, base, asegurarPlan }),
  );
}

// Parte de trabajo de esta faena-día (módulo Reportes): estado y acceso, o crearlo
function seccionParte(ctx, f, fecha, base, rep, partes) {
  const parte = partes.get(`${f.id}|${fecha}`);
  const crear = async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try {
      const { data: cfg } = await ctx.api.from('rep_config').select('responsable').eq('empresa_id', ctx.empresa.id).maybeSingle();
      const sitio = base.sitios.find((s) => s.id === f.sitio_id);
      const { data: nuevo, error } = await ctx.api.from('rep_partes').insert({
        empresa_id: ctx.empresa.id, tercero_id: f.tercero_id, sitio_id: f.sitio_id, lugar: sitio?.nombre ?? null, fecha, responsable: cfg?.responsable ?? null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('rep_parte_faenas').insert({ parte_id: nuevo.id, empresa_id: ctx.empresa.id, faena_id: f.id, fecha });
      if (e2) { await ctx.api.from('rep_partes').delete().eq('id', nuevo.id); throw new Error(e2.code === '23505' ? 'Esta faena-día ya tiene parte.' : e2.message); }
      location.hash = ctx.ruta('reportes.parte', { id: nuevo.id });
    } catch (err) { avisar(err.message, 'error'); b.disabled = false; }
  };
  // Esta faena lleva informe (por omisión, lo del cliente). Si lleva y no tiene parte, se avisa en Partes de trabajo.
  const porCliente = !!base.clientes.find((c) => c.id === f.tercero_id)?.pideInforme;
  const lleva = el('input', { type: 'checkbox', class: 'interruptor', checked: pideInformeFaena(f, base), disabled: !ctx.puede('ope', 'editar') });
  lleva.addEventListener('change', async () => {
    const valor = lleva.checked === porCliente ? null : lleva.checked;   // igual que el cliente: vuelve a seguirlo
    const { data, error } = await ctx.api.from('ope_faenas').update({ pide_informe: valor }).eq('id', f.id).select('id');
    if (error || !data?.length) { lleva.checked = !lleva.checked; avisar(error?.message ?? 'Sin permiso para cambiar la faena.', 'error'); return; }
    f.pide_informe = valor;
    avisar(lleva.checked ? 'Esta faena lleva informe de trabajo.' : 'Esta faena no lleva informe.');
  });
  return el('div', {},
    el('h2', {}, 'Parte de trabajo'),
    el('label', { class: 'casilla', title: 'Si lleva informe y no tiene parte, se avisa en Partes de trabajo y en Planificación' }, lleva,
      'Esta faena lleva informe', el('span', { class: 'texto-suave texto-chico' }, ` (el cliente, por omisión: ${porCliente ? 'sí' : 'no'})`)),
    el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, rep ? el('span', { class: `chip ${rep.clase}` }, rep.texto) : el('span', { class: 'texto-suave' }, 'Sin parte')),
      parte
        ? el('a', { class: 'boton boton-secundario', href: ctx.ruta('reportes.parte', { id: parte.id }) }, icono('camara', { tam: 16 }), 'Abrir parte')
        : ctx.puede('reportes', 'crear') ? boton('Crear parte', { icono: 'camara', onclick: crear }) : null),
    el('p', { class: 'texto-suave texto-chico' }, 'La cuadrilla también puede subir las fotos por etapa desde el link del checklist.'));
}

// Un postulante asignado a una faena se contrata (como el "en espera" que pasaba a activo en InnovaGestión)
function contratarYAsignar(ctx, x, f, fecha, asegurarPlan) {
  if (!x) return;
  const nombre = [x.nombres, x.apellido_paterno].filter(Boolean).join(' ');
  if (!x.rut) throw new Error(`${nombre} no tiene RUT: complétalo en Postulantes para poder contratarlo.`);
  abrirFormulario({
    titulo: `Contratar y asignar a ${nombre}`,
    mensaje: `Queda como trabajador de la empresa desde el ${fechaLarga(fecha)} (con el vínculo que elijas) y asignado a ${f.titulo}. En Postulantes queda como contratado.`,
    campos: [
      { id: 'cargo', etiqueta: 'Cargo', valor: x.cargo ?? '' },
      { id: 'tipo_vinculo', etiqueta: 'Vínculo', opciones: [['spot', 'Spot'], ['contrato', 'Contrato'], ['honorarios', 'Honorarios'], ['practica', 'Práctica']], valor: 'spot' },
    ],
    textoGuardar: 'Contratar y asignar',
    alGuardar: async (v) => {
      const { data: personaId, error } = await ctx.api.rpc('sel_contratar', { p_postulante: x.id, p_cargo: v.cargo || null, p_tipo_vinculo: v.tipo_vinculo, p_fecha_ingreso: fecha });
      if (error) throw new Error(error.message);
      const planId = await asegurarPlan();
      const { error: e2 } = await ctx.api.from('ope_plan_personas').insert({ plan_id: planId, empresa_id: ctx.empresa.id, persona_id: personaId, rol: 'op' });
      if (e2) throw new Error(`Quedó contratado, pero no se pudo asignar: ${e2.message}`);
      avisar(`${nombre} contratado y asignado.`);
      ctx.refrescar();
    },
  });
}

function ajustarDotacion(ctx, f, p, asegurarPlan) {
  const d = dotacionDe(f, p);
  abrirFormulario({
    titulo: 'Dotación de este día',
    mensaje: `La faena pide ${dotTexto(f.dotacion)}. Puedes cambiarla solo para este día o para todo el trabajo.`,
    campos: [
      ...ROLES.map(([k, , pl]) => ({ id: k, etiqueta: pl, tipo: 'number', valor: String(d[k] ?? 0) })),
      { id: 'alcance', etiqueta: 'Aplicar a', opciones: [['dia', 'Solo este día'], ['todo', f.fecha_inicio !== f.fecha_fin ? 'Todo el trabajo (todos sus días y el Calendario)' : 'La faena (y el Calendario)']], valor: 'dia' },
      ...(p?.dotacion ? [{ id: 'volver', etiqueta: '¿Volver a la dotación de la faena?', opciones: [['no', 'No, usar estos valores'], ['si', 'Sí, quitar el ajuste']], valor: 'no' }] : []),
    ],
    alGuardar: async (v) => {
      const valores = Object.fromEntries(ROLES.map(([k]) => [k, Math.max(0, Number(v[k]) || 0)]));
      if (v.alcance === 'todo') {
        // La faena completa: cambia su dotación y los días sin enviar dejan de tener ajuste propio (siguen a la faena)
        const { error } = await ctx.api.from('ope_faenas').update({ dotacion: valores }).eq('id', f.id);
        if (error) throw new Error(error.message);
        const { error: e2 } = await ctx.api.from('ope_plan').update({ dotacion: null }).eq('faena_id', f.id).eq('estado', 'borrador');
        if (e2) throw new Error(e2.message);
        avisar('Dotación del trabajo guardada (todos sus días).');
      } else {
        const planId = await asegurarPlan();
        const { error } = await ctx.api.from('ope_plan').update({ dotacion: v.volver === 'si' ? null : valores }).eq('id', planId);
        if (error) throw new Error(error.message);
        avisar('Dotación del día guardada.');
      }
      ctx.refrescar();
    },
  });
}

// Vehículos de la flota (si la empresa tiene el módulo Flota) con sus avisos: en taller o documentos vencidos
async function cargarFlotaOpe(ctx) {
  if (!ctx.puede('flota', 'ver')) return null;
  const { cargarFlota, alertas, textoVence, etiquetaVehiculo } = await import('../../flota/datos.js?v=66a811d');
  const lista = await cargarFlota(ctx);
  const avisos = (v) => [...(v.estado === 'taller' ? ['En taller'] : []), ...alertas(v.registros).filter((a) => a.k === 'venc').map(textoVence)];
  return { lista, de: new Map(lista.map((v) => [v.id, v])), avisos, etiqueta: etiquetaVehiculo };
}

function agregarVehiculo(ctx, base, asignados, asegurarPlan, flota) {
  const choferes = asignados.map((x) => base.personas.get(x.persona_id)).filter(Boolean);
  const deFlota = (flota?.lista ?? []).filter((v) => v.estado !== 'inactivo');
  abrirFormulario({
    titulo: 'Agregar vehículo',
    mensaje: deFlota.length ? 'Elige un vehículo de la flota; si es otro (arrendado, particular), escríbelo.' : null,
    campos: [
      ...(deFlota.length ? [{ id: 'vehiculo_id', etiqueta: 'Vehículo de la flota', opciones: [['', 'Otro (escribirlo abajo)'],
        ...deFlota.map((v) => { const a = flota.avisos(v); return [v.id, `${flota.etiqueta(v)}${a.length ? ` · ${a.join(', ')}` : ''}`]; })] }] : []),
      { id: 'vehiculo', etiqueta: deFlota.length ? 'Otro vehículo (nombre o patente)' : 'Vehículo (nombre o patente)', requerido: !deFlota.length },
      { id: 'chofer', etiqueta: 'Chofer (de la cuadrilla)', opciones: [['', 'Sin chofer'], ...choferes.map((v) => [v.persona_id, nombreCompleto(v.personas)])] },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const fv = v.vehiculo_id ? flota.de.get(v.vehiculo_id) : null;
      const texto = fv ? flota.etiqueta(fv) : v.vehiculo.trim();
      if (!texto) throw new Error('Elige un vehículo de la flota o escribe cuál.');
      const planId = await asegurarPlan();
      const { error } = await ctx.api.from('ope_plan_vehiculos').insert({
        plan_id: planId, empresa_id: ctx.empresa.id, vehiculo: texto, chofer_id: v.chofer || null, ...(fv ? { vehiculo_id: fv.id } : {}),
      });
      if (error) throw new Error(error.message);
      const avisos = fv ? flota.avisos(fv) : [];
      avisar(avisos.length ? `Vehículo agregado. Ojo: ${avisos.join(', ')}.` : 'Vehículo agregado.', avisos.length ? 'error' : undefined);
      ctx.refrescar();
    },
  });
}

// Crea los registros de horas de la cuadrilla en Asistencia (una vez por planificación).
function generarHoras(ctx, f, p, e, base) {
  const h = horarioDe(f, p);
  if (!h.ini || !h.fin) { avisar('Indica la hora de inicio y término del día antes de generar las horas.', 'error'); return; }
  const n = p.ope_plan_personas.length;
  abrirFormulario({
    titulo: 'Generar horas en Asistencia',
    mensaje: `Se registrarán ${hhmm(h.ini)}–${hhmm(h.fin)} para ${n} ${n === 1 ? 'persona' : 'personas'} el ${fechaLarga(p.fecha)}. Después puedes corregir a quien entró o salió a otra hora en Registro de horas.`,
    campos: [],
    textoGuardar: 'Generar',
    alGuardar: async () => {
      const origen = `ope:${p.id}`;
      const { count } = await ctx.api.from('asis_horas').select('id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id).eq('origen', origen);
      if (count) throw new Error('Las horas de esta planificación ya se generaron.');
      const filas = p.ope_plan_personas.map((x) => ({
        empresa_id: ctx.empresa.id, persona_id: x.persona_id, fecha: p.fecha, entrada: h.ini, salida: h.fin,
        faena: `${e.texto} · ${f.titulo}`, vueltas: 0, notas: 'Desde la planificación', origen,
      }));
      const { error } = await ctx.api.from('asis_horas').insert(filas);
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('ope_plan').update({ horas_generadas_at: new Date().toISOString() }).eq('id', p.id);
      if (e2) throw new Error(`Se generaron las horas, pero no se marcó la planificación: ${e2.message}`);
      avisar(`Horas registradas para ${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}.`);
      ctx.refrescar();
    },
  });
}


// Observaciones de la faena (con autor y fecha) y las de faenas iguales anteriores (mismo cliente, sitio y título)
async function observaciones(ctx, f) {
  const [{ data: propias }, { data: iguales }, us] = await Promise.all([
    ctx.api.from('ope_faena_obs').select('*').eq('faena_id', f.id).order('created_at'),
    ctx.api.from('ope_faenas').select('id, fecha_inicio').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).neq('id', f.id).lt('fecha_inicio', f.fecha_inicio)
      .ilike('titulo', f.titulo.replace(/[%_]/g, '')).order('fecha_inicio', { ascending: false }).limit(10)
      .filter('tercero_id', f.tercero_id ? 'eq' : 'is', f.tercero_id ?? null).filter('sitio_id', f.sitio_id ? 'eq' : 'is', f.sitio_id ?? null),
    ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }),
  ]);
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  const ids = (iguales ?? []).map((x) => x.id);
  const anteriores = ids.length ? (await ctx.api.from('ope_faena_obs').select('*').in('faena_id', ids).order('created_at', { ascending: false }).limit(10)).data ?? [] : [];
  const fila = (o) => el('div', { class: 'faena-obs' }, el('span', { class: 'texto-chico texto-suave' }, `${quien.get(o.autor) ?? 'Sin autor'} · ${fechaLarga(o.created_at.slice(0, 10))}`), el('span', {}, o.texto));
  const lista = el('div', { class: 'faena-obs-lista' }, (propias ?? []).length ? (propias ?? []).map(fila) : el('p', { class: 'texto-suave texto-chico sin-obs' }, 'Sin observaciones.'));
  const nueva = el('textarea', { class: 'campo', rows: 2, placeholder: 'Agregar observación (queda con tu nombre y la fecha)' });
  return el('div', {},
    el('h3', { class: 'ind-sub' }, 'Observaciones'),
    anteriores.length ? el('details', { class: 'aviso-bandeja' }, el('summary', {}, icono('alerta', { tam: 14 }), ` Observaciones anteriores (${anteriores.length}) de faenas iguales`), anteriores.map(fila)) : null,
    lista,
    ctx.puede('ope', 'ver') ? el('div', { class: 'faena-obs-nueva' }, nueva, boton('Agregar', { icono: 'mas', onclick: async () => {
      if (!nueva.value.trim()) return;
      const { data, error } = await ctx.api.from('ope_faena_obs').insert({ empresa_id: ctx.empresa.id, faena_id: f.id, texto: nueva.value.trim() }).select('*').single();
      if (error) { avisar(error.message, 'error'); return; }
      lista.querySelector('.sin-obs')?.remove(); lista.append(fila(data)); nueva.value = '';
    } })) : null);
}
