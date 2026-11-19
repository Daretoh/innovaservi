// Capacitaciones → Áreas: las agrupaciones de la biblioteca (ej.: Pulido, Cerámicos, Lavados; Seguridad, Operación).
// Cada empresa crea las suyas. Eliminar un área deja sus contenidos "Sin área".
// Ruta: #/capacitaciones.areas
import { el } from '../../../core/ui/dom.js?v=92e612c';
import { icono } from '../../../core/ui/iconos.js?v=92e612c';
import { boton } from '../../../core/ui/tabla.js?v=92e612c';
import { abrirFormulario } from '../../../core/ui/modal.js?v=92e612c';
import { avisar } from '../../../core/ui/aviso.js?v=92e612c';
import { cargarBiblioteca, cargarEstilos } from '../datos.js?v=92e612c';

export default async function vista(ctx) {
  cargarEstilos();
  const datos = await cargarBiblioteca(ctx);
  const cuenta = (id) => datos.contenidos.filter((c) => c.area_id === id).length;

  const editar = (a) => abrirFormulario({
    titulo: a ? 'Editar área' : 'Nueva área',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: a?.nombre ?? '', ayuda: 'Ej.: Pulido, Cerámicos, Lavados, Interiores.' },
      { id: 'descripcion', etiqueta: 'Descripción (opcional)', tipo: 'textarea', filas: 2, valor: a?.descripcion ?? '' },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: a?.orden ?? (datos.areas.length + 1) },
    ],
    alGuardar: async (v) => {
      const fila = { nombre: v.nombre.trim(), descripcion: v.descripcion.trim() || null, orden: Math.round(Number(v.orden) || 0) };
      const { error } = a
        ? await ctx.api.from('cap_areas').update(fila).eq('id', a.id)
        : await ctx.api.from('cap_areas').insert({ ...fila, empresa_id: ctx.empresa.id });
      if (error) throw new Error(error.message);
      avisar(a ? 'Área guardada.' : 'Área creada.');
      ctx.refrescar();
    },
  });
  const eliminar = (a) => abrirFormulario({
    titulo: 'Eliminar área', mensaje: `"${a.nombre}" se elimina; sus ${cuenta(a.id)} contenidos quedan sin área.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      if (cuenta(a.id)) {
        const { error } = await ctx.api.from('cap_contenidos').update({ area_id: null }).eq('area_id', a.id);
        if (error) throw new Error(error.message);
      }
      const { error } = await ctx.api.from('cap_areas').update({ deleted_at: new Date().toISOString() }).eq('id', a.id);
      if (error) throw new Error(error.message);
      avisar('Área eliminada.');
      ctx.refrescar();
    },
  });

  const puedeEditar = ctx.puede('capacitaciones', 'editar');
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Áreas de la biblioteca'),
      el('div', { class: 'listado-acciones' }, ctx.puede('capacitaciones', 'crear') ? boton('Nueva área', { icono: 'mas', tipo: 'primario', onclick: () => editar(null) }) : null)),
    datos.areas.length
      ? el('ul', { class: 'cap-caja cap-lista' }, datos.areas.map((a) => el('li', { class: 'cap-lista-fila' },
        el('div', { class: 'cap-lista-texto' }, el('strong', {}, a.nombre), el('span', { class: 'texto-suave texto-chico' }, `${cuenta(a.id)} contenidos${a.descripcion ? ` · ${a.descripcion}` : ''}`)),
        puedeEditar ? boton('', { icono: 'editar', class: 'boton-icono', 'aria-label': `Editar ${a.nombre}`, title: 'Editar', onclick: () => editar(a) }) : null,
        ctx.puede('capacitaciones', 'eliminar') ? boton('', { icono: 'basura', class: 'boton-icono', 'aria-label': `Eliminar ${a.nombre}`, title: 'Eliminar', onclick: () => eliminar(a) }) : null)))
      : el('div', { class: 'cap-vacio' }, icono('ajustes', { tam: 28 }), el('p', {}, 'Aún no hay áreas. Crea las que use tu equipo (ej.: Pulido, Cerámicos, Lavados).')));
}
