// Bandeja "Por cargar" (2026-11-10, pedido de Enzo): sacar o elegir de una vez muchas fotos de boletas y facturas
// (ej.: 20 al volver de terreno) y cargarlas después una por una en el lector. Cada foto es una fila de fin_bandeja
// (Costos 008) con su archivo en R2 (<empresa>/costos/…). "Cargar" abre el lector con la foto ya puesta; al registrar
// el gasto la foto pasa a ser su archivo y el lector sigue con la siguiente de la bandeja.
// Ruta: #/costos.bandeja
import { el } from '../../../core/ui/dom.js?v=dcd938a';
import { icono } from '../../../core/ui/iconos.js?v=dcd938a';
import { boton } from '../../../core/ui/tabla.js?v=dcd938a';
import { avisar } from '../../../core/ui/aviso.js?v=dcd938a';
import { subirArchivo, urlsFirmadas, eliminarArchivo } from '../../../core/adjuntos.js?v=dcd938a';
import { botonesFotos, tomarFotos } from '../../../core/ui/camara.js?v=dcd938a';
import { comprimirFoto, esImagen, esPdf } from '../../../core/imagenes.js?v=dcd938a';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=dcd938a';

// Pendientes de la empresa en orden de llegada (RLS: quien solo carga ve las suyas)
export const pendientesBandeja = (ctx) => ctx.api.from('fin_bandeja').select('id, ruta, nombre, tipo_mime, nota, created_at, created_by')
  .eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente').order('created_at');

// Sube fotos o PDF a la bandeja. Devuelve cuántos quedaron.
export async function subirABandeja(ctx, archivos, avance = () => {}) {
  const e = ctx.empresa.id;
  let ok = 0;
  for (const [i, a] of archivos.entries()) {
    avance(`Subiendo ${i + 1} de ${archivos.length}…`);
    try {
      if (!esImagen(a) && !esPdf(a)) throw new Error(`${a.name}: solo fotos o PDF.`);
      // Lado mayor 2.000 px: liviano y se sigue leyendo bien el texto y el timbre
      const archivo = esPdf(a) ? a : await comprimirFoto(a, 2000);
      const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo, tabla: 'fin_bandeja' });
      const { error } = await ctx.api.from('fin_bandeja').insert({ empresa_id: e, ruta, nombre: archivo.name, tipo_mime: archivo.type, tamano: archivo.size, created_by: ctx.usuario.id });
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      ok += 1;
    } catch (err) { avisar(err.message, 'error'); }
  }
  return ok;
}

// Desde el "+" del teléfono: abre la cámara, sube las fotos a la bandeja y muestra Por cargar
export async function escanearABandeja(ctx) {
  const fotos = await tomarFotos({ titulo: 'Escanear documentos', textoListo: 'Subir' });
  if (!fotos.length) return;
  avisar(`Subiendo ${fotos.length === 1 ? '1 documento' : `${fotos.length} documentos`}…`);
  const ok = await subirABandeja(ctx, fotos);
  avisar(ok === fotos.length ? `${ok === 1 ? 'Quedó 1 documento' : `Quedaron ${ok} documentos`} por cargar.` : `Se subieron ${ok} de ${fotos.length}.`, ok === fotos.length ? 'ok' : 'error');
  const destino = ctx.ruta('costos.bandeja');
  if (location.hash === destino) ctx.refrescar(); else location.hash = destino;
}

// Saca un documento de la bandeja sin registrarlo (el archivo se borra si se puede)
export async function descartarDeBandeja(ctx, fila) {
  const { error } = await ctx.api.from('fin_bandeja').update({ estado: 'descartado' }).eq('id', fila.id);
  if (error) throw new Error(error.message);
  if (ctx.puede('costos', 'eliminar')) await eliminarArchivo(ctx.api, fila.ruta).catch(() => {});
}

