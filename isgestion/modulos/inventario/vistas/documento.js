// Documento de inventario.
// - Ver:       #/inventario.documento?id=<id>   (líneas, archivo y anular)
// - Registrar: #/inventario.documento?tipo=entrada|salida|ajuste|traslado[&producto=<id>][&solicitud=<id>]
import { el } from '../../../core/ui/dom.js?v=14e2347';
import { icono } from '../../../core/ui/iconos.js?v=14e2347';
import { boton } from '../../../core/ui/tabla.js?v=14e2347';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14e2347';
import { avisar } from '../../../core/ui/aviso.js?v=14e2347';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=14e2347';
import { dinero, fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=14e2347';
import { nombreDoc, DOCS_COMPRA, cargarBase, cargarProductos, cargarStock, registrar, anular, nombreTercero, cant } from '../datos.js?v=14e2347';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];

export default async function vista(ctx) {
  return ctx.params.id ? ver(ctx) : nuevo(ctx);
}

async function ver(ctx) {
  const [{ data: d, error }, base] = await Promise.all([
    ctx.api.from('inv_documentos').select('*, terceros(razon_social, nombre_fantasia), inv_movimientos(*, inv_productos(sku, nombre, udm)), inv_solicitudes!inv_documentos_solicitud_id_fkey(numero)').eq('id', ctx.params.id).maybeSingle(),
    cargarBase(ctx),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('inventario.movimientos') }, icono('volver', { tam: 16 }), 'Movimientos');
  if (!d) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Documento no encontrado'));
  const anulado = d.estado === 'anulado';
  const lineas = d.tipo === 'traslado' ? d.inv_movimientos.filter((m) => Number(m.cantidad) > 0) : d.inv_movimientos;
  const total = lineas.reduce((s, m) => s + Math.abs(Number(m.cantidad)) * m.costo_unitario, 0);

  const acciones = [];
  if (d.archivo) acciones.push(boton('Ver documento', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, d.archivo, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }));
  if (!anulado && ctx.puede('inventario', 'editar')) acciones.push(boton('Anular', { icono: 'cerrar', onclick: () => abrirFormulario({
    titulo: `Anular ${nombreDoc[d.tipo].toLowerCase()} N° ${d.numero}`,
    mensaje: 'Su efecto en el stock desaparece. No se puede si lo que entró ya se usó.',
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true }], textoGuardar: 'Anular',
    alGuardar: async (v) => { await anular(ctx, d.id, v.motivo.trim()); avisar('Documento anulado.'); ctx.refrescar(); },
  }) }));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `${nombreDoc[d.tipo]} N° ${d.numero}`),
        el('p', { class: 'texto-suave' }, [fechaLarga(d.fecha), base.almacenDe.get(d.almacen_id)?.nombre + (d.almacen_destino_id ? ` → ${base.almacenDe.get(d.almacen_destino_id)?.nombre}` : ''),
          d.origen === 'taller' ? 'insumos de una orden de trabajo' : d.origen === 'pos' ? 'venta en mesón' : null].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${anulado ? 'chip-na' : 'chip-ok'}` }, anulado ? 'Anulado' : 'Vigente'), acciones)),
    anulado ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `Anulado el ${fechaLarga(diaLocal(d.anulado_at))}: ${d.anulado_motivo}`) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Detalle'),
      [['Proveedor', nombreTercero(d.terceros)], ['Documento', d.doc_numero ? `${DOCS_COMPRA.find((x) => x[0] === d.doc_tipo)?.[1] ?? ''} ${d.doc_numero}` : null],
        ['Motivo', d.motivo], ['Solicitud de pedido', d.inv_solicitudes ? `N° ${d.inv_solicitudes.numero}` : null]]
        .filter(([, v]) => v).map(([k, v]) => el('p', {}, el('span', { class: 'texto-suave' }, `${k}: `), v)),
      d.orden_id ? el('p', {}, el('span', { class: 'texto-suave' }, 'Orden de trabajo: '), el('a', { href: ctx.ruta('taller.orden', { id: d.orden_id }) }, 'ver orden')) : null),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Productos (${lineas.length})`),
      lineas.map((m) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' },
          el('a', { href: ctx.ruta('inventario.producto', { id: m.producto_id }) }, el('strong', {}, m.inv_productos?.nombre ?? 'Producto')),
          el('span', { class: 'texto-suave texto-chico' }, `SKU ${m.inv_productos?.sku ?? ''}`)),
        el('strong', {}, `${d.tipo === 'ajuste' && Number(m.cantidad) > 0 ? '+' : ''}${cant(d.tipo === 'ajuste' ? m.cantidad : Math.abs(Number(m.cantidad)))} ${m.inv_productos?.udm ?? ''}`),
        el('span', { class: 'texto-suave' }, m.costo_unitario ? `${dinero(m.costo_unitario)} c/u` : ''))),
      el('p', {}, el('strong', {}, `Valor: ${dinero(total)}`))));
}

