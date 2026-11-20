// Datos y utilidades compartidas de Reportes de trabajo.
import { nombreDia, fechaCorta } from '../../core/ui/formato.js?v=394625e';

export const ETAPAS = [['antes', 'Antes'], ['proceso', 'Proceso'], ['despues', 'Después'], ['doc', 'Registro documental'], ['sin', 'Sin ordenar']];
export const nombreEtapa = Object.fromEntries(ETAPAS);

// Procesos personalizados del parte (rep_partes.procesos): pasos con nombre dentro de la etapa Proceso. En los selectores cada
// uno es "proceso:<id>". Una foto con un paso que ya no existe vale como Proceso general.
export const opcionesEtapa = (procesos = []) => ETAPAS.flatMap(([k, t]) => (k === 'proceso' ? [[k, t], ...procesos.map((p) => [`proceso:${p.id}`, p.nombre])] : [[k, t]]));
export const valorEtapa = (m, procesos = []) => (m.etapa === 'proceso' && procesos.some((p) => p.id === m.proceso) ? `proceso:${m.proceso}` : m.etapa);
export const desdeValorEtapa = (v) => (v.startsWith('proceso:') ? { etapa: 'proceso', proceso: v.slice(8) } : { etapa: v, proceso: null });

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || 'Interno';

// Faenas, clientes y sitios con el permiso de Reportes (Reportes 010): quien hace partes (ej.: Capataz) no tiene por qué
// ver el módulo de Faenas ni Clientes y proveedores, y por RLS antes no veía ninguna faena ni el nombre del cliente.
async function rpc(ctx, fn, args) {
  const { data, error } = await ctx.api.rpc(fn, { p_empresa: ctx.empresa.id, ...args });
  if (error) throw error;
  return data ?? [];
}
export const cargarFaenas = (ctx, desde, hasta, ids = []) => rpc(ctx, 'rep_faenas', { p_desde: desde, p_hasta: hasta, p_ids: ids });
export const cargarClientes = (ctx) => rpc(ctx, 'rep_clientes');
export const cargarSitios = (ctx) => rpc(ctx, 'rep_sitios');

// Parte con sus faenas, fotos, cliente, sitio y configuración del informe. Deja cliente, sitio y faena en
// parte.terceros, parte.ope_sitios y f.ope_faenas (la forma que esperan la vista y el informe).
export async function cargarParte(ctx, id) {
  const [parte, faenas, media, config, clientes, sitios] = await Promise.all([
    ctx.api.from('rep_partes').select('*').eq('id', id).maybeSingle(),
    ctx.api.from('rep_parte_faenas').select('faena_id, fecha').eq('parte_id', id).order('fecha'),
    ctx.api.from('rep_media').select('*').eq('parte_id', id).order('orden').order('created_at'),
    ctx.api.from('rep_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle(),
    cargarClientes(ctx),
    cargarSitios(ctx),
  ]);
  for (const r of [parte, faenas, media, config]) if (r.error) throw r.error;
  const ids = [...new Set(faenas.data.map((f) => f.faena_id))];
  const fae = new Map((ids.length ? await cargarFaenas(ctx, '2000-01-01', '2000-01-01', ids) : []).map((f) => [f.id, f]));
  const p = parte.data;
  if (p) {
    p.terceros = clientes.find((c) => c.id === p.tercero_id) ?? null;
    p.ope_sitios = sitios.find((s) => s.id === p.sitio_id) ?? null;
  }
  const lista = faenas.data.map((f) => ({ ...f, ope_faenas: fae.get(f.faena_id) ?? null }));
  return { parte: p, faenas: lista, media: media.data, config: config.data ?? { lineas: [], contactos: [] } };
}

// Faenas-día de un rango que todavía no están en un parte
export async function faenasSinParte(ctx, desde, hasta) {
  const [faenas, usadas, clientes, sitios] = await Promise.all([
    cargarFaenas(ctx, desde, hasta),
    ctx.api.from('rep_parte_faenas').select('faena_id, fecha').eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta),
    cargarClientes(ctx),
    cargarSitios(ctx),
  ]);
  if (usadas.error) throw usadas.error;
  const ya = new Set(usadas.data.map((u) => `${u.faena_id}|${u.fecha}`));
  const cli = new Map(clientes.map((c) => [c.id, c]));
  const sit = new Map(sitios.map((s) => [s.id, s.nombre]));
  const out = [];
  for (const f of faenas) {
    for (let d = new Date(`${f.fecha_inicio}T12:00`); d <= new Date(`${f.fecha_fin}T12:00`); d.setDate(d.getDate() + 1)) {
      const fecha = d.toISOString().slice(0, 10);
      if (fecha < desde || fecha > hasta || ya.has(`${f.id}|${fecha}`) || (f.dias?.length && !f.dias.includes(fecha))) continue;
      const cliente = f.tercero_id ? nombreTercero(cli.get(f.tercero_id)) : 'Interno';
      out.push({ ...f, fecha, cliente, sitio: sit.get(f.sitio_id) ?? '', etiqueta: `${nombreDia(fecha)} ${fechaCorta(fecha)} · ${cliente}${f.sitio_id ? ` · ${sit.get(f.sitio_id)}` : ''} — ${f.titulo}` });
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Achica una foto antes de subirla (vive en core para que la usen otros módulos)
export { comprimirFoto } from '../../core/imagenes.js?v=394625e';

// URL firmadas de varias rutas a la vez (10 minutos): vive en core/adjuntos.js
export { urlsFirmadas } from '../../core/adjuntos.js?v=394625e';

// Una faena de varios días aparece una vez por día en el parte; para clasificar fotos basta una por faena.
export const faenasDistintas = (faenas) => [...new Map(faenas.map((f) => [f.faena_id, f])).values()];
