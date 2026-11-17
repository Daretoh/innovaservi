// Grupo → Quincenas: las quincenas de todas las empresas con Remuneraciones (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../../remu/quincenas.js?v=e20d256';
import { empresasCon } from '../empresas.js?v=e20d256';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: empresasCon(ctx, 'remu'), cierre: '#/grupo.remu' });
}
