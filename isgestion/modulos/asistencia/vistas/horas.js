// Registro de horas tipo planilla (como InnovaGestión): semana con sus días; el día elegido muestra sus registros
// agrupados por faena con el color del cliente; cada fila se edita ahí mismo y se guarda sola al cambiar
// (persona con búsqueda por teclado, faena, entrada, salida, vueltas), "+ persona en esta faena", aviso en rojo de
// horas que se pisan y, abajo, los vehículos y la preparación del día (desde Planificación).
// Las horas del marcaje (tablet o terreno) se corrigen en Marcajes. "Agregar horas" carga el mismo horario a varios.
import { el } from '../../../core/ui/dom.js?v=30360b8';
import { icono } from '../../../core/ui/iconos.js?v=30360b8';
import { boton } from '../../../core/ui/tabla.js?v=30360b8';
import { abrirFormulario } from '../../../core/ui/modal.js?v=30360b8';
import { avisar } from '../../../core/ui/aviso.js?v=30360b8';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, horas, aMin, hhmm } from '../../../core/ui/formato.js?v=30360b8';

const estado = { lunes: lunesDe(hoyISO()), dia: hoyISO(), nuevas: [] };   // nuevas: filas en blanco aún sin guardar

const nombre = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
export function minutosRegistro(h) {
  const a = aMin(h.entrada); let b = aMin(h.salida);
  if (b <= a) b += 1440;   // termina al día siguiente
  return b - a;
}
const clave = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·—-]+/g, ' ').replace(/\s+/g, ' ');

