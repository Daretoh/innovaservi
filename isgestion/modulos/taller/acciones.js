// Cambios de estado de una orden (tablero, agenda y detalle).
import { avisar } from '../../core/ui/aviso.js?v=3b97680';
import { ESTADOS, MARCA_DE, nombreEstado } from './datos.js?v=3b97680';

// Avanza (+1) o retrocede (−1) un estado. Al avanzar marca la hora si no estaba; al retroceder la borra.
export async function mover(ctx, o, dir) {
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const destino = ESTADOS[i + dir]?.[0];
  if (!destino) return false;
  const cambios = { estado: destino };
  if (dir > 0 && MARCA_DE[destino] && !o[MARCA_DE[destino]]) cambios[MARCA_DE[destino]] = new Date().toISOString();
  if (dir < 0 && MARCA_DE[o.estado]) cambios[MARCA_DE[o.estado]] = null;
  const { error } = await ctx.api.from('tal_ordenes').update(cambios).eq('id', o.id);
  if (error) { avisar(error.message, 'error'); return false; }
  avisar(`N° ${o.numero}: ${nombreEstado[destino]}.`);
  return true;
}
