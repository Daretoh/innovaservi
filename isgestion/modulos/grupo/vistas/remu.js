// Grupo → Cierre de remuneraciones: el cierre del mes de todas las empresas con Remuneraciones (modulos/remu/cierre.js).
import { vistaCierre } from '../../remu/cierre.js?v=259fbba';
import { empresasCon } from '../empresas.js?v=259fbba';

export default function vista(ctx) {
  return vistaCierre(ctx, { empresas: empresasCon(ctx, 'remu'), titulo: 'Cierre de remuneraciones', grupo: true });
}
