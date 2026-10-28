// Etapas del tablero de postulantes (por empresa): agregar, renombrar, ordenar y desactivar.
import { el } from '../../../core/ui/dom.js?v=384ede1';
import { icono } from '../../../core/ui/iconos.js?v=384ede1';
import { listado, boton } from '../../../core/ui/tabla.js?v=384ede1';
import { abrirFormulario } from '../../../core/ui/modal.js?v=384ede1';
import { avisar } from '../../../core/ui/aviso.js?v=384ede1';
import { cargarBase } from '../datos.js?v=384ede1';

export default async function vista(ctx) {
  const { etapas } = await cargarBase(ctx);
  const editar = ctx.puede('postulantes', 'editar');
  const activas = etapas.filter((x) => x.activo);
  const guardar = async (x, cambios, aviso) => {
    const { error } = await ctx.api.from('sel_etapas').update(cambios).eq('id', x.id);
    if (error) avisar(error.message, 'error'); else { if (aviso) avisar(aviso); ctx.refrescar(); }
  };
  // Intercambia el orden con la etapa vecina (renumera todas para que no queden empates)
  const mover = async (x, d) => {
    const lista = [...activas]; const i = lista.indexOf(x); const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    for (const [n, et] of lista.entries()) if (et.orden !== n + 1) await ctx.api.from('sel_etapas').update({ orden: n + 1 }).eq('id', et.id);
    ctx.refrescar();
  };
  const nombre = (x = null) => abrirFormulario({
    titulo: x ? 'Renombrar etapa' : 'Nueva etapa',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: x?.nombre ?? '' }],
    alGuardar: async (v) => {
      const r = x ? await ctx.api.from('sel_etapas').update({ nombre: v.nombre.trim() }).eq('id', x.id)
        : await ctx.api.from('sel_etapas').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), orden: (etapas.at(-1)?.orden ?? 0) + 1 });
      if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? 'Ya existe una etapa con ese nombre.' : r.error.message);
      avisar(x ? 'Etapa renombrada.' : 'Etapa agregada.'); ctx.refrescar();
    },
  });

  const vistaLista = listado({
    titulo: 'Etapas',
    filas: etapas,
    vacio: 'Sin etapas.',
    acciones: editar ? [boton('Nueva etapa', { icono: 'mas', tipo: 'primario', onclick: () => nombre() })] : [],
    columnas: [
      { titulo: 'Orden', valor: (x) => (x.activo ? String(activas.indexOf(x) + 1) : '—') },
      { titulo: 'Etapa', valor: (x) => el('strong', {}, x.nombre) },
      { titulo: 'Estado', valor: (x) => el('span', { class: `chip ${x.activo ? 'chip-ok' : 'chip-na'}` }, x.activo ? 'En el tablero' : 'Desactivada') },
      { titulo: '', valor: (x) => (editar ? el('div', { class: 'doc-acciones' },
        x.activo ? el('button', { type: 'button', class: 'boton-icono', title: 'Subir', 'aria-label': `Subir ${x.nombre}`, disabled: activas[0] === x, onclick: () => mover(x, -1) }, icono('arriba', { tam: 16 })) : null,
        x.activo ? el('button', { type: 'button', class: 'boton-icono', title: 'Bajar', 'aria-label': `Bajar ${x.nombre}`, disabled: activas.at(-1) === x, onclick: () => mover(x, 1) }, icono('abajo', { tam: 16 })) : null,
        el('button', { type: 'button', class: 'boton-icono', title: 'Renombrar', 'aria-label': `Renombrar ${x.nombre}`, onclick: () => nombre(x) }, icono('editar', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-enlace', onclick: () => guardar(x, { activo: !x.activo }, x.activo ? 'Etapa desactivada.' : 'Etapa activada.') }, x.activo ? 'Desactivar' : 'Activar')) : null) },
    ],
  });
  vistaLista.append(el('p', { class: 'texto-suave texto-chico' }, icono('alerta', { tam: 14 }), ' Los postulantes nuevos entran en la primera etapa. Contratado y Descartado no son etapas: se marcan desde la ficha del postulante.'));
  return vistaLista;
}
