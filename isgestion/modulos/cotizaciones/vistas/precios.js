// Listas de precios por cliente (lo que en el OS era "flota"): precio sin talla o por talla S/M/L/XL.
// Al cotizar a ese cliente, el precio se sugiere desde su lista antes que desde el catálogo.
import { el } from '../../../core/ui/dom.js?v=08113ef';
import { listado, boton } from '../../../core/ui/tabla.js?v=08113ef';
import { abrirFormulario } from '../../../core/ui/modal.js?v=08113ef';
import { avisar } from '../../../core/ui/aviso.js?v=08113ef';
import { dinero } from '../../../core/ui/formato.js?v=08113ef';
import { nombreTercero, TALLAS } from '../datos.js?v=08113ef';

const estado = { cliente: '' };

export default async function vista(ctx) {
  const [clientes, precios] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('cot_precios').select('*').eq('empresa_id', ctx.empresa.id).order('descripcion'),
  ]);
  if (precios.error) throw precios.error;
  const conLista = new Set(precios.data.map((p) => p.tercero_id));
  if (!estado.cliente && precios.data.length) estado.cliente = precios.data[0].tercero_id;
  const filas = precios.data.filter((p) => p.tercero_id === estado.cliente);
  const editable = ctx.puede('cotizaciones', 'editar');

  const sel = el('select', { class: 'campo campo-filtro', 'aria-label': 'Cliente' },
    el('option', { value: '' }, 'Elige un cliente…'),
    (clientes.data ?? []).map((c) => el('option', { value: c.id, selected: c.id === estado.cliente }, `${nombreTercero(c)}${conLista.has(c.id) ? ' · con lista' : ''}`)));
  sel.addEventListener('change', () => { estado.cliente = sel.value; ctx.refrescar(); });
  const acciones = [sel];
  if (estado.cliente && ctx.puede('cotizaciones', 'crear')) acciones.push(boton('Agregar precio', { icono: 'mas', tipo: 'primario', onclick: () => formulario(ctx, null) }));

  const valor = (n) => (n == null ? '' : dinero(n));
  const lista = listado({
    titulo: 'Listas de precios por cliente',
    filas,
    acciones,
    vacio: estado.cliente ? 'Este cliente no tiene precios especiales.' : 'Elige un cliente para ver o crear su lista.',
    columnas: [
      { titulo: 'Servicio o ítem', valor: (p) => (editable ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); formulario(ctx, p); } }, p.descripcion) : p.descripcion) },
      { titulo: 'Sin talla', valor: (p) => valor(p.precio) },
      ...TALLAS.map((t) => ({ titulo: t, valor: (p) => valor(p[`precio_${t.toLowerCase()}`]) })),
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Usa el mismo nombre del servicio del catálogo para que se reconozca al cotizar. Si el ítem no depende de la talla (ej.: retiro y entrega), deja solo "sin talla".'));
  return lista;
}

function formulario(ctx, p) {
  abrirFormulario({
    titulo: p ? p.descripcion : 'Agregar precio especial',
    campos: [
      { id: 'descripcion', etiqueta: 'Servicio o ítem', requerido: true, valor: p?.descripcion ?? '' },
      { id: 'precio', etiqueta: 'Precio sin talla', tipo: 'number', valor: p?.precio != null ? String(p.precio) : '' },
      ...TALLAS.map((t) => ({ id: `precio_${t.toLowerCase()}`, etiqueta: `Precio talla ${t}`, tipo: 'number', valor: p?.[`precio_${t.toLowerCase()}`] != null ? String(p[`precio_${t.toLowerCase()}`]) : '' })),
      ...(p && ctx.puede('cotizaciones', 'eliminar') ? [{ id: 'eliminar', etiqueta: 'Eliminar este precio', opciones: [['no', 'No'], ['si', 'Sí, eliminarlo']], valor: 'no' }] : []),
    ],
    alGuardar: async (v) => {
      if (v.eliminar === 'si') {
        const { error } = await ctx.api.from('cot_precios').delete().eq('id', p.id);
        if (error) throw new Error(error.message);
        avisar('Precio eliminado.'); ctx.refrescar(); return;
      }
      const n = (k) => (v[k] === '' ? null : Math.max(0, Math.round(Number(v[k]))));
      const datos = { descripcion: v.descripcion.trim(), precio: n('precio'), precio_s: n('precio_s'), precio_m: n('precio_m'), precio_l: n('precio_l'), precio_xl: n('precio_xl') };
      if ([datos.precio, datos.precio_s, datos.precio_m, datos.precio_l, datos.precio_xl].every((x) => x == null)) throw new Error('Indica al menos un precio.');
      const r = p ? await ctx.api.from('cot_precios').update(datos).eq('id', p.id)
        : await ctx.api.from('cot_precios').insert({ ...datos, empresa_id: ctx.empresa.id, tercero_id: estado.cliente });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ese ítem ya está en la lista del cliente.' : r.error.message);
      avisar('Precio guardado.'); ctx.refrescar();
    },
  });
}
