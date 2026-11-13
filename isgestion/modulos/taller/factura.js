// El cliente pide factura (Cotizaciones 008, 2026-11-05), aunque sea a última hora y estuviera como natural y sin datos:
// se completan los datos de facturación (tal_pedir_factura) y la orden queda esperando el pago: no se entrega hasta que
// el pago de su factura esté registrado en Cotizaciones → Facturas (la base lo exige). Boletas y cierres, sin cambios.
import { abrirFormulario } from '../../core/ui/modal.js?v=23e9550';
import { avisar } from '../../core/ui/aviso.js?v=23e9550';
import { rutValido, limpioRut } from '../../core/lector-dte.js?v=23e9550';

const rutGuardado = (r) => { const c = limpioRut(r); return `${c.slice(0, -1)}-${c.slice(-1)}`; };   // como en el maestro: 12345678-9

export function formPedirFactura(ctx, o, { cliente = null, facturarA = null, alGuardar } = {}) {
  const base = facturarA ?? cliente;
  const sinRut = cliente && !cliente.rut;   // natural sin datos: se puede completar su misma ficha
  abrirFormulario({
    titulo: `Pide factura · N° ${o.numero}`,
    mensaje: 'La orden queda con Factura (suma el IVA) y no se entrega hasta registrar el pago en Cotizaciones → Facturas.',
    campos: [
      ...(sinRut && !facturarA ? [{ id: 'mismo', etiqueta: '¿A quién se factura?', opciones: [['si', `A ${cliente.nombre_fantasia || cliente.razon_social} (completar su ficha)`], ['no', 'A otra empresa (el vehículo sigue a nombre del cliente)']], valor: 'si' }] : []),
      { id: 'rut', etiqueta: 'RUT', requerido: true, valor: base?.rut ?? '' },
      { id: 'razon', etiqueta: 'Razón social', requerido: true, valor: base?.razon_social ?? '' },
      { id: 'giro', etiqueta: 'Giro', valor: base?.giro ?? '' },
      { id: 'direccion', etiqueta: 'Dirección', valor: base?.direccion ?? '' },
      { id: 'email', etiqueta: 'Correo para la factura', tipo: 'email', valor: base?.email ?? '' },
    ],
    textoGuardar: 'Guardar y esperar pago',
    alGuardar: async (v) => {
      if (!rutValido(v.rut)) throw new Error('Revisa el RUT: el dígito verificador no coincide.');
      const { error } = await ctx.api.rpc('tal_pedir_factura', {
        p_orden: o.id, p_mismo: (v.mismo ?? 'no') === 'si', p_rut: rutGuardado(v.rut), p_razon: v.razon.trim(),
        p_giro: v.giro?.trim() || null, p_direccion: v.direccion?.trim() || null, p_email: v.email?.trim() || null,
      });
      if (error) throw new Error(/terceros_rut_uq/.test(error.message) ? 'Ya hay un cliente con ese RUT.' : error.message);
      avisar('Listo: la orden espera el pago de su factura.');
      alGuardar?.();
    },
  });
}

// Se arrepintió: vuelve a boleta (solo si todavía no hay factura registrada; la base lo revisa)
export async function quitarPedido(ctx, o, alGuardar) {
  const { error } = await ctx.api.from('tal_ordenes').update({ factura_tercero_id: null, doc_tipo: 'boleta' }).eq('id', o.id);
  if (error) { avisar(error.message, 'error'); return; }
  avisar('La orden vuelve a Boleta.');
  alGuardar?.();
}
