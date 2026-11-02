// Cambios de estado de una orden (tablero, agenda y detalle).
import { avisar } from '../../core/ui/aviso.js?v=a07e023';
import { ESTADOS, MARCA_DE, nombreEstado } from './datos.js?v=a07e023';
import { pideVb, puedeVb, darVb } from './vb.js?v=a07e023';

// Avanza (+1) o retrocede (−1) un estado. Al avanzar marca la hora si no estaba; al retroceder la borra.
export async function mover(ctx, o, dir) {
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const destino = ESTADOS[i + dir]?.[0];
  if (!destino) return false;
  // Entregar o devolver una entregada: con VB lo hace quien tiene taller.aprobar, con su PIN (vb.js)
  if (pideVb(ctx) && (destino === 'entregado' || o.estado === 'entregado')) {
    if (!puedeVb(ctx)) { avisar('Entregar (o devolver a Terminado) lo hace quien da el VB de entrega.', 'error'); return false; }
    return new Promise((listo) => darVb(ctx, o, destino === 'entregado' ? 'entregar' : 'reabrir', () => listo(true)));
  }
  const cambios = { estado: destino };
  if (dir > 0 && MARCA_DE[destino] && !o[MARCA_DE[destino]]) cambios[MARCA_DE[destino]] = new Date().toISOString();
  if (dir < 0 && MARCA_DE[o.estado]) cambios[MARCA_DE[o.estado]] = null;
  const { error } = await ctx.api.from('tal_ordenes').update(cambios).eq('id', o.id);
  if (error) { avisar(error.message, 'error'); return false; }
  avisar(`N° ${o.numero}: ${nombreEstado[destino]}.`);
  return true;
}

// Texto del botón para avanzar (null si este usuario no puede): Terminado → "Dar VB y entregar" o nada
export function textoAvance(ctx, o) {
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const t = ESTADOS[i]?.[2] ?? null;
  if (t && ESTADOS[i + 1]?.[0] === 'entregado' && pideVb(ctx)) return puedeVb(ctx) ? 'Dar VB y entregar' : null;
  return t;
}
// ¿Puede devolver un estado? (de Entregado, solo quien da el VB)
export const puedeVolver = (ctx, o) => !(o.estado === 'entregado' && pideVb(ctx) && !puedeVb(ctx));
