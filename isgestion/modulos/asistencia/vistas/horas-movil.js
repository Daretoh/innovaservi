// Asistencia en el teléfono (Enzo, 2026-11-06): en vez de la planilla, una lista de personas por día.
// Como en InnovaGestión: la semana y, abajo, los días con horas cargadas; al abrir uno, pestañas Con horas (por faena) / Sin horas /
// Ausentes, y filtro por faena. Tocar a alguien abre una hoja con entrada, salida, faena y
// atajos de horario. En Sin horas se marcan varias personas (o las planificadas) y se registran de una vez.
// Botón Agregar (y el "+" de la barra), sin ventanas (Enzo, 2026-11-21): abre el día en Sin horas y tocar a alguien lo agrega;
// las horas se ponen después. "Agregar persona en esta faena" hace lo mismo con esa faena.
// Mismos datos y reglas que la planilla de escritorio (horas.js): las del marcaje se corrigen en Marcajes y los fijos con
// turno quedan presentes "según horario".
import { el } from '../../../core/ui/dom.js?v=10113d4';
import { icono } from '../../../core/ui/iconos.js?v=10113d4';
import { boton } from '../../../core/ui/tabla.js?v=10113d4';
import { avisar } from '../../../core/ui/aviso.js?v=10113d4';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, horas, aMin, hhmm, diaLocal } from '../../../core/ui/formato.js?v=10113d4';
import { estado, minutosRegistro, ausente, eliminar, campoFiltroFaena, pasaFiltroFaena, resumenDia, vinculosAsistencia, horaTs, registrarSalida, anularEntrada } from './horas.js?v=10113d4';

const pantalla = { pestana: null, buscar: '', marcados: new Set(), cerradas: new Set(), diaAbierto: null, faenaDestino: null, nuevas: [], enfocar: null };   // faenaDestino: faena a la que se agrega desde Sin horas; nuevas: filas vacías por llenar   // cerradas: faenas plegadas a mano (día|faena)
const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HORARIO_BASE = '08:00-17:00';
const diaLargo = (d) => `${DIAS_LARGOS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}`;

const nombre = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
const clave = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·—-]+/g, ' ').replace(/\s+/g, ' ');
const iniciales = (p) => `${p.nombres?.[0] ?? ''}${p.apellido_paterno?.[0] ?? ''}`.toUpperCase();
const textoFaena = (f) => [f.terceros?.nombre_fantasia || f.terceros?.razon_social || 'Interno', f.ope_sitios?.nombre, f.titulo].filter(Boolean).join(' · ');
const enDia = (f, d) => f.fecha_inicio <= d && f.fecha_fin >= d && (!f.dias?.length || f.dias.includes(d));

