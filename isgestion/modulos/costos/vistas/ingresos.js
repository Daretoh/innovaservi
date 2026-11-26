// Ventas y cobros → Otros ingresos (2026-11-24): los ingresos de Costos (lo que no factura otro módulo: arriendos,
// reembolsos, devoluciones), separados de los gastos. Misma pantalla que Gastos (vistaRegistros), solo con ingresos.
import { vistaRegistros } from './registros.js?v=9540066';

export default (ctx) => vistaRegistros(ctx, 'ingreso');
