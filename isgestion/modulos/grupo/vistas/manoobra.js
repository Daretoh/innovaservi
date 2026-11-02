// Grupo → Mano de obra del grupo: los costos de mano de obra de todas las empresas con Remuneraciones juntos
// (modulos/remu/vistas/costos.js con empresas; pedido de Enzo, 2026-11-02).
import { vistaManoObra } from '../../remu/vistas/costos.js?v=4343d6d';
import { empresasCon } from '../empresas.js?v=4343d6d';

export default function vista(ctx) {
  return vistaManoObra(ctx, { empresas: empresasCon(ctx, 'remu') });
}
