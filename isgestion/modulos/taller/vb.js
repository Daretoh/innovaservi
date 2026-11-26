// VB de entrega (Taller 002): con la opción "Entregar solo con VB" el encargado lleva la orden hasta Terminado y
// quien tiene taller.aprobar la pasa a Entregado después de revisar lo cargado. Sin PIN desde Taller 016 (decisión de
// Enzo, 2026-11-24): basta la sesión y queda anotado quién lo dio. También devuelve a Terminado una entregada sin
// cobrar, con motivo. La base lo exige (tal_vb); aquí está la ventana.
import { abrirFormulario } from '../../core/ui/modal.js?v=76c5d2a';
import { avisar } from '../../core/ui/aviso.js?v=76c5d2a';
import { dinero } from '../../core/ui/formato.js?v=76c5d2a';
import { SELECT_ORDEN, totales, verPatente, nombreVehiculo } from './datos.js?v=76c5d2a';

export const pideVb = (ctx) => ctx.config?.vb_entrega === true;
export const puedeVb = (ctx) => ctx.puede('taller', 'aprobar');

// accion: 'entregar' (Terminado → Entregado) o 'reabrir' (Entregado → Terminado). alListo() tras guardar.
export async function darVb(ctx, orden, accion, alListo) {
  try {
    const [{ data: o, error }, fotos] = await Promise.all([
      ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('id', orden.id).single(),
      ctx.api.from('tal_media').select('id', { count: 'exact', head: true }).eq('orden_id', orden.id),
    ]);
    if (error) throw error;
    const lineas = o.tal_orden_servicios ?? [];
    const t = totales(o, lineas);
    const auto = `${verPatente(o.tal_vehiculos?.patente) || 'S/P'} ${nombreVehiculo(o.tal_vehiculos)}`.trim();
    const hecho = async (v) => {
      const { data, error: e } = await ctx.api.rpc('tal_vb', { p_orden: o.id, p_accion: accion, p_pin: null, p_nota: v.nota || null });
      if (e) throw new Error(e.message);
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo dar el VB.');
      avisar(accion === 'entregar' ? `N° ${o.numero}: Entregado con tu VB.` : `N° ${o.numero}: devuelta a Terminado.`);
      alListo?.();
    };
    if (accion === 'reabrir') {
      abrirFormulario({
        titulo: `Devolver a Terminado · N° ${o.numero}`,
        mensaje: `${auto}. La orden vuelve a Terminado para completarla y queda anotado el motivo.`,
        campos: [{ id: 'nota', etiqueta: 'Motivo', requerido: true }],
        textoGuardar: 'Devolver', alGuardar: hecho,
      });
      return;
    }
    if (!lineas.length && o.tipo_venta === 'normal') { avisar('La orden no tiene servicios: agrégalos antes de dar el VB.', 'error'); return; }
    const servicios = lineas.map((x) => `${x.nombre} ${dinero(x.precio)}`).join(' · ');
    abrirFormulario({
      titulo: `VB de entrega · N° ${o.numero}`,
      mensaje: `${auto}. Servicios (${lineas.length}): ${servicios || 'ninguno'}.${Number(o.descuento) ? ` Descuento ${dinero(o.descuento)}.` : ''} Total ${dinero(t.total)}. Fotos: ${fotos.count ?? 0}.`,
      campos: [
        { id: 'revisado', etiqueta: 'Revisé que esté todo cargado', tipo: 'checks', opciones: [
          ['servicios', 'Servicios y extras hechos están en la orden'],
          ['precios', 'Precios y descuento correctos'],
          ['insumos', 'Insumos usados cargados'],
          ['fotos', 'Fotos del trabajo'],
        ] },
        { id: 'nota', etiqueta: 'Nota (opcional)' },
      ],
      textoGuardar: 'Dar VB y entregar',
      alGuardar: async (v) => {
        if (v.revisado.length < 4) throw new Error('Marca las cuatro revisiones antes de dar el VB.');
        await hecho(v);
      },
    });
  } catch (e) { avisar(e.message, 'error'); }
}
