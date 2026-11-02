// Grupo → Cierre de remuneraciones: el cierre del mes de todas las empresas con Remuneraciones (modulos/remu/cierre.js).
import { vistaCierre } from '../../remu/cierre.js?v=eb25cc4';
import { empresasCon } from '../empresas.js?v=eb25cc4';

export default function vista(ctx) {
  return vistaCierre(ctx, { empresas: empresasCon(ctx, 'remu'), titulo: 'Cierre de remuneraciones', grupo: true });
}
