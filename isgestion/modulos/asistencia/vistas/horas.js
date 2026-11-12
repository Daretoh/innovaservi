// Registro de horas tipo planilla (como InnovaGestión): la semana y, abajo, los días con horas cargadas (se abren al tocarlos),
// cada uno agrupado por faena con el color del cliente, con filtro por faena; cada fila se edita ahí mismo y se guarda sola al cambiar
// (persona con búsqueda por teclado, faena, entrada, salida, vueltas), "+ persona en esta faena", aviso en rojo de
// horas que se pisan y, abajo, los vehículos y la preparación del día (desde Planificación).
// Las horas del marcaje (tablet o terreno) se corrigen en Marcajes. "Agregar horas" carga el mismo horario a varios.
// Fijos con turno (2026-10-30): cada día hábil quedan presentes "según horario" solos (asis_generar_fijos); aquí solo se
// corrigen las excepciones: retraso o salida temprana (cambiar la hora), horas extra (cambiar la salida o agregar otra
// fila) y ausencias (botón Ausente: el día deja de contar y no se vuelve a crear).
import { el } from '../../../core/ui/dom.js?v=5a36f48';
import { icono } from '../../../core/ui/iconos.js?v=5a36f48';
import { boton } from '../../../core/ui/tabla.js?v=5a36f48';
import { abrirFormulario } from '../../../core/ui/modal.js?v=5a36f48';
import { arrastrarHorario } from './arrastre.js?v=5a36f48';
import { avisar } from '../../../core/ui/aviso.js?v=5a36f48';
import { esTelefono } from '../../../core/movil.js?v=5a36f48';
import { hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana, horas, aMin, hhmm } from '../../../core/ui/formato.js?v=5a36f48';

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const estado = { lunes: lunesDe(hoyISO()), dia: hoyISO(), nuevas: [], abiertas: new Set(), diasAbiertos: new Set(), filtro: '', borradorLeido: new Set() };   // abiertas: faenas desplegadas (día|faena)   // nuevas: filas en blanco aún sin guardar

const nombre = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
export function minutosRegistro(h) {
  if (!h.entrada || !h.salida) return 0;   // sin salida (Asistencia 007): no cuenta hasta completarla
  const a = aMin(h.entrada); let b = aMin(h.salida);
  if (b <= a) b += 1440;   // termina al día siguiente
  return b - a;
}
const clave = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·—-]+/g, ' ').replace(/\s+/g, ' ');

