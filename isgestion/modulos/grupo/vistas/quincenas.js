// Grupo → Quincenas: las quincenas de todas las empresas con Remuneraciones (modulos/remu/quincenas.js).
import { vistaQuincenas } from '../../remu/quincenas.js?v=394625e';
import { empresasCon } from '../empresas.js?v=394625e';

export default function vista(ctx) {
  return vistaQuincenas(ctx, { empresas: empresasCon(ctx, 'remu'), cierre: '#/grupo.remu' });
}