export default async function vista(ctx) {
  const puedeCrear = ctx.puede('costos', 'crear');
  const [{ data, error }, us, hechos] = await Promise.all([
    pendientesBandeja(ctx),
    ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }),
    ctx.api.from('fin_bandeja').select('id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id).eq('estado', 'registrado')
      .gte('updated_at', new Date(Date.now() - 7 * 864e5).toISOString()),
  ]);
  if (error) throw error;
  const filas = data ?? [];
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  const urls = await urlsFirmadas(ctx.api, filas.map((f) => f.ruta)).catch(() => new Map());
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.subir') }, icono('volver', { tam: 16 }), 'Subir documentos');

  const progreso = el('span', { class: 'texto-suave', 'aria-live': 'polite' });
  let subiendo = false;
  const subir = async (archivos) => {
    if (subiendo) return;
    subiendo = true; fotos.camara.disabled = true; fotos.galeria.disabled = true;
    const ok = await subirABandeja(ctx, archivos, (t) => { progreso.textContent = t; });
    avisar(ok === archivos.length ? `${ok === 1 ? 'Quedó 1 documento' : `Quedaron ${ok} documentos`} por cargar.` : `Se subieron ${ok} de ${archivos.length}.`, ok === archivos.length ? 'ok' : 'error');
    ctx.refrescar();
  };
  const fotos = botonesFotos({ alElegir: subir, titulo: 'Boletas y facturas', textoListo: 'Subir', accept: 'image/*,application/pdf' });
  const cargar = (f) => { location.hash = ctx.ruta('costos.lector', { bandeja: f.id }); };

  const tarjeta = (f) => {
    const url = urls.get(f.ruta);
    const pdf = /pdf/i.test(f.tipo_mime ?? '') || /\.pdf$/i.test(f.nombre ?? '');
    const descartar = async (ev) => {
      const b = ev.currentTarget;
      if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.lastChild.textContent = '¿Seguro?'; setTimeout(() => { b.dataset.seguro = ''; b.lastChild.textContent = 'Descartar'; }, 3000); return; }
      b.disabled = true;
      try { await descartarDeBandeja(ctx, f); avisar('Documento descartado.'); ctx.refrescar(); } catch (err) { avisar(err.message, 'error'); b.disabled = false; }
    };
    return el('div', { class: 'media-tarjeta ban-tarjeta' },
      el('a', { href: url ?? '#', target: '_blank', rel: 'noopener', class: 'ban-previa' },
        pdf || !url ? el('span', { class: 'lec-doc' }, pdf ? 'PDF' : 'Sin vista previa') : el('img', { src: url, alt: f.nombre ?? 'Documento', loading: 'lazy' })),
      el('span', { class: 'texto-chico texto-suave' }, [`${fechaLarga(diaLocal(f.created_at))} ${new Date(f.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`, quien.get(f.created_by)].filter(Boolean).join(' · ')),
      el('div', { class: 'ban-acciones' },
        boton('Cargar', { icono: 'editar', tipo: 'primario', onclick: () => cargar(f) }),
        boton('Descartar', { icono: 'basura', onclick: descartar })));
  };

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Por cargar'),
        el('p', { class: 'texto-suave' }, 'Saca o elige de una vez todas las boletas y facturas; quedan aquí y después las cargas una por una (la IA lee cada una).')),
      filas.length ? el('div', { class: 'listado-acciones' }, boton(`Cargar la primera (${filas.length})`, { icono: 'derecha', tipo: 'primario', onclick: () => cargar(filas[0]) })) : null),
    puedeCrear ? el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Agregar documentos'),
      el('div', { class: 'fotos-botones' }, fotos.camara, fotos.galeria, progreso),
      el('p', { class: 'texto-suave texto-chico' }, 'Cámara: saca una foto por documento, seguidas, y toca Subir al final. Galería: elige varias fotos o PDF a la vez.')) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Pendientes (${filas.length})`),
      filas.length ? el('div', { class: 'galeria ban-galeria' }, filas.map(tarjeta))
        : el('p', { class: 'texto-suave' }, 'No hay documentos por cargar.'),
      hechos.count ? el('p', { class: 'texto-suave texto-chico' }, `${hechos.count} ${hechos.count === 1 ? 'documento cargado' : 'documentos cargados'} desde la bandeja en los últimos 7 días. `,
        el('a', { href: ctx.ruta('costos.registros') }, 'Ver en Gastos e ingresos')) : null));
}