export default async function vista(ctx) {
  const desde = estado.lunes;
  const hasta = sumarDias(desde, 6);
  if (estado.dia < desde || estado.dia > hasta) estado.dia = desde;
  const verOpe = ctx.puede('ope', 'ver');

  const [regs, vinculos, faenas, colores, planes] = await Promise.all([
    ctx.api.from('asis_horas').select('id, persona_id, fecha, entrada, salida, faena, vueltas, notas, origen')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('entrada'),
    ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
    verOpe ? ctx.api.from('ope_faenas').select('id, titulo, tercero_id, fecha_inicio, fecha_fin, dias, terceros(nombre_fantasia, razon_social), ope_sitios(nombre)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'programada').lte('fecha_inicio', hasta).gte('fecha_fin', desde) : { data: [] },
    verOpe ? ctx.api.from('ope_clientes').select('tercero_id, color').eq('empresa_id', ctx.empresa.id) : { data: [] },
    verOpe ? ctx.api.from('ope_plan').select('id, faena_id, fecha, ope_plan_vehiculos(vehiculo, personas(nombres, apellido_paterno))').eq('empresa_id', ctx.empresa.id).eq('fecha', estado.dia) : { data: [] },
  ]);
  if (regs.error) throw regs.error;
  if (vinculos.error) throw vinculos.error;

  const personas = new Map(vinculos.data.map((v) => [v.persona_id, v]));
  const activos = vinculos.data.filter((v) => v.estado === 'activo').sort((a, b) => nombre(a.personas).localeCompare(nombre(b.personas)));
  const porDia = new Map();
  for (const r of regs.data) { if (!porDia.has(r.fecha)) porDia.set(r.fecha, []); porDia.get(r.fecha).push(r); }

  // Faenas (texto como lo escriben Planificación y el marcaje) y su color de cliente
  const colorDe = new Map((colores.data ?? []).map((c) => [c.tercero_id, c.color]));
  const textoFaena = (f) => [f.terceros?.nombre_fantasia || f.terceros?.razon_social || 'Interno', f.ope_sitios?.nombre, f.titulo].filter(Boolean).join(' · ');
  const faenasDia = (faenas.data ?? []).filter((f) => f.fecha_inicio <= estado.dia && f.fecha_fin >= estado.dia && (!f.dias?.length || f.dias.includes(estado.dia)))
    .map((f) => ({ id: f.id, texto: textoFaena(f), color: colorDe.get(f.tercero_id) ?? null }));
  const colorFaena = (texto) => {
    const k = clave(texto); if (!k) return null;
    return faenasDia.find((f) => clave(f.texto) === k)?.color ?? (faenas.data ?? []).map((f) => ({ k: clave(textoFaena(f)), c: colorDe.get(f.tercero_id) })).find((x) => x.k === k)?.c ?? null;
  };

  const puedeCrear = ctx.puede('asistencia', 'crear');
  const puedeEditar = ctx.puede('asistencia', 'editar');
  const puedeEliminar = ctx.puede('asistencia', 'eliminar');

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); estado.dia = estado.lunes; estado.nuevas = []; ctx.refrescar(); };
  const navegacion = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, `Semana ${numSemana(desde)} · ${fechaCorta(desde)} – ${fechaCorta(hasta)}`),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')),
    boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); estado.dia = hoyISO(); estado.nuevas = []; ctx.refrescar(); } }));

  const dias = el('div', { class: 'dias-semana', role: 'tablist' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const f = sumarDias(desde, i);
    const lista = porDia.get(f) ?? [];
    const min = lista.reduce((s, r) => s + minutosRegistro(r), 0);
    return el('button', {
      type: 'button', role: 'tab', class: `dia-tarjeta ${f === hoyISO() ? 'hoy' : ''}`, 'aria-selected': String(f === estado.dia),
      onclick: () => { estado.dia = f; estado.nuevas = []; ctx.refrescar(); },
    }, el('span', {}, `${nombreDia(f)} ${Number(f.slice(8))}`),
      el('strong', {}, lista.length ? `${new Set(lista.map((r) => r.persona_id)).size} pers.` : '—'),
      el('span', { class: 'texto-suave texto-chico' }, min ? horas(min) : ''));
  }));

  // ---- Planilla del día
  const delDia = porDia.get(estado.dia) ?? [];
  // Horas que se pisan: misma persona, mismo día, horarios solapados
  const pisan = new Set();
  const iv = (r) => { const a = aMin(r.entrada); return [a, a + minutosRegistro(r)]; };
  for (let i = 0; i < delDia.length; i++) for (let j = i + 1; j < delDia.length; j++) {
    const a = delDia[i]; const b = delDia[j];
    if (a.persona_id !== b.persona_id) continue;
    const [a0, a1] = iv(a); const [b0, b1] = iv(b);
    if (a0 < b1 && b0 < a1) { pisan.add(a.id); pisan.add(b.id); }
  }
  const listaPersonas = el('datalist', { id: 'hz-personas' }, activos.map((v) => el('option', { value: `${nombre(v.personas)}${v.cargo ? ` · ${v.cargo}` : ''}` })));
  const listaFaenas = el('datalist', { id: 'hz-faenas' }, faenasDia.map((f) => el('option', { value: f.texto })));
  const personaDeTexto = (t) => {
    const k = clave(t).replace(/ · .*$/, ''); if (!k) return null;
    const exactos = activos.filter((v) => clave(`${nombre(v.personas)}${v.cargo ? ` · ${v.cargo}` : ''}`) === clave(t) || clave(nombre(v.personas)) === k);
    if (exactos.length === 1) return exactos[0].persona_id;
    const parecidos = activos.filter((v) => k.split(' ').every((p) => clave(nombre(v.personas)).includes(p)));
    return parecidos.length === 1 ? parecidos[0].persona_id : null;
  };

  // Guarda una fila existente al cambiar (persona no se cambia: se elimina y se crea otra)
  const guardarFila = async (r, campos, tr) => {
    const entrada = campos.entrada.value; const salida = campos.salida.value;
    if (!entrada || !salida) return;
    if (entrada === salida) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
    const cambios = { entrada, salida, faena: campos.faena.value.trim() || null, vueltas: Math.max(0, Number(campos.vueltas.value) || 0) };
    if (hhmm(r.entrada) === entrada && hhmm(r.salida) === salida && (r.faena ?? null) === cambios.faena && (r.vueltas || 0) === cambios.vueltas) return;
    tr.classList.add('hz-guardando');
    const { data, error } = await ctx.api.from('asis_horas').update(cambios).eq('id', r.id).select('id');
    tr.classList.remove('hz-guardando');
    if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para editar.', 'error'); return; }
    avisar('Guardado.'); ctx.refrescar();
  };
  // Fila nueva: se guarda cuando tiene persona, entrada y salida
  const guardarNueva = async (n, campos) => {
    const persona_id = personaDeTexto(campos.persona.value);
    if (!campos.persona.value.trim() || !campos.entrada.value || !campos.salida.value) return;
    if (!persona_id) { campos.persona.classList.add('campo-error'); avisar('Elige a la persona de la lista (nombre con ficha activa).', 'error'); return; }
    if (campos.entrada.value === campos.salida.value) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
    const { error } = await ctx.api.from('asis_horas').insert({ empresa_id: ctx.empresa.id, persona_id, fecha: estado.dia, entrada: campos.entrada.value, salida: campos.salida.value,
      faena: campos.faena.value.trim() || null, vueltas: Math.max(0, Number(campos.vueltas.value) || 0) });
    if (error) { avisar(error.message, 'error'); return; }
    estado.nuevas = estado.nuevas.filter((x) => x !== n);
    avisar('Hora registrada.'); ctx.refrescar();
  };

  const fila = (r, nueva = null) => {
    const desdeMarcaje = r?.origen === 'marcaje';
    const editable = nueva ? puedeCrear : puedeEditar && !desdeMarcaje;
    const persona = nueva
      ? el('input', { class: 'campo hz-persona', list: 'hz-personas', placeholder: 'Trabajador', autocomplete: 'off', value: nueva.persona ?? '', 'aria-label': 'Trabajador' })
      : el('span', { class: 'hz-nombre' }, personas.get(r.persona_id) ? nombre(personas.get(r.persona_id).personas) : 'Persona sin vínculo');
    const faena = el('input', { class: 'campo hz-faena', list: 'hz-faenas', placeholder: 'Faena', value: nueva ? nueva.faena ?? '' : r.faena ?? '', disabled: !editable, 'aria-label': 'Faena' });
    const entrada = el('input', { type: 'time', class: 'campo hz-hora', value: nueva ? '' : hhmm(r.entrada), disabled: !editable, 'aria-label': 'Entrada' });
    const salida = el('input', { type: 'time', class: 'campo hz-hora', value: nueva ? '' : hhmm(r.salida), disabled: !editable, 'aria-label': 'Salida' });
    const vueltas = el('input', { type: 'number', min: '0', class: 'campo hz-vueltas', value: nueva ? '0' : String(r.vueltas || 0), disabled: !editable, 'aria-label': 'Vueltas', title: 'Vueltas (choferes)' });
    const total = el('span', { class: 'hz-total texto-chico' }, nueva ? '' : `${horas(minutosRegistro(r))}${aMin(r.salida) <= aMin(r.entrada) ? ' (+1 día)' : ''}`);
    const tr = el('tr', { class: `${pisan.has(r?.id) ? 'hz-pisa' : ''}${nueva ? ' hz-nueva' : ''}` },
      el('td', {}, persona, desdeMarcaje ? el('span', { class: 'chip chip-pend', title: 'Del marcaje: se corrige en Asistencia → Marcajes' }, (r.notas ?? '').includes('terreno') ? 'terreno' : 'tablet') : null,
        pisan.has(r?.id) ? el('div', { class: 'texto-chico pct-mal' }, 'Se pisa con otra hora de esta persona ese día') : null),
      el('td', {}, faena), el('td', { class: 'hz-horario' }, entrada, el('span', { class: 'texto-suave' }, '→'), salida), el('td', {}, total), el('td', {}, vueltas),
      el('td', { class: 'acciones-fila' },
        nueva ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar fila', 'aria-label': 'Quitar fila', onclick: () => { estado.nuevas = estado.nuevas.filter((x) => x !== nueva); ctx.refrescar(); } }, icono('cerrar', { tam: 16 }))
          : puedeEliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar registro', onclick: () => eliminar(ctx, r) }, icono('basura', { tam: 16 })) : null));
    const campos = { persona, faena, entrada, salida, vueltas };
    const alCambiar = () => {
      if (entrada.value && salida.value) total.textContent = horas(minutosRegistro({ entrada: entrada.value, salida: salida.value }));
      if (nueva) { Object.assign(nueva, { persona: persona.value, faena: faena.value }); guardarNueva(nueva, campos); } else guardarFila(r, campos, tr);
    };
    for (const c of [faena, entrada, salida, vueltas, nueva ? persona : null]) if (c) c.addEventListener('change', alCambiar);
    if (nueva) persona.addEventListener('input', () => persona.classList.remove('campo-error'));
    return tr;
  };

  // Agrupar por faena (las nuevas, en la faena desde la que se agregaron)
  const grupos = new Map();
  const grupoDe = (texto) => { const k = clave(texto) || ''; if (!grupos.has(k)) grupos.set(k, { texto: String(texto ?? '').trim(), filas: [] }); return grupos.get(k); };
  for (const r of delDia) grupoDe(r.faena).filas.push(fila(r));
  for (const n of estado.nuevas) grupoDe(n.faena).filas.push(fila(null, n));
  for (const f of faenasDia) grupoDe(f.texto);   // las faenas del día aparecen aunque no tengan horas aún
  const orden = [...grupos.entries()].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b));
  const agregarEn = (texto) => { estado.nuevas.push({ faena: texto, persona: '' }); ctx.refrescar(); };
  const bloques = orden.map(([k, g]) => {
    const color = colorFaena(g.texto);
    const min = delDia.filter((r) => clave(r.faena) === k).reduce((s, r) => s + minutosRegistro(r), 0);
    return el('div', { class: 'hz-grupo', style: color ? `--hz-color:${color}` : '' },
      el('div', { class: 'hz-grupo-cabeza' }, el('strong', {}, g.texto || 'Sin faena'),
        el('span', { class: 'texto-suave texto-chico' }, g.filas.length ? `${g.filas.length} registro${g.filas.length > 1 ? 's' : ''} · ${horas(min)}` : 'sin horas aún')),
      g.filas.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla hz-tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Faena', 'Horario', 'Horas', 'Vueltas', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, g.filas))) : null,
      puedeCrear ? el('button', { type: 'button', class: 'boton-enlace hz-agregar', onclick: () => agregarEn(g.texto) }, icono('mas', { tam: 14 }), g.texto ? 'persona en esta faena' : 'persona (sin faena)') : null);
  });

  // Vehículos y preparación del día (desde Planificación)
  const vehiculos = (planes.data ?? []).flatMap((p) => (p.ope_plan_vehiculos ?? []).map((v) => ({ p, v })));
  const jornada = verOpe ? el('div', { class: 'ficha hz-jornada' },
    el('h2', {}, 'Vehículos y preparación del día'),
    vehiculos.length ? el('div', { class: 'chips-fila' }, vehiculos.map(({ p, v }) => el('span', { class: 'chip chip-na' }, icono('camion', { tam: 12 }),
      ` ${v.vehiculo}${v.personas ? ` · ${v.personas.nombres.split(' ')[0]} ${v.personas.apellido_paterno}` : ''}${faenasDia.find((f) => f.id === p.faena_id) ? ` · ${faenasDia.find((f) => f.id === p.faena_id).texto}` : ''}`)))
      : el('p', { class: 'texto-suave' }, 'Sin vehículos planificados este día.'),
    (planes.data ?? []).length ? el('div', { class: 'chips-fila' }, (planes.data ?? []).map((p) => el('a', { class: 'boton-enlace', href: ctx.ruta('ope.plan', { f: p.faena_id, d: estado.dia }) },
      icono('check', { tam: 14 }), `Preparación · ${faenasDia.find((f) => f.id === p.faena_id)?.texto ?? 'faena'}`))) : null) : null;

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Registro de horas'),
      el('div', { class: 'listado-acciones' },
        puedeCrear ? boton('Agregar horas a varios', { icono: 'mas', tipo: 'primario', onclick: () => agregar(ctx, activos) }) : null)),
    navegacion,
    dias,
    listaPersonas, listaFaenas,
    el('h2', { class: 'hz-dia-titulo' }, `${nombreDia(estado.dia)} ${fechaCorta(estado.dia)}`,
      el('span', { class: 'texto-suave texto-chico' }, delDia.length ? ` · ${new Set(delDia.map((r) => r.persona_id)).size} personas · ${horas(delDia.reduce((s, r) => s + minutosRegistro(r), 0))}` : ' · sin registros')),
    bloques.length ? bloques : el('p', { class: 'texto-suave' }, 'Sin registros ni faenas este día.'),
    jornada,
    el('p', { class: 'texto-suave texto-chico' }, 'Cada fila se guarda sola al cambiar un dato. Si la salida es menor que la entrada, el turno termina al día siguiente. Las horas que se pisan se marcan en rojo y al pagar se cuentan una sola vez. Las del marcaje (tablet o terreno) se corrigen en Marcajes.'),
  );
}

