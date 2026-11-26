// Grupo → Quincenas: las quincenas de todas las empresas con Remuneraciones (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../../remu/quincenas.js?v=cd68dd0';
import { empresasCon } from '../empresas.js?v=cd68dd0';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: empresasCon(ctx, 'remu'), cierre: '#/grupo.remu' });
}
