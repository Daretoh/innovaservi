// Grupo → Cierre de remuneraciones: el cierre del mes de todas las empresas con Remuneraciones (modulos/remu/cierre.js).
import { vistaCierre } from '../../remu/cierre.js?v=2f9e074';
import { empresasCon } from '../empresas.js?v=2f9e074';

export default function vista(ctx) {
  return vistaCierre(ctx, { empresas: empresasCon(ctx, 'remu'), titulo: 'Cierre de remuneraciones', grupo: true });
}
