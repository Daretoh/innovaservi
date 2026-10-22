// Calendario mensual de faenas: crear, editar, repetir y cancelar.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { hoyISO, rangoMes, moverMes, nombreMes, sumarDias, lunesDe, hhmm } from '../../../core/ui/formato.js';
import { cargarBase, etiquetaFaena, ROLES } from '../datos.js';

const estado = { mes: hoyISO().slice(0, 7) };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  const ini = lunesDe(desde);
  const fin = sumarDias(lunesDe(hasta), 6);
  const [base, faenas] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('ope_faenas').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
      .lte('fecha_inicio', fin).gte('fecha_fin', ini).order('hora_inicio', { nullsFirst: false }),
  ]);
  if (faenas.error) throw faenas.error;
  const puedeCrear = ctx.puede('ope', 'crear');
  const puedeEditar = ctx.puede('ope', 'editar');

  const dias = [];
  for (let f = ini; f <= fin; f = sumarDias(f, 1)) dias.push(f);
  const celdas = dias.map((f) => {
    const del = faenas.data.filter((x) => x.fecha_inicio <= f && x.fecha_fin >= f);
    return el('div', { class: `cal-dia ${f.slice(0, 7) !== estado.mes ? 'fuera' : ''} ${f === hoyISO() ? 'hoy' : ''}` },
      el('span', { class: 'cal-num' }, Number(f.slice(8))),
      del.map((x) => {
        const e = etiquetaFaena(x, base);
        return el('button', {
          type: 'button', class: `cal-faena ${x.estado === 'cancelada' ? 'cancelada' : ''}`, style: `--c:${e.color}`,
          title: `${e.texto} — ${x.titulo}${x.hora_inicio ? ` · ${hhmm(x.hora_inicio)}` : ''}`,
          onclick: () => (puedeEditar ? editar(ctx, base, x) : null),
        }, x.hora_inicio && x.fecha_inicio === f ? `${hhmm(x.hora_inicio)} ` : '', e.cliente === 'Interno' ? x.titulo : e.cliente);
      }));
  });

  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Calendario de faenas'),
      el('div', { class: 'listado-acciones' }, puedeCrear ? boton('Nueva faena', { icono: 'mas', tipo: 'primario', onclick: () => editar(ctx, base, null) }) : null)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, nombreMes(estado.mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Este mes', { onclick: () => { estado.mes = hoyISO().slice(0, 7); ctx.refrescar(); } })),
    el('div', { class: 'calendario' },
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => el('div', { class: 'cal-cab' }, d)),
      celdas),
    base.clientes.length ? el('div', { class: 'leyenda' }, base.clientes.map((c) => el('span', { class: 'leyenda-item' }, el('span', { class: 'punto', style: `background:${c.color}` }), c.nombre))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Haz clic en una faena para editarla o cancelarla. La asignación de personas se hace en Planificación semanal.'),
  );
}

function editar(ctx, base, f) {
  const opcionesSitio = [['', 'Sin sitio'], ...base.sitios.filter((s) => s.activo || s.id === f?.sitio_id).map((s) => {
    const c = base.clientes.find((x) => x.id === s.tercero_id);
    return [s.id, `${c?.nombre ?? '?'} · ${s.nombre}`];
  })];
  const d = f?.dotacion ?? {};
  abrirFormulario({
    titulo: f ? 'Editar faena' : 'Nueva faena',
    campos: [
      { id: 'tercero_id', etiqueta: 'Cliente', opciones: [['', 'Trabajo interno'], ...base.clientes.map((c) => [c.id, c.nombre])], valor: f?.tercero_id ?? '' },
      { id: 'sitio_id', etiqueta: 'Sitio (debe ser del cliente)', opciones: opcionesSitio, valor: f?.sitio_id ?? '' },
      { id: 'titulo', etiqueta: 'Trabajo', requerido: true, valor: f?.titulo },
      { id: 'fecha_inicio', etiqueta: 'Desde', tipo: 'date', requerido: true, valor: f?.fecha_inicio ?? hoyISO() },
      { id: 'fecha_fin', etiqueta: 'Hasta (igual a "desde" si es de un día)', tipo: 'date', valor: f?.fecha_fin ?? '' },
      { id: 'hora_inicio', etiqueta: 'Hora de inicio', tipo: 'time', valor: f?.hora_inicio ? hhmm(f.hora_inicio) : '' },
      { id: 'hora_fin', etiqueta: 'Hora de término', tipo: 'time', valor: f?.hora_fin ? hhmm(f.hora_fin) : '' },
      ...ROLES.map(([k, , pl]) => ({ id: `dot_${k}`, etiqueta: `${pl} necesarios`, tipo: 'number', valor: String(d[k] ?? 0) })),
      { id: 'tareas', etiqueta: 'Tareas (una por línea)', tipo: 'textarea', valor: (f?.tareas ?? []).join('\n') },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', valor: f?.descripcion ?? '' },
      ...(f ? [{ id: 'estado', etiqueta: 'Estado', opciones: [['programada', 'Programada'], ['cancelada', 'Cancelada']], valor: f.estado }]
        : [{ id: 'repetir', etiqueta: 'Repetir cada semana (cuántas semanas más)', tipo: 'number', valor: '0' }]),
    ],
    alGuardar: async (v) => {
      const fin = v.fecha_fin || v.fecha_inicio;
      if (fin < v.fecha_inicio) throw new Error('"Hasta" no puede ser antes de "Desde".');
      if (!!v.hora_inicio !== !!v.hora_fin && v.hora_fin) throw new Error('Indica la hora de inicio.');
      const datos = {
        tercero_id: v.tercero_id || null, sitio_id: v.sitio_id || null, titulo: v.titulo.trim(),
        fecha_inicio: v.fecha_inicio, fecha_fin: fin, hora_inicio: v.hora_inicio || null, hora_fin: v.hora_fin || null,
        dotacion: Object.fromEntries(ROLES.map(([k]) => [k, Math.max(0, Number(v[`dot_${k}`]) || 0)])),
        tareas: v.tareas.split('\n').map((t) => t.trim()).filter(Boolean),
        descripcion: v.descripcion.trim() || null,
      };
      if (f) {
        const { data, error } = await ctx.api.from('ope_faenas').update({ ...datos, estado: v.estado }).eq('id', f.id).select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error('No tienes permiso.');
        avisar('Faena actualizada.');
      } else {
        const n = Math.min(52, Math.max(0, Number(v.repetir) || 0));
        const serie = n ? crypto.randomUUID() : null;
        const filas = Array.from({ length: n + 1 }, (_, i) => ({
          ...datos, empresa_id: ctx.empresa.id, serie_id: serie,
          fecha_inicio: sumarDias(datos.fecha_inicio, i * 7), fecha_fin: sumarDias(datos.fecha_fin, i * 7),
        }));
        const { error } = await ctx.api.from('ope_faenas').insert(filas);
        if (error) throw new Error(error.message);
        avisar(n ? `Se crearon ${n + 1} faenas (una por semana).` : 'Faena creada.');
      }
      ctx.refrescar();
    },
  });
}
