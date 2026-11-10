// Tareas como una sola lista del grupo (decisión de Enzo, 2026-11-09): las empresas con empresas.config.tareas_grupo
// comparten sus tareas en la pantalla Tareas y en el Inicio, sin distinguir empresa. Cada tarea sigue guardada con su
// empresa_id y la RLS no cambia: cada acción usa los permisos del usuario en la empresa de esa tarea.
// Una empresa sin esa opción (clientes) ve solo las suyas.
import { crearPuede } from './permisos.js?v=c16a35c';

// Contextos (ctx con su empresa y sus permisos) de las empresas cuyas tareas ve este usuario; siempre incluye la actual.
export function ctxTareas(ctx) {
  if (!ctx.empresa.config?.tareas_grupo) return [ctx];
  const otras = (ctx.empresas ?? []).filter((e) => e.id !== ctx.empresa.id && e.config?.tareas_grupo)
    .map((e) => ({ ...ctx, empresa: e, puede: crearPuede(e.id) }))
    .filter((c) => c.puede('tareas', 'ver'));
  return [ctx, ...otras];
}
