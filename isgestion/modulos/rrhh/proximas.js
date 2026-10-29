// Trabajadores asignados a faenas de los próximos 14 días (Planificación) con documentos vencidos o pendientes
// (como la alerta de InnovaGestión). Lo usan la vista rrhh.proximas y las alertas del Panel de gerencia.
// Requiere ver RRHH y Faenas; si no, devuelve null.
import { hoyISO, sumarDias } from '../../core/ui/formato.js?v=6f62ff2';
import { cargarRrhh, estadoDoc, nombreCompleto } from './datos.js?v=6f62ff2';

export const DIAS_PROXIMAS = 14;

export async function asignadosConPendientes(ctx, datos = null) {
  if (!ctx.puede('rrhh', 'ver') || !ctx.puede('ope', 'ver')) return null;
  const hoy = hoyISO();
  const { data: planes, error } = await ctx.api.from('ope_plan')
    .select('fecha, faena_id, ope_plan_personas(persona_id), ope_faenas(titulo, estado, deleted_at, terceros(nombre_fantasia, razon_social))')
    .eq('empresa_id', ctx.empresa.id).gte('fecha', hoy).lte('fecha', sumarDias(hoy, DIAS_PROXIMAS - 1)).order('fecha');
  if (error) throw error;
  const D = datos ?? await cargarRrhh(ctx);
  const vinculo = new Map(D.vinculos.map((v) => [v.persona_id, v]));
  const tipos = D.tiposActivos.filter((t) => t.cuenta);
  const porPersona = new Map();
  for (const p of planes) {
    const f = p.ope_faenas;
    if (!f || f.deleted_at || f.estado === 'cancelada') continue;
    const cliente = f.terceros?.nombre_fantasia || f.terceros?.razon_social || '';
    for (const { persona_id: pid } of p.ope_plan_personas ?? []) {
      const v = vinculo.get(pid);
      if (!v) continue;
      if (!porPersona.has(pid)) {
        const est = tipos.map((t) => ({ t, e: estadoDoc(t, D.doc(pid, t.slug)) }));
        const venc = est.filter((x) => x.e.k === 'venc').map((x) => x.t.nombre);
        const pend = est.filter((x) => x.e.k === 'pend').map((x) => x.t.nombre);
        if (!venc.length && !pend.length) { porPersona.set(pid, null); continue; }
        porPersona.set(pid, { persona_id: pid, nombre: nombreCompleto(v.personas), cargo: v.cargo, venc, pend, faenas: [] });
      }
      const o = porPersona.get(pid);
      if (o && !o.faenas.some((x) => x.fecha === p.fecha && x.faena_id === p.faena_id)) o.faenas.push({ fecha: p.fecha, faena_id: p.faena_id, titulo: f.titulo, cliente });
    }
  }
  return [...porPersona.values()].filter(Boolean)
    .sort((a, b) => b.venc.length - a.venc.length || a.faenas[0].fecha.localeCompare(b.faenas[0].fecha) || a.nombre.localeCompare(b.nombre));
}
