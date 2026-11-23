// Ficha de una ruta: sus contenidos (en orden), los trabajadores asignados y el avance de cada uno (visto / aprobado).
// Ruta: #/capacitaciones.ruta?id=<id>
import { el } from '../../../core/ui/dom.js?v=6ccf11a';
import { icono } from '../../../core/ui/iconos.js?v=6ccf11a';
import { boton } from '../../../core/ui/tabla.js?v=6ccf11a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6ccf11a';
import { avisar } from '../../../core/ui/aviso.js?v=6ccf11a';
import { cargarBiblioteca, cargarPersonas, cargarEstilos, conCarga, TIPO_CORTO, ICONO_TIPO } from '../datos.js?v=6ccf11a';

// Rutas, sus contenidos y personas, y el avance visible para quien consulta (Map "contenido|persona" → fila)
export async function cargarRutas(ctx) {
  const e = ctx.empresa.id;
  const [rutas, items, pers, av, bib] = await Promise.all([
    ctx.api.from('cap_rutas').select('*').eq('empresa_id', e).is('deleted_at', null).order('orden').order('nombre'),
    ctx.api.from('cap_ruta_items').select('*').eq('empresa_id', e).order('orden'),
    ctx.api.from('cap_ruta_personas').select('*').eq('empresa_id', e),
    ctx.api.from('cap_avance').select('*').eq('empresa_id', e),
    cargarBiblioteca(ctx),
  ]);
  for (const r of [rutas, items, pers, av]) if (r.error) throw new Error(r.error.message);
  return {
    rutas: rutas.data, items: items.data, personas: pers.data, contenidoDe: bib.contenidoDe, biblioteca: bib,
    avance: new Map(av.data.map((a) => [`${a.contenido_id}|${a.persona_id}`, a])),
    itemsDe: (id) => items.data.filter((i) => i.ruta_id === id),
    personasDe: (id) => pers.data.filter((p) => p.ruta_id === id),
  };
}

// Barra con lo visto y lo aprobado sobre el total
export function barraAvance(vistos, aprobados, total) {
  const pct = (n) => `${Math.round((n / total) * 100)}%`;
  return el('div', { class: 'cap-barra', title: `${vistos} de ${total} vistos · ${aprobados} aprobados` },
    el('div', { class: 'cap-barra-fondo' }, el('i', { class: 'visto', style: `width:${pct(vistos)}` }), el('i', { class: 'aprobado', style: `width:${pct(aprobados)}` })),
    el('span', { class: 'texto-chico' }, pct(vistos)));
}

