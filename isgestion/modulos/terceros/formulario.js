// Ficha de un cliente o proveedor (crear o editar). La usan Clientes y proveedores y Faenas → Clientes y sitios.
// Sus datos salen en los documentos: razón social, RUT y dirección en el informe de trabajo, cotizaciones y cierres.
import { abrirFormulario } from '../../core/ui/modal.js?v=605af68';
import { avisar } from '../../core/ui/aviso.js?v=605af68';
import { telefono } from '../../core/ui/formato.js?v=605af68';

export const TIPOS = [['cliente', 'Cliente'], ['proveedor', 'Proveedor'], ['ambos', 'Cliente y proveedor']];

// Mismo formato que rut_normalizar() en la base: 12345678-9
export function normalizarRut(rut) {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  return limpio.length > 1 ? `${limpio.slice(0, -1)}-${limpio.slice(-1)}` : limpio;
}

// t: registro de terceros (null = nuevo). alGuardar(): para refrescar la vista que lo abrió.
export function fichaTercero(ctx, t = null, { alGuardar } = {}) {
  const tipo = !t ? 'cliente' : t.tipo?.length > 1 ? 'ambos' : t.tipo?.[0] ?? 'cliente';
  abrirFormulario({
    titulo: t ? `Editar · ${t.nombre_fantasia || t.razon_social}` : 'Nuevo cliente o proveedor',
    mensaje: 'La razón social, el RUT y la dirección salen en los informes, cotizaciones y cierres.',
    campos: [
      { id: 'razon_social', etiqueta: 'Razón social', requerido: true, valor: t?.razon_social ?? '' },
      { id: 'nombre_fantasia', etiqueta: 'Nombre corto (se muestra en listas y calendario)', valor: t?.nombre_fantasia ?? '' },
      { id: 'rut', etiqueta: 'RUT', valor: t?.rut ?? '' },
      { id: 'giro', etiqueta: 'Giro', valor: t?.giro ?? '' },
      { id: 'direccion', etiqueta: 'Dirección', valor: t?.direccion ?? '', ayuda: 'Si la faena es en un sitio con dirección propia (Clientes y sitios), el informe usa la del sitio.' },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS, valor: tipo },
      { id: 'contacto', etiqueta: 'Contacto', valor: t?.contacto ?? '' },
      { id: 'email', etiqueta: 'Correo', tipo: 'email', valor: t?.email ?? '' },
      { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', valor: t?.telefono ?? '' },
    ],
    textoGuardar: t ? 'Guardar cambios' : 'Crear',
    alGuardar: async (v) => {
      const datos = {
        razon_social: v.razon_social.trim(),
        nombre_fantasia: v.nombre_fantasia.trim() || null,
        rut: v.rut.trim() ? normalizarRut(v.rut) : null,
        giro: v.giro.trim() || null,
        direccion: v.direccion.trim() || null,
        tipo: v.tipo === 'ambos' ? ['cliente', 'proveedor'] : [v.tipo],
        contacto: v.contacto.trim() || null,
        email: v.email.trim() || null,
        telefono: telefono(v.telefono),
      };
      const { data, error } = t
        ? await ctx.api.from('terceros').update(datos).eq('id', t.id).select('id')
        : await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, ...datos }).select('id');
      if (error) {
        if (error.code === '23505') throw new Error('Ya existe un cliente o proveedor con ese RUT.');
        if (error.code === '23514') throw new Error('El RUT no es válido.');
        throw new Error(error.message);
      }
      if (!data?.length) throw new Error('No tienes permiso para cambiar este registro.');
      avisar(t ? 'Datos guardados.' : 'Registro creado.');
      (alGuardar ?? ctx.refrescar)();
    },
  });
}
