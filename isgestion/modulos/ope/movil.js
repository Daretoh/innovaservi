// Botón "+" del teléfono en empresas con Faenas (manifest → movil.accion): Tarea o Faena al calendario.
// La Faena abre el formulario del Calendario (`?nuevo=1` lo abre una vez y se quita de la dirección).

export function nuevaFaena(ctx) {
  location.hash = ctx.ruta('ope.calendario', { nuevo: 1 });
}

export async function nuevaTareaMovil(ctx) {
  const [{ nuevaTarea }, { data, error }] = await Promise.all([
    import('../tareas/vistas/nueva.js?v=7100fbc'),
    ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }),
  ]);
  if (error) throw error;
  nuevaTarea(ctx, { usuarios: data ?? [], alCrear: () => ctx.refrescar() });
}
