// Botón "+" del teléfono en empresas con Faenas (manifest → movil.accion): Tarea, Asistencia o Faena al calendario.
// La Faena abre el formulario del Calendario (`?nuevo=1` lo abre una vez y se quita de la dirección).
// Asistencia abre hoy con Agregar: faenas del día y luego la gente (`?registrar=1`, igual: una vez).

export function nuevaFaena(ctx) {
  location.hash = ctx.ruta('ope.calendario', { nuevo: 1 });
}

export function registrarHoras(ctx) {
  location.hash = ctx.ruta('asistencia.horas', { registrar: 1 });
}

export async function nuevaTareaMovil(ctx) {
  const [{ nuevaTarea }, { data, error }] = await Promise.all([
    import('../tareas/vistas/nueva.js?v=5f872bd'),
    ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }),
  ]);
  if (error) throw error;
  nuevaTarea(ctx, { usuarios: data ?? [], alCrear: () => ctx.refrescar() });
}
