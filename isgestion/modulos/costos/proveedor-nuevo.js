// Crear un proveedor desde un gasto o el lector (2026-11-27, pedido de Enzo: la luz de Saesa se paga en Servipag y se
// sube el comprobante de Servipag, que no trae a Saesa). Razón social y RUT opcional; si ya existe uno con ese RUT o ese
// nombre, se usa ese. Pide terceros.crear (el enlace no se muestra a quien no puede).
import { el } from '../../core/ui/dom.js?v=96471b3';
import { abrirFormulario } from '../../core/ui/modal.js?v=96471b3';
import { avisar } from '../../core/ui/aviso.js?v=96471b3';
import { limpioRut, rutValido } from '../../core/lector-dte.js?v=96471b3';

export const puedeCrearProveedor = (ctx) => ctx.puede('terceros', 'crear');

// Enlace "+ Nuevo proveedor": al crearlo llama alCrear(tercero) con { id, rut, razon_social, nombre_fantasia, tipo }
export function enlaceNuevoProveedor(ctx, alCrear, { texto = '+ Nuevo proveedor', razon = () => '' } = {}) {
  if (!puedeCrearProveedor(ctx)) return null;
  return el('a', { href: '#', class: 'texto-chico', onclick: (ev) => { ev.preventDefault(); nuevoProveedor(ctx, alCrear, { razon: razon() }); } }, texto);
}

export function nuevoProveedor(ctx, alCrear, { razon = '' } = {}) {
  const e = ctx.empresa.id;
  abrirFormulario({
    titulo: 'Nuevo proveedor',
    mensaje: 'Queda en Clientes y proveedores. Si el documento es de un intermediario (ej.: Servipag), crea aquí a quien realmente se le paga (ej.: Saesa).',
    campos: [
      { id: 'razon', etiqueta: 'Razón social o nombre', requerido: true, valor: razon },
      { id: 'rut', etiqueta: 'RUT (opcional)', valor: '' },
    ],
    textoGuardar: 'Crear proveedor',
    alGuardar: async (v) => {
      const nombre = v.razon.trim();
      const rut = v.rut.trim();
      if (!nombre) throw new Error('Escribe la razón social o el nombre.');
      if (rut && !rutValido(rut)) throw new Error('El RUT no es válido (revisa el dígito verificador).');
      const c = rut ? limpioRut(rut) : null;
      const rutFmt = c ? `${c.slice(0, -1)}-${c.slice(-1)}` : null;
      // ¿Ya existe? (mismo RUT o mismo nombre)
      const { data: ya } = await ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null)
        .or([rutFmt ? `rut.eq.${rutFmt}` : null, `razon_social.ilike.${nombre.replace(/[,()]/g, ' ')}`].filter(Boolean).join(','));
      const existente = (ya ?? [])[0];
      if (existente) {
        if (!existente.tipo?.includes('proveedor') && ctx.puede('terceros', 'editar')) {
          await ctx.api.from('terceros').update({ tipo: [...(existente.tipo ?? []), 'proveedor'] }).eq('id', existente.id);
          existente.tipo = [...(existente.tipo ?? []), 'proveedor'];
        }
        avisar(`Ya existía: ${existente.razon_social}. Quedó elegido.`);
        alCrear(existente); return;
      }
      const { data, error } = await ctx.api.from('terceros').insert({ empresa_id: e, razon_social: nombre, rut: rutFmt, tipo: ['proveedor'] })
        .select('id, rut, razon_social, nombre_fantasia, tipo').single();
      if (error) throw new Error(error.message);
      avisar(`Proveedor creado: ${data.razon_social}.`);
      alCrear(data);
    },
  });
}
