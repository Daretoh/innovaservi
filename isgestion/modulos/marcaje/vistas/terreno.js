// Asistencia en terreno (como en InnovaGestión): el capataz elige una faena de hoy desde su celular y la cuadrilla
// marca con los 4 últimos dígitos del RUT. La primera marca del día es la entrada y la siguiente la salida (la hora
// la pone el servidor); la pareja genera la hora en Registro de horas con esa faena. Cuadrilla planificada con su
// estado, quitar una marca propia de hoy y bitácora de la faena.
import { el } from '../../../core/ui/dom.js?v=dab9182';
import { icono } from '../../../core/ui/iconos.js?v=dab9182';
import { boton } from '../../../core/ui/tabla.js?v=dab9182';
import { avisar } from '../../../core/ui/aviso.js?v=dab9182';
import { hoyISO, fechaLarga, nombreDia, hhmm } from '../../../core/ui/formato.js?v=dab9182';

const CLAVE = 'isg.terreno.faena';
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ROL = { op: 'Operario', sup: 'Supervisor', prev: 'Prevención' };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const titulo = el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Asistencia en terreno'),
    el('p', { class: 'texto-suave' }, `${nombreDia(hoy)} ${fechaLarga(hoy)}`)));
  if (!ctx.puede('marcaje', 'crear')) {
    return el('section', { class: 'listado' }, titulo,
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no puede tomar asistencia. Pide el rol "Capataz de terreno".'));
  }
  const { data: faenas, error } = await ctx.api.rpc('mar_terreno_faenas', { p_empresa: e, p_fecha: hoy });
  if (error) throw error;
  if (!faenas.length) {
    return el('section', { class: 'listado' }, titulo,
      el('p', { class: 'aviso-bandeja' }, icono('calendario', { tam: 16 }), 'No hay faenas agendadas hoy. Créalas en Faenas → Calendario para poder tomar asistencia.'));
  }
  let elegida = null;
  try { elegida = sessionStorage.getItem(CLAVE); } catch { /* sin almacenamiento */ }
  const faena = faenas.find((x) => x.faena_id === elegida) ?? faenas[0];
  const [{ data: marcas, error: e2 }, { data: bit }] = await Promise.all([
    ctx.api.rpc('mar_terreno_dia', { p_faena: faena.faena_id }),
    ctx.api.from('ope_bitacora').select('texto, updated_at').eq('faena_id', faena.faena_id).eq('fecha', hoy).maybeSingle(),
  ]);
  if (e2) throw e2;

  // Estado de cada persona en esta faena hoy: sus marcas en orden
  const porPersona = new Map();
  for (const m of marcas) { const o = porPersona.get(m.persona_id) ?? { nombre: m.nombre, marcas: [] }; o.marcas.push(m); porPersona.set(m.persona_id, o); }
  const planificados = faena.cuadrilla ?? [];
  const filas = [...planificados.map((p) => ({ persona_id: p.persona_id, nombre: p.nombre, rol: p.rol, planificado: true })),
    ...[...porPersona].filter(([id]) => !planificados.some((p) => p.persona_id === id)).map(([id, o]) => ({ persona_id: id, nombre: o.nombre, planificado: false }))];
  const presentes = filas.filter((f) => { const ms = porPersona.get(f.persona_id)?.marcas ?? []; return ms.at(-1)?.tipo === 'entrada'; }).length;

  // ---- Elegir la faena
  const selector = el('select', { class: 'campo', 'aria-label': 'Faena', onchange: (ev) => { try { sessionStorage.setItem(CLAVE, ev.currentTarget.value); } catch { /* */ } ctx.refrescar(); } },
    faenas.map((x) => el('option', { value: x.faena_id, selected: x.faena_id === faena.faena_id }, `${x.texto}${x.hora_inicio ? ` · ${hhmm(x.hora_inicio)}` : ''}`)));
  const info = [faena.hora_inicio ? `Horario ${hhmm(faena.hora_inicio)}${faena.hora_fin ? `–${hhmm(faena.hora_fin)}` : ''}` : null,
    faena.necesarios ? `necesita ${faena.necesarios}` : null, `${presentes} presente${presentes === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

  // ---- Marcar con los 4 dígitos
  const mensaje = el('p', { class: 'ter-mensaje', role: 'status', 'aria-live': 'polite' });
  const elegir = el('div', { class: 'ter-elegir' });
  const clave = el('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off', class: 'campo ter-clave', placeholder: '4 dígitos', 'aria-label': 'Últimos 4 dígitos del RUT (sin dígito verificador)' });
  const marcar = async (persona) => {
    const ms = porPersona.get(persona.persona_id)?.marcas ?? [];
    const tipo = (ms.length ? ms.at(-1).tipo === 'entrada' : persona.dentro) ? 'salida' : 'entrada';
    const { data, error: er } = await ctx.api.rpc('mar_terreno_marcar', { p_faena: faena.faena_id, p_persona: persona.persona_id, p_tipo: tipo });
    if (er) { mensaje.className = 'ter-mensaje ter-mal'; mensaje.textContent = er.message; return; }
    avisar(`${data.nombre} · ${tipo} ${hora(data.ts)}`);
    ctx.refrescar();
  };
  const buscar = async () => {
    const v = clave.value.replace(/\D/g, '');
    elegir.replaceChildren(); mensaje.className = 'ter-mensaje'; mensaje.textContent = '';
    if (v.length !== 4) { mensaje.className = 'ter-mensaje ter-mal'; mensaje.textContent = 'Escribe los 4 últimos dígitos del RUT (sin el dígito verificador).'; return; }
    const { data, error: er } = await ctx.api.rpc('mar_buscar', { p_empresa: e, p_clave: v });
    clave.value = '';
    if (er) { mensaje.className = 'ter-mensaje ter-mal'; mensaje.textContent = er.message; return; }
    if (!data.length) { mensaje.className = 'ter-mensaje ter-mal'; mensaje.textContent = 'No hay un trabajador activo con esos dígitos.'; return; }
    if (data.length === 1) { await marcar(data[0]); return; }
    mensaje.textContent = 'Hay varios con esos dígitos: elige quién es.';
    elegir.replaceChildren(...data.map((p) => boton(p.nombre, { onclick: () => marcar(p) })));
  };
  clave.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') buscar(); });
  clave.addEventListener('input', () => { if (clave.value.replace(/\D/g, '').length === 4) buscar(); });

  // ---- Cuadrilla de hoy
  const quitar = async (m) => {
    if (!confirm(`¿Quitar la ${m.tipo} de ${m.nombre} (${hora(m.ts)})?`)) return;
    const { error: er } = await ctx.api.rpc('mar_terreno_quitar', { p_marca: m.marca_id });
    if (er) avisar(er.message, 'error'); else { avisar('Marca quitada.'); ctx.refrescar(); }
  };
  const fila = (f) => {
    const ms = porPersona.get(f.persona_id)?.marcas ?? [];
    const ult = ms.at(-1);
    const tramos = []; let ent = null;
    for (const m of ms) { if (m.tipo === 'entrada') ent = m; else { tramos.push(`${ent ? hora(ent.ts) : '--:--'}–${hora(m.ts)}`); ent = null; } }
    const estado = !ms.length ? el('span', { class: 'chip chip-na' }, 'Sin marcar')
      : ult.tipo === 'entrada' ? el('span', { class: 'chip chip-ok' }, `Presente desde ${hora(ult.ts)}`)
        : el('span', { class: 'chip chip-pend' }, `Salió · ${tramos.join(', ')}`);
    return el('div', { class: 'doc-fila ter-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, f.nombre),
        f.rol ? el('span', { class: 'texto-suave texto-chico' }, ROL[f.rol] ?? f.rol) : el('span', { class: 'texto-suave texto-chico' }, 'no estaba en la cuadrilla')),
      estado,
      ult?.mia ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar la última marca', 'aria-label': `Quitar la última marca de ${f.nombre}`, onclick: () => quitar(ult) }, icono('cerrar', { tam: 16 })) : null);
  };

  // ---- Bitácora
  const texto = el('textarea', { class: 'campo', rows: 4, placeholder: 'Qué se hizo, novedades, incidentes, materiales…', 'aria-label': 'Bitácora de la faena' });
  texto.value = bit?.texto ?? '';
  const estadoBit = el('span', { class: 'texto-suave texto-chico' }, bit?.updated_at ? `Guardada ${new Date(bit.updated_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : '');
  const guardarBit = async () => {
    estadoBit.textContent = 'Guardando…';
    const { error: er } = await ctx.api.rpc('mar_bitacora', { p_faena: faena.faena_id, p_fecha: hoy, p_texto: texto.value });
    estadoBit.textContent = er ? `No se pudo guardar: ${er.message}` : 'Bitácora guardada';
  };

  return el('section', { class: 'listado ter' },
    titulo,
    el('div', { class: 'ficha' }, el('label', { class: 'form-fila' }, 'Faena de hoy', selector), el('p', { class: 'texto-suave texto-chico' }, info)),
    el('div', { class: 'ficha ter-marcar' },
      el('h2', {}, 'Marcar asistencia'),
      el('p', { class: 'texto-suave texto-chico' }, 'Cada persona escribe los 4 últimos dígitos de su RUT: la primera vez marca la entrada y la siguiente, la salida.'),
      el('div', { class: 'ter-fila-marcar' }, clave, boton('Marcar', { icono: 'check', tipo: 'primario', onclick: buscar })),
      mensaje, elegir),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Cuadrilla de hoy (${filas.length})`),
      filas.length ? filas.map(fila) : el('p', { class: 'texto-suave' }, 'Nadie planificado ni marcado aún en esta faena.')),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Bitácora de la faena'),
      texto,
      el('div', { class: 'listado-acciones' }, estadoBit, boton('Guardar bitácora', { icono: 'check', onclick: guardarBit }))));
}
