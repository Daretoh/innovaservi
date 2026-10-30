// Dónde se guarda lo generado (con los permisos del módulo de destino):
// - documento de un trabajador → su documentación de RRHH (tipo con el mismo slug; si la empresa no lo tiene, se crea
//   sin contar para el % al día, como los "firmados" de InnovaGestión) y queda entregado con el PDF.
// - documento de la empresa → nueva versión del documento preventivo en Prevención SST (se crea si no existe).
import { subirArchivo, eliminarArchivo } from '../../core/adjuntos.js?v=3b97680';
import { hoyISO } from '../../core/ui/formato.js?v=3b97680';

const NOMBRES_RRHH = {
  contrato: 'Contrato', perfil: 'Perfil de cargo', datos: 'Ficha de datos del trabajador', epp: 'Registro de entrega de EPP',
  odi: 'IRL (información de riesgos laborales)', pts_herramientas: 'PTS herramientas (estanques)', pts_frigorifico: 'PTS cámaras frigoríficas',
};

export const puedeGuardarRrhh = (ctx) => ctx.puede('rrhh', 'crear') && ctx.puede('rrhh', 'editar');
export const puedeGuardarSst = (ctx) => ctx.puede('sst', 'crear') && ctx.puede('sst', 'ver');

export async function guardarEnRrhh(ctx, slug, personaId, blob, nombreArchivo, nombreDoc) {
  const e = ctx.empresa.id;
  let { data: tipo, error } = await ctx.api.from('rrhh_tipos_doc').select('slug, ambito').eq('empresa_id', e).eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!tipo) {
    const r = await ctx.api.from('rrhh_tipos_doc').insert({ empresa_id: e, slug, nombre: NOMBRES_RRHH[slug] ?? nombreDoc, corto: (NOMBRES_RRHH[slug] ?? nombreDoc).slice(0, 18),
      categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true, cuenta: false, orden: 90 }).select('slug, ambito').single();
    if (r.error) throw new Error(`No se pudo crear el tipo de documento "${nombreDoc}" en RRHH: ${r.error.message}`);
    tipo = r.data;
  }
  const personal = tipo.ambito === 'persona';
  const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
  const { ruta } = await subirArchivo(ctx.api, { ...(personal ? { personaId } : { empresaId: e }), modulo: 'rrhh', archivo, tabla: 'rrhh_documentos', tipos: ['application/pdf'] });
  let q = ctx.api.from('rrhh_documentos').select('id, archivo').eq('persona_id', personaId).eq('tipo_slug', slug).is('deleted_at', null);
  q = personal ? q.is('empresa_id', null) : q.eq('empresa_id', e);
  const { data: previo } = await q.maybeSingle();
  const cambios = { estado: 'entregado', fecha: hoyISO(), archivo: ruta, nota: 'Generado con ISgestión' };
  const r = previo
    ? await ctx.api.from('rrhh_documentos').update(cambios).eq('id', previo.id).select('id')
    : await ctx.api.from('rrhh_documentos').insert({ empresa_id: personal ? null : e, persona_id: personaId, tipo_slug: slug, ...cambios }).select('id');
  if (r.error || !r.data?.length) {
    await eliminarArchivo(ctx.api, ruta).catch(() => {});
    throw new Error(r.error?.message ?? 'No tienes permiso para guardar en la documentación del trabajador.');
  }
}

// Tipo de documento preventivo de SST según la plantilla
const TIPO_SST = (slug) => (slug.startsWith('pts_') ? 'pts' : slug.startsWith('cap_') ? 'capacitacion'
  : { iper: 'iper', proc_iper: 'iper', programa: 'programa', karin: 'ley_karin', matriz_epp: 'matriz_epp' }[slug] ?? 'otro');

export async function guardarEnSst(ctx, { slug, codigo, titulo, version, cambios }, blob, nombreArchivo) {
  const e = ctx.empresa.id;
  const cod = codigo || slug.toUpperCase().replace(/_/g, '-');
  let { data: doc, error } = await ctx.api.from('sst_documentos').select('id, sst_documento_versiones(version)').eq('empresa_id', e).eq('codigo', cod).maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) {
    const r = await ctx.api.from('sst_documentos').insert({ empresa_id: e, tipo: TIPO_SST(slug), codigo: cod, titulo, revisar_meses: 12 }).select('id').single();
    if (r.error) throw new Error(`No se pudo crear el documento en Prevención SST: ${r.error.message}`);
    doc = { id: r.data.id, sst_documento_versiones: [] };
  }
  const usadas = new Set((doc.sst_documento_versiones ?? []).map((x) => x.version));
  let ver = version || String(Math.max(0, ...[...usadas].map((x) => Number(x) || 0)) + 1).padStart(2, '0');
  while (usadas.has(ver)) ver = String(Number(ver) + 1).padStart(2, '0');
  const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' });
  const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'sst', archivo, tabla: 'sst_documento_versiones', tipos: ['application/pdf'] });
  const r = await ctx.api.from('sst_documento_versiones').insert({ documento_id: doc.id, empresa_id: e, version: ver, fecha: hoyISO(), cambios: cambios || 'Generado con ISgestión', archivo: ruta });
  if (r.error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(r.error.message); }
  return ver;
}
