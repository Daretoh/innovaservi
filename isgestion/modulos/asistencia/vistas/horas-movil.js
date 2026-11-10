// Asistencia en el teléfono (Enzo, 2026-11-06): en vez de la planilla, una lista de personas por día.
// Como en InnovaGestión: la semana y, abajo, los días con horas cargadas; al abrir uno, pestañas Con horas (por faena) / Sin horas /
// Ausentes, y filtro por faena. Tocar a alguien abre una hoja con entrada, salida, faena y
// atajos de horario. En Sin horas se marcan varias personas (o las planificadas) y se registran de una vez.
// Botón Agregar (y el "+" de la barra), como en InnovaGestión: primero las faenas del día, después se marca la gente; cada faena
// abierta tiene además "Agregar persona en esta faena".
// Mismos datos y reglas que la planilla de escritorio (horas.js): las del marcaje se corrigen en Marcajes y los fijos con
// turno quedan presentes "según horario".
import { el } from '../../../core/ui/dom.js?v=dcd938a';
import { icono } from '../../../core/ui/iconos.js?v=dcd938a';
import { boton } from '../../../core/ui/tabla.js?v=dcd938a';
import { avisar } from '../../../core/ui/aviso.js?v=dcd938a';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, horas, aMin, hhmm } from '../../../core/ui/formato.js?v=dcd938a';
import { estado, minutosRegistro, ausente, eliminar, campoFiltroFaena, pasaFiltroFaena, resumenDia } from './horas.js?v=dcd938a';