async function nuevo(ctx) {
  const tipo = ctx.params.tipo;
  const volver = el('a', { class: 'volver', href: ctx.ruta('inventario.movimientos') }, icono('volver', { tam: 16 }), 'Movimientos');
  if (!nombreDoc[tipo]) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Tipo de documento no válido'));
  if (!ctx.puede('inventario', 'crear')) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Sin permiso para registrar'));
  const [base, productos, stock, proveedores, sol] = await Promise.all([
    cargarBase(ctx), cargarProductos(ctx), cargarStock(ctx),
    tipo === 'entrada' ? ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['proveedor']).order('razon_social') : Promise.resolve({ data: [] }),
    ctx.params.solicitud ? ctx.api.from('inv_solicitudes').select('*').eq('id', ctx.params.solicitud).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const almacenes = base.almacenes.filter((a) => a.activo);
  if (!almacenes.length) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Primero crea un almacén'), el('a', { href: ctx.ruta('inventario.config') }, 'Ir a almacenes y tipos'));
  const solicitud = sol.data;
  const prodDe = new Map(productos.map((p) => [p.id, p]));

  // Estado del formulario
  const lineas = [];
  const inicial = ctx.params.producto ?? solicitud?.producto_id;
  if (inicial && prodDe.has(inicial)) lineas.push({ producto_id: inicial, cantidad: solicitud ? Number(solicitud.cantidad) : 1, costo: prodDe.get(inicial).costo });
  if (!lineas.length) lineas.push({ producto_id: '', cantidad: 1, costo: 0 });

  const selAlmacen = el('select', { class: 'campo', id: 'd-almacen' }, almacenes.map((a) => el('option', { value: a.id }, `${a.nombre} (${a.codigo})`)));
  const selDestino = tipo === 'traslado' ? el('select', { class: 'campo', id: 'd-destino' }, almacenes.map((a, i) => el('option', { value: a.id, selected: i === 1 }, `${a.nombre} (${a.codigo})`))) : null;
  const fecha = el('input', { class: 'campo', id: 'd-fecha', type: 'date', value: hoyISO() });
  const motivo = Object.assign(el('textarea', { class: 'campo', id: 'd-motivo', rows: 2 }), { value: solicitud ? `Solicitud N° ${solicitud.numero}: ${solicitud.item}` : '' });
  const selProv = tipo === 'entrada' ? el('select', { class: 'campo', id: 'd-prov' }, el('option', { value: '' }, 'Sin proveedor'), (proveedores.data ?? []).map((t) => el('option', { value: t.id }, nombreTercero(t)))) : null;
  const selDocTipo = tipo === 'entrada' ? el('select', { class: 'campo', id: 'd-doctipo' }, DOCS_COMPRA.map(([k, n]) => el('option', { value: k }, n))) : null;
  const docNum = tipo === 'entrada' ? el('input', { class: 'campo', id: 'd-docnum' }) : null;
  const archivo = tipo === 'entrada' ? el('input', { class: 'campo', id: 'd-archivo', type: 'file', accept: ARCHIVOS.join(',') }) : null;

  const cuerpo = el('div', {});
  const stockEn = (pid) => cant(stock.get(pid)?.[selAlmacen.value] ?? 0);
  const pintar = () => {
    cuerpo.replaceChildren(
      el('div', { class: `inv-fila inv-fila-cab ${tipo === 'entrada' ? 'con-costo' : ''}` }, el('span', {}, 'Producto'), el('span', {}, tipo === 'ajuste' ? 'Ajuste (+/−)' : 'Cantidad'), tipo === 'entrada' ? el('span', {}, 'Costo unitario') : el('span', {}, 'En el almacén'), el('span')),
      ...lineas.map((l, i) => {
        const sel = el('select', { class: 'campo', 'aria-label': 'Producto' }, el('option', { value: '' }, 'Elige un producto…'),
          productos.map((p) => el('option', { value: p.id, selected: p.id === l.producto_id }, `${p.sku} · ${p.nombre}`)));
        sel.addEventListener('change', () => { l.producto_id = sel.value; l.costo = prodDe.get(sel.value)?.costo ?? 0; pintar(); });
        const q = el('input', { class: 'campo campo-num', type: 'number', step: 'any', value: l.cantidad, 'aria-label': 'Cantidad' });
        q.addEventListener('change', () => { l.cantidad = Number(q.value); });
        const c = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: l.costo, 'aria-label': 'Costo unitario' });
        c.addEventListener('change', () => { l.costo = Math.max(0, Math.round(Number(c.value) || 0)); });
        return el('div', { class: `inv-fila ${tipo === 'entrada' ? 'con-costo' : ''}` }, sel, q,
          tipo === 'entrada' ? c : el('span', { class: 'texto-suave' }, l.producto_id ? `${stockEn(l.producto_id)} ${prodDe.get(l.producto_id)?.udm ?? ''}` : ''),
          lineas.length > 1 ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar línea', onclick: () => { lineas.splice(i, 1); pintar(); } }, icono('cerrar', { tam: 14 })) : el('span'));
      }),
      boton('Agregar producto', { icono: 'mas', onclick: () => { lineas.push({ producto_id: '', cantidad: 1, costo: 0 }); pintar(); } }));
  };
  selAlmacen.addEventListener('change', pintar);
  pintar();

  const guardar = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    let ruta = null;
    try {
      const validas = lineas.filter((l) => l.producto_id);
      if (!validas.length) throw new Error('Agrega al menos un producto.');
      if (validas.some((l) => !l.cantidad || (tipo !== 'ajuste' && l.cantidad < 0))) throw new Error('Revisa las cantidades.');
      if ((tipo === 'salida' || tipo === 'ajuste') && !motivo.value.trim()) throw new Error('Indica el motivo.');
      if (archivo?.files[0]) ruta = (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'inventario', archivo: archivo.files[0], tabla: 'inv_documentos', tipos: ARCHIVOS })).ruta;
      const id = await registrar(ctx, {
        tipo, fecha: fecha.value || hoyISO(), almacen: selAlmacen.value, destino: selDestino?.value ?? null,
        lineas: validas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, costo_unitario: tipo === 'entrada' ? l.costo : 0 })),
        tercero: selProv?.value || null, docTipo: selDocTipo?.value ?? null, docNumero: docNum?.value ?? null, motivo: motivo.value, archivo: ruta,
        solicitud: solicitud?.id ?? null,
      });
      avisar(`${nombreDoc[tipo]} registrada.`);
      location.hash = ctx.ruta('inventario.documento', { id });
    } catch (e) {
      if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {});
      avisar(e.message, 'error'); b.disabled = false;
    }
  };

  const fila = (label, ctl) => (ctl ? el('div', { class: 'form-fila' }, el('label', { for: ctl.id }, label), ctl) : null);
  const ayuda = { entrada: 'Compra o recepción: suma al almacén. El costo unitario queda como último costo del producto.', salida: 'Consumo o pérdida: resta del almacén.',
    ajuste: 'Corrige el stock contado: positivo suma, negativo resta.', traslado: 'Mueve productos de un almacén a otro.' }[tipo];
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, `Nueva ${nombreDoc[tipo].toLowerCase()}`), el('p', { class: 'texto-suave' }, ayuda)),
      el('div', { class: 'listado-acciones' }, boton('Registrar', { icono: 'check', tipo: 'primario', onclick: guardar }))),
    solicitud ? el('p', { class: 'aviso-bandeja' }, icono('check', { tam: 16 }), `Recepción de la solicitud N° ${solicitud.numero} (${solicitud.item}): al registrar queda recibida.`) : null,
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'rejilla-campos' }, fila('Fecha', fecha), fila(tipo === 'traslado' ? 'Desde' : 'Almacén', selAlmacen)),
        fila('Hacia', selDestino),
        fila('Proveedor', selProv),
        selDocTipo ? el('div', { class: 'rejilla-campos' }, fila('Documento', selDocTipo), fila('N° del documento', docNum)) : null,
        fila('Factura, guía o boleta (PDF o foto)', archivo),
        fila(tipo === 'entrada' || tipo === 'traslado' ? 'Nota' : 'Motivo', motivo)),
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Productos'), cuerpo)));
}