export default async function asistenciaMovil(ctx) {
  const hoy = hoyISO();
  const puedeCrear = ctx.puede('asistencia', 'crear');
  // Desde el "+" de la barra: hoy, con Agregar abierto; una vez (la dirección queda limpia y recargar no lo repite)
  const abrirAgregar = !!ctx.params.registrar && puedeCrear;
  if (abrirAgregar) {
    history.replaceState(null, '', ctx.ruta('asistencia.horas'));
    estado.lunes = lunesDe(hoy); estado.dia = hoy;
    pantalla.pestana = null; pantalla.buscar = ''; pantalla.marcados.clear();
  }
  const desde = estado.lunes; const hasta = sumarDias(desde, 6);
  if (estado.dia < desde || estado.dia > hasta) estado.dia = hoy >= desde && hoy <= hasta ? hoy : desde;
  const verOpe = ctx.puede('ope', 'ver');
  const puedeEditar = ctx.puede('asistencia', 'editar');
  const puedeEliminar = ctx.puede('asistencia', 'eliminar');

  await ctx.api.rpc('asis_generar_fijos', { p_empresa: ctx.empresa.id }).then(() => {}, () => {});
  const [regs, vinculos, ausencias, faenas, colores, planes] = await Promise.all([
    ctx.api.from('asis_horas').select('id, persona_id, fecha, entrada, salida, faena, vueltas, notas, origen')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta).order('entrada'),
    vinculosAsistencia(ctx),
    ctx.api.from('asis_horas').select('id, persona_id, fecha, notas').eq('empresa_id', ctx.empresa.id).eq('origen', 'horario')
      .not('deleted_at', 'is', null).like('notas', 'Ausente%').gte('fecha', desde).lte('fecha', hasta),
    verOpe ? ctx.api.from('ope_faenas').select('id, titulo, tercero_id, fecha_inicio, fecha_fin, dias, hora_inicio, hora_fin, terceros(nombre_fantasia, razon_social), ope_sitios(nombre)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'programada').lte('fecha_inicio', hasta).gte('fecha_fin', desde) : { data: [] },
    verOpe ? ctx.api.from('ope_clientes').select('tercero_id, color').eq('empresa_id', ctx.empresa.id) : { data: [] },
    verOpe ? ctx.api.from('ope_plan').select('faena_id, fecha, hora_inicio, hora_fin, ope_plan_personas(persona_id)')
      .eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta) : { data: [] },
  ]);
  if (regs.error) throw regs.error;
  // Entradas del marcaje sin salida (tablet o terreno): se ven en el día como "En curso", igual que en el PC (2026-11-16:
  // en el teléfono no salía quien había marcado entrada y aún no salida). Sin el módulo Marcaje no hay nada.
  const marcasAbiertas = await ctx.api.from('asis_marcas').select('id, persona_id, ts, origen, motivo').eq('empresa_id', ctx.empresa.id).eq('tipo', 'entrada')
    .is('horas_id', null).is('anulada_at', null).gte('ts', new Date(`${desde}T00:00:00`).toISOString()).lt('ts', new Date(`${sumarDias(hasta, 1)}T00:00:00`).toISOString())
    .then((r) => r.data ?? [], () => []);
  for (const m of marcasAbiertas) regs.data.push({ id: `marca:${m.id}`, persona_id: m.persona_id, fecha: diaLocal(m.ts), entrada: horaTs(m.ts), salida: null, faena: null, vueltas: 0,
    notas: m.origen === 'terreno' ? 'terreno' : 'tablet', origen: 'marcaje', marca: m });
  if (vinculos.error) throw vinculos.error;

  const personas = new Map(vinculos.data.map((v) => [v.persona_id, v]));
  const activos = vinculos.data.filter((v) => v.estado === 'activo').sort((a, b) => nombre(a.personas).localeCompare(nombre(b.personas)));
  const colorDe = new Map((colores.data ?? []).map((c) => [c.tercero_id, c.color]));
  const faenaPorId = new Map((faenas.data ?? []).map((f) => [f.id, f]));
  const colorFaena = new Map((faenas.data ?? []).map((f) => [clave(textoFaena(f)), colorDe.get(f.tercero_id)]));
  const faenasDe = (d) => (faenas.data ?? []).filter((f) => enDia(f, d)).map(textoFaena);
  // Horarios más usados de la semana (atajos de la hoja)
  const cuenta = new Map([[HORARIO_BASE, 1]]);
  for (const r of regs.data) { const h = `${hhmm(r.entrada)}-${hhmm(r.salida)}`; cuenta.set(h, (cuenta.get(h) ?? 0) + 1); }
  const atajos = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => h);

  const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(desde, i));
  const recargar = () => { pantalla.marcados.clear(); ctx.refrescar(); };
  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); estado.dia = estado.lunes; pantalla.pestana = null; pantalla.diaAbierto = null; recargar(); };

  // Lo planificado el día: persona → { faena, entrada, salida }
  const planDelDia = (d) => {
    const m = new Map();
    for (const p of planes.data ?? []) {
      if (p.fecha !== d) continue;
      const f = faenaPorId.get(p.faena_id); if (!f || !enDia(f, d)) continue;
      for (const x of p.ope_plan_personas ?? []) if (!m.has(x.persona_id)) m.set(x.persona_id, { faena: textoFaena(f), entrada: hhmm(p.hora_inicio ?? f.hora_inicio ?? '') || '', salida: hhmm(p.hora_fin ?? f.hora_fin ?? '') || '' });
    }
    return m;
  };

  // Atajos de horario, entrada, salida y total (hoja de una persona y Agregar)
  function camposHorario({ inicial, final, editable, obligatoria = true }) {
    const entrada = el('input', { type: 'time', class: 'campo', 'aria-label': 'Entrada', required: obligatoria, disabled: !editable, value: inicial });
    const salida = el('input', { type: 'time', class: 'campo', 'aria-label': 'Salida', disabled: !editable, value: final });   // opcional (Asistencia 007)
    const total = el('p', { class: 'asm-total', 'aria-live': 'polite' });
    const pintarTotal = () => {
      if (entrada.value && !salida.value) { total.textContent = 'Sin salida: no cuenta hasta completarla.'; return; }
      if (!entrada.value || !salida.value) { total.textContent = ''; return; }
      if (entrada.value === salida.value) { total.textContent = 'La entrada y la salida no pueden ser iguales.'; return; }
      total.textContent = `${horas(minutosRegistro({ entrada: entrada.value, salida: salida.value }))}${aMin(salida.value) <= aMin(entrada.value) ? ' · termina al día siguiente' : ''}`;
    };
    const chips = el('div', { class: 'asm-atajos' }, atajos.map((h) => {
      const [a, b] = h.split('-');
      return el('button', { type: 'button', class: 'asm-atajo', disabled: !editable, onclick: () => { entrada.value = a; salida.value = b; pintarTotal(); marcarAtajo(); } }, `${a} – ${b}`);
    }));
    const marcarAtajo = () => { [...chips.children].forEach((c) => c.classList.toggle('activo', c.textContent === `${entrada.value} – ${salida.value}`)); };
    for (const c of [entrada, salida]) c.addEventListener('input', () => { pintarTotal(); marcarAtajo(); });
    const filas = el('div', { class: 'asm-horas' },
      el('label', {}, el('span', {}, 'Entrada'), entrada),
      el('span', { class: 'asm-flecha', 'aria-hidden': 'true' }, icono('derecha', { tam: 18 })),
      el('label', {}, el('span', {}, 'Salida', editable ? el('button', { type: 'button', class: 'asm-sin-salida', onclick: (ev) => { ev.preventDefault(); salida.value = ''; pintarTotal(); marcarAtajo(); } }, 'Dejar en blanco') : null), salida));
    return { entrada, salida, total, chips, filas, iniciar: () => { pintarTotal(); marcarAtajo(); } };
  }

  // ---- Hoja para registrar o corregir
  function hoja({ r = null, ids = [], plan = null }) {
    const d = r?.fecha ?? estado.dia;
    const v = personas.get(r?.persona_id ?? ids[0]);
    const varias = ids.length > 1;
    const desdeMarcaje = r?.origen === 'marcaje';
    const editable = r ? puedeEditar && !desdeMarcaje : puedeCrear;
    const titulo = varias ? `${ids.length} personas` : v ? nombre(v.personas) : 'Persona';
    const h = camposHorario({ inicial: r ? hhmm(r.entrada) : plan?.entrada || HORARIO_BASE.split('-')[0], final: r ? hhmm(r.salida) : plan?.sinSalida ? '' : plan?.salida || HORARIO_BASE.split('-')[1], editable });
    const { entrada, salida, total, chips } = h;

    const listaFaenas = el('datalist', { id: 'asm-faenas' }, faenasDe(d).map((t) => el('option', { value: t })));
    const conFaena = verOpe || !!r?.faena;
    const faena = el('input', { class: 'campo', list: 'asm-faenas', placeholder: 'Elige o escribe', autocomplete: 'off', disabled: !editable, value: r?.faena ?? plan?.faena ?? '' });
    const conVueltas = !varias && (verOpe || Number(r?.vueltas) > 0 || /chofer|conductor/i.test(v?.cargo ?? ''));
    const vueltas = el('input', { type: 'number', class: 'campo', min: '0', max: '50', inputmode: 'numeric', disabled: !editable, value: String(r?.vueltas ?? 0) });
    const error = el('p', { class: 'asm-error', role: 'alert', hidden: true });

    const guardar = async (ev) => {
      ev.preventDefault();
      error.hidden = true;
      if (salida.value && entrada.value === salida.value) { error.textContent = 'La entrada y la salida no pueden ser iguales.'; error.hidden = false; return; }
      btn.disabled = true; btn.classList.add('cargando');
      const datos = { entrada: entrada.value, salida: salida.value || null, ...(conFaena ? { faena: faena.value.trim() || null } : {}), vueltas: conVueltas ? Math.max(0, Number(vueltas.value) || 0) : (r?.vueltas ?? 0) };
      let res;
      if (r) {
        const corregido = r.origen === 'horario' && !(r.notas ?? '').startsWith('Corregido') && (hhmm(r.entrada) !== entrada.value || hhmm(r.salida) !== salida.value);
        res = await ctx.api.from('asis_horas').update({ ...datos, ...(corregido ? { notas: 'Corregido (retraso u horas extra)' } : {}) }).eq('id', r.id).select('id');
      } else {
        res = await ctx.api.from('asis_horas').insert(ids.map((persona_id) => ({ ...datos, persona_id, fecha: d, empresa_id: ctx.empresa.id }))).select('id');
      }
      btn.disabled = false; btn.classList.remove('cargando');
      if (res.error || !res.data?.length) { error.textContent = res.error?.message ?? 'No tienes permiso para guardar.'; error.hidden = false; return; }
      cerrar();
      avisar(r ? 'Guardado.' : varias ? `Horas registradas a ${ids.length} personas.` : 'Horas registradas.');
      if (!r) pantalla.pestana = 'con';
      recargar();
    };

    const btn = boton(r ? 'Guardar' : varias ? `Registrar a ${ids.length}` : 'Registrar', { tipo: 'primario', type: 'submit' });
    const extras = r && !desdeMarcaje ? [
      r.origen === 'horario' && puedeEditar ? boton('Marcar ausente', { onclick: () => { cerrar(); ausente(ctx, r, v); } }) : null,
      r.origen !== 'horario' && puedeEliminar ? boton('Eliminar', { icono: 'basura', onclick: () => { cerrar(); eliminar(ctx, r); } }) : null,
      puedeCrear ? boton('Otra hora', { icono: 'mas', onclick: () => { cerrar(); hoja({ ids: [r.persona_id], plan: { faena: r.faena ?? '', entrada: hhmm(r.salida) || hhmm(r.entrada), salida: '', sinSalida: true } }); } }) : null,
    ].filter(Boolean) : [];
    const form = el('form', { class: 'modal-cuerpo asm-form', onsubmit: guardar },
      desdeMarcaje ? el('p', { class: 'asm-nota' }, 'Viene del marcaje: se corrige en ', ctx.hayVista('asistencia.marcajes') ? el('a', { href: ctx.ruta('asistencia.marcajes'), onclick: () => cerrar() }, 'Marcajes') : 'Marcajes', '.') : null,
      editable ? chips : null,
      h.filas,
      total,
      conFaena ? el('label', { class: 'asm-campo' }, el('span', {}, 'Faena'), faena) : null,
      conFaena ? listaFaenas : null,
      conVueltas ? el('label', { class: 'asm-campo' }, el('span', {}, 'Vueltas'), vueltas) : null,
      error,
      extras.length ? el('div', { class: 'asm-extras' }, extras) : null,
      el('div', { class: 'modal-pie' }, boton(editable ? 'Cancelar' : 'Cerrar', { onclick: () => cerrar() }), editable ? btn : null));
    const dialogo = el('dialog', { class: 'modal asm-hoja', 'aria-label': titulo },
      el('header', { class: 'modal-cabecera' },
        el('div', { class: 'asm-hoja-titulo' }, el('h2', {}, titulo),
          el('span', { class: 'texto-suave texto-chico' }, `${DIAS_LARGOS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}${v?.cargo && !varias ? ` · ${v.cargo}` : ''}`)),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
      form);
    function cerrar() { dialogo.close(); dialogo.remove(); }
    dialogo.addEventListener('cancel', () => dialogo.remove());
    document.body.append(dialogo);
    dialogo.showModal();
    h.iniciar();
  }

  // ---- Pantalla: la semana y, abajo, los días con horas cargadas; al abrir uno salen sus faenas (y Sin horas / Ausentes)
  const lista = el('div', { class: 'asm-lista' });
  const pestanas = el('div', { class: 'asm-pestanas', role: 'tablist', 'aria-label': 'Personas del día' });
  const barraVarios = el('div', { class: 'asm-varios', hidden: true });
  const registrar = puedeCrear ? el('div', { class: 'asm-registrar' }, boton('Agregar', { tipo: 'primario', icono: 'mas', onclick: () => irAgregar() })) : null;
  const buscador = el('input', { type: 'search', class: 'campo asm-buscar', placeholder: 'Buscar trabajador', 'aria-label': 'Buscar trabajador', value: pantalla.buscar });
  buscador.addEventListener('input', () => { pantalla.buscar = buscador.value; pintarLista(); });
  const listaDias = el('div', { class: 'sem-dias' });
  const otrosDias = el('div', { class: 'sem-otros' });
  const filtro = campoFiltroFaena(regs.data, () => { pantalla.pestana = null; pintarSemana(); });
  if (pantalla.diaAbierto && (pantalla.diaAbierto < desde || pantalla.diaAbierto > hasta)) pantalla.diaAbierto = null;

  let datosDia = null;
  function calcularDia() {
    const d = estado.dia;
    const delDia = regs.data.filter((r) => r.fecha === d);
    const aus = (ausencias.data ?? []).filter((a) => a.fecha === d);
    const conHoras = new Set(delDia.map((r) => r.persona_id));
    const ausIds = new Set(aus.map((a) => a.persona_id));
    const plan = planDelDia(d);
    const sin = activos.filter((v) => !conHoras.has(v.persona_id) && !ausIds.has(v.persona_id))
      .sort((a, b) => plan.has(b.persona_id) - plan.has(a.persona_id));
    // Horas que se pisan: misma persona, horarios solapados
    const pisan = new Set();
    const iv = (r) => { const a = aMin(r.entrada); return [a, a + minutosRegistro(r)]; };
    delDia.forEach((a, i) => delDia.slice(i + 1).forEach((b) => {
      if (a.persona_id !== b.persona_id) return;
      const [a0, a1] = iv(a); const [b0, b1] = iv(b);
      if (a0 < b1 && b0 < a1) { pisan.add(a.id); pisan.add(b.id); }
    }));
    datosDia = { d, delDia, aus, sin, plan, pisan };
    if (!pantalla.pestana) pantalla.pestana = 'con';   // siempre parte en Con horas (la lista completa satura)
  }

  const coincide = (v) => !pantalla.buscar.trim() || clave(`${v ? nombre(v.personas) : ''} ${v?.cargo ?? ''}`).includes(clave(pantalla.buscar));
  const avatar = (v) => el('span', { class: 'asm-avatar', 'aria-hidden': 'true' }, v ? iniciales(v.personas) : '?');

  function tarjetaHoras(r) {
    const v = personas.get(r.persona_id);
    const chip = r.origen === 'horario' ? [(r.notas ?? '').startsWith('Corregido') ? 'corregido' : 'según horario', 'chip-ok']
      : r.origen === 'marcaje' ? [(r.notas ?? '').includes('terreno') ? 'terreno' : 'tablet', 'chip-pend'] : null;
    const enCurso = r.marca ? (r.fecha === hoyISO() ? 'En curso' : 'Falta la salida') : null;
    return el('button', { type: 'button', class: `asm-persona${datosDia.pisan.has(r.id) ? ' pisa' : ''}`, onclick: () => (r.marca ? accionesMarca(r) : hoja({ r })) },
      avatar(v),
      el('span', { class: 'asm-persona-texto' },
        el('strong', {}, v ? nombre(v.personas) : 'Persona sin vínculo'),
        !r.entrada && !r.salida
          ? el('span', { class: 'asm-horario' }, el('span', { class: 'chip chip-prox' }, 'Sin horas'), el('span', { class: 'texto-suave texto-chico' }, 'toca para ponerlas'))
          : el('span', { class: 'asm-horario' }, `${hhmm(r.entrada) || '…'} – ${hhmm(r.salida) || '…'}`, r.salida ? el('b', {}, horas(minutosRegistro(r))) : el('span', { class: 'chip chip-prox' }, enCurso ?? 'Sin salida'), chip ? el('span', { class: `chip ${chip[1]}` }, chip[0]) : null),
        datosDia.pisan.has(r.id) ? el('span', { class: 'texto-chico pct-mal' }, 'Se pisa con otra hora ese día') : null),
      icono('derecha', { tam: 18 }));
  }

  // Como InnovaGestión: tocar a alguien en Sin horas lo agrega al día sin preguntar nada (con su faena si estaba
  // planificado); queda "Sin horas" y las horas se ponen después tocando su nombre en Con horas.
  async function agregarDirecto(ids, plan, btnEl, planDe = () => plan) {
    if (!ids.length || btnEl?.disabled) return;
    if (btnEl) { btnEl.disabled = true; btnEl.classList.add('cargando'); }
    const res = await ctx.api.from('asis_horas').insert(ids.map((persona_id) => ({
      persona_id, fecha: estado.dia, empresa_id: ctx.empresa.id, entrada: null, salida: null, faena: pantalla.faenaDestino || planDe(persona_id)?.faena || null, vueltas: 0,
    }))).select('id');
    if (btnEl) { btnEl.disabled = false; btnEl.classList.remove('cargando'); }
    if (res.error || !res.data?.length) { avisar(res.error?.message ?? 'No tienes permiso para agregar.', 'error'); return; }
    avisar(ids.length === 1 ? 'Agregado. Toca su nombre en Con horas para ponerle las horas.' : `${ids.length} personas agregadas. Toca cada nombre en Con horas para ponerle las horas.`);
    recargar();
  }

  // Fila en línea (como el PC y InnovaGestión): el nombre y, en la misma fila, entrada y salida que se guardan al salir
  // del campo. Tocar el nombre abre la hoja (faena, vueltas, eliminar). Lo del marcaje se ve como tarjeta (se corrige en Marcajes).
  function filaHoras(r) {
    if (r.marca || r.origen === 'marcaje') return tarjetaHoras(r);
    const v = personas.get(r.persona_id);
    const editable = puedeEditar;
    const entrada = el('input', { type: 'time', class: 'campo', 'aria-label': `Entrada de ${v ? nombre(v.personas) : 'la persona'}`, disabled: !editable, value: hhmm(r.entrada), 'data-enfocar': r.id });
    const salida = el('input', { type: 'time', class: 'campo', 'aria-label': `Salida de ${v ? nombre(v.personas) : 'la persona'}`, disabled: !editable, value: hhmm(r.salida) });
    const total = el('span', { class: 'asm-fila-total' });
    const pintarTotal = () => { total.textContent = entrada.value && salida.value ? horas(minutosRegistro({ entrada: entrada.value, salida: salida.value })) : entrada.value ? 'sin salida' : 'sin horas'; };
    pintarTotal();
    const guardar = async () => {
      const e = entrada.value || null; const sa = salida.value || null;
      if (e === (hhmm(r.entrada) || null) && sa === (hhmm(r.salida) || null)) { pintarTotal(); return; }
      if (e && sa && e === sa) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
      if (!e && sa) { avisar('Pon la entrada primero.', 'error'); return; }
      const corregido = r.origen === 'horario' && !(r.notas ?? '').startsWith('Corregido');
      const { data, error } = await ctx.api.from('asis_horas').update({ entrada: e, salida: sa, ...(corregido ? { notas: 'Corregido (retraso u horas extra)' } : {}) }).eq('id', r.id).select('id');
      if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para guardar.', 'error'); return; }
      r.entrada = e; r.salida = sa; pintarTotal();
    };
    entrada.addEventListener('change', guardar); salida.addEventListener('change', guardar);
    entrada.addEventListener('input', pintarTotal); salida.addEventListener('input', pintarTotal);
    const chip = r.origen === 'horario' ? ((r.notas ?? '').startsWith('Corregido') ? 'corregido' : 'según horario') : null;
    return el('div', { class: `asm-fila${datosDia.pisan.has(r.id) ? ' pisa' : ''}` },
      el('button', { type: 'button', class: 'asm-fila-nombre', onclick: () => hoja({ r }), title: 'Faena, vueltas y más' },
        el('strong', {}, v ? nombre(v.personas) : 'Persona sin vínculo'), chip ? el('span', { class: 'chip chip-ok' }, chip) : null, icono('derecha', { tam: 16 })),
      el('div', { class: 'asm-fila-horas' }, entrada, el('span', { class: 'asm-flecha', 'aria-hidden': 'true' }, '→'), salida, total),
      datosDia.pisan.has(r.id) ? el('span', { class: 'texto-chico pct-mal' }, 'Se pisa con otra hora ese día') : null);
  }

  // Fila vacía: se escribe el nombre (con buscador); al elegirlo queda guardada y se siguen poniendo las horas
  function filaNueva(n) {
    const quitar = () => { pantalla.nuevas = pantalla.nuevas.filter((x) => x !== n); pintarLista(); };
    const nombreIn = el('input', { class: 'campo', list: 'asm-personas', placeholder: 'Nombre del trabajador', autocomplete: 'off', 'aria-label': 'Nombre del trabajador', 'data-enfocar': n.id });
    let guardando = false;
    nombreIn.addEventListener('change', async () => {
      const k = clave(nombreIn.value); if (!k || guardando) return;
      const v = activos.find((x) => clave(nombre(x.personas)) === k);
      if (!v) { avisar('Elige un nombre de la lista.', 'error'); return; }
      guardando = true; nombreIn.disabled = true;
      const { data, error } = await ctx.api.from('asis_horas').insert({ persona_id: v.persona_id, fecha: estado.dia, empresa_id: ctx.empresa.id, entrada: null, salida: null, faena: n.faena || null, vueltas: 0 }).select('id');
      guardando = false; nombreIn.disabled = false;
      if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para agregar.', 'error'); return; }
      pantalla.nuevas = pantalla.nuevas.filter((x) => x !== n);
      pantalla.enfocar = data[0].id;
      recargar();
    });
    return el('div', { class: 'asm-fila asm-fila-nueva' },
      el('div', { class: 'asm-fila-nombre' }, nombreIn,
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar fila', onclick: quitar }, icono('cerrar', { tam: 16 }))),
      el('div', { class: 'asm-fila-horas' },
        el('input', { type: 'time', class: 'campo', disabled: true, 'aria-label': 'Entrada' }), el('span', { class: 'asm-flecha', 'aria-hidden': 'true' }, '→'),
        el('input', { type: 'time', class: 'campo', disabled: true, 'aria-label': 'Salida' }), el('span', { class: 'asm-fila-total' }, '—')));
  }

  // Entrada marcada sin salida: Registrar salida o Anular entrada (las mismas del PC)
  function accionesMarca(r) {
    if (puedeCrear) registrarSalida(ctx, r.marca, personas);
    else if (puedeEditar) anularEntrada(ctx, r.marca, personas);
  }

  function pintarLista() {
    const { delDia, aus, sin, plan } = datosDia;
    let contenido = [];
    if (pantalla.pestana === 'con') {
      const grupos = new Map();
      for (const r of delDia) {
        if (!pasaFiltroFaena(r) || !coincide(personas.get(r.persona_id))) continue;
        const k = clave(r.faena); if (!grupos.has(k)) grupos.set(k, { texto: r.faena, filas: [], nuevas: [] });
        grupos.get(k).filas.push(r);
      }
      for (const n of pantalla.nuevas) {
        const k = clave(n.faena); if (!grupos.has(k)) grupos.set(k, { texto: n.faena, filas: [], nuevas: [] });
        grupos.get(k).nuevas.push(n);
      }
      contenido = [...grupos.entries()].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b)).map(([k, g]) => {
        // Como InnovaGestión: al abrir el día se ven sus faenas con la gente (se pueden plegar); al buscar o filtrar siempre abiertas
        const conCabeza = verOpe || !!g.texto;
        const llave = `${estado.dia}|${k}`;
        const abierto = !conCabeza || !!pantalla.buscar.trim() || !!estado.filtro || !pantalla.cerradas.has(llave) || g.nuevas.length > 0;
        const cuerpo = el('div', { class: 'asm-grupo-cuerpo', hidden: !abierto }, g.filas.map(filaHoras), g.nuevas.map(filaNueva),
          puedeCrear ? el('button', { type: 'button', class: 'asm-planificados', onclick: () => nuevaFila(g.texto || '') }, icono('mas', { tam: 16 }), g.texto ? 'Agregar persona en esta faena' : 'Agregar persona') : null);
        const cabeza = conCabeza && (g.texto || g.filas.length) ? el('button', { type: 'button', class: 'asm-grupo-cabeza', 'aria-expanded': String(abierto), onclick: () => {
          const abrir = cuerpo.hidden; cuerpo.hidden = !abrir; cabeza.setAttribute('aria-expanded', String(abrir));
          if (abrir) pantalla.cerradas.delete(llave); else pantalla.cerradas.add(llave);
        } }, el('i', { 'aria-hidden': 'true' }), el('span', {}, g.texto || 'Sin faena'), el('small', {}, `${g.filas.length} · ${horas(g.filas.reduce((s, r) => s + minutosRegistro(r), 0))}`), icono('derecha', { tam: 18 })) : null;
        return el('div', { class: 'asm-grupo', style: colorFaena.get(k) ? `--asm-color:${colorFaena.get(k)}` : '' }, cabeza, cuerpo);
      });
      if (!contenido.length) contenido = [el('div', { class: 'tm-vacio' }, el('span', {}, pantalla.buscar ? 'Nadie con ese nombre.' : 'Nadie con horas este día.'),
        puedeCrear ? boton('Agregar persona', { icono: 'mas', onclick: () => nuevaFila('') }) : null)];
    } else if (pantalla.pestana === 'sin') {
      const visibles = sin.filter(coincide);
      const planificados = visibles.filter((v) => plan.has(v.persona_id));
      contenido = [
        puedeCrear ? el('p', { class: 'asm-destino' }, icono('mas', { tam: 16 }),
          pantalla.faenaDestino ? ['Toca a alguien para agregarlo a ', el('strong', {}, pantalla.faenaDestino), '. ', el('button', { type: 'button', class: 'boton-enlace', onclick: () => { pantalla.faenaDestino = null; pintarLista(); } }, 'Sin faena')]
            : 'Toca a alguien para agregarlo al día. Las horas se ponen después, tocando su nombre en Con horas.') : null,
        puedeCrear && planificados.length > 1 ? el('button', { type: 'button', class: 'asm-planificados', onclick: () => { planificados.forEach((v) => pantalla.marcados.add(v.persona_id)); pintarLista(); } },
          icono('check', { tam: 16 }), `Marcar los ${planificados.length} planificados`) : null,
        ...visibles.map((v) => {
          const p = plan.get(v.persona_id);
          const marcado = pantalla.marcados.has(v.persona_id);
          return el('div', { class: `asm-persona asm-sin${marcado ? ' marcada' : ''}` },
            puedeCrear ? el('button', { type: 'button', class: 'asm-marca', role: 'checkbox', 'aria-checked': String(marcado), 'aria-label': `Marcar a ${nombre(v.personas)}`,
              onclick: () => { if (marcado) pantalla.marcados.delete(v.persona_id); else pantalla.marcados.add(v.persona_id); pintarLista(); } }, marcado ? icono('check', { tam: 18 }) : avatar(v)) : avatar(v),
            el('button', { type: 'button', class: 'asm-persona-abrir', disabled: !puedeCrear, onclick: (ev) => agregarDirecto([v.persona_id], p, ev.currentTarget) },
              el('span', { class: 'asm-persona-texto' }, el('strong', {}, nombre(v.personas)),
                el('span', { class: 'texto-suave texto-chico' }, p ? `Planificado: ${p.faena}` : v.cargo || 'Sin horas')),
              puedeCrear ? icono('mas', { tam: 18 }) : null));
        }),
      ].filter(Boolean);
      if (!visibles.length) contenido = [el('div', { class: 'tm-vacio' }, el('span', {}, pantalla.buscar ? 'Nadie con ese nombre.' : 'Todos tienen horas este día.'))];
    } else {
      contenido = aus.filter((a) => coincide(personas.get(a.persona_id))).map((a) => {
        const v = personas.get(a.persona_id);
        return el('div', { class: 'asm-persona asm-ausente' }, avatar(v),
          el('span', { class: 'asm-persona-texto' }, el('strong', {}, v ? nombre(v.personas) : 'Persona'), el('span', { class: 'texto-suave texto-chico' }, String(a.notas ?? '').replace(/^Ausente:\s*/, ''))),
          puedeEditar ? boton('Deshacer', { onclick: async () => { const { error } = await ctx.api.from('asis_horas').update({ deleted_at: null, notas: 'Según horario' }).eq('id', a.id); if (error) avisar(error.message, 'error'); else recargar(); } }) : null);
      });
      if (!contenido.length) contenido = [el('div', { class: 'tm-vacio' }, el('span', {}, 'Sin ausentes este día.'))];
    }
    lista.replaceChildren(...contenido);
    if (pantalla.enfocar) { const id = pantalla.enfocar; pantalla.enfocar = null; setTimeout(() => lista.querySelector(`[data-enfocar="${id}"]`)?.focus(), 60); }
    const n = pantalla.marcados.size;
    barraVarios.hidden = !(n && pantalla.pestana === 'sin');
    barraVarios.replaceChildren(
      el('button', { type: 'button', class: 'asm-limpiar', onclick: () => { pantalla.marcados.clear(); pintarLista(); } }, 'Limpiar'),
      boton(`Agregar a ${n}`, { tipo: 'primario', icono: 'mas', onclick: (ev) => { const ids = [...pantalla.marcados]; agregarDirecto(ids, null, ev.currentTarget, (x) => plan.get(x)); } }));
  }

  // El día abierto: pestañas y lista
  function pintar() {
    if (pantalla.diaAbierto) estado.dia = pantalla.diaAbierto;
    calcularDia();
    const { delDia, aus, sin } = datosDia;
    pestanas.replaceChildren(...[['con', 'Con horas', new Set(delDia.map((r) => r.persona_id)).size], ['sin', 'Sin horas', sin.length], ['aus', 'Ausentes', aus.length]].map(([k, t, n]) =>
      el('button', { type: 'button', role: 'tab', class: `asm-pestana asm-${k}`, 'aria-selected': String(pantalla.pestana === k), onclick: () => { pantalla.pestana = k; pintar(); } }, el('strong', {}, String(n)), el('span', {}, t))));
    pintarLista();
  }

  // La semana: un bloque por día con carga (o abierto); uno abierto a la vez
  const registrosDe = (d) => regs.data.filter((r) => r.fecha === d && pasaFiltroFaena(r));
  const ausentesDe = (d) => (ausencias.data ?? []).filter((a) => a.fecha === d);
  const abrirDia = (d) => {
    pantalla.diaAbierto = pantalla.diaAbierto === d ? null : d;
    pantalla.pestana = null; pantalla.marcados.clear(); pantalla.faenaDestino = null; pantalla.nuevas = [];
    pintarSemana();
  };
  // Agregar (botón, "+" de la barra o "Agregar persona en esta faena"), como InnovaGestión y sin ventanas: abre el día en
  // Sin horas; tocar a alguien lo agrega (a esa faena, si se vino desde una) y las horas se ponen después.
  function irAgregar(faena = null, dia = null, desplazar = true) {
    const d = dia ?? pantalla.diaAbierto ?? (hoy >= desde && hoy <= hasta ? hoy : desde);
    if (d !== pantalla.diaAbierto) pantalla.nuevas = [];
    pantalla.diaAbierto = d; estado.dia = d;
    pantalla.marcados.clear(); pantalla.buscar = ''; buscador.value = '';
    nuevaFila(faena ?? '', desplazar);
  }
  // Agrega una fila vacía (como el PC) en la faena indicada y pone el cursor en el nombre
  function nuevaFila(faena, desplazar = true) {
    const n = { id: `nueva-${Date.now()}-${pantalla.nuevas.length}`, faena };
    pantalla.nuevas.push(n);
    pantalla.pestana = 'con'; pantalla.faenaDestino = null; pantalla.enfocar = n.id;
    pantalla.cerradas.delete(`${estado.dia}|${clave(faena)}`);
    pintarSemana();
    const ir = () => lista.querySelector(`[data-enfocar="${n.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (desplazar) setTimeout(ir, 80); else setTimeout(ir, 150);
  }
  function pintarSemana() {
    const listados = dias.filter((d) => registrosDe(d).length || d === pantalla.diaAbierto || (!estado.filtro && ausentesDe(d).length));
    listaDias.replaceChildren(...(listados.length ? listados.map((d) => {
      const abierto = d === pantalla.diaAbierto;
      return el('div', { class: `sem-dia${d === hoy ? ' hoy' : ''}` },
        el('button', { type: 'button', class: 'sem-dia-cabeza', 'aria-expanded': String(abierto), onclick: () => abrirDia(d) },
          icono('derecha', { tam: 18 }), el('strong', {}, diaLargo(d)), d === hoy ? el('span', { class: 'chip chip-ok' }, 'Hoy') : null,
          el('span', { class: 'sem-dia-resumen' }, resumenDia(registrosDe(d), verOpe || regs.data.some((r) => r.faena)))),
        abierto ? el('div', { class: 'sem-dia-cuerpo' }, pestanas, activos.length > 8 ? buscador : null, lista) : null);
    }) : [el('div', { class: 'tm-vacio' }, el('span', {}, 'Sin horas cargadas esta semana.'))]));
    const otros = estado.filtro ? [] : dias.filter((d) => !listados.includes(d));
    otrosDias.hidden = !otros.length;
    otrosDias.replaceChildren(el('span', { class: 'texto-suave texto-chico' }, 'Días sin carga:'),
      ...otros.map((d) => el('button', { type: 'button', class: 'boton-enlace', onclick: () => abrirDia(d) }, `${nombreDia(d)} ${Number(d.slice(8))}`)));
    if (pantalla.diaAbierto) pintar(); else barraVarios.hidden = true;
  }
  calcularDia();
  pintarSemana();
  if (abrirAgregar) irAgregar(null, hoy, false);

  return el('section', { class: 'listado tm ag asm' },
    el('header', { class: 'tm-cab ag-cab' },
      el('div', { class: 'tm-cab-fila' },
        el('h1', {}, 'Asistencia'),
        el('div', { class: 'ag-semana' },
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
          el('span', {}, `Semana ${numSemana(desde)}`),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')))),
      el('p', { class: 'texto-suave texto-chico sem-rango' }, `${fechaCorta(desde)} – ${fechaCorta(hasta)}`),
      desde !== lunesDe(hoy) ? el('button', { type: 'button', class: 'ag-hoy', onclick: () => { estado.lunes = lunesDe(hoy); estado.dia = hoy; pantalla.pestana = null; pantalla.diaAbierto = hoy; recargar(); } }, 'Volver a hoy') : null),
    registrar, filtro, listaDias, otrosDias, barraVarios,
    el('datalist', { id: 'asm-personas' }, activos.map((v) => el('option', { value: nombre(v.personas) }))));
}
