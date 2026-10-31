// Ficha del producto: datos (se guardan al salir del campo), stock por almacén y kardex (movimientos con saldo).
// Ruta: #/inventario.producto?id=<id>
import { el } from '../../../core/ui/dom.js?v=5909720';
import { icono } from '../../../core/ui/iconos.js?v=5909720';
import { boton } from '../../../core/ui/tabla.js?v=5909720';
import { abrirFormulario } from '../../../core/ui/modal.js?v=5909720';
import { avisar } from '../../../core/ui/aviso.js?v=5909720';
import { dinero, fechaLarga } from '../../../core/ui/formato.js?v=5909720';
import { cargarBase, cargarStock, nombreDoc, cant } from '../datos.js?v=5909720';

export default async function vista(ctx) {
  const [{ data: p, error }, base, stock, movs] = await Promise.all([
    ctx.api.from('inv_productos').select('*').eq('id', ctx.params.id).maybeSingle(),
    cargarBase(ctx),
    cargarStock(ctx),
    ctx.api.from('inv_movimientos').select('*, inv_documentos(id, numero, tipo, fecha, estado, motivo, doc_tipo, doc_numero)').eq('producto_id', ctx.params.id).order('created_at').limit(1000),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('inventario.stock') }, icono('volver', { tam: 16 }), 'Stock');
  if (!p || p.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Producto no encontrado'));
  const editable = ctx.puede('inventario', 'editar');
  const st = stock.get(p.id) ?? { total: 0 };

  const campo = (id, etiqueta, { tipo = 'text', opciones } = {}) => {
    const c = opciones
      ? el('select', { class: 'campo', id: `p-${id}`, disabled: !editable }, opciones.map(([k, t]) => el('option', { value: k, selected: String(p[id] ?? '') === k }, t)))
      : el('input', { class: 'campo', id: `p-${id}`, type: tipo, value: p[id] ?? '', disabled: !editable, min: tipo === 'number' ? 0 : null });
    c.addEventListener('change', async () => {
      let v = c.value.trim();
      if (tipo === 'number') v = Math.max(0, id === 'stock_min' ? Number(v) || 0 : Math.round(Number(v) || 0));
      else if (v === '' && id !== 'nombre') v = null;
      if (id === 'activo') v = v === 'true';
      if (id === 'nombre' && !v) { c.value = p.nombre; return; }
      const cambios = { [id]: v };
      if (id === 'tipo_id') cambios.categoria = base.tipoDe.get(v)?.categoria ?? p.categoria;
      const { error: e } = await ctx.api.from('inv_productos').update(cambios).eq('id', p.id);
      if (e) { avisar(e.message, 'error'); return; }
      Object.assign(p, cambios); avisar('Guardado.');
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `p-${id}` }, etiqueta), c);
  };

  // Kardex: saldo acumulado solo con documentos vigentes
  let saldo = 0;
  const kardex = (movs.data ?? []).map((m) => {
    const d = m.inv_documentos;
    const vigente = d.estado === 'vigente';
    if (vigente) saldo += Number(m.cantidad);
    return { m, d, vigente, saldo };
  }).reverse();

  const acciones = [];
  if (ctx.puede('inventario', 'crear')) {
    acciones.push(boton('Entrada', { icono: 'mas', onclick: () => { location.hash = ctx.ruta('inventario.documento', { tipo: 'entrada', producto: p.id }); } }));
    acciones.push(boton('Salida', { icono: 'menos', onclick: () => { location.hash = ctx.ruta('inventario.documento', { tipo: 'salida', producto: p.id }); } }));
    acciones.push(boton('Ajuste', { icono: 'editar', onclick: () => { location.hash = ctx.ruta('inventario.documento', { tipo: 'ajuste', producto: p.id }); } }));
  }
  if (ctx.puede('inventario', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar producto', mensaje: st.total ? `Tiene ${cant(st.total)} en stock: primero sácalo con una salida o un ajuste.` : 'Deja de aparecer en el stock. Sus movimientos se conservan.',
    campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      if (st.total) throw new Error('El producto todavía tiene stock.');
      const { error: e } = await ctx.api.from('inv_productos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
      if (e) throw new Error(e.message);
      location.hash = ctx.ruta('inventario.stock');
    },
  }) }));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, p.nombre), el('p', { class: 'texto-suave' }, [`SKU ${p.sku}`, base.tipoDe.get(p.tipo_id)?.nombre, p.categoria === 'venta' ? 'en venta' : 'insumo'].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${Number(p.stock_min) && st.total < Number(p.stock_min) ? 'chip-venc' : 'chip-ok'}` }, `${cant(st.total)} ${p.udm}`), acciones)),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        campo('nombre', 'Nombre'),
        el('div', { class: 'rejilla-campos' }, campo('tipo_id', 'Tipo', { opciones: base.tipos.map((t) => [t.id, t.nombre]) }), campo('marca', 'Marca')),
        el('div', { class: 'rejilla-campos' }, campo('presentacion', 'Presentación'), campo('contenido', 'Contenido')),
        el('div', { class: 'rejilla-campos' }, campo('udm', 'Unidad de medida'), campo('familia', 'Familia o uso')),
        el('div', { class: 'rejilla-campos' }, campo('compatibilidad', 'Compatibilidad'), campo('medidas', 'Medidas')),
        campo('ubicacion', 'Ubicación en bodega'),
        el('div', { class: 'rejilla-campos' }, campo('costo', 'Último costo ($)', { tipo: 'number' }), campo('precio', 'Precio de venta ($)', { tipo: 'number' })),
        el('div', { class: 'rejilla-campos' }, campo('stock_min', 'Stock mínimo', { tipo: 'number' }), campo('activo', 'Estado', { opciones: [['true', 'Activo'], ['false', 'Inactivo']] }))),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Stock por almacén'),
        base.almacenes.map((a) => el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, a.nombre), el('span', { class: 'texto-suave texto-chico' }, a.codigo)), el('strong', {}, cant(st[a.id] ?? 0)))),
        el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'Total')), el('strong', {}, `${cant(st.total)} ${p.udm}`)),
        el('p', { class: 'texto-suave texto-chico' }, `Valorizado: ${dinero(Math.max(0, st.total) * p.costo)} al último costo.`))),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Movimientos (${kardex.length})`),
      kardex.length ? kardex.map(({ m, d, vigente, saldo: s }) => el('div', { class: `doc-fila ${vigente ? '' : 'fila-inactiva'}` },
        el('div', { class: 'doc-nombre' },
          el('a', { href: ctx.ruta('inventario.documento', { id: d.id }) }, el('strong', {}, `${fechaLarga(d.fecha)} · ${nombreDoc[d.tipo]} N° ${d.numero}`)),
          el('span', { class: 'texto-suave texto-chico' }, [base.almacenDe.get(m.almacen_id)?.nombre, d.motivo, d.doc_numero ? `${d.doc_tipo ?? ''} ${d.doc_numero}` : null, vigente ? null : 'anulado'].filter(Boolean).join(' · '))),
        el('strong', { class: Number(m.cantidad) < 0 ? 'texto-error' : '' }, `${Number(m.cantidad) > 0 ? '+' : ''}${cant(m.cantidad)}`),
        el('span', { class: 'texto-suave' }, vigente ? `saldo ${cant(s)}` : ''))) : el('p', { class: 'texto-suave' }, 'Sin movimientos.')));
}
