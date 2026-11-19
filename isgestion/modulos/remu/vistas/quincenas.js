// Remuneraciones → Quincenas: las quincenas de esta empresa (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../quincenas.js?v=40804ef';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: [{ empresa: ctx.empresa, puede: ctx.puede }], cierre: '#/remu.mes' });
}