export default async function vista(ctx) {
  if (esTelefono()) return (await import('./horas-movil.js?v=5a36f48')).default(ctx);   // en el teléfono, lista de personas en vez de planilla
  const desde = estado.lunes;
  const hasta = sumarDias(desde, 6);
  const hoy = hoyISO();
  if (estado.dia < desde || estado.dia > hasta) estado.dia = hoy >= desde && hoy <= hasta ? hoy : desde;
  const verOpe = ctx.puede('ope', 'ver');
  const CLAVE_BORRADOR = `isg.horas.borrador.${ctx.empresa.id}`;
  if (!estado.borradorLeido.has(ctx.empresa.id)) {
    estado.borradorLeido.add(ctx.empresa.id);
    try {
      const guardadas = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || '[]');
      for (const n of guardadas) if (n?.uid && n.fecha && !estado.nuevas.some((x) => x.uid === n.uid)) estado.nuevas.push({ ...n, empresa: ctx.empresa.id, guardando: false });
    } catch { /* sin almacenamiento */ }
  }
  const guardarBorrador = () => {
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(estado.nuevas.filter((n) => n.empresa === ctx.empresa.id).map(({ guardando, ...n }) => n))); } catch { /* sin almacenamiento */ }
  };

  // Guardar sin perder el campo: al volver a armar la pantalla se devuelve el foco (y lo escrito en una fila nueva) al mismo
  // campo, y el desplazamiento. Antes el foco quedaba en la página y el siguiente Tab llevaba arriba (Enzo, 2026-11-09)
  const refrescar = async (renombrar = null, enfocar = null) => {
    const a = document.activeElement;
    let llave = enfocar ?? a?.dataset?.hz ?? null;
    if (llave && renombrar && llave.startsWith(`${renombrar[0]}|`)) llave = renombrar[1] + llave.slice(renombrar[0].length);
    const valor = !enfocar && a?.closest?.('.hz-nueva') ? a.value : null;
    const cajas = []; for (let n = a?.parentElement; n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) cajas.push([n, n.scrollTop]);
    const y = scrollY;
    await ctx.refrescar();
    await new Promise((ok) => { requestAnimationFrame(ok); setTimeout(ok, 60); });   // sin cuadros (pestaña en segundo plano) igual sigue
    for (const [n, top] of cajas) if (n.isConnected) n.scrollTop = top;
    scrollTo({ top: y });
    const nuevo = llave ? document.querySelector(`[data-hz="${CSS.escape(llave)}"]`) : null;
    if (!nuevo) return;
    nuevo.focus({ preventScroll: true });
    if (valor != null && nuevo.value !== valor) { nuevo.value = valor; nuevo.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (enfocar || nuevo.type !== 'time') nuevo.select?.();
  };

  // Fijos con turno: se crean los días que falten según su horario (no espera al cron)
  if (ctx.puede('remu', 'ver') || ctx.puede('asistencia', 'ver')) await ctx.api.rpc('asis_generar_fijos', { p_empresa: ctx.empresa.id }).then(() => {}, () => {});
  const [regs, vinculos, faenas, colores, planes, ausencias] = await Promise.all([
    ctx.api.from('asis_horas').select('id, persona_id, fecha, entrada, salida, faena, vueltas, notas, origen')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('entrada'),
    ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
    verOpe ? ctx.api.from('ope_faenas').select('id, titulo, tercero_id, fecha_inicio, fecha_fin, dias, terceros(nombre_fantasia, razon_social), ope_sitios(nombre)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'programada').lte('fecha_inicio', hasta).gte('fecha_fin', desde) : { data: [] },
    verOpe ? ctx.api.from('ope_clientes').select('tercero_id, color').eq('empresa_id', ctx.empresa.id) : { data: [] },
    verOpe ? ctx.api.from('ope_plan').select('id, faena_id, fecha, ope_plan_vehiculos(vehiculo, personas(nombres, apellido_paterno))').eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta) : { data: [] },
    ctx.api.from('asis_horas').select('id, persona_id, fecha, notas').eq('empresa_id', ctx.empresa.id).eq('origen', 'horario').not('deleted_at', 'is', null).like('notas', 'Ausente%').gte('fecha', desde).lte('fecha', hasta),
  ]);
  if (regs.error) throw regs.error;
  if (vinculos.error) throw vinculos.error;

  const personas = new Map(vinculos.data.map((v) => [v.persona_id, v]));
  const activos = vinculos.data.filter((v) => v.estado === 'activo').sort((a, b) => nombre(a.personas).localeCompare(nombre(b.personas)));
  const porDia = new Map();
  for (const r of regs.data) { if (!porDia.has(r.fecha)) porDia.set(r.fecha, []); porDia.get(r.fecha).push(r); }
  const diasSemana = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(desde, i));

  // Faenas (texto como lo escriben Planificación y el marcaje) y su color de cliente
  const colorDe = new Map((colores.data ?? []).map((c) => [c.tercero_id, c.color]));
  const textoFaena = (f) => [f.terceros?.nombre_fantasia || f.terceros?.razon_social || 'Interno', f.ope_sitios?.nombre, f.titulo].filter(Boolean).join(' · ');
  const faenasDe = (d) => (faenas.data ?? []).filter((f) => f.fecha_inicio <= d && f.fecha_fin >= d && (!f.dias?.length || f.dias.includes(d)))
    .map((f) => ({ id: f.id, texto: textoFaena(f), color: colorDe.get(f.tercero_id) ?? null }));
  const colorFaena = (texto) => {
    const k = clave(texto); if (!k) return null;
    return (faenas.data ?? []).map((f) => ({ k: clave(textoFaena(f)), c: colorDe.get(f.tercero_id) })).find((x) => x.k === k)?.c ?? null;
  };

  const puedeCrear = ctx.puede('asistencia', 'crear');
  const puedeEditar = ctx.puede('asistencia', 'editar');
  const puedeEliminar = ctx.puede('asistencia', 'eliminar');

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); estado.dia = estado.lunes; estado.diasAbiertos.clear(); ctx.refrescar(); };
  const navegacion = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, `Semana ${numSemana(desde)} · ${fechaCorta(desde)} – ${fechaCorta(hasta)}`),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')),
    boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); estado.dia = hoyISO(); estado.diasAbiertos.clear(); ctx.refrescar(); } }));

  // Faena: solo donde se usa Faenas y planificación (Innova); en las demás (Performance) no se muestra, salvo que la semana
  // ya tenga horas con faena escrita (2026-11-05)
  const conFaena = verOpe || regs.data.some((r) => r.faena);
  estado.conFaena = conFaena;
  const filtro = campoFiltroFaena(regs.data, () => ctx.refrescar());
  // Horas que se pisan: misma persona, mismo día, horarios solapados
  const pisan = new Set();
  const iv = (r) => { const a = aMin(r.entrada); return [a, a + minutosRegistro(r)]; };
  for (const delDia of porDia.values()) for (let i = 0; i < delDia.length; i++) for (let j = i + 1; j < delDia.length; j++) {
    const a = delDia[i]; const b = delDia[j];
    if (a.persona_id !== b.persona_id) continue;
    const [a0, a1] = iv(a); const [b0, b1] = iv(b);
    if (a0 < b1 && b0 < a1) { pisan.add(a.id); pisan.add(b.id); }
  }
  const listaPersonas = el('datalist', { id: 'hz-personas' }, activos.map((v) => el('option', { value: `${nombre(v.personas)}${v.cargo ? ` · ${v.cargo}` : ''}` })));
  const listasFaenas = diasSemana.map((d) => el('datalist', { id: `hz-faenas-${d}` }, faenasDe(d).map((f) => el('option', { value: f.texto }))));
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
    if (!entrada) return;
    if (entrada === salida) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
    const cambios = { entrada, salida: salida || null, faena: campos.faena.value.trim() || null, vueltas: Math.max(0, Number(campos.vueltas.value) || 0) };
    if (hhmm(r.entrada) === entrada && hhmm(r.salida) === salida && (r.faena ?? null) === cambios.faena && (r.vueltas || 0) === cambios.vueltas) return;
    tr.classList.add('hz-guardando');
    const { data, error } = await ctx.api.from('asis_horas').update(cambios).eq('id', r.id).select('id');
    tr.classList.remove('hz-guardando');
    if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para editar.', 'error'); return; }
    avisar('Guardado.'); refrescar();
  };
  // Fila nueva: se guarda cuando tiene persona, entrada y salida
  const guardarNueva = async (n, campos) => {
    const persona_id = personaDeTexto(campos.persona.value);
    if (n.guardando || !campos.persona.value.trim() || !campos.entrada.value || !campos.salida.value) return;   // incompleta: queda de borrador
    if (!persona_id) { campos.persona.classList.add('campo-error'); avisar('Elige a la persona de la lista (nombre con ficha activa).', 'error'); return; }
    if (campos.entrada.value === campos.salida.value) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
    n.guardando = true;
    const { data, error } = await ctx.api.from('asis_horas').insert({ empresa_id: ctx.empresa.id, persona_id, fecha: n.fecha, entrada: campos.entrada.value, salida: campos.salida.value,
      faena: campos.faena.value.trim() || null, vueltas: Math.max(0, Number(campos.vueltas.value) || 0) }).select('id');
    n.guardando = false;
    if (error) { avisar(error.message, 'error'); return; }
    estado.nuevas = estado.nuevas.filter((x) => x !== n); guardarBorrador();
    avisar('Hora registrada.'); refrescar([n.uid, data?.[0]?.id]);
  };

  const filasPorLlave = new Map();   // llave de la fila → { r, nueva, tr, campos }
  const fila = (r, nueva = null) => {
    const llave = r ? r.id : nueva.uid;
    const hz = (col) => ({ 'data-col': col, 'data-hz': `${llave}|${col}` });
    const desdeMarcaje = r?.origen === 'marcaje';
    const segunHorario = r?.origen === 'horario';
    const editable = nueva ? puedeCrear : puedeEditar && !desdeMarcaje;
    const persona = nueva
      ? el('input', { class: 'campo hz-persona', list: 'hz-personas', placeholder: 'Trabajador', autocomplete: 'off', value: nueva.persona ?? '', 'aria-label': 'Trabajador', 'data-planilla': '', ...hz('persona') })
      : el('span', { class: 'hz-nombre' }, personas.get(r.persona_id) ? nombre(personas.get(r.persona_id).personas) : 'Persona sin vínculo');
    const faena = el('input', { class: 'campo hz-faena', list: `hz-faenas-${nueva ? nueva.fecha : r.fecha}`, placeholder: 'Faena', value: nueva ? nueva.faena ?? '' : r.faena ?? '', disabled: !editable, 'aria-label': 'Faena', 'data-planilla': '', ...hz('faena') });
    const entrada = el('input', { type: 'time', class: 'campo hz-hora', value: nueva ? nueva.entrada ?? '' : hhmm(r.entrada), disabled: !editable, 'aria-label': 'Entrada', ...hz('entrada') });
    const salida = el('input', { type: 'time', class: 'campo hz-hora', value: nueva ? nueva.salida ?? '' : hhmm(r.salida), disabled: !editable, 'aria-label': 'Salida', ...hz('salida') });
    const vueltas = el('input', { type: 'number', min: '0', class: 'campo hz-vueltas', value: nueva ? String(nueva.vueltas ?? 0) : String(r.vueltas || 0), disabled: !editable, 'aria-label': 'Vueltas', title: 'Vueltas (choferes)', ...hz('vueltas') });
    const total = el('span', { class: 'hz-total texto-chico' }, nueva ? '' : !r.salida ? 'Sin salida' : `${horas(minutosRegistro(r))}${aMin(r.salida) <= aMin(r.entrada) ? ' (+1 día)' : ''}`);
    const incompleta = nueva && !(nueva.persona && nueva.entrada && nueva.salida);
    const tr = el('tr', { class: `${pisan.has(r?.id) ? 'hz-pisa' : ''}${nueva ? ' hz-nueva' : ''}`, 'data-k': llave },
      el('td', {}, persona, incompleta && (nueva.persona || nueva.entrada || nueva.salida) ? el('span', { class: 'chip chip-prox', title: 'Queda guardada en este equipo hasta que tenga trabajador, entrada y salida' }, 'Borrador') : null, segunHorario ? el('span', { class: 'chip chip-ok', title: 'Se creó solo según su turno. Si llegó tarde o hizo horas extra, cambia la hora; si faltó, márcalo ausente.' }, (r.notas ?? '').startsWith('Corregido') ? 'horario corregido' : 'según horario') : null, desdeMarcaje ? el('span', { class: 'chip chip-pend', title: 'Del marcaje: se corrige en Asistencia → Marcajes' }, (r.notas ?? '').includes('terreno') ? 'terreno' : 'tablet') : null,
        pisan.has(r?.id) ? el('div', { class: 'texto-chico pct-mal' }, 'Se pisa con otra hora de esta persona ese día') : null),
      conFaena ? el('td', {}, faena) : null, el('td', { class: 'hz-horario' }, entrada, el('span', { class: 'texto-suave' }, '→'), salida, (nueva ? puedeCrear : puedeEditar) ? el('button', { type: 'button', class: 'hz-arrastre', title: 'Copiar este horario: arrástralo hacia abajo hasta donde quieras, o haz clic para elegir a quiénes', 'aria-label': 'Copiar este horario a otras personas', tabindex: '-1' }) : null), el('td', {}, total), el('td', {}, vueltas),
      el('td', { class: 'acciones-fila' },
        nueva ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar fila', 'aria-label': 'Quitar fila', onclick: () => { estado.nuevas = estado.nuevas.filter((x) => x !== nueva); guardarBorrador(); refrescar(); } }, icono('cerrar', { tam: 16 }))
          : segunHorario ? (puedeEditar ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', title: 'No vino: el día deja de contar', onclick: () => ausente(ctx, r, personas.get(r.persona_id)) }, 'Ausente') : null)
          : puedeEliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar registro', onclick: () => eliminar(ctx, r) }, icono('basura', { tam: 16 })) : null));
    const campos = { persona, faena, entrada, salida, vueltas };
    const anotar = () => { Object.assign(nueva, { persona: persona.value, faena: faena.value, entrada: entrada.value, salida: salida.value, vueltas: Number(vueltas.value) || 0 }); guardarBorrador(); };
    filasPorLlave.set(llave, { r, nueva, tr, campos });
    const alCambiar = () => {
      if (entrada.value && salida.value) total.textContent = horas(minutosRegistro({ entrada: entrada.value, salida: salida.value }));
      if (nueva) { anotar(); guardarNueva(nueva, campos); }
      else { if (segunHorario && !(r.notas ?? '').startsWith('Corregido')) { r.notas = 'Corregido (retraso u horas extra)'; ctx.api.from('asis_horas').update({ notas: r.notas }).eq('id', r.id).then(() => {}); } guardarFila(r, campos, tr); }
    };
    for (const c of [faena, entrada, salida, vueltas, nueva ? persona : null]) if (c) c.addEventListener('change', alCambiar);
    if (nueva) { persona.addEventListener('input', () => persona.classList.remove('campo-error')); for (const x of [persona, faena, entrada, salida, vueltas]) x.addEventListener('input', anotar); }
    return tr;
  };

  // Enter baja a la misma columna de la fila de abajo (Shift+Enter sube); en la última fila agrega otra en la misma faena.
  // Tab sigue a la columna siguiente (lo hace el navegador). Con la lista de sugerencias abierta, Enter la elige (combo.js).
  // El cuadrito del horario se arrastra para copiarlo a las filas de abajo, o con un clic se elige a quiénes (arrastre.js).
  function planilla(tbody, agregarAbajo, d) {
    tbody.addEventListener('keydown', (ev) => {
      const c = ev.target.closest?.('[data-col]');
      if (!c || ev.key !== 'Enter' || ev.ctrlKey || ev.altKey || c.getAttribute('aria-expanded') === 'true') return;
      ev.preventDefault();
      const tr = c.closest('tr'); const col = c.dataset.col;
      const otra = ev.shiftKey ? tr.previousElementSibling : tr.nextElementSibling;
      const destino = otra?.querySelector(`[data-col="${col}"]:not(:disabled)`) ?? otra?.querySelector('[data-col]:not(:disabled)');
      if (destino) { destino.focus(); destino.select?.(); return; }
      if (!ev.shiftKey && puedeCrear) { c.blur(); setTimeout(agregarAbajo, 150); }   // primero se guarda lo de esta fila
    });
    arrastrarHorario(tbody, {
      filas: () => [...tbody.rows].map((tr) => filasPorLlave.get(tr.dataset.k)).filter(Boolean),
      delDia: () => [...filasPorLlave.values()].filter((x) => (x.r?.fecha ?? x.nueva?.fecha) === d),
      nombre: (x) => (x.r ? nombre(personas.get(x.r.persona_id)?.personas ?? {}) || 'Persona' : x.campos.persona.value || 'Fila nueva'),
      aplicar: aplicarHorario,
    });
    return tbody;
  }
  async function aplicarHorario(entrada, salida, destinos) {
    if (!entrada || !salida) { avisar('Primero completa la entrada y la salida de esa fila.', 'error'); return; }
    if (entrada === salida) { avisar('La entrada y la salida no pueden ser iguales.', 'error'); return; }
    const delMarcaje = destinos.filter((x) => x.r?.origen === 'marcaje');
    const existentes = puedeEditar ? destinos.filter((x) => x.r && x.r.origen !== 'marcaje') : [];
    const nuevas = destinos.filter((x) => x.nueva);
    for (const x of nuevas) { Object.assign(x.nueva, { entrada, salida }); x.campos.entrada.value = entrada; x.campos.salida.value = salida; }
    guardarBorrador();
    if (existentes.length) {
      const { data, error } = await ctx.api.from('asis_horas').update({ entrada, salida }).in('id', existentes.map((x) => x.r.id)).select('id');
      if (error) { avisar(error.message, 'error'); return; }
      const horario = existentes.filter((x) => x.r.origen === 'horario' && !(x.r.notas ?? '').startsWith('Corregido')).map((x) => x.r.id);
      if (horario.length) await ctx.api.from('asis_horas').update({ notas: 'Corregido (retraso u horas extra)' }).in('id', horario);
      if ((data?.length ?? 0) < existentes.length) avisar('Algunas filas no se pudieron cambiar (sin permiso).', 'error');
    }
    for (const x of nuevas) await guardarNueva(x.nueva, x.campos);
    avisar(`Horario ${entrada} – ${salida} copiado a ${existentes.length + nuevas.length} ${existentes.length + nuevas.length === 1 ? 'fila' : 'filas'}${delMarcaje.length ? ` (${delMarcaje.length} del marcaje no se tocan: se corrigen en Marcajes)` : ''}.`);
    refrescar();
  }
  // Las mismas horas en otra faena del día (ej.: Cámara 1 y Cámara 2 por separado)
  // Juntar: las horas de esta faena pasan a otra del día (ej.: el mismo trabajo escrito de dos formas)
  function juntarFaena(d, g) {
    const textos = new Map();
    for (const t of [...registrosDe(d).map((r) => r.faena), ...faenasDe(d).map((f) => f.texto)]) if (t && clave(t) !== clave(g.texto) && !textos.has(clave(t))) textos.set(clave(t), String(t).trim());
    const mover = g.regs.filter((r) => r.origen !== 'marcaje');
    const delMarcaje = g.regs.length - mover.length;
    if (!mover.length) { avisar('Estas horas vienen del marcaje: su faena se corrige en Marcajes.', 'error'); return; }
    abrirFormulario({
      titulo: 'Juntar con otra faena',
      mensaje: `${mover.length === 1 ? 'La hora' : `Las ${mover.length} horas`} de "${g.texto || 'Sin faena'}" ${mover.length === 1 ? 'pasa' : 'pasan'} a la faena que elijas.${delMarcaje ? ` ${delMarcaje} del marcaje se quedan (se corrigen en Marcajes).` : ''}`,
      campos: [
        ...(textos.size ? [{ id: 'destino', etiqueta: 'Faena de este día', opciones: [['', '— elige —'], ...[...textos.values()].sort().map((t) => [t, t])] }] : []),
        { id: 'otra', etiqueta: textos.size ? 'U otra faena (escríbela)' : 'Faena' },
      ],
      textoGuardar: 'Juntar',
      alGuardar: async (v) => {
        const destino = (v.otra ?? '').trim() || v.destino || '';
        if (!destino) throw new Error('Elige o escribe la faena.');
        const { data, error } = await ctx.api.from('asis_horas').update({ faena: destino }).in('id', mover.map((r) => r.id)).select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error('No tienes permiso para editar.');
        estado.abiertas.add(`${d}|${clave(destino)}`);
        avisar(`${data.length} ${data.length === 1 ? 'hora pasó' : 'horas pasaron'} a "${destino}".`);
        refrescar();
      },
    });
  }
  function copiarAFaena(d, g) {
    const otras = faenasDe(d).filter((f) => clave(f.texto) !== clave(g.texto));
    abrirFormulario({
      titulo: 'Copiar a otra faena',
      mensaje: `${g.regs.length === 1 ? 'La hora' : `Las ${g.regs.length} horas`} de "${g.texto || 'Sin faena'}" se registran también en la faena que elijas, con la misma persona y horario. Quedan como filas separadas (se marcan como horas que se pisan y al pagar se cuentan una vez).`,
      campos: [
        ...(otras.length ? [{ id: 'destinos', etiqueta: 'Faenas de este día', tipo: 'checks', opciones: otras.map((f) => [f.texto, f.texto]) }] : []),
        { id: 'otra', etiqueta: otras.length ? 'Otra faena (opcional)' : 'Faena' },
      ],
      textoGuardar: 'Copiar',
      alGuardar: async (v) => {
        const destinos = [...new Map([...(v.destinos ?? []), v.otra.trim()].filter(Boolean).map((t) => [clave(t), t])).values()];
        if (!destinos.length) throw new Error('Elige o escribe la faena.');
        const ya = registrosDe(d);
        const filas = destinos.flatMap((faena) => g.regs.filter((r) => !ya.some((x) => x.persona_id === r.persona_id && clave(x.faena) === clave(faena) && hhmm(x.entrada) === hhmm(r.entrada)))
          .map((r) => ({ empresa_id: ctx.empresa.id, persona_id: r.persona_id, fecha: d, entrada: hhmm(r.entrada), salida: hhmm(r.salida), faena, vueltas: 0 })));
        if (!filas.length) throw new Error('Esas personas ya tienen ese horario en esa faena.');
        const { error } = await ctx.api.from('asis_horas').insert(filas);
        if (error) throw new Error(error.message);
        for (const t of destinos) estado.abiertas.add(`${d}|${clave(t)}`);
        avisar(`Se copiaron ${filas.length} ${filas.length === 1 ? 'hora' : 'horas'}.`);
        refrescar();
      },
    });
  }

  // ---- Un día: sus faenas (cada una plegable) y, abajo, ausentes, vehículos y preparación
  const registrosDe = (d) => (porDia.get(d) ?? []).filter(pasaFiltroFaena);
  const ausentesDe = (d) => (ausencias.data ?? []).filter((a) => a.fecha === d);
  const nuevasDe = (d) => estado.nuevas.filter((n) => n.fecha === d && n.empresa === ctx.empresa.id);

  function detalleDia(d) {
    const delDia = registrosDe(d);
    const faenasDia = faenasDe(d);
    // Agrupar por faena (las nuevas, en la faena desde la que se agregaron)
    const grupos = new Map();
    const grupoDe = (texto) => { const k = clave(texto) || ''; if (!grupos.has(k)) grupos.set(k, { texto: String(texto ?? '').trim(), filas: [], regs: [] }); return grupos.get(k); };
    for (const r of delDia) { const g = grupoDe(r.faena); g.filas.push(fila(r)); g.regs.push(r); }
    for (const n of nuevasDe(d)) grupoDe(n.faena).filas.push(fila(null, n));
    if (!estado.filtro) for (const f of faenasDia) grupoDe(f.texto);   // las faenas del día aparecen aunque no tengan horas aún
    const orden = [...grupos.entries()].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b));
    const agregarEn = (texto) => {
      const uid = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      estado.dia = d; estado.diasAbiertos.add(d); estado.abiertas.add(`${d}|${clave(texto)}`);
      estado.nuevas.push({ uid, empresa: ctx.empresa.id, fecha: d, faena: texto, persona: '', entrada: '', salida: '', vueltas: 0 }); guardarBorrador();
      refrescar(null, `${uid}|persona`);
    };
    const bloques = orden.map(([k, g]) => {
      const color = colorFaena(g.texto);
      const min = delDia.filter((r) => clave(r.faena) === k).reduce((s, r) => s + minutosRegistro(r), 0);
      // Las faenas parten plegadas (Enzo, 2026-11-06); se abren al tocarlas y siguen abiertas al guardar. Sin Faenas hay un solo
      // grupo: abierto. Con filtro se ve directo la faena elegida.
      const llave = `${d}|${k}`;
      const abierto = !conFaena || !!estado.filtro || estado.abiertas.has(llave) || nuevasDe(d).some((n) => clave(n.faena) === k);
      const resumen = [el('strong', {}, g.texto || (conFaena ? 'Sin faena' : 'Trabajadores')),
        el('span', { class: 'texto-suave texto-chico' }, g.filas.length ? `${g.filas.length} registro${g.filas.length > 1 ? 's' : ''} · ${horas(min)}` : 'sin horas aún'),
        g.filas.some((tr) => tr.classList.contains('hz-pisa')) ? el('span', { class: 'chip chip-venc' }, 'Horas que se pisan') : null];
      const cuerpo = el('div', { class: 'hz-grupo-cuerpo', hidden: !abierto });
      const cabeza = conFaena ? el('button', { type: 'button', class: 'hz-grupo-cabeza hz-grupo-boton', 'aria-expanded': String(abierto), onclick: () => {
        const abrir = cuerpo.hidden; cuerpo.hidden = !abrir; cabeza.setAttribute('aria-expanded', String(abrir));
        if (abrir) estado.abiertas.add(llave); else estado.abiertas.delete(llave);
      } }, icono('derecha', { tam: 16 }), resumen) : el('div', { class: 'hz-grupo-cabeza' }, resumen);
      cuerpo.append(...[
        g.filas.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla hz-tabla' },
          el('thead', {}, el('tr', {}, ['Trabajador', ...(conFaena ? ['Faena'] : []), 'Horario', 'Horas', 'Vueltas', ''].map((t) => el('th', {}, t)))),
          planilla(el('tbody', {}, g.filas), () => agregarEn(g.texto), d))) : null,
        el('div', { class: 'hz-acciones' },
          puedeCrear ? el('button', { type: 'button', class: 'boton-enlace hz-agregar', onclick: () => agregarEn(g.texto) }, icono('mas', { tam: 14 }), g.texto ? 'persona en esta faena' : conFaena ? 'persona (sin faena)' : 'persona') : null,
          puedeCrear && conFaena && g.regs.length ? el('button', { type: 'button', class: 'boton-enlace hz-agregar', onclick: () => copiarAFaena(d, g) }, icono('copiar', { tam: 14 }), 'copiar a otra faena') : null,
          puedeEditar && conFaena && g.regs.length ? el('button', { type: 'button', class: 'boton-enlace hz-agregar', onclick: () => juntarFaena(d, g) }, icono('arrastrar', { tam: 14 }), 'juntar con otra faena') : null),
      ].filter(Boolean));
      return el('div', { class: 'hz-grupo', style: color ? `--hz-color:${color}` : '' }, cabeza, cuerpo);
    });

    // Vehículos y preparación del día (desde Planificación)
    const planesDia = (planes.data ?? []).filter((p) => p.fecha === d && faenasDia.some((f) => f.id === p.faena_id));
    const vehiculos = planesDia.flatMap((p) => (p.ope_plan_vehiculos ?? []).map((v) => ({ p, v })));
    const jornada = verOpe ? el('div', { class: 'ficha hz-jornada' },
      el('h2', {}, 'Vehículos y preparación del día'),
      vehiculos.length ? el('div', { class: 'chips-fila' }, vehiculos.map(({ p, v }) => el('span', { class: 'chip chip-na' }, icono('camion', { tam: 12 }),
        ` ${v.vehiculo}${v.personas ? ` · ${v.personas.nombres.split(' ')[0]} ${v.personas.apellido_paterno}` : ''}${faenasDia.find((f) => f.id === p.faena_id) ? ` · ${faenasDia.find((f) => f.id === p.faena_id).texto}` : ''}`)))
        : el('p', { class: 'texto-suave' }, 'Sin vehículos planificados este día.'),
      planesDia.length ? el('div', { class: 'chips-fila' }, planesDia.map((p) => el('a', { class: 'boton-enlace', href: ctx.ruta('ope.plan', { f: p.faena_id, d }) },
        icono('check', { tam: 14 }), `Preparación · ${faenasDia.find((f) => f.id === p.faena_id)?.texto ?? 'faena'}`))) : null) : null;
    const aus = ausentesDe(d);

    return [
      bloques.length ? bloques : el('p', { class: 'texto-suave' }, conFaena ? 'Sin registros ni faenas este día.' : 'Sin registros este día.'),
      aus.length ? el('div', { class: 'ficha hz-jornada' }, el('h2', {}, 'Ausentes'),
        aus.map((a) => el('div', { class: 'doc-fila' }, el('span', { class: 'doc-nombre' }, el('strong', {}, personas.get(a.persona_id) ? nombre(personas.get(a.persona_id).personas) : 'Persona'), el('span', { class: 'texto-suave texto-chico' }, a.notas)),
          puedeEditar ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', title: 'Vuelve a quedar presente según su horario', onclick: async () => { const { error } = await ctx.api.from('asis_horas').update({ deleted_at: null, notas: 'Según horario' }).eq('id', a.id); if (error) avisar(error.message, 'error'); else ctx.refrescar(); } }, 'Deshacer') : null))) : null,
      jornada,
    ].flat().filter(Boolean);
  }

  // ---- La semana: un bloque por cada día con horas cargadas; los demás quedan abajo para abrirlos si hace falta
  const conCarga = (d) => registrosDe(d).length > 0 || nuevasDe(d).length > 0 || (!estado.filtro && (ausentesDe(d).length > 0 || estado.diasAbiertos.has(d)));
  const listados = diasSemana.filter(conCarga);
  const bloquesDia = listados.map((d) => {
    const abierto = !!estado.filtro || estado.diasAbiertos.has(d) || nuevasDe(d).length > 0;
    const cuerpo = el('div', { class: 'sem-dia-cuerpo', hidden: !abierto }, detalleDia(d));
    const cabeza = el('button', { type: 'button', class: 'sem-dia-cabeza', 'aria-expanded': String(abierto), onclick: () => {
      const abrir = cuerpo.hidden; cuerpo.hidden = !abrir; cabeza.setAttribute('aria-expanded', String(abrir));
      estado.dia = d;
      if (abrir) estado.diasAbiertos.add(d); else estado.diasAbiertos.delete(d);
    } }, icono('derecha', { tam: 18 }), el('strong', {}, `${DIAS_LARGOS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}`), d === hoy ? el('span', { class: 'chip chip-ok' }, 'Hoy') : null, el('span', { class: 'sem-dia-resumen' }, resumenDia(registrosDe(d), conFaena)));
    return el('div', { class: `sem-dia${d === hoy ? ' hoy' : ''}` }, cabeza, cuerpo);
  });
  const otros = estado.filtro ? [] : diasSemana.filter((d) => !listados.includes(d));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Registro de horas'),
      el('div', { class: 'listado-acciones' },
        puedeCrear ? boton('Agregar horas a varios', { icono: 'mas', tipo: 'primario', onclick: () => agregar(ctx, activos) }) : null)),
    navegacion,
    filtro,
    listaPersonas, listasFaenas,
    el('div', { class: 'sem-dias' }, bloquesDia.length ? bloquesDia : el('p', { class: 'texto-suave' }, 'Sin horas cargadas esta semana.')),
    otros.length && puedeCrear ? el('div', { class: 'sem-otros' }, el('span', { class: 'texto-suave texto-chico' }, 'Días sin carga:'),
      otros.map((d) => el('button', { type: 'button', class: 'boton-enlace', onclick: () => { estado.dia = d; estado.diasAbiertos.add(d); ctx.refrescar(); } }, icono('mas', { tam: 14 }), `${nombreDia(d)} ${Number(d.slice(8))}`))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Cada fila se guarda sola al cambiar un dato. Si la salida es menor que la entrada, el turno termina al día siguiente. Las horas que se pisan se marcan en rojo y al pagar se cuentan una sola vez. Las del marcaje (tablet o terreno) se corrigen en Marcajes. Los fijos con turno quedan presentes "según horario" cada día hábil: corrige solo retrasos, horas extra o ausencias.'),
  );
}

