// Planificación semanal: tablero por día con las faenas, dotación necesaria vs. asignada y estado.
// Como InnovaGestión: "Disponibles" de cada día se arrastran a una faena (o se toca la persona y luego la faena);
// un asignado arrastrado a Disponibles se quita; "Copiar día" replica el personal, vehículos, horario y preparador
// a otros días; los días se pueden plegar (se recuerda en este equipo).
import { el } from '../../../core/ui/dom.js?v=af5b0f2';
import { icono } from '../../../core/ui/iconos.js?v=af5b0f2';
import { boton } from '../../../core/ui/tabla.js?v=af5b0f2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=af5b0f2';
import { avisar } from '../../../core/ui/aviso.js?v=af5b0f2';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, hhmm, esFinde } from '../../../core/ui/formato.js?v=af5b0f2';
import { cargarBase, cargarSemana, faenasDelDia, etiquetaFaena, horarioDe, dotacionDe, dotTotal, turno, ocupacion, resumenWhatsApp, nombreCorto, partesDeRango, estadoParte } from '../datos.js?v=af5b0f2';

const estado = { lunes: lunesDe(hoyISO()), sel: null };   // sel: { persona_id, fecha } elegido para asignar tocando
const PLEGADOS = 'isg.plan.plegados';
// Selector de día (como InnovaGestión): se ve un día (hoy, o el primero con faenas) o todos; se recuerda la elección
const DIA = 'isg.plan.dia';
const leerDia = () => { try { return localStorage.getItem(DIA); } catch { return null; } };
const guardarDia = (v) => { try { localStorage.setItem(DIA, v); } catch { /* sin almacenamiento */ } };
const claveFaena = (f) => `${f.tercero_id ?? ''}|${f.sitio_id ?? ''}|${f.titulo.trim().toLowerCase()}`;
const leerPlegados = () => { try { return new Set(JSON.parse(localStorage.getItem(PLEGADOS) ?? '[]')); } catch { return new Set(); } };

