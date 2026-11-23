// Grupo → Quincenas: las quincenas de todas las empresas con Remuneraciones (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../../remu/quincenas.js?v=6ccf11a';
import { empresasCon } from '../empresas.js?v=6ccf11a';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: empresasCon(ctx, 'remu'), cierre: '#/grupo.remu' });
}
