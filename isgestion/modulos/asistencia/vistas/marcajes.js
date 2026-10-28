// Marcajes de la tablet (módulo Marcaje): marcas del día por persona, entradas sin salida, marca manual,
// corregir hora (guarda la original y el motivo) y anular. Las parejas generan las horas del Registro.
import { el } from '../../../core/ui/dom.js?v=3a264c0';
import { icono } from '../../../core/ui/iconos.js?v=3a264c0';
import { boton } from '../../../core/ui/tabla.js?v=3a264c0';
import { abrirFormulario } from '../../../core/ui/modal.js?v=3a264c0';
import { avisar } from '../../../core/ui/aviso.js?v=3a264c0';
import { horas, hoyISO, sumarDias, nombreDia, fechaLarga } from '../../../core/ui/formato.js?v=3a264c0';

const estado = { dia: hoyISO() };
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const diaLocal = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const inicioDia = (iso) => new Date(`${iso}T00:00:00`).toISOString();
const nombre = (p) => [p?.nombres?.split(' ')[0], p?.apellido_paterno].filter(Boolean).join(' ');
const aTs = (fecha, hhmm) => new Date(`${fecha}T${hhmm}:00`).toISOString();

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const dia = estado.dia;
  const [delDia, abiertas, vin] = await Promise.all([
    ctx.api.from('asis_marcas').select('*, personas(nombres, apellido_paterno)').eq('empresa_id', e)
      .gte('ts', inicioDia(dia)).lt('ts', inicioDia(sumarDias(dia, 1))).order('ts'),
    // Entradas de los últimos 14 días sin pareja (posible olvido de marcar la salida)
    ctx.api.from('asis_marcas').select('*, personas(nombres, apellido_paterno)').eq('empresa_id', e).eq('tipo', 'entrada')
      .is('horas_id', null).is('anulada_at', null).gte('ts', inicioDia(sumarDias(hoyISO(), -14))).order('ts', { ascending: false }),
    ctx.api.from('persona_empresa').select('persona_id, personas(nombres, apellido_paterno, apellido_materno)').eq('empresa_id', e).eq('estado', 'activo').is('deleted_at', null),
  ]);
  if (delDia.error) throw delDia.error;
  const crear = ctx.puede('asistencia', 'crear');
  const editar = ctx.puede('asistencia', 'editar');
  const personas = (vin.data ?? []).map((v) => [v.persona_id, [v.personas?.nombres, v.personas?.apellido_paterno, v.personas?.apellido_materno].filter(Boolean).join(' ')])
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  // Abiertas: las que ya no tienen salida posterior (hace más de 1 h o de otro día)
  const abiertasReales = (abiertas.data ?? []).filter((m) => Date.now() - new Date(m.ts) > 3600e3 || diaLocal(m.ts) !== hoyISO());

  const rpc = async (fn, args, aviso) => {
    const { error } = await ctx.api.rpc(fn, args);
    if (error) throw new Error(error.message);
    avisar(aviso); ctx.refrescar();
  };
  const manual = (persona = null, tipo = 'entrada', fecha = dia) => abrirFormulario({
    titulo: 'Marca manual', mensaje: 'Para cuando alguien olvidó marcar. Queda registrada como manual, con el motivo.',
    campos: [
      { id: 'persona', etiqueta: 'Persona', opciones: personas, valor: persona ?? personas[0]?.[0] },
      { id: 'tipo', etiqueta: 'Tipo', opciones: [['entrada', 'Entrada'], ['salida', 'Salida']], valor: tipo },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: fecha },
      { id: 'hora', etiqueta: 'Hora', tipo: 'time', requerido: true },
      { id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: 'Olvidó marcar' },
    ],
    textoGuardar: 'Registrar',
    alGuardar: (v) => rpc('mar_agregar', { p_empresa: e, p_persona: v.persona, p_tipo: v.tipo, p_ts: aTs(v.fecha, v.hora), p_motivo: v.motivo }, 'Marca registrada.'),
  });
  const corregir = (m) => abrirFormulario({
    titulo: `Corregir ${m.tipo} de ${nombre(m.personas)}`,
    mensaje: `Hora registrada: ${hora(m.ts)}${m.ts_original ? ` (original ${hora(m.ts_original)})` : ''}. Se guarda la hora original y el motivo; las horas del día se recalculan.`,
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: diaLocal(m.ts) },
      { id: 'hora', etiqueta: 'Hora correcta', tipo: 'time', requerido: true, valor: hora(m.ts) },
      { id: 'motivo', etiqueta: 'Motivo', requerido: true },
    ],
    alGuardar: (v) => rpc('mar_corregir', { p_marca: m.id, p_ts: aTs(v.fecha, v.hora), p_motivo: v.motivo }, 'Marca corregida.'),
  });
  const anular = (m) => abrirFormulario({
    titulo: `Anular ${m.tipo} de ${nombre(m.personas)}`,
    mensaje: `${hora(m.ts)} del ${fechaLarga(diaLocal(m.ts))}. La marca no se borra; si tenía horas generadas, se dan de baja.`,
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: 'Marca duplicada' }],
    textoGuardar: 'Anular',
    alGuardar: (v) => rpc('mar_anular', { p_marca: m.id, p_motivo: v.motivo }, 'Marca anulada.'),
  });
  const chip = (m) => el('span', { class: `marca-chip ${m.tipo} ${m.anulada_at ? 'anulada' : ''}`, title: [m.origen === 'manual' ? 'Manual' : 'Tablet', m.ts_original ? `original ${hora(m.ts_original)}` : null, m.motivo].filter(Boolean).join(' · ') },
    `${m.tipo === 'entrada' ? 'E' : 'S'} ${hora(m.ts)}${m.origen === 'manual' || m.ts_original ? ' *' : ''}`,
    editar && !m.anulada_at ? el('button', { type: 'button', class: 'boton-icono', title: 'Corregir hora', 'aria-label': 'Corregir hora', onclick: () => corregir(m) }, icono('editar', { tam: 13 })) : null,
    editar && !m.anulada_at ? el('button', { type: 'button', class: 'boton-icono', title: 'Anular', 'aria-label': 'Anular marca', onclick: () => anular(m) }, icono('cerrar', { tam: 13 })) : null);

  // Agrupar las marcas del día por persona
  const porPersona = new Map();
  for (const m of delDia.data) {
    if (!porPersona.has(m.persona_id)) porPersona.set(m.persona_id, { p: m.personas, marcas: [] });
    porPersona.get(m.persona_id).marcas.push(m);
  }
  const filas = [...porPersona].sort((a, b) => nombre(a[1].p).localeCompare(nombre(b[1].p), 'es')).map(([pid, x]) => {
    const vivas = x.marcas.filter((m) => !m.anulada_at);
    let min = 0; let ent = null;
    for (const m of vivas) { if (m.tipo === 'entrada') ent = m; else if (ent && m.horas_id && m.horas_id === ent.horas_id) { min += Math.round((new Date(m.ts) - new Date(ent.ts)) / 60000); ent = null; } }
    const abierta = vivas.length && vivas[vivas.length - 1].tipo === 'entrada' && !vivas[vivas.length - 1].horas_id;
    return el('tr', {},
      el('td', {}, el('strong', {}, nombre(x.p))),
      el('td', {}, el('div', { class: 'marca-chips' }, x.marcas.map(chip))),
      el('td', { class: 'num' }, min ? horas(min) : '—'),
      el('td', {}, abierta ? el('span', { class: 'chip chip-prox' }, 'Dentro') : vivas.length ? el('span', { class: 'chip chip-ok' }, 'Fuera') : '',
        abierta && crear ? boton('Salida', { onclick: () => manual(pid, 'salida', dia) }) : null));
  });

  const mover = (n) => { estado.dia = sumarDias(estado.dia, n); ctx.refrescar(); };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Marcajes'),
      el('div', { class: 'listado-acciones' },
        crear ? boton('Marca manual', { icono: 'mas', tipo: 'primario', onclick: () => manual() }) : null)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Día anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, `${nombreDia(dia)} ${fechaLarga(dia)}`),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Día siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Hoy', { onclick: () => { estado.dia = hoyISO(); ctx.refrescar(); } })),
    abiertasReales.length ? el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Entradas sin salida (${abiertasReales.length})`),
      el('p', { class: 'texto-suave texto-chico' }, 'Últimos 14 días. Registra la salida que faltó para que se generen las horas.'),
      abiertasReales.map((m) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, nombre(m.personas)), el('span', { class: 'texto-suave texto-chico' }, `entrada ${hora(m.ts)} del ${nombreDia(diaLocal(m.ts)).toLowerCase()} ${fechaLarga(diaLocal(m.ts))}`)),
        crear ? boton('Registrar salida', { onclick: () => manual(m.persona_id, 'salida', diaLocal(m.ts)) }) : null,
        editar ? boton('Anular entrada', { onclick: () => anular(m) }) : null))) : null,
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Persona'), el('th', {}, 'Marcas'), el('th', { class: 'num' }, 'Trabajado'), el('th', {}, 'Estado'))),
      el('tbody', {}, filas.length ? filas : el('tr', {}, el('td', { colspan: 4, class: 'tabla-vacia' }, 'Sin marcas este día.'))))),
    el('p', { class: 'texto-suave texto-chico' }, 'E = entrada, S = salida. * manual o corregida (pasa el cursor para ver el motivo). Cada entrada con su salida genera una fila en Registro de horas (origen tablet), que es lo que paga Remuneraciones.'));
}