export default async function vista(ctx) {
  const lunes = estado.lunes;
  const domingo = sumarDias(lunes, 6);
  const [base, semana, partes, obsAnt] = await Promise.all([cargarBase(ctx), cargarSemana(ctx, lunes, domingo), partesDeRango(ctx, lunes, domingo),
    ctx.api.from('ope_faena_obs').select('faena_id, ope_faenas(tercero_id, sitio_id, titulo, fecha_inicio)').eq('empresa_id', ctx.empresa.id).lt('created_at', `${domingo}T23:59:59`).limit(3000)]);
  // Acreditación: asignados sin validar en el cliente de la faena (si el cliente pide documentos a los trabajadores)
  const acr = ctx.puede('acreditacion', 'ver') && ctx.puede('rrhh', 'ver')
    ? await import('../../acreditacion/trabajadores.js?v=af5b0f2').then(async (m) => ({ m, d: await m.cargarAcreditacion(ctx) })).catch(() => null) : null;
  const sinValidar = (f, p) => (acr && f.tercero_id && acr.d.req.some((r) => r.tercero_id === f.tercero_id)
    ? (p?.ope_plan_personas ?? []).filter((x) => !['validado', 'por_vencer'].includes(acr.m.estadoTrabajador(acr.d, f.tercero_id, f.sitio_id, x.persona_id).k)).length : 0);
  // Faenas iguales (cliente + sitio + título) con observaciones en fechas anteriores
  const obsPorClave = new Map();
  for (const o of obsAnt.data ?? []) if (o.ope_faenas) { const k = claveFaena(o.ope_faenas); const prev = obsPorClave.get(k); obsPorClave.set(k, [...(prev ?? []), { id: o.faena_id, ini: o.ope_faenas.fecha_inicio }]); }
  const conObsAnteriores = (f) => (obsPorClave.get(claveFaena(f)) ?? []).some((x) => x.id !== f.id && x.ini < f.fecha_inicio);
  // Día visible
  const diasSemana = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(lunes, i));
  let diaVer = leerDia();
  if (diaVer !== 'todos' && !diasSemana.includes(diaVer)) {
    const hoy = hoyISO();
    diaVer = diasSemana.includes(hoy) && faenasDelDia(semana.faenas, hoy).length ? hoy : diasSemana.find((d) => faenasDelDia(semana.faenas, d).length) ?? (diasSemana.includes(hoy) ? hoy : diasSemana[0]);
  }

  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear');
  const plegados = leerPlegados();
  const plegar = (fecha) => { if (plegados.has(fecha)) plegados.delete(fecha); else plegados.add(fecha); try { localStorage.setItem(PLEGADOS, JSON.stringify([...plegados])); } catch { /* */ } ctx.refrescar(); };
  const asignar = async (f, fecha, persona_id) => {
    estado.sel = null;
    let p = semana.planDe(f, fecha);
    if (p?.estado === 'enviada') { avisar('Esa planificación ya fue enviada: reábrela para cambiarla.', 'error'); ctx.refrescar(); return; }
    if (p?.ope_plan_personas?.some((x) => x.persona_id === persona_id)) { ctx.refrescar(); return; }
    if (!p) {
      const { data, error } = await ctx.api.from('ope_plan').insert({ empresa_id: ctx.empresa.id, faena_id: f.id, fecha, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin }).select('id').single();
      if (error) { avisar(error.message, 'error'); return; }
      p = { id: data.id };
    }
    const v = base.activos.find((x) => x.persona_id === persona_id);
    const { error } = await ctx.api.from('ope_plan_personas').insert({ plan_id: p.id, empresa_id: ctx.empresa.id, persona_id, rol: v?.rol ?? 'op' });
    if (error) avisar(error.message, 'error'); else avisar(`${v ? nombreCorto(v.personas) : 'Persona'} asignada a ${f.titulo}.`);
    ctx.refrescar();
  };
  const quitar = async (plan_id, persona_id) => {
    const { error } = await ctx.api.from('ope_plan_personas').delete().eq('plan_id', plan_id).eq('persona_id', persona_id);
    if (error) avisar(error.message, 'error'); else avisar('Persona quitada de la faena.');
    ctx.refrescar();
  };
  const leerArrastre = (ev) => { try { return JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return null; } };

  const tot = { nec: 0, asg: 0, falt: 0, env: 0, n: 0 };
  const columnas = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const fecha = sumarDias(lunes, i);
    const fs = faenasDelDia(semana.faenas, fecha)
      .sort((a, b) => String(horarioDe(a, semana.planDe(a, fecha)).ini ?? '99').localeCompare(String(horarioDe(b, semana.planDe(b, fecha)).ini ?? '99')));
    const ocup = ocupacion(semana, fecha);
    const libres = base.activos.filter((v) => !ocup.has(v.persona_id));
    let dNec = 0; let dAsg = 0;
    const tarjetas = fs.map((f) => {
      const p = semana.planDe(f, fecha);
      const h = horarioDe(f, p);
      const nec = dotTotal(dotacionDe(f, p));
      const asg = p?.ope_plan_personas?.length ?? 0;
      dNec += nec; dAsg += asg; tot.n += 1;
      tot.falt += Math.max(0, nec - asg);
      if (p?.estado === 'enviada') tot.env += 1;
      const e = etiquetaFaena(f, base);
      const rep = estadoParte(partes, f, fecha, base, hoyISO());
      const repetidos = (p?.ope_plan_personas ?? []).filter((x) => (ocup.get(x.persona_id)?.length ?? 0) > 1).length;
      const bloqueada = p?.estado === 'enviada';
      const esDestino = editable && !bloqueada && estado.sel?.fecha === fecha;
      const tarjeta = el('a', { class: `plan-tarjeta${esDestino ? ' plan-destino' : ''}`, style: `--c:${e.color}`, href: ctx.ruta('ope.plan', { f: f.id, d: fecha }),
        title: esDestino ? 'Toca para asignar aquí a la persona elegida' : '' },
        el('div', { class: 'plan-fila' },
          el('span', { class: 'texto-chico' }, turno(h.ini, h.fin) === 'noche' ? icono('luna', { tam: 12 }) : null, h.ini ? ` ${hhmm(h.ini)}${h.fin ? `–${hhmm(h.fin)}` : ''}` : 'Sin hora'),
          p?.estado === 'enviada' ? el('span', { class: 'chip chip-ok' }, 'Enviada') : null),
        el('strong', { class: 'plan-cliente' }, e.texto),
        el('span', { class: 'plan-titulo' }, f.titulo),
        el('div', { class: 'plan-fila' },
          el('span', { class: `chip ${asg >= nec && nec ? 'chip-ok' : asg ? 'chip-prox' : 'chip-pend'}` }, `${asg}/${nec || '?'}`),
          repetidos ? el('span', { class: 'chip chip-venc', title: 'Personas asignadas a dos faenas el mismo día' }, `${repetidos} en 2 faenas`) : null,
          rep ? el('span', { class: `chip ${rep.clase}`, title: 'Parte de trabajo' }, rep.texto) : null,
          sinValidar(f, p) ? el('span', { class: 'chip chip-venc', title: 'Asignados que aún no están validados en este cliente (Acreditación)' }, `${sinValidar(f, p)} sin validar`) : null,
          conObsAnteriores(f) ? el('span', { class: 'chip chip-prox', title: 'Faenas iguales anteriores tienen observaciones: revísalas al abrir la faena' }, icono('alerta', { tam: 11 }), ' obs. anteriores') : null),
        asg ? el('div', { class: 'plan-asignados' }, (p.ope_plan_personas).map((x) => {
          const v = base.personas.get(x.persona_id);
          const ficha = el('span', { class: `plan-persona rol-${x.rol}`, draggable: editable && !bloqueada ? 'true' : 'false', title: editable && !bloqueada ? 'Arrástrala a Disponibles para quitarla' : '' }, v ? nombreCorto(v.personas) : '?');
          if (editable && !bloqueada) ficha.addEventListener('dragstart', (ev) => { ev.stopPropagation(); ev.dataTransfer.setData('text/plain', JSON.stringify({ quitar: true, plan_id: p.id, persona_id: x.persona_id, fecha })); });
          return ficha;
        })) : null);
      if (editable && !bloqueada) {
        tarjeta.addEventListener('click', (ev) => { if (estado.sel?.fecha === fecha) { ev.preventDefault(); asignar(f, fecha, estado.sel.persona_id); } });
        tarjeta.addEventListener('dragover', (ev) => { ev.preventDefault(); tarjeta.classList.add('plan-soltar'); });
        tarjeta.addEventListener('dragleave', () => tarjeta.classList.remove('plan-soltar'));
        tarjeta.addEventListener('drop', (ev) => { ev.preventDefault(); tarjeta.classList.remove('plan-soltar'); const d = leerArrastre(ev); if (d && !d.quitar && d.fecha === fecha) asignar(f, fecha, d.persona_id); });
      }
      return tarjeta;
    });
    tot.nec += dNec; tot.asg += dAsg;
    const disponibles = el('div', { class: 'plan-disponibles', 'aria-label': `Disponibles del ${nombreDia(fecha)}` },
      el('span', { class: 'texto-suave texto-chico' }, `Disponibles (${libres.length})`),
      el('div', { class: 'plan-asignados' }, libres.map((v) => {
        const elegido = estado.sel?.persona_id === v.persona_id && estado.sel?.fecha === fecha;
        const ficha = el('button', { type: 'button', class: `plan-persona libre rol-${v.rol}${elegido ? ' elegido' : ''}`, draggable: editable ? 'true' : 'false', disabled: !editable,
          'aria-pressed': String(elegido), title: editable ? 'Arrástrala a una faena, o tócala y luego toca la faena' : '' }, nombreCorto(v.personas));
        if (editable) {
          ficha.addEventListener('click', () => { estado.sel = elegido ? null : { persona_id: v.persona_id, fecha }; ctx.refrescar(); });
          ficha.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', JSON.stringify({ persona_id: v.persona_id, fecha })));
        }
        return ficha;
      })));
    if (editable) {
      disponibles.addEventListener('dragover', (ev) => { ev.preventDefault(); disponibles.classList.add('plan-soltar'); });
      disponibles.addEventListener('dragleave', () => disponibles.classList.remove('plan-soltar'));
      disponibles.addEventListener('drop', (ev) => { ev.preventDefault(); disponibles.classList.remove('plan-soltar'); const d = leerArrastre(ev); if (d?.quitar && d.fecha === fecha) quitar(d.plan_id, d.persona_id); });
    }
    const plegado = plegados.has(fecha);
    return el('div', { class: ['plan-columna', 'tal-dia', plegado ? 'plegado' : '', fecha === hoyISO() ? 'hoy' : '', esFinde(fecha) ? 'finde' : '', fecha < hoyISO() ? 'pasado' : ''].filter(Boolean).join(' ') },
      el('div', { class: 'tal-dia-cab' },
        el('span', { class: 'tal-dia-nombre' }, nombreDia(fecha)),
        el('span', { class: 'tal-dia-num' }, String(Number(fecha.slice(8)))),
        fs.length ? el('span', { class: `tal-cuenta ${dAsg < dNec ? 'falta' : ''}`, title: 'Asignados / necesarios' }, `${dAsg}/${dNec}`) : null,
        el('span', { class: 'plan-dia-acciones' },
          editable && fs.length && !plegado ? el('button', { type: 'button', class: 'boton-icono', title: 'Copiar este día a otros', 'aria-label': `Copiar el ${nombreDia(fecha)} a otros días`, onclick: () => copiarDia(ctx, fecha) }, icono('copiar', { tam: 14 })) : null,
          el('button', { type: 'button', class: 'boton-icono', title: plegado ? 'Mostrar el día' : 'Plegar el día', 'aria-label': `${plegado ? 'Mostrar' : 'Plegar'} el ${nombreDia(fecha)}`, onclick: () => plegar(fecha) }, icono(plegado ? 'derecha' : 'volver', { tam: 14 })))),
      plegado ? null : [tarjetas.length ? tarjetas : el('p', { class: 'tal-vacia texto-suave texto-chico' }, 'Sin faenas'),
        fs.length ? disponibles : null]);
  });

  const visibles = diaVer === 'todos' ? columnas : columnas.filter((_, i) => diasSemana[i] === diaVer);
  const tablero = el('div', { class: `plan-tablero ope-semana${diaVer === 'todos' ? '' : ' plan-un-dia'}` }, visibles);
  const selectorDia = el('div', { class: 'segmento plan-selector-dia', role: 'group', 'aria-label': 'Día' },
    diasSemana.map((d) => { const n = faenasDelDia(semana.faenas, d).length; return el('button', { type: 'button', 'aria-pressed': String(diaVer === d), onclick: () => { guardarDia(d); ctx.refrescar(); } },
      `${nombreDia(d).slice(0, 3)} ${Number(d.slice(8))}`, n ? el('span', { class: 'plan-dia-n' }, String(n)) : null); }),
    el('button', { type: 'button', 'aria-pressed': String(diaVer === 'todos'), onclick: () => { guardarDia('todos'); ctx.refrescar(); } }, 'Todos'));
  // En tablet o teléfono: mostrar el día de hoy al abrir
  setTimeout(() => { const d = tablero.querySelector('.hoy'); if (d && tablero.scrollWidth > tablero.clientWidth) tablero.scrollTo({ left: d.offsetLeft - tablero.offsetLeft - 4, behavior: 'smooth' }); }, 50);
  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); if (leerDia() !== 'todos') guardarDia(''); ctx.refrescar(); };
  const acciones = [];
  if (semana.faenas.length) acciones.push(boton('Resumen para WhatsApp', { icono: 'copiar', onclick: () => copiarResumen(resumenWhatsApp(lunes, semana, base)) }));
  if (ctx.puede('ope', 'crear')) acciones.push(el('a', { class: 'boton boton-secundario', href: ctx.ruta('ope.calendario') }, icono('mas', { tam: 16 }), 'Nueva faena'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Planificación semanal'), el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, `Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} – ${fechaCorta(domingo)}`),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); if (leerDia() !== 'todos') guardarDia(hoyISO()); ctx.refrescar(); } })),
    tot.n ? el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-pend' }, `${tot.nec} necesarias`),
      el('span', { class: 'chip chip-ok' }, `${tot.asg} asignadas`),
      tot.falt ? el('span', { class: 'chip chip-venc' }, `${tot.falt} por asignar`) : null,
      el('span', { class: 'texto-suave' }, `${tot.env} de ${tot.n} faena-días enviadas`)) : null,
    estado.sel ? el('p', { class: 'aviso-bandeja' }, icono('users', { tam: 16 }), ` ${nombreCorto(base.personas.get(estado.sel.persona_id)?.personas ?? {})}: toca la faena del ${nombreDia(estado.sel.fecha)} donde va. `,
      el('button', { type: 'button', class: 'boton-enlace', onclick: () => { estado.sel = null; ctx.refrescar(); } }, 'Cancelar')) : null,
    selectorDia,
    tablero,
    editable ? el('p', { class: 'texto-suave texto-chico' }, 'Arrastra a una persona de Disponibles a una faena (o tócala y luego toca la faena); arrastra a un asignado de vuelta a Disponibles para quitarlo. El botón de copiar de cada día replica su planificación en otros días.') : null,
  );
}

