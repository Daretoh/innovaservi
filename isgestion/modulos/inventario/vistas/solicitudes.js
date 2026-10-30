// Solicitudes de pedido (SolPed): pendiente → comprada → recibida (al registrar la entrada) o rechazada.
import { el } from '../../../core/ui/dom.js?v=a665921';
import { boton } from '../../../core/ui/tabla.js?v=a665921';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a665921';
import { avisar } from '../../../core/ui/aviso.js?v=a665921';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=a665921';
import { cargarProductos, cant } from '../datos.js?v=a665921';

const COLUMNAS = [['pendiente', 'Pendientes', 'Comprada'], ['comprada', 'Compradas', null], ['recibida', 'Recibidas', null], ['rechazada', 'Rechazadas', null]];

export default async function vista(ctx) {
  const [{ data, error }, productos] = await Promise.all([
    ctx.api.from('inv_solicitudes').select('*, inv_productos(sku, nombre, udm), inv_documentos!inv_solicitudes_documento_fk(id, numero)').eq('empresa_id', ctx.empresa.id).order('numero', { ascending: false }).limit(300),
    cargarProductos(ctx),
  ]);
  if (error) throw error;
  const editar = ctx.puede('inventario', 'editar');
  const cambiar = async (s, estado) => {
    const { error: e } = await ctx.api.from('inv_solicitudes').update({ estado }).eq('id', s.id);
    if (e) avisar(e.message, 'error'); else ctx.refrescar();
  };

  const tarjeta = (s) => el('div', { class: `tal-tarjeta ${s.urgencia === 'urgente' ? 'prio-urgente' : ''}` },
    el('div', { class: 'plan-fila' }, el('span', { class: 'texto-chico texto-suave' }, `N° ${s.numero} · ${fechaLarga(diaLocal(s.created_at))}`),
      s.urgencia === 'urgente' ? el('span', { class: 'chip chip-venc' }, 'Urgente') : null),
    el('strong', {}, s.inv_productos ? `${s.inv_productos.nombre}` : s.item),
    el('span', { class: 'texto-chico' }, `${cant(s.cantidad)} ${s.inv_productos?.udm ?? ''}`),
    s.motivo ? el('span', { class: 'texto-suave texto-chico' }, s.motivo) : null,
    s.inv_documentos ? el('a', { class: 'texto-chico', href: ctx.ruta('inventario.documento', { id: s.inv_documentos.id }) }, `Entrada N° ${s.inv_documentos.numero}`) : null,
    editar ? el('div', { class: 'tal-botones' },
      s.estado === 'pendiente' ? boton('Comprada', { onclick: () => cambiar(s, 'comprada') }) : null,
      ['pendiente', 'comprada'].includes(s.estado) && ctx.puede('inventario', 'crear')
        ? boton('Recibir', { tipo: 'primario', onclick: () => {
          if (!s.producto_id) { avisar('Liga la solicitud a un producto del inventario para recibirla (edítala).', 'error'); return; }
          location.hash = ctx.ruta('inventario.documento', { tipo: 'entrada', solicitud: s.id });
        } }) : null,
      ['pendiente', 'comprada'].includes(s.estado) ? boton('Rechazar', { onclick: () => cambiar(s, 'rechazada') }) : null,
      ['pendiente', 'comprada'].includes(s.estado) ? boton('Editar', { onclick: () => formulario(ctx, productos, s) }) : null,
      s.estado === 'rechazada' ? boton('Reabrir', { onclick: () => cambiar(s, 'pendiente') }) : null) : null);

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Solicitudes de pedido'),
      ctx.puede('inventario', 'crear') ? el('div', { class: 'listado-acciones' }, boton('Nueva solicitud', { icono: 'mas', tipo: 'primario', onclick: () => formulario(ctx, productos, null) })) : null),
    el('div', { class: 'plan-tablero inv-solicitudes' }, COLUMNAS.map(([k, n]) => {
      const lista = data.filter((s) => s.estado === k);
      return el('div', { class: 'plan-columna' },
        el('div', { class: 'plan-cabecera' }, el('strong', {}, n), el('span', { class: 'texto-suave texto-chico' }, String(lista.length))),
        lista.length ? lista.map(tarjeta) : el('p', { class: 'texto-suave texto-chico' }, 'Vacío'));
    })),
    el('p', { class: 'texto-suave texto-chico' }, 'Recibir abre la entrada al inventario con lo pedido; al registrarla la solicitud queda recibida. Para deshacer, se anula la entrada.'));
}

async function formulario(ctx, productos, s) {
  abrirFormulario({
    titulo: s ? `Solicitud N° ${s.numero}` : 'Nueva solicitud de pedido',
    campos: [
      { id: 'producto_id', etiqueta: 'Producto del inventario', opciones: [['', 'Otro (escribirlo abajo)'], ...productos.map((p) => [p.id, `${p.sku} · ${p.nombre}`])], valor: s?.producto_id ?? '' },
      { id: 'item', etiqueta: 'Qué se pide (si no está en el inventario)', valor: s && !s.producto_id ? s.item : '' },
      { id: 'cantidad', etiqueta: 'Cantidad', tipo: 'number', requerido: true, valor: String(s?.cantidad ?? 1) },
      { id: 'urgencia', etiqueta: 'Urgencia', opciones: [['normal', 'Normal'], ['urgente', 'Urgente']], valor: s?.urgencia ?? 'normal' },
      { id: 'motivo', etiqueta: 'Para qué o por qué', tipo: 'textarea', valor: s?.motivo ?? '' },
    ],
    alGuardar: async (v) => {
      const p = productos.find((x) => x.id === v.producto_id);
      const item = p?.nombre ?? v.item.trim();
      if (!item) throw new Error('Elige un producto o escribe qué se pide.');
      const cantidad = Number(v.cantidad);
      if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
      const datos = { producto_id: p?.id ?? null, item, cantidad, urgencia: v.urgencia, motivo: v.motivo.trim() || null };
      let r;
      if (s) r = await ctx.api.from('inv_solicitudes').update(datos).eq('id', s.id);
      else {
        const { data: numero, error: e } = await ctx.api.rpc('siguiente_correlativo', { p_empresa: ctx.empresa.id, p_modulo: 'inventario', p_clave: 'inventario.solicitud' });
        if (e) throw new Error(e.message);
        r = await ctx.api.from('inv_solicitudes').insert({ ...datos, empresa_id: ctx.empresa.id, numero });
      }
      if (r.error) throw new Error(r.error.message);
      avisar('Solicitud guardada.'); ctx.refrescar();
    },
  });
}
