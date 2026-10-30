// Insumos usados en una orden de trabajo (si la empresa tiene Inventario): cada registro es una salida
// del inventario ligada a la orden; anularla devuelve el stock.
import { el } from '../../core/ui/dom.js?v=605af68';
import { icono } from '../../core/ui/iconos.js?v=605af68';
import { boton } from '../../core/ui/tabla.js?v=605af68';
import { abrirFormulario } from '../../core/ui/modal.js?v=605af68';
import { avisar } from '../../core/ui/aviso.js?v=605af68';
import { dinero, fechaLarga, hoyISO } from '../../core/ui/formato.js?v=605af68';

export async function seccionInsumos(ctx, o, anulada) {
  if (!ctx.puede('inventario', 'ver')) return null;
  const inv = await import('../inventario/datos.js?v=605af68');
  const [{ data: docs, error }, base] = await Promise.all([
    ctx.api.from('inv_documentos').select('id, numero, fecha, estado, almacen_id, inv_movimientos(cantidad, costo_unitario, inv_productos(nombre, udm))')
      .eq('orden_id', o.id).eq('tipo', 'salida').order('numero'),
    inv.cargarBase(ctx),
  ]);
  if (error) return el('p', { class: 'texto-error' }, error.message);
  const vigentes = (docs ?? []).filter((d) => d.estado === 'vigente');
  const costo = vigentes.flatMap((d) => d.inv_movimientos).reduce((s, m) => s + Math.abs(Number(m.cantidad)) * m.costo_unitario, 0);
  const puedeRegistrar = !anulada && ctx.puede('inventario', 'crear');

  const registrar = async () => {
    const [productos, stock] = await Promise.all([inv.cargarProductos(ctx), inv.cargarStock(ctx)]);
    const almacenes = base.almacenes.filter((a) => a.activo);
    const insumos = productos.filter((p) => p.categoria === 'insumo').concat(productos.filter((p) => p.categoria !== 'insumo'));
    const conStock = (p) => almacenes.map((a) => `${a.codigo} ${inv.cant(stock.get(p.id)?.[a.id] ?? 0)}`).join(' · ');
    abrirFormulario({
      titulo: `Insumos usados · Orden N° ${o.numero}`,
      mensaje: 'Se descuentan del inventario como una salida ligada a esta orden.',
      campos: [
        { id: 'almacen', etiqueta: 'Desde el almacén', opciones: almacenes.map((a) => [a.id, a.nombre]) },
        { id: 'p1', etiqueta: 'Producto', opciones: [['', 'Elige…'], ...insumos.map((p) => [p.id, `${p.nombre} (${conStock(p)})`])] },
        { id: 'c1', etiqueta: 'Cantidad', tipo: 'number', valor: '1' },
        { id: 'p2', etiqueta: 'Otro producto (opcional)', opciones: [['', '—'], ...insumos.map((p) => [p.id, `${p.nombre} (${conStock(p)})`])] },
        { id: 'c2', etiqueta: 'Cantidad', tipo: 'number', valor: '1' },
        { id: 'p3', etiqueta: 'Otro producto (opcional)', opciones: [['', '—'], ...insumos.map((p) => [p.id, `${p.nombre} (${conStock(p)})`])] },
        { id: 'c3', etiqueta: 'Cantidad', tipo: 'number', valor: '1' },
      ],
      textoGuardar: 'Registrar',
      alGuardar: async (v) => {
        const lineas = [1, 2, 3].filter((i) => v[`p${i}`]).map((i) => ({ producto_id: v[`p${i}`], cantidad: Number(v[`c${i}`]) }));
        if (!lineas.length) throw new Error('Elige al menos un producto.');
        if (lineas.some((l) => !(l.cantidad > 0))) throw new Error('Las cantidades deben ser mayores a cero.');
        await inv.registrar(ctx, { tipo: 'salida', fecha: hoyISO(), almacen: v.almacen, lineas, motivo: `Orden N° ${o.numero}`, orden: o.id, origen: 'taller' });
        avisar('Insumos registrados.'); ctx.refrescar();
      },
    });
  };

  return el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' },
      el('h2', {}, `Insumos usados${costo ? ` · costo ${dinero(costo)}` : ''}`),
      puedeRegistrar ? boton('Registrar insumos', { icono: 'caja', onclick: registrar }) : null),
    (docs ?? []).length ? (docs ?? []).map((d) => el('div', { class: `doc-fila ${d.estado === 'vigente' ? '' : 'fila-inactiva'}` },
      el('div', { class: 'doc-nombre' },
        el('a', { href: ctx.ruta('inventario.documento', { id: d.id }) }, el('strong', {}, `Salida N° ${d.numero} · ${fechaLarga(d.fecha)}`)),
        el('span', { class: 'texto-suave texto-chico' }, [d.inv_movimientos.map((m) => `${m.inv_productos?.nombre} × ${inv.cant(Math.abs(Number(m.cantidad)))}`).join(', '),
          base.almacenDe.get(d.almacen_id)?.nombre, d.estado === 'vigente' ? null : 'anulada'].filter(Boolean).join(' · '))),
      d.estado === 'vigente' && ctx.puede('inventario', 'editar') && !anulada ? el('button', { type: 'button', class: 'boton-icono', title: 'Anular (devuelve el stock)', 'aria-label': 'Anular salida', onclick: () => abrirFormulario({
        titulo: `Anular salida N° ${d.numero}`, mensaje: 'Los productos vuelven al stock.', campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: 'Registrado por error' }], textoGuardar: 'Anular',
        alGuardar: async (x) => { await inv.anular(ctx, d.id, x.motivo.trim()); avisar('Salida anulada.'); ctx.refrescar(); },
      }) }, icono('cerrar', { tam: 16 })) : null))
      : el('p', { class: 'texto-suave' }, 'Sin insumos registrados. Lo que se use del inventario se descuenta del stock.'));
}