// Copiar el personal (con vehículos, horario y preparador) de un día a otros días: elige los destinos entre
// los 6 días anteriores y los 13 siguientes que tienen faenas
async function copiarDia(ctx, fecha) {
  const desde = sumarDias(fecha, -6); const hasta = sumarDias(fecha, 13);
  const sem = await cargarSemana(ctx, desde, hasta);
  const dias = []; for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (d !== fecha && faenasDelDia(sem.faenas, d).length) dias.push(d);
  if (!dias.length) { avisar('No hay otros días con faenas cerca para copiar.', 'error'); return; }
  abrirFormulario({
    titulo: `Copiar el ${nombreDia(fecha).toLowerCase()} ${fechaCorta(fecha)}`,
    mensaje: 'Cada faena del día se copia a su pareja en los días elegidos: la misma faena (si dura varios días) o la de igual cliente, sitio y título. Reemplaza lo planificado en esas faenas; las ya enviadas no se tocan.',
    campos: [{ id: 'dias', etiqueta: 'Copiar a', tipo: 'checks', opciones: dias.map((d) => [d, `${nombreDia(d)} ${fechaCorta(d)} · ${faenasDelDia(sem.faenas, d).length} faena${faenasDelDia(sem.faenas, d).length > 1 ? 's' : ''}`]), valor: dias.filter((d) => d > fecha && d <= sumarDias(fecha, 6) && !esFinde(d)) }],
    textoGuardar: 'Copiar',
    alGuardar: async (v) => {
      if (!v.dias.length) throw new Error('Elige al menos un día.');
      const { data, error } = await ctx.api.rpc('ope_copiar_dia', { p_empresa: ctx.empresa.id, p_origen: fecha, p_destinos: v.dias });
      if (error) throw new Error(error.message);
      avisar(`Copiado a ${data.copiadas} faena-día${data.copiadas === 1 ? '' : 's'}${data.enviadas ? ` (${data.enviadas} ya enviadas no se tocaron)` : ''}.`);
      ctx.refrescar();
    },
  });
}

async function copiarResumen(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar('Resumen copiado. Pégalo en WhatsApp.');
  } catch {
    abrirFormulario({ titulo: 'Resumen para WhatsApp', mensaje: 'Selecciona el texto y cópialo.', campos: [{ id: 'texto', etiqueta: 'Resumen', tipo: 'textarea', filas: 14, valor: texto }], textoGuardar: 'Cerrar', alGuardar: () => {} });
  }
}
