// Almacenes y tipos de producto de la empresa (en el OS estaban fijos en el código).
import { el } from '../../../core/ui/dom.js?v=5909720';
import { boton } from '../../../core/ui/tabla.js?v=5909720';
import { abrirFormulario } from '../../../core/ui/modal.js?v=5909720';
import { avisar } from '../../../core/ui/aviso.js?v=5909720';
import { cargarBase } from '../datos.js?v=5909720';

const ALMACENES = [['BOD', 'Bodega', false], ['MES', 'Mesón de venta', true]];
const TIPOS = [['insumo', 'Químico', '31'], ['insumo', 'Insumo', '32'], ['insumo', 'Herramienta', '33'], ['insumo', 'Repuesto', '34'], ['venta', 'Equipamiento', '41'], ['venta', 'Accesorios', '42']];

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const crear = ctx.puede('inventario', 'crear');
  const editar = ctx.puede('inventario', 'editar');

  const cargarSugeridos = async (b) => {
    b.disabled = true;
    const e = ctx.empresa.id;
    const r1 = base.almacenes.length ? { error: null } : await ctx.api.from('inv_almacenes').insert(ALMACENES.map(([codigo, nombre, es_venta], i) => ({ empresa_id: e, codigo, nombre, es_venta, orden: i + 1 })));
    const r2 = base.tipos.length ? { error: null } : await ctx.api.from('inv_tipos').insert(TIPOS.map(([categoria, nombre, prefijo], i) => ({ empresa_id: e, categoria, nombre, prefijo, orden: i + 1 })));
    if (r1.error || r2.error) { avisar((r1.error ?? r2.error).message, 'error'); b.disabled = false; return; }
    avisar('Almacenes y tipos cargados.'); ctx.refrescar();
  };

  const almacen = (a) => abrirFormulario({
    titulo: a ? a.nombre : 'Nuevo almacén',
    campos: [
      ...(a ? [] : [{ id: 'codigo', etiqueta: 'Código (2 a 8 letras o números)', requerido: true }]),
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: a?.nombre ?? '' },
      { id: 'es_venta', etiqueta: '¿Se vende desde aquí (POS)?', opciones: [['no', 'No'], ['si', 'Sí']], valor: a?.es_venta ? 'si' : 'no' },
      ...(a ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(a.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), es_venta: v.es_venta === 'si', ...(a ? { activo: v.activo === 'true' } : {}) };
      const r = a ? await ctx.api.from('inv_almacenes').update(datos).eq('id', a.id)
        : await ctx.api.from('inv_almacenes').insert({ ...datos, empresa_id: ctx.empresa.id, codigo: v.codigo.trim().toUpperCase(), orden: base.almacenes.length + 1 });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe un almacén con ese código.' : r.error.code === '23514' ? 'El código va en mayúsculas, sin espacios (2 a 8).' : r.error.message);
      avisar('Almacén guardado.'); ctx.refrescar();
    },
  });

  const tipo = (t) => abrirFormulario({
    titulo: t ? t.nombre : 'Nuevo tipo de producto',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: t?.nombre ?? '' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: [['insumo', 'Insumo (se usa en el trabajo)'], ['venta', 'Producto en venta']], valor: t?.categoria ?? 'insumo' },
      { id: 'prefijo', etiqueta: 'Prefijo del SKU (2 dígitos)', requerido: true, valor: t?.prefijo ?? '' },
      ...(t ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(t.activo) }] : []),
    ],
    alGuardar: async (v) => {
      if (!/^\d{2}$/.test(v.prefijo.trim())) throw new Error('El prefijo son 2 dígitos (ej.: 31).');
      const datos = { nombre: v.nombre.trim(), categoria: v.categoria, prefijo: v.prefijo.trim(), ...(t ? { activo: v.activo === 'true' } : {}) };
      const r = t ? await ctx.api.from('inv_tipos').update(datos).eq('id', t.id) : await ctx.api.from('inv_tipos').insert({ ...datos, empresa_id: ctx.empresa.id, orden: base.tipos.length + 1 });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe ese tipo.' : r.error.message);
      avisar('Tipo guardado.'); ctx.refrescar();
    },
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Almacenes y tipos'),
      crear && (!base.almacenes.length || !base.tipos.length) ? el('div', { class: 'listado-acciones' }, boton('Cargar sugeridos', { icono: 'mas', tipo: 'primario', onclick: (ev) => cargarSugeridos(ev.currentTarget) })) : null),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Almacenes'), crear ? boton('Nuevo', { icono: 'mas', onclick: () => almacen(null) }) : null),
        base.almacenes.length ? base.almacenes.map((a) => el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, editar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); almacen(a); } }, el('strong', {}, a.nombre)) : el('strong', {}, a.nombre),
            el('span', { class: 'texto-suave texto-chico' }, [a.codigo, a.es_venta ? 'vende el POS' : null, a.activo ? null : 'inactivo'].filter(Boolean).join(' · ')))))
          : el('p', { class: 'texto-suave' }, 'Sin almacenes.')),
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Tipos de producto'), crear ? boton('Nuevo', { icono: 'mas', onclick: () => tipo(null) }) : null),
        base.tipos.length ? base.tipos.map((t) => el('div', { class: 'doc-fila' },
          el('div', { class: 'doc-nombre' }, editar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); tipo(t); } }, el('strong', {}, t.nombre)) : el('strong', {}, t.nombre),
            el('span', { class: 'texto-suave texto-chico' }, [t.categoria === 'venta' ? 'en venta' : 'insumo', `SKU ${t.prefijo}…`, t.activo ? null : 'inactivo'].filter(Boolean).join(' · ')))))
          : el('p', { class: 'texto-suave' }, 'Sin tipos.'))));
}