function campos(r, activos, varios) {
  const opciones = activos.map((v) => [v.persona_id, `${nombre(v.personas)}${v.cargo ? ` · ${v.cargo}` : ''}`]);
  return [
    varios
      ? { id: 'personas', etiqueta: 'Personas (puedes marcar varias)', tipo: 'checks', opciones }
      : { id: 'persona', etiqueta: 'Persona', opciones, valor: r?.persona_id },
    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: r?.fecha ?? estado.dia },
    { id: 'entrada', etiqueta: 'Entrada', tipo: 'time', requerido: true, valor: r ? hhmm(r.entrada) : '08:00' },
    { id: 'salida', etiqueta: 'Salida', tipo: 'time', requerido: true, valor: r ? hhmm(r.salida) : '17:00' },
    { id: 'faena', etiqueta: 'Faena o lugar', valor: r?.faena ?? '' },
    { id: 'vueltas', etiqueta: 'Vueltas (choferes)', tipo: 'number', valor: String(r?.vueltas ?? 0) },
    { id: 'notas', etiqueta: 'Notas', valor: r?.notas ?? '' },
  ];
}

const datosDe = (v) => {
  if (v.entrada === v.salida) throw new Error('La entrada y la salida no pueden ser iguales.');
  return { fecha: v.fecha, entrada: v.entrada, salida: v.salida, faena: v.faena.trim() || null, vueltas: Number(v.vueltas) || 0, notas: v.notas.trim() || null };
};