// ---- Compartido con el teléfono: filtro por faena de la semana y resumen del día
const SIN_FAENA = '∅';
export const pasaFiltroFaena = (r) => !estado.filtro || (estado.filtro === SIN_FAENA ? !clave(r.faena) : clave(r.faena) === estado.filtro);
// Lista para elegir una faena de las cargadas en la semana; null si hay menos de dos (no hay nada que filtrar)
export function campoFiltroFaena(registros, alCambiar) {
  const faenas = new Map();
  for (const r of registros) { const k = clave(r.faena) || SIN_FAENA; if (!faenas.has(k)) faenas.set(k, k === SIN_FAENA ? 'Sin faena' : String(r.faena).trim()); }
  if (!faenas.has(estado.filtro)) estado.filtro = '';
  if (faenas.size < 2) return null;
  const orden = [...faenas.entries()].sort(([a, ta], [b, tb]) => (a === SIN_FAENA) - (b === SIN_FAENA) || ta.localeCompare(tb));
  const campo = el('select', { class: 'campo', 'aria-label': 'Filtrar por faena' },
    el('option', { value: '' }, 'Todas las faenas'), orden.map(([k, t]) => el('option', { value: k }, t)));
  campo.value = estado.filtro;
  campo.addEventListener('change', () => { estado.filtro = campo.value; alCambiar(); });
  return el('label', { class: 'sem-filtro' }, el('span', { class: 'texto-suave texto-chico' }, 'Faena'), campo);
}
export function resumenDia(registros, conFaena) {
  const personas = new Set(registros.map((r) => r.persona_id)).size;
  if (!registros.length) return 'sin horas';
  const faenas = new Set(registros.map((r) => clave(r.faena))).size;
  const min = registros.reduce((s, r) => s + minutosRegistro(r), 0);
  return [`${personas} ${personas === 1 ? 'persona' : 'personas'}`, horas(min), conFaena && faenas > 1 ? `${faenas} faenas` : null].filter(Boolean).join(' · ');
}

