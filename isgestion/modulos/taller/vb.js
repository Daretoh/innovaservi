// VB de entrega (Taller 002): con la opción "Entregar solo con VB" el encargado lleva la orden hasta Terminado y
// quien tiene taller.aprobar la pasa a Entregado después de revisar lo cargado, con su PIN personal. También
// devuelve a Terminado una entregada sin cobrar, con motivo. La base lo exige (tal_vb); aquí está la ventana.
import { abrirFormulario } from '../../core/ui/modal.js?v=882cc93';
import { avisar } from '../../core/ui/aviso.js?v=882cc93';
import { dinero } from '../../core/ui/formato.js?v=882cc93';
import { estadoPin, formularioPin } from '../../core/pin.js?v=882cc93';
import { SELECT_ORDEN, totales, verPatente, nombreVehiculo } from './datos.js?v=882cc93';

export const pideVb = (ctx) => ctx.config?.vb_entrega === true;
export const puedeVb = (ctx) => ctx.puede('taller', 'aprobar');

// accion: 'entregar' (Terminado → Entregado) o 'reabrir' (Entregado → Terminado). alListo() tras guardar.
export async function darVb(ctx, orden, accion, alListo) {
  try {
    const pin = await estadoPin(ctx.api);
    if (pin.bloqueado_hasta) { avisar('Tu PIN está bloqueado por intentos fallidos: espera 15 minutos.', 'error'); return; }
    if (!pin.definido) {
      formularioPin(ctx.api, { mensaje: 'Para dar el VB necesitas tu PIN personal (4 a 6 dígitos, solo tú lo sabes). Créalo ahora y sigue con el VB.', alListo: () => darVb(ctx, orden, accion, alListo) });
      return;
    }
    const [{ data: o, error }, fotos] = await Promise.all([
      ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('id', orden.id).single(),
      ctx.api.from('tal_media').select('id', { count: 'exact', head: true }).eq('orden_id', orden.id),
    ]);
    if (error) throw error;
    const lineas = o.tal_orden_servicios ?? [];
    const t = totales(o, lineas);
    const auto = `${verPatente(o.tal_vehiculos?.patente) || 'S/P'} ${nombreVehiculo(o.tal_vehiculos)}`.trim();
    const hecho = async (v) => {
      const { data, error: e } = await ctx.api.rpc('tal_vb', { p_orden: o.id, p_accion: accion, p_pin: v.pin, p_nota: v.nota || null });
      if (e) throw new Error(e.message);
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo dar el VB.');
      avisar(accion === 'entregar' ? `N° ${o.numero}: Entregado con tu VB.` : `N° ${o.numero}: devuelta a Terminado.`);
      alListo?.();
    };
    if (accion === 'reabrir') {
      abrirFormulario({
        titulo: `Devolver a Terminado · N° ${o.numero}`,
        mensaje: `${auto}. La orden vuelve a Terminado para completarla y queda anotado el motivo.`,
        campos: [{ id: 'nota', etiqueta: 'Motivo', requerido: true }, { id: 'pin', etiqueta: 'Tu PIN', tipo: 'password', requerido: true }],
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
        { id: 'pin', etiqueta: 'Tu PIN', tipo: 'password', requerido: true },
      ],
      textoGuardar: 'Dar VB y entregar',
      alGuardar: async (v) => {
        if (v.revisado.length < 4) throw new Error('Marca las cuatro revisiones antes de dar el VB.');
        await hecho(v);
      },
    });
  } catch (e) { avisar(e.message, 'error'); }
}
