// Tareas: mis tareas o todas, agrupadas en vencidas, hoy, próximas y sin fecha; agregar rápido, editar,
// marcar hecha (si se repite, aparece la siguiente) y hechas recientes.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { hoyISO, fechaLarga, nombreDia, hhmm, sumarDias, diaLocal } from '../../../core/ui/formato.js';

const estado = { ver: 'mias' };
const PRIORIDADES = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const REPETIR = [['no', 'No se repite'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes']];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const yo = ctx.usuario.id;
  let q = ctx.api.from('tar_tareas').select('*').eq('empresa_id', e).is('deleted_at', null);
  if (estado.ver === 'hechas') q = q.eq('estado', 'hecha').gte('hecha_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('hecha_at', { ascending: false });
  else q = q.eq('estado', 'pendiente').order('fecha', { nullsFirst: false }).order('hora', { nullsFirst: false });
  if (estado.ver === 'mias') q = q.eq('responsable_id', yo);
  const [{ data, error }, us] = await Promise.all([q, ctx.api.rpc('tar_usuarios', { p_empresa: e })]);
  if (error) throw error;
  const usuarios = us.data ?? [];
  const nombreUsuario = new Map(usuarios.map((u) => [u.user_id, u.nombre]));
  const crear = ctx.puede('tareas', 'crear');
  const editar = ctx.puede('tareas', 'editar');
  const hoy = hoyISO();

  const formulario = (t = null) => abrirFormulario({
    titulo: t ? 'Editar tarea' : 'Nueva tarea',
    campos: [
      { id: 'titulo', etiqueta: 'Tarea', requerido: true, valor: t?.titulo ?? '' },
      { id: 'detalle', etiqueta: 'Detalle', tipo: 'textarea', valor: t?.detalle ?? '' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: t?.fecha ?? '' },
      { id: 'hora', etiqueta: 'Hora (opcional)', tipo: 'time', valor: t?.hora ? hhmm(t.hora) : '' },
      { id: 'prioridad', etiqueta: 'Prioridad', opciones: PRIORIDADES, valor: t?.prioridad ?? 'media' },
      { id: 'responsable', etiqueta: 'Responsable', opciones: [['', 'Sin asignar'], ...usuarios.map((u) => [u.user_id, u.nombre])], valor: t ? t.responsable_id ?? '' : yo },
      { id: 'repetir', etiqueta: 'Repetir', opciones: REPETIR, valor: t?.repetir ?? 'no' },
    ],
    alGuardar: async (v) => {
      if (v.hora && !v.fecha) throw new Error('Para la hora, indica la fecha.');
      if (v.repetir !== 'no' && !v.fecha) throw new Error('Una tarea que se repite necesita fecha.');
      const datos = { titulo: v.titulo.trim(), detalle: v.detalle.trim() || null, fecha: v.fecha || null, hora: v.hora || null, prioridad: v.prioridad, responsable_id: v.responsable || null, repetir: v.repetir };
      const r = t ? await ctx.api.from('tar_tareas').update(datos).eq('id', t.id) : await ctx.api.from('tar_tareas').insert({ ...datos, empresa_id: e });
      if (r.error) throw new Error(r.error.message);
      avisar(t ? 'Tarea guardada.' : 'Tarea creada.'); ctx.refrescar();
    },
  });
  const marcar = async (t, hecha) => {
    const { data: sig, error: er } = await ctx.api.rpc('tar_marcar', { p_tarea: t.id, p_hecha: hecha });
    if (er) { avisar(er.message, 'error'); return; }
    avisar(hecha ? (sig ? 'Hecha. La siguiente ya está en la lista.' : 'Tarea hecha.') : 'Tarea pendiente de nuevo.');
    ctx.refrescar();
  };
  const eliminar = async (t) => {
    const { error: er } = await ctx.api.from('tar_tareas').update({ deleted_at: new Date().toISOString() }).eq('id', t.id);
    if (er) avisar(er.message, 'error'); else { avisar('Tarea eliminada.'); ctx.refrescar(); }
  };

  const vencida = (t) => t.fecha && (t.fecha < hoy || (t.fecha === hoy && t.hora && hhmm(t.hora) < new Date().toTimeString().slice(0, 5)));
  const fila = (t) => {
    const puedeMarcar = editar || t.responsable_id === yo;
    return el('div', { class: `tar-fila tar-${t.prioridad}${t.estado === 'hecha' ? ' tar-hecha' : ''}` },
      el('input', { type: 'checkbox', class: 'casilla-sola', checked: t.estado === 'hecha', disabled: !puedeMarcar, 'aria-label': `Marcar ${t.titulo}`, onchange: (ev) => marcar(t, ev.currentTarget.checked) }),
      el('div', { class: 'doc-nombre' },
        el('strong', {}, t.titulo),
        el('span', { class: 'texto-suave texto-chico' }, [
          t.fecha ? `${nombreDia(t.fecha)} ${fechaLarga(t.fecha)}${t.hora ? ` ${hhmm(t.hora)}` : ''}` : null,
          estado.ver !== 'mias' ? nombreUsuario.get(t.responsable_id) ?? 'Sin asignar' : null,
          t.repetir !== 'no' ? (t.repetir === 'semanal' ? 'cada semana' : 'cada mes') : null,
          t.estado === 'hecha' ? `hecha ${fechaLarga(diaLocal(t.hecha_at))}` : null,
        ].filter(Boolean).join(' · ')),
        t.detalle ? el('span', { class: 'texto-chico' }, t.detalle) : null),
      t.prioridad === 'alta' ? el('span', { class: 'chip chip-venc' }, 'Alta') : null,
      editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${t.titulo}`, onclick: () => formulario(t) }, icono('editar', { tam: 16 })) : null,
      editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${t.titulo}`, onclick: () => eliminar(t) }, icono('basura', { tam: 16 })) : null);
  };
  const grupo = (titulo, lista, clase = '') => (lista.length ? el('div', { class: `ficha doc-grupo ${clase}` }, el('h2', {}, `${titulo} (${lista.length})`), lista.map(fila)) : null);

  // Agregar rápido: título y Enter (para mí, hoy)
  const rapido = el('input', { class: 'campo', placeholder: 'Nueva tarea para hoy y Enter (o "Más opciones")', 'aria-label': 'Nueva tarea rápida' });
  rapido.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter' || !rapido.value.trim()) return;
    const { error: er } = await ctx.api.from('tar_tareas').insert({ empresa_id: e, titulo: rapido.value.trim(), fecha: hoy, responsable_id: yo });
    if (er) avisar(er.message, 'error'); else ctx.refrescar();
  });

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['mias', 'Mis tareas'], ['todas', 'Todas'], ['hechas', 'Hechas (30 días)']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, n)));
  const cuerpo = estado.ver === 'hechas'
    ? [grupo('Hechas', data) ?? el('p', { class: 'texto-suave' }, 'Sin tareas hechas en los últimos 30 días.')]
    : (() => {
      const venc = data.filter(vencida);
      const deHoy = data.filter((t) => t.fecha === hoy && !vencida(t));
      const prox = data.filter((t) => t.fecha && t.fecha > hoy && t.fecha <= sumarDias(hoy, 7));
      const despues = data.filter((t) => t.fecha && t.fecha > sumarDias(hoy, 7));
      const sin = data.filter((t) => !t.fecha);
      const g = [grupo('Vencidas', venc, 'tar-grupo-venc'), grupo('Hoy', deHoy), grupo('Próximos 7 días', prox), grupo('Más adelante', despues), grupo('Sin fecha', sin)].filter(Boolean);
      return g.length ? g : [el('p', { class: 'texto-suave' }, icono('check', { tam: 14 }), estado.ver === 'mias' ? ' No tienes tareas pendientes.' : ' No hay tareas pendientes.')];
    })();

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Tareas'),
      el('div', { class: 'listado-acciones' }, segmento, crear ? boton('Más opciones', { icono: 'mas', tipo: 'primario', onclick: () => formulario() }) : null)),
    crear ? rapido : null,
    cuerpo);
}
