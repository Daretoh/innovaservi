// PIN personal (núcleo 010): 4 a 6 dígitos que solo sabe cada usuario, para pasos clave como el VB del taller.
// La base guarda solo el hash y bloquea 15 minutos tras 5 errores; aquí solo se define o cambia.
import { abrirFormulario } from './ui/modal.js?v=7f39998';
import { avisar } from './ui/aviso.js?v=7f39998';

export async function estadoPin(api) {
  const { data, error } = await api.rpc('pin_estado');
  if (error) throw error;
  return data ?? { definido: false };
}

// Formulario para crear (o cambiar, pidiendo el actual) el PIN. Llama alListo() al guardarlo.
export function formularioPin(api, { definido = false, mensaje = null, alListo = null } = {}) {
  abrirFormulario({
    titulo: definido ? 'Cambiar mi PIN' : 'Crear mi PIN',
    mensaje: mensaje ?? 'Tu PIN personal confirma pasos clave (como el VB de entrega). De 4 a 6 dígitos, sin números repetidos ni seguidos. No lo compartas.',
    campos: [
      ...(definido ? [{ id: 'actual', etiqueta: 'PIN actual', tipo: 'password', requerido: true }] : []),
      { id: 'nuevo', etiqueta: 'PIN nuevo', tipo: 'password', requerido: true },
      { id: 'repetir', etiqueta: 'Repite el PIN nuevo', tipo: 'password', requerido: true },
    ],
    textoGuardar: 'Guardar PIN',
    alGuardar: async (v) => {
      if (v.nuevo !== v.repetir) throw new Error('Los PIN no coinciden.');
      const { data, error } = await api.rpc('pin_definir', { p_actual: v.actual ?? null, p_nuevo: v.nuevo });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo guardar.');
      avisar('PIN guardado.');
      alListo?.();
    },
  });
}

// Desde el menú de la cuenta: crear o cambiar
export async function miPin(api) {
  try { formularioPin(api, { definido: (await estadoPin(api)).definido }); } catch (e) { avisar(e.message, 'error'); }
}
