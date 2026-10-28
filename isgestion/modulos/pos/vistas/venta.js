// Venta en mesón: productos del almacén de venta (con su stock), ítems manuales, cliente, medio de pago
// voucher y descuento. Al registrar, la base calcula el total y descuenta el stock. Avisa si la caja del día
// no está abierta o ya se cerró (cerrada, la base no acepta ventas en efectivo de ese día).
import { el } from '../../../core/ui/dom.js?v=a4abe71';
import { icono } from '../../../core/ui/iconos.js?v=a4abe71';
import { boton } from '../../../core/ui/tabla.js?v=a4abe71';
import { avisar } from '../../../core/ui/aviso.js?v=a4abe71';
import { subirArchivo, eliminarArchivo } from '../../../core/adjuntos.js?v=a4abe71';
import { dinero, hoyISO } from '../../../core/ui/formato.js?v=a4abe71';
import { MEDIOS, DOCS } from '../datos.js?v=a4abe71';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];
// El carro se mantiene mientras se navega dentro de la sesión
const estado = { carro: [], buscar: '', almacen: null, medio: 'debito', doc: 'boleta', descuento: 0 };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [alm, prods, stock, clientes, caja] = await Promise.all([
    ctx.api.from('inv_almacenes').select('*').eq('empresa_id', e).eq('activo', true).order('orden'),
    ctx.api.from('inv_productos').select('id, sku, nombre, precio, udm, categoria').eq('empresa_id', e).eq('activo', true).is('deleted_at', null).order('nombre'),
    ctx.api.from('inv_stock').select('producto_id, almacen_id, cantidad').eq('empresa_id', e),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('pos_cajas').select('id, cerrada_at').eq('empresa_id', e).eq('fecha', hoyISO()).maybeSingle(),
  ]);
  const almacenes = (alm.data ?? []).filter((a) => a.es_venta);
  if (!almacenes.length) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Venta en mesón'),
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'No hay un almacén de venta. Márcalo en Inventario → Almacenes y tipos ("Se vende desde aquí").'));
  }
  if (!almacenes.some((a) => a.id === estado.almacen)) estado.almacen = almacenes[0].id;
  const stockDe = (pid) => Number((stock.data ?? []).find((s) => s.producto_id === pid && s.almacen_id === estado.almacen)?.cantidad ?? 0);
  const enCarro = (pid) => estado.carro.filter((l) => l.producto_id === pid).reduce((s, l) => s + Number(l.cantidad), 0);
  const subtotal = () => estado.carro.reduce((s, l) => s + Math.round(Number(l.cantidad || 0) * Number(l.precio || 0)), 0);
  const total = () => subtotal() - estado.descuento;

  // ---- Productos (izquierda): se filtran en el navegador, sin recargar
  const vendibles = (prods.data ?? []).filter((p) => p.categoria === 'venta');
  const buscador = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar producto o SKU…', value: estado.buscar, 'aria-label': 'Buscar producto' });
  const agregar = (p) => {
    if (enCarro(p.id) + 1 > stockDe(p.id)) { avisar(`No queda stock de ${p.nombre} en este almacén.`, 'error'); return; }
    const l = estado.carro.find((x) => x.producto_id === p.id);
    if (l) l.cantidad += 1; else estado.carro.push({ producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio: p.precio });
    pintarCarro();
  };
  const grilla = el('div', { class: 'pos-productos' });
  const pintarProductos = () => {
    const b = estado.buscar.trim().toLowerCase();
    const visibles = vendibles.filter((p) => !b || `${p.sku} ${p.nombre}`.toLowerCase().includes(b));
    grilla.replaceChildren(...(visibles.length ? visibles.map((p) => {
      const st = stockDe(p.id);
      return el('button', { type: 'button', class: 'pos-producto', disabled: st <= 0, onclick: () => agregar(p) },
        el('strong', {}, p.nombre),
        el('span', { class: 'texto-suave texto-chico' }, `${p.sku} · stock ${st}`),
        el('span', { class: 'pos-precio' }, p.precio ? dinero(p.precio) : 'Sin precio'));
    }) : [el('p', { class: 'texto-suave' }, vendibles.length ? 'Ningún producto coincide.' : 'Sin productos en venta. Créalos en Inventario (tipo "en venta").')]));
  };
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; pintarProductos(); });
  pintarProductos();

  // ---- Carro (derecha)
  const carro = el('div', {});
  const totalEl = el('strong', { class: 'pos-total-valor' });
  const subtotalEl = el('span', {});
  const descuento = el('input', { class: 'campo campo-num', id: 'pos-descuento', type: 'number', min: 0, step: 1, value: estado.descuento || '', placeholder: '0' });
  descuento.addEventListener('change', () => { estado.descuento = Math.max(0, Math.round(Number(descuento.value) || 0)); descuento.value = estado.descuento || ''; pintarCarro(); });
  const pintarCarro = () => {
    carro.replaceChildren(...(estado.carro.length ? estado.carro.map((l, i) => {
      const desc = l.producto_id ? el('span', { class: 'pos-linea-nombre' }, l.descripcion)
        : Object.assign(el('input', { class: 'campo', placeholder: 'Servicio o ítem', 'aria-label': 'Descripción' }), { value: l.descripcion });
      if (!l.producto_id) desc.addEventListener('change', () => { l.descripcion = desc.value; });
      const q = el('input', { class: 'campo campo-num', type: 'number', min: 1, step: 'any', value: l.cantidad, 'aria-label': 'Cantidad' });
      q.addEventListener('change', () => {
        const n = Math.max(0.01, Number(q.value) || 1);
        if (l.producto_id && enCarro(l.producto_id) - l.cantidad + n > stockDe(l.producto_id)) { avisar('No alcanza el stock.', 'error'); q.value = l.cantidad; return; }
        l.cantidad = n; pintarCarro();
      });
      const pr = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: l.precio, 'aria-label': 'Precio' });
      pr.addEventListener('change', () => { l.precio = Math.max(0, Math.round(Number(pr.value) || 0)); pintarCarro(); });
      return el('div', { class: 'pos-linea' }, desc, q, pr,
        el('span', { class: 'pos-linea-total' }, dinero(Math.round(l.cantidad * l.precio))),
        el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar', onclick: () => { estado.carro.splice(i, 1); pintarCarro(); } }, icono('cerrar', { tam: 14 })));
    }) : [el('p', { class: 'texto-suave' }, 'Toca un producto para agregarlo, o agrega un servicio.')]));
    subtotalEl.textContent = dinero(subtotal());
    totalEl.textContent = dinero(total());
  };
  pintarCarro();

  const selAlmacen = almacenes.length > 1 ? el('select', { class: 'campo', 'aria-label': 'Almacén de venta' }, almacenes.map((a) => el('option', { value: a.id, selected: a.id === estado.almacen }, a.nombre))) : null;
  selAlmacen?.addEventListener('change', () => { estado.almacen = selAlmacen.value; estado.carro = estado.carro.filter((l) => !l.producto_id); ctx.refrescar(); });
  const selCliente = el('select', { class: 'campo', id: 'pos-cliente' }, el('option', { value: '' }, 'Sin cliente del maestro'), (clientes.data ?? []).map((c) => el('option', { value: c.id }, c.nombre_fantasia || c.razon_social)));
  const cliente = el('input', { class: 'campo', id: 'pos-nombre', placeholder: 'Nombre (opcional)' });
  const patente = el('input', { class: 'campo', id: 'pos-patente', placeholder: 'Patente (opcional)' });
  const medio = el('select', { class: 'campo', id: 'pos-medio' }, MEDIOS.map(([k, n]) => el('option', { value: k, selected: k === estado.medio }, n)));
  medio.addEventListener('change', () => { estado.medio = medio.value; });
  const doc = el('select', { class: 'campo', id: 'pos-doc' }, DOCS.map(([k, n]) => el('option', { value: k, selected: k === estado.doc }, n)));
  doc.addEventListener('change', () => { estado.doc = doc.value; });
  const docNum = el('input', { class: 'campo', id: 'pos-docnum', placeholder: 'N° (opcional)' });
  const fecha = el('input', { class: 'campo', id: 'pos-fecha', type: 'date', value: hoyISO() });
  const voucher = el('input', { class: 'campo', id: 'pos-voucher', type: 'file', accept: ARCHIVOS.join(',') });

  const vender = async (ev) => {
    const btn = ev.currentTarget;
    if (!estado.carro.length) { avisar('Agrega productos o un servicio.', 'error'); return; }
    if (estado.carro.some((l) => !l.producto_id && !l.descripcion.trim())) { avisar('Los servicios llevan descripción.', 'error'); return; }
    if (total() <= 0) { avisar('El total debe ser mayor a cero (revisa los precios y el descuento).', 'error'); return; }
    btn.disabled = true;
    let ruta = null;
    try {
      if (voucher.files[0]) ruta = (await subirArchivo(ctx.api, { empresaId: e, modulo: 'pos', archivo: voucher.files[0], tabla: 'pos_ventas', tipos: ARCHIVOS })).ruta;
      const { data: id, error } = await ctx.api.rpc('pos_vender', {
        p_empresa: e, p_fecha: fecha.value || hoyISO(), p_almacen: estado.almacen, p_medio: estado.medio,
        p_lineas: estado.carro.map((l) => (l.producto_id ? { producto_id: l.producto_id, cantidad: l.cantidad, precio: l.precio } : { descripcion: l.descripcion.trim(), cantidad: l.cantidad, precio: l.precio })),
        p_tercero: selCliente.value || null, p_cliente: cliente.value || null, p_patente: patente.value || null,
        p_doc_tipo: estado.doc, p_doc_numero: docNum.value || null, p_archivo: ruta, p_descuento: estado.descuento,
      });
      if (error) throw new Error(error.message);
      const { data: v } = await ctx.api.from('pos_ventas').select('numero, total').eq('id', id).single();
      avisar(`Venta N° ${v.numero} registrada: ${dinero(v.total)}.`);
      estado.carro = []; estado.descuento = 0;
      ctx.refrescar();
    } catch (err) {
      if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {});
      avisar(err.message, 'error'); btn.disabled = false;
    }
  };

  const avisoCaja = !caja.data
    ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'La caja de hoy no está abierta. ', el('a', { href: ctx.ruta('pos.caja') }, 'Abrir caja'))
    : caja.data.cerrada_at ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'La caja de hoy está cerrada: no se puede vender en efectivo con fecha de hoy. ', el('a', { href: ctx.ruta('pos.caja') }, 'Ver caja')) : null;
  const fila = (label, ctl) => el('div', { class: 'form-fila' }, el('label', { for: ctl.id }, label), ctl);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Venta en mesón'),
      el('div', { class: 'listado-acciones' }, selAlmacen, el('a', { class: 'boton boton-secundario', href: ctx.ruta('pos.caja') }, 'Caja'), el('a', { class: 'boton boton-secundario', href: ctx.ruta('pos.ventas') }, 'Ventas'))),
    avisoCaja,
    el('div', { class: 'pos-grid' },
      el('div', { class: 'ficha doc-grupo pos-catalogo' }, buscador, grilla),
      el('div', { class: 'ficha doc-grupo pos-carro' },
        el('h2', {}, 'Venta'),
        carro,
        boton('Agregar servicio o ítem', { icono: 'mas', onclick: () => { estado.carro.push({ producto_id: null, descripcion: '', cantidad: 1, precio: 0 }); pintarCarro(); } }),
        el('div', { class: 'pos-cuadre-fila' }, el('span', {}, 'Subtotal'), subtotalEl),
        el('div', { class: 'pos-cuadre-fila' }, el('label', { for: 'pos-descuento' }, 'Descuento ($)'), descuento),
        el('div', { class: 'pos-total' }, el('span', {}, 'Total'), totalEl),
        el('div', { class: 'rejilla-campos' }, fila('Medio de pago', medio), fila('Fecha', fecha)),
        el('div', { class: 'rejilla-campos' }, fila('Documento', doc), fila('N° de documento', docNum)),
        fila('Cliente', selCliente),
        el('div', { class: 'rejilla-campos' }, fila('Nombre', cliente), fila('Patente', patente)),
        fila('Voucher o boleta (opcional)', voucher),
        ctx.puede('pos', 'crear') ? boton('Registrar venta', { icono: 'check', tipo: 'primario', onclick: vender }) : null,
        el('p', { class: 'texto-suave texto-chico' }, 'La venta descuenta el stock del almacén de venta. No marca como cobrada una orden del taller.'))));
}
