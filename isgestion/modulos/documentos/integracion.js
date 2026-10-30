// Para otros módulos: generar un documento de un trabajador desde su ficha (RRHH), como en InnovaGestión.
import { avisar } from '../../core/ui/aviso.js?v=81adf5e';
import { cargarPlantillas, trabajador, abrirDocumento, sueldosBase } from './editor.js?v=81adf5e';
import { guardarEnRrhh, puedeGuardarRrhh } from './acciones.js?v=81adf5e';

// Plantillas por slug de documento de RRHH (contrato, perfil, datos, epp, odi y registros de entrega de PTS)
export const SLUGS_TRABAJADOR = ['contrato', 'perfil', 'datos', 'epp', 'odi', 'pts_quimicos', 'pts_extintores', 'pts_altura', 'pts_confinados',
  'pts_alzahombre', 'pts_funciones', 'pts_herramientas', 'pts_frigorifico'];
export const sePuedeGenerar = (ctx, slug) => ctx.puede('documentos', 'ver') && SLUGS_TRABAJADOR.includes(slug);

export async function generarParaTrabajador(ctx, slug, personaId) {
  const [{ P }, { data: v, error }, sueldos] = await Promise.all([
    cargarPlantillas(ctx),
    ctx.api.from('persona_empresa').select('id, persona_id, cargo, fecha_ingreso, estado, personas(nombres, apellido_paterno, apellido_materno, rut, direccion, numero, poblacion, comuna, nacionalidad, estado_civil, fecha_nacimiento, email, telefono, afp, salud)')
      .eq('empresa_id', ctx.empresa.id).eq('persona_id', personaId).is('deleted_at', null).order('estado').limit(1).maybeSingle(),
    sueldosBase(ctx),
  ]);
  if (error || !v) throw new Error(error?.message ?? 'Trabajador no encontrado.');
  const g = P.DOC_GEN[slug];
  const t = trabajador(v, { sueldo_base: sueldos.get(v.id) ?? null });
  await abrirDocumento({
    titulo: `${g.nombre} · ${t.nombre}`, nombreArchivo: `${slug}-${t.nombre}`, autor: ctx.empresa.razon_social,
    variantes: g.variantes ? P.DG_VARS : null, variante: g.variantes ? P.varDefault(t) : null,
    construir: (variante) => g.build(t, variante),
    guardar: puedeGuardarRrhh(ctx) ? { texto: 'Guardar en la ficha', alGuardar: async (blob, x) => {
      await guardarEnRrhh(ctx, slug, personaId, blob, x.nombre, g.nombre);
      avisar('Documento generado y guardado en la ficha.');
      ctx.refrescar();
    } } : null,
  });
}
