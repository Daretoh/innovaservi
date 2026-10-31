// Clientes y proveedores de la empresa activa. Tocar una fila abre su ficha (editar).
import { el } from '../../../core/ui/dom.js?v=66a811d';
import { listado, boton } from '../../../core/ui/tabla.js?v=66a811d';
import { fichaTercero } from '../formulario.js?v=66a811d';

export default async function vista(ctx) {
  const { data, error } = await ctx.api
    .from('terceros')
    .select('id, rut, razon_social, nombre_fantasia, giro, direccion, tipo, contacto, email, telefono')
    .eq('empresa_id', ctx.empresa.id)
    .is('deleted_at', null)
    .order('razon_social');
  if (error) throw error;

  const acciones = [];
  if (ctx.puede('terceros', 'crear')) {
    acciones.push(boton('Nuevo', { icono: 'mas', tipo: 'primario', onclick: () => fichaTercero(ctx) }));
  }

  return listado({
    titulo: 'Clientes y proveedores',
    filas: data,
    acciones,
    vacio: 'Aún no hay clientes ni proveedores.',
    alFila: ctx.puede('terceros', 'editar') ? (f) => fichaTercero(ctx, f) : null,
    columnas: [
      { titulo: 'RUT', valor: (f) => f.rut },
      { titulo: 'Razón social', valor: (f) => f.razon_social },
      { titulo: 'Dirección', valor: (f) => f.direccion },
      { titulo: 'Tipo', valor: (f) => el('span', {}, f.tipo.map((t) => el('span', { class: 'etiqueta' }, t === 'cliente' ? 'Cliente' : 'Proveedor'))) },
      { titulo: 'Contacto', valor: (f) => f.contacto },
      { titulo: 'Correo', valor: (f) => f.email },
      { titulo: 'Teléfono', valor: (f) => f.telefono },
    ],
  });
}
