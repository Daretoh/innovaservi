// Clientes y proveedores de la empresa activa.
import { el } from '../../../core/ui/dom.js';
import { listado, boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';

const TIPOS = [['cliente', 'Cliente'], ['proveedor', 'Proveedor'], ['ambos', 'Cliente y proveedor']];

export default async function vista(ctx) {
  const { data, error } = await ctx.api
    .from('terceros')
    .select('id, rut, razon_social, nombre_fantasia, tipo, contacto, email, telefono')
    .eq('empresa_id', ctx.empresa.id)
    .is('deleted_at', null)
    .order('razon_social');
  if (error) throw error;

  const acciones = [];
  if (ctx.puede('terceros', 'crear')) {
    acciones.push(boton('Nuevo', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx) }));
  }

  return listado({
    titulo: 'Clientes y proveedores',
    filas: data,
    acciones,
    vacio: 'Aún no hay clientes ni proveedores.',
    columnas: [
      { titulo: 'RUT', valor: (f) => f.rut },
      { titulo: 'Razón social', valor: (f) => f.razon_social },
      { titulo: 'Tipo', valor: (f) => el('span', {}, f.tipo.map((t) => el('span', { class: 'etiqueta' }, t === 'cliente' ? 'Cliente' : 'Proveedor'))) },
      { titulo: 'Contacto', valor: (f) => f.contacto },
      { titulo: 'Correo', valor: (f) => f.email },
      { titulo: 'Teléfono', valor: (f) => f.telefono },
    ],
  });
}

// Mismo formato que rut_normalizar() en la base: 12345678-9
function normalizarRut(rut) {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
}

function nuevo(ctx) {
  abrirFormulario({
    titulo: 'Nuevo cliente o proveedor',
    campos: [
      { id: 'razon_social', etiqueta: 'Razón social', requerido: true },
      { id: 'rut', etiqueta: 'RUT' },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS },
      { id: 'contacto', etiqueta: 'Contacto' },
      { id: 'email', etiqueta: 'Correo', tipo: 'email' },
      { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('terceros').insert({
        empresa_id: ctx.empresa.id,
        razon_social: v.razon_social.trim(),
        rut: v.rut.trim() ? normalizarRut(v.rut) : null,
        tipo: v.tipo === 'ambos' ? ['cliente', 'proveedor'] : [v.tipo],
        contacto: v.contacto.trim() || null,
        email: v.email.trim() || null,
        telefono: v.telefono.trim() || null,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Ya existe un cliente o proveedor con ese RUT.');
        if (error.code === '23514') throw new Error('El RUT no es válido.');
        throw new Error(error.message);
      }
      avisar('Registro creado.');
      ctx.refrescar();
    },
  });
}