// Ausente: el día según horario deja de contar (queda eliminado con el motivo) y no se vuelve a crear
export function ausente(ctx, r, v) {
  abrirFormulario({
    titulo: `Ausente · ${v ? nombre(v.personas) : ''}`,
    mensaje: `${fechaCorta(r.fecha)}: el día deja de contar como trabajado. Se puede deshacer.`,
    campos: [
      { id: 'motivo', etiqueta: 'Motivo', opciones: [['Falta', 'Falta'], ['Licencia médica', 'Licencia médica'], ['Vacaciones', 'Vacaciones'], ['Permiso', 'Permiso'], ['Otro', 'Otro']] },
      { id: 'nota', etiqueta: 'Nota (opcional)' },
    ],
    textoGuardar: 'Marcar ausente',
    alGuardar: async (x) => {
      const { error } = await ctx.api.from('asis_horas').update({ deleted_at: new Date().toISOString(), notas: `Ausente: ${x.motivo}${x.nota.trim() ? ` · ${x.nota.trim()}` : ''}` }).eq('id', r.id);
      if (error) throw new Error(error.message);
      avisar('Marcado ausente.'); ctx.refrescar();
    },
  });
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
    ...(estado.conFaena || r?.faena ? [{ id: 'faena', etiqueta: 'Faena o lugar', valor: r?.faena ?? '' }] : []),
    { id: 'vueltas', etiqueta: 'Vueltas (choferes)', tipo: 'number', valor: String(r?.vueltas ?? 0) },
    { id: 'notas', etiqueta: 'Notas', valor: r?.notas ?? '' },
  ];
}

const datosDe = (v) => {
  if (v.entrada === v.salida) throw new Error('La entrada y la salida no pueden ser iguales.');
  return { fecha: v.fecha, entrada: v.entrada, salida: v.salida, faena: v.faena === undefined ? undefined : v.faena.trim() || null,   // sin el campo (empresa sin faenas) no se toca
    vueltas: Number(v.vueltas) || 0, notas: v.notas.trim() || null };
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

export function eliminar(ctx, r) {
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