function agregar(ctx, activos) {
  abrirFormulario({
    titulo: 'Agregar horas',
    campos: campos(null, activos, true),
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      if (!v.personas.length) throw new Error('Marca al menos una persona.');
      const base = datosDe(v);
      const filas = v.personas.map((persona_id) => ({ ...base, persona_id, empresa_id: ctx.empresa.id }));
      const { error } = await ctx.api.from('asis_horas').insert(filas);
      if (error) throw new Error(error.message);
      estado.dia = base.fecha; estado.lunes = lunesDe(base.fecha);
      avisar(`Se registraron horas para ${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}.`);
      ctx.refrescar();
    },
  });
}

function editar(ctx, r, activos) {
  abrirFormulario({
    titulo: 'Editar registro',
    campos: campos(r, activos, false).map((c) => (c.id === 'persona' ? { ...c, etiqueta: 'Persona (no se cambia; elimina y crea uno nuevo)' } : c)),
    alGuardar: async (v) => {
      const cambios = datosDe(v);
      const { data, error } = await ctx.api.from('asis_horas').update(cambios).eq('id', r.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('No tienes permiso para editar.');
      estado.dia = cambios.fecha; estado.lunes = lunesDe(cambios.fecha);
      avisar('Registro actualizado.');
      ctx.refrescar();
    },
  });
  // La persona no se cambia: se muestra bloqueada
  setTimeout(() => { const s = document.querySelector('dialog[open] select[name="persona"]'); if (s) s.disabled = true; }, 0);
}

function eliminar(ctx, r) {
  abrirFormulario({
    titulo: 'Eliminar registro',
    mensaje: `${hhmm(r.entrada)} – ${hhmm(r.salida)} del ${fechaCorta(r.fecha)}. Deja de contar para el pago (queda en la auditoría).`,
    campos: [],
    textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { data, error } = await ctx.api.from('asis_horas').delete().eq('id', r.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('No tienes permiso para eliminar.');
      avisar('Registro eliminado.');
      ctx.refrescar();
    },
  });
}
