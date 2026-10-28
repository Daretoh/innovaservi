// Categorías (con su clase: dónde van en el Estado de resultados) y centros de costo de la empresa.
import { el } from '../../../core/ui/dom.js?v=384ede1';
import { boton } from '../../../core/ui/tabla.js?v=384ede1';
import { abrirFormulario } from '../../../core/ui/modal.js?v=384ede1';
import { avisar } from '../../../core/ui/aviso.js?v=384ede1';
import { cargarBase, CLASES, nombreClase } from '../datos.js?v=384ede1';

const CATEGORIAS = [['Arriendo', 'gasto'], ['Servicios básicos', 'gasto'], ['Asesorías', 'gasto'], ['Servicios digitales', 'gasto'], ['Materiales y repuestos', 'gasto'],
  ['Combustible y viajes', 'gasto'], ['Publicidad', 'gasto'], ['Mantención y reparaciones', 'gasto'], ['Impuestos, patentes y bancos', 'gasto'], ['Otros gastos', 'gasto'],
  ['Remuneraciones y honorarios', 'personal'], ['Compras de inventario', 'inventario'], ['Otros ingresos', 'ingreso']];
const CENTROS = ['Operación', 'Oficina', 'Ventas'];

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const crear = ctx.puede('costos', 'crear');
  const editar = ctx.puede('costos', 'editar');
  const e = ctx.empresa.id;

  const sugeridos = async (b) => {
    b.disabled = true;
    const r1 = base.categorias.length ? { error: null } : await ctx.api.from('fin_categorias').insert(CATEGORIAS.map(([nombre, clase], i) => ({ empresa_id: e, nombre, clase, orden: i + 1 })));
    const r2 = base.centros.length ? { error: null } : await ctx.api.from('fin_centros').insert(CENTROS.map((nombre, i) => ({ empresa_id: e, nombre, orden: i + 1 })));
    if (r1.error || r2.error) { avisar((r1.error ?? r2.error).message, 'error'); b.disabled = false; return; }
    avisar('Categorías y centros cargados.'); ctx.refrescar();
  };

  const categoria = (c) => abrirFormulario({
    titulo: c ? c.nombre : 'Nueva categoría',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre ?? '' },
      { id: 'clase', etiqueta: 'Clase', opciones: CLASES, valor: c?.clase ?? 'gasto', ayuda: 'Define en qué línea del Estado de resultados cae.' },
      ...(c ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activa'], ['false', 'Inactiva']], valor: String(c.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), clase: v.clase, ...(c ? { activo: v.activo === 'true' } : {}) };
      const r = c ? await ctx.api.from('fin_categorias').update(datos).eq('id', c.id) : await ctx.api.from('fin_categorias').insert({ ...datos, empresa_id: e, orden: base.categorias.length + 1 });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : r.error.message);
      avisar('Categoría guardada.'); ctx.refrescar();
    },
  });

  const centro = (c) => abrirFormulario({
    titulo: c ? c.nombre : 'Nuevo centro de costo',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre ?? '' },
      ...(c ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(c.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), ...(c ? { activo: v.activo === 'true' } : {}) };
      const r = c ? await ctx.api.from('fin_centros').update(datos).eq('id', c.id) : await ctx.api.from('fin_centros').insert({ ...datos, empresa_id: e, orden: base.centros.length + 1 });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe ese centro.' : r.error.message);
      avisar('Centro guardado.'); ctx.refrescar();
    },
  });

  const enlace = (texto, fn) => (editar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); fn(); } }, el('strong', {}, texto)) : el('strong', {}, texto));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Categorías y centros'),
      crear && (!base.categorias.length || !base.centros.length) ? el('div', { class: 'listado-acciones' }, boton('Cargar sugeridos', { icono: 'mas', tipo: 'primario', onclick: (ev) => sugeridos(ev.currentTarget) })) : null),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Categorías'), crear ? boton('Nueva', { icono: 'mas', onclick: () => categoria(null) }) : null),
        base.categorias.length ? base.categorias.map((c) => el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, enlace(c.nombre, () => categoria(c)),
            el('span', { class: 'texto-suave texto-chico' }, [nombreClase[c.clase], c.activo ? null : 'inactiva'].filter(Boolean).join(' · ')))))
          : el('p', { class: 'texto-suave' }, 'Sin categorías.')),
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Centros de costo'), crear ? boton('Nuevo', { icono: 'mas', onclick: () => centro(null) }) : null),
        base.centros.length ? base.centros.map((c) => el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, enlace(c.nombre, () => centro(c)), c.activo ? null : el('span', { class: 'texto-suave texto-chico' }, 'inactivo'))))
          : el('p', { class: 'texto-suave' }, 'Sin centros.'))),
    el('p', { class: 'texto-suave texto-chico' }, 'Las compras de inventario se registran para pagarlas, pero no van al resultado: el costo se reconoce cuando el producto se usa o se vende.'));
}