const pantalla = { pestana: null, buscar: '', marcados: new Set(), abiertas: new Set(), diaAbierto: null };   // abiertas: faenas desplegadas (día|faena)
const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HORARIO_BASE = '08:00-17:00';

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
    ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
    ctx.api.from('asis_horas').select('id, persona_id, fecha, notas').eq('empresa_id', ctx.empresa.id).eq('origen', 'horario')
      .not('deleted_at', 'is', null).like('notas', 'Ausente%').gte('fecha', desde).lte('fecha', hasta),
    verOpe ? ctx.api.from('ope_faenas').select('id, titulo, tercero_id, fecha_inicio, fecha_fin, dias, hora_inicio, hora_fin, terceros(nombre_fantasia, razon_social), ope_sitios(nombre)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'programada').lte('fecha_inicio', hasta).gte('fecha_fin', desde) : { data: [] },
    verOpe ? ctx.api.from('ope_clientes').select('tercero_id, color').eq('empresa_id', ctx.empresa.id) : { data: [] },
    verOpe ? ctx.api.from('ope_plan').select('faena_id, fecha, hora_inicio, hora_fin, ope_plan_personas(persona_id)')
      .eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta) : { data: [] },
  ]);
  if (regs.error) throw regs.error;
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
  function camposHorario({ inicial, final, editable }) {
    const entrada = el('input', { type: 'time', class: 'campo', 'aria-label': 'Entrada', required: true, disabled: !editable, value: inicial });
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

  // ---- Agregar (como en InnovaGestión): primero la faena del día, después la gente
  const diaLargo = (d) => `${DIAS_LARGOS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}`;
  function faenasParaAgregar(d) {
    const { delDia, plan } = datosDia;
    const m = new Map();
    for (const f of (faenas.data ?? []).filter((x) => enDia(x, d))) {
      const texto = textoFaena(f);
      if (!m.has(clave(texto))) m.set(clave(texto), { texto, color: colorDe.get(f.tercero_id), entrada: hhmm(f.hora_inicio ?? '') || '', salida: hhmm(f.hora_fin ?? '') || '' });
    }
    for (const r of delDia) if (r.faena && !m.has(clave(r.faena))) m.set(clave(r.faena), { texto: r.faena, color: colorFaena.get(clave(r.faena)), entrada: '', salida: '' });
    return [...m.entries()].map(([k, f]) => ({ ...f,
      conHoras: new Set(delDia.filter((r) => clave(r.faena) === k).map((r) => r.persona_id)).size,
      planificados: activos.filter((v) => clave(plan.get(v.persona_id)?.faena) === k).length,
    })).sort((a, b) => a.texto.localeCompare(b.texto));
  }

  function agregar(faenaInicial) {
    // Con el botón general: el día abierto, o hoy si es de esta semana (arriba se puede cambiar)
    if (!faenaInicial) estado.dia = pantalla.diaAbierto ?? (hoy >= desde && hoy <= hasta ? hoy : desde);
    calcularDia();
    let d = estado.dia;
    const conFaena = verOpe || regs.data.some((r) => r.faena);
    let opciones = conFaena ? faenasParaAgregar(d) : [];
    const tituloEl = el('h2', {});
    const subtitulo = el('span', { class: 'texto-suave texto-chico' });
    const cuerpo = el('div', { class: 'asm-agregar' });
    const dialogo = el('dialog', { class: 'modal asm-hoja', 'aria-label': 'Agregar horas' },
      el('header', { class: 'modal-cabecera' },
        el('div', { class: 'asm-hoja-titulo' }, tituloEl, subtitulo),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
      cuerpo);
    const alSalir = () => { if (pantalla.diaAbierto) { estado.dia = pantalla.diaAbierto; calcularDia(); } };   // el día de fondo vuelve a ser el abierto
    function cerrar() { dialogo.close(); dialogo.remove(); alSalir(); }
    dialogo.addEventListener('cancel', () => { dialogo.remove(); alSalir(); });
    const cambiarDia = (f) => { estado.dia = f; d = f; calcularDia(); opciones = conFaena ? faenasParaAgregar(d) : []; elegirFaena(); };

    function elegirFaena() {
      tituloEl.textContent = conFaena ? '¿En qué faena?' : '¿Qué día?';
      subtitulo.textContent = diaLargo(d);
      cuerpo.replaceChildren(el('div', { class: 'modal-cuerpo asm-faenas' },
        el('div', { class: 'asm-atajos', role: 'group', 'aria-label': 'Día' }, dias.map((f) => el('button', { type: 'button', class: `asm-atajo${f === d ? ' activo' : ''}`, onclick: () => cambiarDia(f) }, `${nombreDia(f)} ${Number(f.slice(8))}`))),
        conFaena && !opciones.length ? el('p', { class: 'texto-suave texto-chico' }, 'Sin faenas este día.') : null,
        opciones.map((f) => el('button', { type: 'button', class: 'asm-grupo-cabeza', style: f.color ? `--asm-color:${f.color}` : '', onclick: () => elegirGente(f, true) },
          el('i', { 'aria-hidden': 'true' }), el('span', {}, f.texto),
          el('small', {}, f.conHoras ? `${f.conHoras} con horas` : f.planificados ? `${f.planificados} planif.` : ''), icono('derecha', { tam: 18 }))),
        el('button', { type: 'button', class: 'asm-otra-faena', onclick: () => elegirGente({ texto: '' }, true) }, conFaena ? 'Sin faena u otra' : 'Elegir gente')));
    }

    function elegirGente(f, conVolver) {
      const { plan, delDia, aus } = datosDia;
      const ausentes = new Set(aus.map((a) => a.persona_id));
      const k = clave(f.texto);
      const delPlan = (v) => !!k && clave(plan.get(v.persona_id)?.faena) === k;
      const horasDe = (v) => delDia.filter((r) => r.persona_id === v.persona_id);
      const gente = activos.filter((v) => !ausentes.has(v.persona_id))
        .sort((a, b) => delPlan(b) - delPlan(a) || (horasDe(a).length > 0) - (horasDe(b).length > 0));   // planificados, sin horas, con horas
      const planificado = gente.find(delPlan) ? plan.get(gente.find(delPlan).persona_id) : null;
      const marcados = new Set();
      const h = camposHorario({ inicial: planificado?.entrada || f.entrada || HORARIO_BASE.split('-')[0], final: planificado?.salida || f.salida || HORARIO_BASE.split('-')[1], editable: true });
      tituloEl.textContent = f.texto || 'Sin faena u otra';
      subtitulo.textContent = `${diaLargo(d)} · marca a la gente`;
      const faena = el('input', { class: 'campo', list: 'asm-faenas-agregar', placeholder: 'Elige o escribe', autocomplete: 'off', value: f.texto });
      const listaFaenas = el('datalist', { id: 'asm-faenas-agregar' }, opciones.map((o) => el('option', { value: o.texto })));
      const buscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar trabajador', 'aria-label': 'Buscar trabajador' });
      const filas = el('div', { class: 'asm-gente' });
      const error = el('p', { class: 'asm-error', role: 'alert', hidden: true });
      const btn = boton('Marca a alguien', { tipo: 'primario', type: 'submit', disabled: true });
      const contar = () => { const n = marcados.size; btn.disabled = !n; btn.textContent = n ? `Agregar ${n === 1 ? 'a 1 persona' : `a ${n} personas`}` : 'Marca a alguien'; };
      const planificados = gente.filter(delPlan);
      const marcarPlan = planificados.length > 1 ? el('button', { type: 'button', class: 'asm-planificados', onclick: () => { planificados.forEach((v) => marcados.add(v.persona_id)); pintarGente(); } }, icono('check', { tam: 16 }), `Marcar los ${planificados.length} planificados`) : null;
      function pintarGente() {
        const texto = clave(buscar.value);
        filas.replaceChildren(...gente.filter((v) => !texto || clave(`${nombre(v.personas)} ${v.cargo ?? ''}`).includes(texto)).map((v) => {
          const marcado = marcados.has(v.persona_id);
          const ya = horasDe(v);
          return el('button', { type: 'button', class: `asm-persona asm-elegir${marcado ? ' marcada' : ''}`, role: 'checkbox', 'aria-checked': String(marcado),
            onclick: () => { if (marcado) marcados.delete(v.persona_id); else marcados.add(v.persona_id); pintarGente(); } },
          el('span', { class: 'asm-marca-chica', 'aria-hidden': 'true' }, marcado ? icono('check', { tam: 18 }) : iniciales(v.personas)),
          el('span', { class: 'asm-persona-texto' }, el('strong', {}, nombre(v.personas)),
            el('span', { class: 'texto-suave texto-chico' }, delPlan(v) ? 'Planificado aquí' : ya.length ? `Ya tiene ${ya.map((r) => `${hhmm(r.entrada)}–${hhmm(r.salida)}`).join(', ')}` : v.cargo || 'Sin horas')));
        }));
        contar();
      }
      buscar.addEventListener('input', pintarGente);
      const guardar = async (ev) => {
        ev.preventDefault();
        error.hidden = true;
        if (h.salida.value && h.entrada.value === h.salida.value) { error.textContent = 'La entrada y la salida no pueden ser iguales.'; error.hidden = false; return; }
        const nombreFaena = conFaena ? faena.value.trim() : '';
        btn.disabled = true; btn.classList.add('cargando');
        const res = await ctx.api.from('asis_horas').insert([...marcados].map((persona_id) => ({ persona_id, fecha: d, empresa_id: ctx.empresa.id, entrada: h.entrada.value, salida: h.salida.value || null, faena: nombreFaena || null, vueltas: 0 }))).select('id');
        btn.classList.remove('cargando');
        if (res.error || !res.data?.length) { contar(); error.textContent = res.error?.message ?? 'No tienes permiso para guardar.'; error.hidden = false; return; }
        const n = marcados.size;
        cerrar();
        avisar(n === 1 ? 'Horas registradas.' : `Horas registradas a ${n} personas.`);
        pantalla.pestana = 'con'; pantalla.diaAbierto = d; pantalla.abiertas.add(`${d}|${clave(nombreFaena)}`);
        recargar();
      };
      cuerpo.replaceChildren(el('form', { class: 'modal-cuerpo asm-form', onsubmit: guardar },
        h.chips, h.filas, h.total,
        conFaena && !f.texto ? el('label', { class: 'asm-campo' }, el('span', {}, 'Faena'), faena) : null,
        conFaena && !f.texto ? listaFaenas : null,
        gente.length > 8 ? buscar : null,
        marcarPlan,
        filas,
        error,
        el('div', { class: 'modal-pie' }, conVolver ? boton('Volver', { onclick: elegirFaena }) : boton('Cancelar', { onclick: () => cerrar() }), btn)));
      pintarGente(); h.iniciar();
    }

    document.body.append(dialogo);
    dialogo.showModal();
    if (faenaInicial) elegirGente(faenaInicial, false);
    else elegirFaena();
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
    const conVueltas = !varias && (Number(r?.vueltas) > 0 || /chofer|conductor/i.test(v?.cargo ?? ''));
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
  const registrar = puedeCrear ? el('div', { class: 'asm-registrar' }, boton('Agregar', { tipo: 'primario', icono: 'mas', onclick: () => agregar() })) : null;
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
    if (!pantalla.pestana) pantalla.pestana = delDia.length ? 'con' : 'sin';
  }

  const coincide = (v) => !pantalla.buscar.trim() || clave(`${v ? nombre(v.personas) : ''} ${v?.cargo ?? ''}`).includes(clave(pantalla.buscar));
  const avatar = (v) => el('span', { class: 'asm-avatar', 'aria-hidden': 'true' }, v ? iniciales(v.personas) : '?');

  function tarjetaHoras(r) {
    const v = personas.get(r.persona_id);
    const chip = r.origen === 'horario' ? [(r.notas ?? '').startsWith('Corregido') ? 'corregido' : 'según horario', 'chip-ok']
      : r.origen === 'marcaje' ? [(r.notas ?? '').includes('terreno') ? 'terreno' : 'tablet', 'chip-pend'] : null;
    return el('button', { type: 'button', class: `asm-persona${datosDia.pisan.has(r.id) ? ' pisa' : ''}`, onclick: () => hoja({ r }) },
      avatar(v),
      el('span', { class: 'asm-persona-texto' },
        el('strong', {}, v ? nombre(v.personas) : 'Persona sin vínculo'),
        el('span', { class: 'asm-horario' }, `${hhmm(r.entrada)} – ${hhmm(r.salida) || '…'}`, r.salida ? el('b', {}, horas(minutosRegistro(r))) : el('span', { class: 'chip chip-prox' }, 'Sin salida'), chip ? el('span', { class: `chip ${chip[1]}` }, chip[0]) : null),
        datosDia.pisan.has(r.id) ? el('span', { class: 'texto-chico pct-mal' }, 'Se pisa con otra hora ese día') : null),
      icono('derecha', { tam: 18 }));
  }

  function pintarLista() {
    const { delDia, aus, sin, plan } = datosDia;
    let contenido = [];
    if (pantalla.pestana === 'con') {
      const grupos = new Map();
      for (const r of delDia) {
        if (!pasaFiltroFaena(r) || !coincide(personas.get(r.persona_id))) continue;
        const k = clave(r.faena); if (!grupos.has(k)) grupos.set(k, { texto: r.faena, filas: [] });
        grupos.get(k).filas.push(r);
      }
      contenido = [...grupos.entries()].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b)).map(([k, g]) => {
        // Las faenas parten plegadas; al buscar o filtrar se abren para ver lo encontrado
        const conCabeza = verOpe || !!g.texto;
        const llave = `${estado.dia}|${k}`;
        const abierto = !conCabeza || !!pantalla.buscar.trim() || !!estado.filtro || pantalla.abiertas.has(llave);
        const cuerpo = el('div', { class: 'asm-grupo-cuerpo', hidden: !abierto }, g.filas.map(tarjetaHoras),
          puedeCrear ? el('button', { type: 'button', class: 'asm-planificados', onclick: () => agregar({ texto: g.texto ?? '', entrada: '', salida: '' }) }, icono('mas', { tam: 16 }), g.texto ? 'Agregar persona en esta faena' : 'Agregar persona') : null);
        const cabeza = conCabeza ? el('button', { type: 'button', class: 'asm-grupo-cabeza', 'aria-expanded': String(abierto), onclick: () => {
          const abrir = cuerpo.hidden; cuerpo.hidden = !abrir; cabeza.setAttribute('aria-expanded', String(abrir));
          if (abrir) pantalla.abiertas.add(llave); else pantalla.abiertas.delete(llave);
        } }, el('i', { 'aria-hidden': 'true' }), el('span', {}, g.texto || 'Sin faena'), el('small', {}, `${g.filas.length} · ${horas(g.filas.reduce((s, r) => s + minutosRegistro(r), 0))}`), icono('derecha', { tam: 18 })) : null;
        return el('div', { class: 'asm-grupo', style: colorFaena.get(k) ? `--asm-color:${colorFaena.get(k)}` : '' }, cabeza, cuerpo);
      });
      if (!contenido.length) contenido = [el('div', { class: 'tm-vacio' }, el('span', {}, pantalla.buscar ? 'Nadie con ese nombre.' : 'Nadie con horas este día.'))];
    } else if (pantalla.pestana === 'sin') {
      const visibles = sin.filter(coincide);
      const planificados = visibles.filter((v) => plan.has(v.persona_id));
      contenido = [
        puedeCrear && planificados.length > 1 ? el('button', { type: 'button', class: 'asm-planificados', onclick: () => { planificados.forEach((v) => pantalla.marcados.add(v.persona_id)); pintarLista(); } },
          icono('check', { tam: 16 }), `Marcar los ${planificados.length} planificados`) : null,
        ...visibles.map((v) => {
          const p = plan.get(v.persona_id);
          const marcado = pantalla.marcados.has(v.persona_id);
          return el('div', { class: `asm-persona asm-sin${marcado ? ' marcada' : ''}` },
            puedeCrear ? el('button', { type: 'button', class: 'asm-marca', role: 'checkbox', 'aria-checked': String(marcado), 'aria-label': `Marcar a ${nombre(v.personas)}`,
              onclick: () => { if (marcado) pantalla.marcados.delete(v.persona_id); else pantalla.marcados.add(v.persona_id); pintarLista(); } }, marcado ? icono('check', { tam: 18 }) : avatar(v)) : avatar(v),
            el('button', { type: 'button', class: 'asm-persona-abrir', disabled: !puedeCrear, onclick: () => hoja({ ids: [v.persona_id], plan: p }) },
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
    const n = pantalla.marcados.size;
    barraVarios.hidden = !(n && pantalla.pestana === 'sin');
    barraVarios.replaceChildren(
      el('button', { type: 'button', class: 'asm-limpiar', onclick: () => { pantalla.marcados.clear(); pintarLista(); } }, 'Limpiar'),
      boton(`Registrar a ${n}`, { tipo: 'primario', icono: 'reloj', onclick: () => { const ids = [...pantalla.marcados]; hoja({ ids, plan: ids.length && ids.every((x) => plan.get(x)?.faena === plan.get(ids[0])?.faena) ? plan.get(ids[0]) : null }); } }));
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
    pantalla.pestana = null; pantalla.marcados.clear();
    pintarSemana();
  };
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
  if (abrirAgregar) agregar();

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
    registrar, filtro, listaDias, otrosDias, barraVarios);
}
