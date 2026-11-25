// Remuneraciones → Quincenas: las quincenas de esta empresa (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../quincenas.js?v=db2b2b7';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: [{ empresa: ctx.empresa, puede: ctx.puede }], cierre: '#/remu.mes' });
}
