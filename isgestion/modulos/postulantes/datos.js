// Datos comunes de Postulantes: etapas y procesos de la empresa, nombres y el formulario del postulante.
import { abrirFormulario } from '../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../core/ui/aviso.js?v=cb36eb2';

export const FUENTES = [['directo', 'Contacto directo'], ['referido', 'Referido'], ['portal', 'Portal de empleo'], ['ficha', 'Ficha de ingreso'], ['otro', 'Otro']];
export const nombreFuente = Object.fromEntries(FUENTES);
export const nombreCompleto = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
export const iniciales = (p) => `${p.nombres?.[0] ?? ''}${p.apellido_paterno?.[0] ?? ''}`.toUpperCase();

// Etapas (crea las iniciales la primera vez, si el usuario puede editar) y procesos de la empresa
export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  await ctx.api.rpc('sel_preparar', { p_empresa: e });
  const [et, pr] = await Promise.all([
    ctx.api.from('sel_etapas').select('*').eq('empresa_id', e).order('orden').order('nombre'),
    ctx.api.from('sel_procesos').select('*').eq('empresa_id', e).is('deleted_at', null).order('estado').order('created_at', { ascending: false }),
  ]);
  if (et.error) throw et.error;
  if (pr.error) throw pr.error;
  return { etapas: et.data, procesos: pr.data, etapaDe: new Map(et.data.map((x) => [x.id, x])), procesoDe: new Map(pr.data.map((x) => [x.id, x])) };
}

// Requisitos del postulante: los de su proceso y los que tenga marcados aunque ya no estén en el proceso
export function requisitosDe(p, procesoDe) {
  const lista = [...(procesoDe.get(p.proceso_id)?.requisitos ?? [])];
  for (const k of Object.keys(p.requisitos ?? {})) if (!lista.includes(k)) lista.push(k);
  return { lista, cumplidos: lista.filter((r) => p.requisitos?.[r]).length };
}

// Crear o editar los datos del postulante
export function formularioPostulante(ctx, base, p = null, { alListo } = {}) {
  const procesos = base.procesos.filter((x) => x.estado === 'abierto' || x.id === p?.proceso_id);
  abrirFormulario({
    titulo: p ? 'Datos del postulante' : 'Nuevo postulante',
    campos: [
      { id: 'nombres', etiqueta: 'Nombres', requerido: true, valor: p?.nombres ?? '' },
      { id: 'apellido_paterno', etiqueta: 'Apellido paterno', valor: p?.apellido_paterno ?? '' },
      { id: 'apellido_materno', etiqueta: 'Apellido materno', valor: p?.apellido_materno ?? '' },
      { id: 'rut', etiqueta: 'RUT', valor: p?.rut ?? '', ayuda: 'Opcional al comienzo; hace falta para contratar.' },
      { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', valor: p?.telefono ?? '' },
      { id: 'email', etiqueta: 'Correo', tipo: 'email', valor: p?.email ?? '' },
      { id: 'comuna', etiqueta: 'Comuna', valor: p?.comuna ?? '' },
      { id: 'cargo', etiqueta: 'Cargo al que postula', valor: p?.cargo ?? '' },
      { id: 'proceso_id', etiqueta: 'Proceso de selección', opciones: [['', 'Sin proceso'], ...procesos.map((x) => [x.id, x.nombre])], valor: p?.proceso_id ?? '' },
      { id: 'fuente', etiqueta: 'Cómo llegó', opciones: FUENTES, valor: p?.fuente ?? 'directo' },
      { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', valor: p?.nota ?? '' },
    ],
    alGuardar: async (v) => {
      const t = (k) => v[k].trim() || null;
      const datos = { nombres: v.nombres.trim(), apellido_paterno: t('apellido_paterno'), apellido_materno: t('apellido_materno'), rut: t('rut'), telefono: t('telefono'),
        email: t('email'), comuna: t('comuna'), cargo: t('cargo') ?? base.procesoDe.get(v.proceso_id)?.cargo ?? null, proceso_id: v.proceso_id || null, fuente: v.fuente, nota: t('nota') };
      if (datos.rut && !p?.rut) {
        const { data: otros } = await ctx.api.from('sel_postulantes').select('id').eq('empresa_id', ctx.empresa.id).eq('rut', datos.rut.replace(/\./g, '').toUpperCase()).is('deleted_at', null);
        if (otros?.some((o) => o.id !== p?.id)) avisar('Ya hay otro postulante con este RUT: revisa si es la misma persona.', 'error');
      }
      const r = p
        ? await ctx.api.from('sel_postulantes').update(datos).eq('id', p.id).select('id').single()
        : await ctx.api.from('sel_postulantes').insert({ ...datos, empresa_id: ctx.empresa.id, etapa_id: base.etapas.find((x) => x.activo)?.id ?? null }).select('id').single();
      if (r.error) throw new Error(/rut/i.test(r.error.message) ? 'El RUT no es válido.' : r.error.message);
      avisar(p ? 'Datos guardados.' : 'Postulante agregado.');
      alListo?.(r.data.id);
    },
  });
}
