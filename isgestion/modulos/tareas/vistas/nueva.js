// Formulario "Nueva tarea" (lo usan Tareas y Grupo → Tareas del grupo). ctx = el de la empresa donde se crea.
import { abrirFormulario } from '../../../core/ui/modal.js?v=0ddac6e';
import { avisar } from '../../../core/ui/aviso.js?v=0ddac6e';
import { PRIORIDADES, REPETIR, CATEGORIAS, categoriaAuto, mencionados, sugerirMenciones } from '../datos.js?v=0ddac6e';

export const SELECT_TAREA = '*, tar_adjuntos(id), tar_obs(id)';

export function nuevaTarea(ctx, { usuarios, responsable = ctx.usuario.id, alCrear }) {
  abrirFormulario({
    titulo: 'Nueva tarea',
    mensaje: 'Después de crearla puedes adjuntar fotos y archivos (también pegando un pantallazo con Ctrl+V).',
    campos: [
      { id: 'titulo', etiqueta: 'Tarea', requerido: true },
      { id: 'detalle', etiqueta: 'Detalle', tipo: 'textarea' },
      { id: 'fecha', etiqueta: 'Vence', tipo: 'date' },
      { id: 'prioridad', etiqueta: 'Prioridad', opciones: PRIORIDADES, valor: 'media' },
      { id: 'responsable', etiqueta: 'Responsable', opciones: [['', 'Sin asignar'], ...usuarios.map((u) => [u.user_id, u.nombre])], valor: usuarios.some((u) => u.user_id === responsable) ? responsable : '' },
      { id: 'responsable2', etiqueta: '2.º responsable (opcional)', opciones: [['', 'Ninguno'], ...usuarios.map((u) => [u.user_id, u.nombre])] },
      { id: 'repetir', etiqueta: 'Repetir', opciones: REPETIR, valor: 'no' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: [['', 'Según el título'], ...CATEGORIAS], valor: '' },
    ],
    textoGuardar: 'Crear tarea',
    alGuardar: async (v) => {
      if (v.repetir !== 'no' && !v.fecha) throw new Error('Una tarea que se repite necesita fecha.');
      const { data: t, error } = await ctx.api.from('tar_tareas').insert({
        empresa_id: ctx.empresa.id, titulo: v.titulo.trim(), detalle: v.detalle.trim() || null, fecha: v.fecha || null, prioridad: v.prioridad,
        responsable_id: v.responsable || null, responsable2_id: v.responsable2 && v.responsable2 !== v.responsable ? v.responsable2 : null, repetir: v.repetir,
        categoria: v.categoria || categoriaAuto(v.titulo),
      }).select(SELECT_TAREA).single();
      if (error) throw new Error(error.message);
      // @menciones en el detalle: avisan a la persona (como en las observaciones)
      const ments = mencionados(v.detalle, usuarios).filter((u) => u.user_id !== ctx.usuario.id);
      if (ments.length) {
        const { error: e2 } = await ctx.api.from('tar_avisos').insert(ments.map((u) => ({ empresa_id: ctx.empresa.id, tarea_id: t.id, user_id: u.user_id, tipo: 'mencion', texto: v.detalle.trim().slice(0, 300) })));
        avisar(e2 ? `Tarea creada, pero no se pudo avisar: ${e2.message}` : `Tarea creada. Avisado: ${ments.map((u) => u.nombre).join(', ')}.`, e2 ? 'error' : undefined);
      } else avisar('Tarea creada.');
      alCrear?.(t);
    },
  });
  // @ en el detalle: sugerencias de nombres bajo el campo
  const detalle = document.querySelector('dialog.modal[open] #f-detalle');
  if (detalle) { detalle.placeholder = 'Usa @ para mencionar a alguien.'; detalle.after(sugerirMenciones(detalle, usuarios)); }
}
