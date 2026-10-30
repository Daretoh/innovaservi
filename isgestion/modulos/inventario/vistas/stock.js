// Stock: productos con su stock por almacén (calculado de los movimientos), mínimo y valorización.
import { el } from '../../../core/ui/dom.js?v=a665921';
import { listado, boton } from '../../../core/ui/tabla.js?v=a665921';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a665921';
import { avisar } from '../../../core/ui/aviso.js?v=a665921';
import { dinero } from '../../../core/ui/formato.js?v=a665921';
import { cargarBase, cargarProductos, cargarStock, CATEGORIAS, cant } from '../datos.js?v=a665921';

const filtro = { categoria: 'todas', buscar: '', bajo: false };

export default async function vista(ctx) {
  const [base, productos, stock] = await Promise.all([cargarBase(ctx), cargarProductos(ctx, { todos: true }), cargarStock(ctx)]);
  const b = filtro.buscar.trim().toLowerCase();
  const de = (p) => stock.get(p.id) ?? { total: 0 };
  const bajo = (p) => p.activo && Number(p.stock_min) > 0 && de(p).total < Number(p.stock_min);
  const filas = productos.filter((p) => (filtro.categoria === 'todas' || p.categoria === filtro.categoria)
    && (!filtro.bajo || bajo(p))
    && (!b || [p.sku, p.nombre, p.marca, p.familia, p.compatibilidad].filter(Boolean).join(' ').toLowerCase().includes(b)));
  const almacenes = base.almacenes.filter((a) => a.activo);
  const valor = filas.reduce((s, p) => s + Math.max(0, de(p).total) * p.costo, 0);
  const nBajo = productos.filter(bajo).length;

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Categoría' },
    [['todas', 'Todos'], ...CATEGORIAS.map(([k, n]) => [k, k === 'venta' ? 'En venta' : 'Insumos'])].map(([k, n]) =>
      el('button', { type: 'button', 'aria-pressed': String(filtro.categoria === k), onclick: () => { filtro.categoria = k; ctx.refrescar(); } }, n)));
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'SKU, nombre, marca…', value: filtro.buscar, 'aria-label': 'Buscar producto' });
  buscador.addEventListener('input', () => { filtro.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const acciones = [segmento, buscador,
    el('label', { class: 'casilla' }, el('input', { type: 'checkbox', class: 'interruptor', checked: filtro.bajo, onchange: (ev) => { filtro.bajo = ev.target.checked; ctx.refrescar(); } }), 'Bajo el mínimo')];
  if (ctx.puede('inventario', 'crear')) acciones.push(boton('Nuevo producto', { icono: 'mas', tipo: 'primario', onclick: () => nuevoProducto(ctx, base) }));
  if (ctx.puede('inventario', 'exportar') && filas.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: () => exportar(ctx, filas, almacenes, de, base).catch((e) => avisar(e.message, 'error')) }));

  const lista = listado({
    titulo: 'Stock',
    filas,
    acciones,
    vacio: productos.length ? 'Sin resultados.' : 'Aún no hay productos.',
    columnas: [
      { titulo: 'SKU', valor: (p) => p.sku },
      { titulo: 'Producto', valor: (p) => el('div', {}, el('a', { href: ctx.ruta('inventario.producto', { id: p.id }) }, el('strong', {}, p.nombre)),
        el('div', { class: 'texto-suave texto-chico' }, [base.tipoDe.get(p.tipo_id)?.nombre, p.marca, [p.presentacion, p.contenido].filter(Boolean).join(' '), p.activo ? null : 'inactivo'].filter(Boolean).join(' · '))) },
      ...almacenes.map((a) => ({ titulo: a.nombre, valor: (p) => (de(p)[a.id] ? cant(de(p)[a.id]) : '') })),
      { titulo: 'Total', valor: (p) => el('span', { class: bajo(p) ? 'chip chip-venc' : '' }, `${cant(de(p).total)} ${p.udm}`) },
      { titulo: 'Mínimo', valor: (p) => (Number(p.stock_min) ? cant(p.stock_min) : '') },
      { titulo: 'Precio', valor: (p) => (p.precio ? dinero(p.precio) : '') },
    ],
  });
  lista.insertBefore(el('div', { class: 'resumen-chips' },
    nBajo ? el('span', { class: 'chip chip-venc' }, `${nBajo} bajo el mínimo`) : el('span', { class: 'chip chip-ok' }, 'Nada bajo el mínimo'),
    el('span', { class: 'texto-suave' }, `Valorizado al último costo: ${dinero(valor)}`)), lista.children[1]);
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'El stock se calcula con los documentos (entradas, salidas, ajustes y traslados). Para corregirlo, registra un ajuste o anula el documento equivocado.'));
  return lista;
}

export function nuevoProducto(ctx, base) {
  abrirFormulario({
    titulo: 'Nuevo producto',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'tipo_id', etiqueta: 'Tipo (define la categoría y el inicio del SKU)', requerido: true,
        opciones: [['', 'Elige…'], ...base.tipos.filter((t) => t.activo).map((t) => [t.id, `${t.nombre} · ${t.categoria === 'venta' ? 'en venta' : 'insumo'} · SKU ${t.prefijo}…`])] },
      { id: 'marca', etiqueta: 'Marca' },
      { id: 'udm', etiqueta: 'Unidad de medida', valor: 'unidad', ayuda: 'Unidad, bidón, litro, kg, juego…' },
      { id: 'precio', etiqueta: 'Precio de venta ($)', tipo: 'number', valor: '0' },
      { id: 'stock_min', etiqueta: 'Stock mínimo', tipo: 'number', valor: '0' },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const t = base.tipoDe.get(v.tipo_id);
      const { data: sku, error: e1 } = await ctx.api.rpc('inv_siguiente_sku', { p_empresa: ctx.empresa.id, p_tipo: v.tipo_id });
      if (e1) throw new Error(e1.message);
      const { data, error } = await ctx.api.from('inv_productos').insert({
        empresa_id: ctx.empresa.id, sku, nombre: v.nombre.trim(), tipo_id: v.tipo_id, categoria: t?.categoria ?? 'venta', marca: v.marca.trim() || null,
        udm: v.udm.trim() || 'unidad', precio: Math.max(0, Math.round(Number(v.precio) || 0)), stock_min: Math.max(0, Number(v.stock_min) || 0),
      }).select('id').single();
      if (error) throw new Error(error.message);
      avisar(`Producto creado con SKU ${sku}.`);
      location.hash = ctx.ruta('inventario.producto', { id: data.id });
    },
  });
}

async function exportar(ctx, filas, almacenes, de, base) {
  const { exportarExcel } = await import('../../../core/excel.js?v=a665921');
  await exportarExcel(ctx, { titulo: 'Stock', subtitulo: `Al ${new Date().toLocaleDateString('es-CL')}`, nombre: 'stock',
    columnas: ['SKU', 'Producto', 'Categoría', 'Tipo', 'Marca', 'Unidad', ...almacenes.map((a) => ({ t: a.nombre, tipo: 'numero' })), { t: 'Total', tipo: 'numero' }, { t: 'Mínimo', tipo: 'numero' }, { t: 'Costo', tipo: 'dinero' }, { t: 'Precio', tipo: 'dinero' }],
    filas: filas.map((p) => [p.sku, p.nombre, p.categoria === 'venta' ? 'En venta' : 'Insumo', base.tipoDe.get(p.tipo_id)?.nombre ?? '', p.marca ?? '', p.udm,
    ...almacenes.map((a) => de(p)[a.id] ?? 0), de(p).total, p.stock_min, p.costo, p.precio]) });
}
