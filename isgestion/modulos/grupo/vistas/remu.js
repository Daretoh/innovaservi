// Grupo → Cierre de remuneraciones: el cierre del mes de todas las empresas con Remuneraciones (modulos/remu/cierre.js).
import { vistaCierre } from '../../remu/cierre.js?v=4343d6d';
import { empresasCon } from '../empresas.js?v=4343d6d';

export default function vista(ctx) {
  return vistaCierre(ctx, { empresas: empresasCon(ctx, 'remu'), titulo: 'Cierre de remuneraciones', grupo: true });
}