export default async function vista(ctx) {
  cargarEstilos();
  const volver = el('a', { class: 'volver', href: ctx.ruta('capacitaciones.rutas') }, icono('volver', { tam: 16 }), 'Rutas');
  const d = await cargarRutas(ctx);
  const r = d.rutas.find((x) => x.id === ctx.params.id);
  if (!r) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Ruta no encontrada'));
  const editable = ctx.puede('capacitaciones', 'editar');
  const supervisa = editable || ctx.puede('capacitaciones', 'aprobar');
  const personas = supervisa ? await cargarPersonas(ctx, { todas: true }) : { lista: [], de: new Map() };
  const items = d.itemsDe(r.id).filter((i) => d.contenidoDe.has(i.contenido_id)).sort((a, b) => a.orden - b.orden);
  const asignados = d.personasDe(r.id).filter((p) => personas.de.has(p.persona_id))
    .sort((a, b) => personas.de.get(a.persona_id).nombre.localeCompare(personas.de.get(b.persona_id).nombre));

  // ---- Editar datos
  const editarDatos = () => abrirFormulario({
    titulo: 'Editar ruta',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: r.nombre },
      { id: 'cargo', etiqueta: 'Cargo al que apunta', valor: r.cargo ?? '' },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', filas: 2, valor: r.descripcion ?? '' },
      { id: 'activa', etiqueta: 'Activa', opciones: [['si', 'Sí'], ['no', 'No']], valor: r.activa ? 'si' : 'no' },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('cap_rutas').update({ nombre: v.nombre.trim(), cargo: v.cargo.trim() || null, descripcion: v.descripcion.trim() || null, activa: v.activa === 'si' }).eq('id', r.id);
      if (error) throw new Error(error.message);
      avisar('Ruta guardada.'); ctx.refrescar();
    },
  });
  const eliminar = () => abrirFormulario({
    titulo: 'Eliminar ruta', mensaje: `"${r.nombre}" se elimina. Lo que cada trabajador vio o aprobó queda guardado.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('cap_rutas').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw new Error(error.message);
      avisar('Ruta eliminada.'); location.hash = ctx.ruta('capacitaciones.rutas');
    },
  });

  // ---- Contenidos
  const agregarContenidos = () => {
    const ya = new Set(items.map((i) => i.contenido_id));
    const libres = d.biblioteca.contenidos.filter((c) => !ya.has(c.id));
    if (!libres.length) { avisar('Todos los contenidos de la biblioteca ya están en esta ruta.', 'error'); return; }
    abrirFormulario({
      titulo: 'Agregar contenidos',
      campos: [{ id: 'ids', etiqueta: 'Contenidos', tipo: 'checks', opciones: libres.map((c) => [c.id, `${c.titulo} · ${d.biblioteca.areaDe.get(c.area_id)?.nombre ?? 'Sin área'} · ${TIPO_CORTO[c.tipo]}`]) }],
      textoGuardar: 'Agregar',
      alGuardar: async (v) => {
        if (!v.ids.length) throw new Error('Marca al menos uno.');
        const base = items.length ? Math.max(...items.map((i) => i.orden)) + 1 : 1;
        const { error } = await ctx.api.from('cap_ruta_items').insert(v.ids.map((id, n) => ({ ruta_id: r.id, contenido_id: id, empresa_id: ctx.empresa.id, orden: base + n })));
        if (error) throw new Error(error.message);
        ctx.refrescar();
      },
    });
  };
  const mover = async (i, delta) => {
    const lista = [...items];
    const j = lista.indexOf(i) + delta;
    if (j < 0 || j >= lista.length) return;
    [lista[j], lista[j - delta]] = [lista[j - delta], lista[j]];
    for (const [n, x] of lista.entries()) {
      if (x.orden === n + 1) continue;
      const { error } = await ctx.api.from('cap_ruta_items').update({ orden: n + 1 }).eq('ruta_id', r.id).eq('contenido_id', x.contenido_id);
      if (error) throw new Error(error.message);
    }
    ctx.refrescar();
  };
  const quitarContenido = async (i) => {
    const { error } = await ctx.api.from('cap_ruta_items').delete().eq('ruta_id', r.id).eq('contenido_id', i.contenido_id);
    if (error) throw new Error(error.message);
    ctx.refrescar();
  };

  // ---- Trabajadores
  const agregarPersonas = () => {
    const ya = new Set(asignados.map((p) => p.persona_id));
    const libres = personas.lista.filter((p) => !ya.has(p.id));
    const delCargo = r.cargo ? libres.filter((p) => (p.cargo ?? '').toLowerCase().includes(r.cargo.toLowerCase())).map((p) => p.id) : [];
    abrirFormulario({
      titulo: 'Asignar trabajadores',
      mensaje: delCargo.length ? `Quedan marcados los ${delCargo.length} con cargo "${r.cargo}".` : null,
      campos: [{ id: 'ids', etiqueta: 'Trabajadores activos', tipo: 'checks', valor: delCargo, opciones: libres.map((p) => [p.id, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]) }],
      textoGuardar: 'Asignar',
      alGuardar: async (v) => {
        if (!v.ids.length) throw new Error('Marca al menos uno.');
        const { error } = await ctx.api.from('cap_ruta_personas').insert(v.ids.map((id) => ({ ruta_id: r.id, persona_id: id, empresa_id: ctx.empresa.id })));
        if (error) throw new Error(error.message);
        ctx.refrescar();
      },
    });
  };
  const quitarPersona = async (p) => {
    const { error } = await ctx.api.from('cap_ruta_personas').delete().eq('ruta_id', r.id).eq('persona_id', p.persona_id);
    if (error) throw new Error(error.message);
    ctx.refrescar();
  };

  const listaContenidos = el('ol', { class: 'cap-caja cap-lista' }, items.length ? items.map((i, n) => {
    const c = d.contenidoDe.get(i.contenido_id);
    return el('li', { class: 'cap-lista-fila' },
      el('span', { class: 'cap-num' }, String(n + 1)),
      icono(ICONO_TIPO[c.tipo], { tam: 18 }),
      el('a', { class: 'cap-lista-texto', href: ctx.ruta('capacitaciones.contenido', { id: c.id }) }, el('strong', {}, c.titulo),
        el('span', { class: 'texto-suave texto-chico' }, `${d.biblioteca.areaDe.get(c.area_id)?.nombre ?? 'Sin área'} · ${TIPO_CORTO[c.tipo]}`)),
      editable ? el('div', { class: 'cap-botones' },
        boton('', { icono: 'arriba', class: 'boton-icono', 'aria-label': 'Subir', title: 'Subir', disabled: n === 0, onclick: (ev) => conCarga(ev, () => mover(i, -1)) }),
        boton('', { icono: 'abajo', class: 'boton-icono', 'aria-label': 'Bajar', title: 'Bajar', disabled: n === items.length - 1, onclick: (ev) => conCarga(ev, () => mover(i, 1)) }),
        boton('', { icono: 'basura', class: 'boton-icono', 'aria-label': 'Quitar de la ruta', title: 'Quitar de la ruta', onclick: (ev) => conCarga(ev, () => quitarContenido(i)) })) : null);
  }) : [el('li', { class: 'cap-lista-fila texto-suave' }, 'Sin contenidos todavía.')]);

  const tablaAvance = supervisa ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Trabajador'), el('th', {}, 'Avance'), el('th', {}, 'Aprobados'), el('th', {}, ''))),
    el('tbody', {}, asignados.length ? asignados.map((p) => {
      const per = personas.de.get(p.persona_id);
      const vistos = items.filter((i) => d.avance.get(`${i.contenido_id}|${p.persona_id}`)?.visto_at).length;
      const aprob = items.filter((i) => d.avance.get(`${i.contenido_id}|${p.persona_id}`)?.aprobado).length;
      return el('tr', {},
        el('td', {}, el('a', { href: ctx.ruta('capacitaciones.avance', { p: p.persona_id }) }, el('strong', {}, per.nombre)), per.cargo ? el('span', { class: 'texto-suave texto-chico' }, ` · ${per.cargo}`) : null,
          per.estado !== 'activo' ? el('span', { class: 'chip chip-na', style: 'margin-left:6px' }, 'Inactivo') : null),
        el('td', {}, items.length ? barraAvance(vistos, aprob, items.length) : ''),
        el('td', {}, `${aprob} de ${items.length}`),
        el('td', {}, editable ? boton('', { icono: 'basura', class: 'boton-icono', 'aria-label': `Quitar a ${per.nombre}`, title: 'Quitar de la ruta', onclick: (ev) => conCarga(ev, () => quitarPersona(p)) }) : null));
    }) : [el('tr', {}, el('td', { colspan: 4, class: 'tabla-vacia' }, 'Sin trabajadores asignados.'))]))) : null;

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', { class: 'cap-cabecera' }, el('h1', {}, r.nombre),
        el('div', { class: 'chips-fila' }, r.cargo ? el('span', { class: 'chip chip-na' }, `Cargo: ${r.cargo}`) : null, r.activa ? null : el('span', { class: 'chip chip-na' }, 'Inactiva'))),
      el('div', { class: 'listado-acciones' },
        editable ? boton('Editar', { icono: 'editar', onclick: editarDatos }) : null,
        ctx.puede('capacitaciones', 'eliminar') ? boton('Eliminar', { icono: 'basura', onclick: eliminar }) : null)),
    r.descripcion ? el('p', { class: 'cap-descripcion' }, r.descripcion) : null,
    el('div', { class: 'cap-columnas' },
      el('div', { class: 'cap-bloque' },
        el('div', { class: 'cap-quienes-cabecera' }, el('h2', {}, `Contenidos (${items.length})`), editable ? boton('Agregar', { icono: 'mas', onclick: agregarContenidos }) : null),
        listaContenidos),
      supervisa ? el('div', { class: 'cap-bloque' },
        el('div', { class: 'cap-quienes-cabecera' }, el('h2', {}, `Trabajadores (${asignados.length})`), editable ? boton('Asignar', { icono: 'mas', onclick: agregarPersonas }) : null),
        tablaAvance) : null));
}
