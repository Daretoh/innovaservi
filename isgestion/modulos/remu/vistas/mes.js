// Cierre del mes de la empresa (Remuneraciones → Cierre): el mismo cierre del Grupo, solo con esta empresa
// (modulos/remu/cierre.js). Reemplaza al Resumen mensual "Para remuneraciones" (Enzo, 2026-10-31).
import { vistaCierre } from '../cierre.js?v=163dc56';

export default function vista(ctx) {
  return vistaCierre(ctx, { empresas: [{ empresa: ctx.empresa, puede: ctx.puede }], titulo: 'Cierre del mes' });
}
