// Rol operativo de cada trabajador (para la dotación de las faenas).
import { el } from '../../../core/ui/dom.js?v=7c7795a';
import { listado } from '../../../core/ui/tabla.js?v=7c7795a';
import { avisar } from '../../../core/ui/aviso.js?v=7c7795a';
import { cargarBase, ROLES, nombreCompleto } from '../datos.js?v=7c7795a';

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear');
  const lista = listado({
    titulo: 'Roles operativos',
    filas: base.activos,
    vacio: 'No hay trabajadores activos.',
    columnas: [
      { titulo: 'Trabajador', valor: (v) => nombreCompleto(v.personas) },
      { titulo: 'Cargo', valor: (v) => v.cargo ?? '' },
      {
        titulo: 'Rol en faena',
        valor: (v) => {
          const s = el('select', { class: 'campo campo-filtro', disabled: !editable, 'aria-label': `Rol de ${nombreCompleto(v.personas)}` },
            ROLES.map(([k, n]) => el('option', { value: k, selected: v.rol === k }, n)));
          s.addEventListener('change', async () => {
            // Actualizar o crear (la empresa del registro no se puede cambiar, por eso no se usa upsert)
            const u = await ctx.api.from('ope_roles').update({ rol: s.value }).eq('vinculo_id', v.id).select('vinculo_id');
            const { error } = u.error || u.data?.length ? u
              : await ctx.api.from('ope_roles').insert({ vinculo_id: v.id, empresa_id: ctx.empresa.id, rol: s.value });
            if (error) { avisar(error.message, 'error'); s.value = v.rol; return; }
            v.rol = s.value;
            avisar('Rol guardado.');
          });
          return el('span', {}, s, v.rolElegido ? null : el('span', { class: 'texto-suave texto-chico' }, '  (según el cargo)'));
        },
      },
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Si no se elige, el rol se deduce del cargo: prevencionista, supervisor (capataz, encargado, jefe…) u operario.'));
  return lista;
}
