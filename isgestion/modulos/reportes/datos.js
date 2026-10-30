// Datos y utilidades compartidas de Reportes de trabajo.
import { nombreDia, fechaCorta } from '../../core/ui/formato.js?v=605af68';

export const ETAPAS = [['antes', 'Antes'], ['proceso', 'Proceso'], ['despues', 'Después'], ['doc', 'Registro documental'], ['sin', 'Sin ordenar']];
export const nombreEtapa = Object.fromEntries(ETAPAS);

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || 'Interno';

// Parte con sus faenas, fotos, cliente, sitio y configuración del informe
export async function cargarParte(ctx, id) {
  const [parte, faenas, media, config] = await Promise.all([
    ctx.api.from('rep_partes').select('*, terceros(razon_social, nombre_fantasia, rut, direccion), ope_sitios(nombre, direccion)').eq('id', id).maybeSingle(),
    ctx.api.from('rep_parte_faenas').select('faena_id, fecha, ope_faenas(titulo, tareas)').eq('parte_id', id).order('fecha'),
    ctx.api.from('rep_media').select('*').eq('parte_id', id).order('orden').order('created_at'),
    ctx.api.from('rep_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle(),
  ]);
  for (const r of [parte, faenas, media, config]) if (r.error) throw r.error;
  return { parte: parte.data, faenas: faenas.data, media: media.data, config: config.data ?? { lineas: [], contactos: [] } };
}

// Faenas-día de un rango que todavía no están en un parte
export async function faenasSinParte(ctx, desde, hasta) {
  const [faenas, usadas, clientes, sitios] = await Promise.all([
    ctx.api.from('ope_faenas').select('id, titulo, tercero_id, sitio_id, fecha_inicio, fecha_fin, dias, estado, pide_informe').eq('empresa_id', ctx.empresa.id)
      .is('deleted_at', null).neq('estado', 'cancelada').lte('fecha_inicio', hasta).gte('fecha_fin', desde),
    ctx.api.from('rep_parte_faenas').select('faena_id, fecha').eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id),
    ctx.api.from('ope_sitios').select('id, nombre').eq('empresa_id', ctx.empresa.id),
  ]);
  for (const r of [faenas, usadas, clientes, sitios]) if (r.error) throw r.error;
  const ya = new Set(usadas.data.map((u) => `${u.faena_id}|${u.fecha}`));
  const cli = new Map(clientes.data.map((c) => [c.id, c]));
  const sit = new Map(sitios.data.map((s) => [s.id, s.nombre]));
  const out = [];
  for (const f of faenas.data) {
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
export { comprimirFoto } from '../../core/imagenes.js?v=605af68';

// URL firmadas de varias rutas a la vez (10 minutos): vive en core/adjuntos.js
export { urlsFirmadas } from '../../core/adjuntos.js?v=605af68';

// Una faena de varios días aparece una vez por día en el parte; para clasificar fotos basta una por faena.
export const faenasDistintas = (faenas) => [...new Map(faenas.map((f) => [f.faena_id, f])).values()];
