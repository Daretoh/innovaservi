// Bandeja "Por cargar" (2026-11-10, pedido de Enzo): sacar o elegir de una vez muchas fotos de boletas y facturas
// (ej.: 20 al volver de terreno) y cargarlas después una por una en el lector. Cada foto es una fila de fin_bandeja
// (Costos 008) con su archivo en R2 (<empresa>/costos/…). "Cargar" abre el lector con la foto ya puesta; al registrar
// el gasto la foto pasa a ser su archivo y el lector sigue con la siguiente de la bandeja.
// Ruta: #/costos.bandeja
import { el } from '../../../core/ui/dom.js?v=92f4191';
import { icono } from '../../../core/ui/iconos.js?v=92f4191';
import { boton } from '../../../core/ui/tabla.js?v=92f4191';
import { avisar } from '../../../core/ui/aviso.js?v=92f4191';
import { subirArchivo, urlsFirmadas, eliminarArchivo } from '../../../core/adjuntos.js?v=92f4191';
import { botonesFotos, tomarFotos } from '../../../core/ui/camara.js?v=92f4191';
import { comprimirFoto, esImagen, esPdf } from '../../../core/imagenes.js?v=92f4191';
import { fechaLarga, diaLocal, dinero } from '../../../core/ui/formato.js?v=92f4191';
import { llamarDte, estadoDte, NOMBRE_DTE } from '../../../core/dte.js?v=92f4191';

// Pendientes de la empresa en orden de llegada (RLS: quien solo carga ve las suyas)
// Las compras del SII (origen 'sii', Núcleo 021) traen además su XML y sus datos (dte)
export const pendientesBandeja = (ctx) => ctx.api.from('fin_bandeja').select('id, ruta, nombre, tipo_mime, nota, created_at, created_by, origen, xml_ruta, dte')
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
  if (ctx.puede('costos', 'eliminar')) for (const r of [fila.ruta, fila.xml_ruta].filter(Boolean)) await eliminarArchivo(ctx.api, r).catch(() => {});
}

// Compras recibidas en el SII (OpenFactura) → Por cargar. Devuelve el texto del resultado.
export async function traerComprasSii(ctx) {
  const r = await llamarDte(ctx, 'traer_compras');
  if (r.prueba) return `Ambiente de pruebas: ${r.revisados} ${r.revisados === 1 ? 'documento' : 'documentos'} de la empresa de pruebas de Haulmer desde el ${fechaLarga(r.desde)}. No se agregan a la bandeja.`;
  const partes = [r.a_bandeja ? `${r.a_bandeja} ${r.a_bandeja === 1 ? 'factura nueva' : 'facturas nuevas'} en la bandeja` : 'No hay facturas nuevas',
    r.ya_en_costos ? `${r.ya_en_costos} ya ${r.ya_en_costos === 1 ? 'estaba' : 'estaban'} en Costos` : null,
    r.otros ? `${r.otros} notas de crédito u otros (se ven en Cuadre SII)` : null,
    r.faltan ? `faltan ${r.faltan}: vuelve a traer en un momento` : null,
    r.limpiadas ? `se sacaron ${r.limpiadas} que ya estaban registradas en Costos` : null].filter(Boolean);
  return `${partes.join(' · ')}.`;
}

// Bandeja de documentos (2026-11-12, pedido de Enzo): un listado, con pestañas
// - Salidas: compras y gastos por cargar (fotos subidas y facturas recibidas en el SII), con aviso de posible duplicado
// - Entradas: ventas emitidas en el SII (la TUU) que faltan en Facturas, para registrarlas ligadas a algo
let trayendo = null;   // una sola búsqueda en el SII a la vez (dos al mismo tiempo duplicaban documentos)
let pestana = 'salidas';
export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const puedeCrear = ctx.puede('costos', 'crear');
  const puedeSii = ctx.puede('costos', 'editar');
  const verEntradas = ctx.puede('cotizaciones', 'crear');
  if (ctx.params.pestana === 'entradas' && verEntradas) pestana = 'entradas';
  if (!verEntradas) pestana = 'salidas';
  const [{ data, error }, us, hechos, par] = await Promise.all([
    pendientesBandeja(ctx),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e }),
    ctx.api.from('fin_bandeja').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('estado', 'registrado')
      .gte('updated_at', new Date(Date.now() - 7 * 864e5).toISOString()),
    puedeSii ? ctx.api.rpc('fin_bandeja_parecido', { p_empresa: e }) : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  const filas = data ?? [];
  const parecido = new Map((par.data ?? []).map((x) => [x.bandeja_id, x]));
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  const urls = await urlsFirmadas(ctx.api, filas.map((f) => f.ruta)).catch(() => new Map());
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.subir') }, icono('volver', { tam: 16 }), 'Subir documentos');

  // ---- Agregar fotos o PDF
  const progreso = el('span', { class: 'texto-suave', 'aria-live': 'polite' });
  let subiendo = false;
  const subir = async (archivos) => {
    if (subiendo) return;
    subiendo = true; fotos.camara.disabled = true; fotos.galeria.disabled = true;
    const ok = await subirABandeja(ctx, archivos, (t) => { progreso.textContent = t; });
    avisar(ok === archivos.length ? (ok === 1 ? 'Quedó 1 documento en la bandeja.' : `Quedaron ${ok} documentos en la bandeja.`) : `Se subieron ${ok} de ${archivos.length}.`, ok === archivos.length ? 'ok' : 'error');
    ctx.refrescar();
  };
  const fotos = botonesFotos({ alElegir: subir, titulo: 'Boletas y facturas', textoListo: 'Subir', accept: 'image/*,application/pdf' });
  const cargar = (f) => { location.hash = ctx.ruta('costos.lector', { bandeja: f.id }); };

  // ---- Fila del listado
  const fila = (f) => {
    const url = urls.get(f.ruta);
    const d = f.origen === 'sii' ? f.dte : null;
    const p = parecido.get(f.id);
    const descartar = async (ev) => {
      const b = ev.currentTarget;
      if (b.dataset.seguro !== '1') {
        b.dataset.seguro = '1'; b.title = 'Toca de nuevo para descartar'; b.classList.add('ban-seguro');
        setTimeout(() => { b.dataset.seguro = ''; b.title = 'Descartar'; b.classList.remove('ban-seguro'); }, 3000);
        return;
      }
      b.disabled = true;
      try { await descartarDeBandeja(ctx, f); avisar('Documento descartado.'); ctx.refrescar(); } catch (err) { avisar(err.message, 'error'); b.disabled = false; }
    };
    const cuando = `${fechaLarga(diaLocal(f.created_at))} ${new Date(f.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    return el('tr', {},
      el('td', {}, d ? el('span', { class: 'chip chip-ok' }, 'SII') : el('span', { class: 'chip' }, 'Foto')),
      el('td', {}, d ? el('strong', {}, d.razon ?? '') : el('span', { class: 'texto-suave' }, 'Por leer'),
        d?.rut ? el('span', { class: 'texto-suave texto-chico ban-linea' }, d.rut) : null,
        p ? el('span', { class: 'texto-chico ban-aviso' }, icono('alerta', { tam: 13 }), ' ¿Ya está en Costos? ',
          el('a', { href: ctx.ruta('costos.registro', { id: p.registro_id }) }, `${p.concepto ?? 'Ver gasto'}${p.folio ? ` (N° ${p.folio})` : ''}`)) : null),
      el('td', {}, d ? `${NOMBRE_DTE[d.td] ?? 'Documento'} N° ${d.folio}` : '—'),
      el('td', { class: 'fac-fecha' }, d?.fecha ? fechaLarga(d.fecha) : ''),
      el('td', { class: 'num' }, d?.total != null ? dinero(d.total) : ''),
      el('td', { class: 'texto-chico texto-suave' }, d ? `Del SII · ${cuando}` : [cuando, quien.get(f.created_by)].filter(Boolean).join(' · ')),
      el('td', {}, el('div', { class: 'ban-acciones-fila' },
        url ? el('a', { class: 'boton boton-secundario boton-chico', href: url, target: '_blank', rel: 'noopener', title: 'Ver el documento', 'aria-label': 'Ver el documento' }, icono('ojo', { tam: 14 })) : null,
        boton('Cargar', { icono: 'editar', tipo: 'primario', class: 'boton boton-primario boton-chico', onclick: () => cargar(f) }),
        el('button', { type: 'button', class: 'boton-icono', title: 'Descartar', 'aria-label': 'Descartar', onclick: descartar }, icono('basura', { tam: 15 })))));
  };
  const tabla = filas.length
    ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla ban-tabla' },
      el('thead', {}, el('tr', {}, ['Origen', 'Proveedor', 'Documento', 'Fecha', 'Total', 'Llegó', ''].map((c, i) => el('th', { class: i === 4 ? 'num' : null }, c)))),
      el('tbody', {}, filas.map(fila))))
    : el('p', { class: 'texto-suave' }, 'No hay documentos por cargar.');

  // ---- Compras del SII: botón y, en producción, solas al abrir si pasaron 6 horas (nunca dos a la vez)
  const estadoSii = el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' });
  const traer = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.classList.add('cargando'); }
    estadoSii.textContent = 'Buscando facturas recibidas en el SII…';
    try {
      trayendo ??= traerComprasSii(ctx).finally(() => { trayendo = null; });
      const texto = await trayendo;
      estadoSii.textContent = texto; avisar(texto);
      if (!/^No hay/.test(texto) || /sacaron/.test(texto)) setTimeout(() => ctx.refrescar(), 1200);
    } catch (err) { estadoSii.textContent = err.message; avisar(err.message, 'error'); }
    finally { if (b) { b.disabled = false; b.classList.remove('cargando'); } }
  };
  if (puedeSii) {
    estadoDte(ctx).then((est) => {
      if (!est.conectado) { estadoSii.textContent = `OpenFactura no está conectado${est.error ? `: ${est.error}` : ''}.`; return; }
      const hace = est.compras_at ? Date.now() - Date.parse(est.compras_at) : Infinity;
      estadoSii.textContent = `${est.prueba ? 'Ambiente de pruebas de OpenFactura. ' : ''}${est.compras_at ? `Última revisión del SII: ${fechaLarga(diaLocal(est.compras_at))} ${new Date(est.compras_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}.` : 'Todavía no se han traído facturas del SII.'} Las que ya están en Costos no se repiten.`;
      if (!est.prueba && hace > 6 * 36e5) traer();
    });
  }

  // ---- Pestañas
  const zona = el('div', {});
  const salidas = () => [
    el('div', { class: 'listado-acciones ban-barra' },
      puedeCrear ? fotos.camara : null, puedeCrear ? fotos.galeria : null,
      puedeSii ? boton('Traer del SII', { icono: 'descargar', onclick: traer }) : null,
      filas.length ? boton(`Cargar el primero (${filas.length})`, { icono: 'derecha', tipo: 'primario', onclick: () => cargar(filas[0]) }) : null, progreso),
    puedeSii ? estadoSii : null,
    tabla,
    hechos.count ? el('p', { class: 'texto-suave texto-chico' }, `${hechos.count} ${hechos.count === 1 ? 'documento cargado' : 'documentos cargados'} desde la bandeja en los últimos 7 días. `,
      el('a', { href: ctx.ruta('costos.registros') }, 'Ver en Gastos e ingresos')) : null,
  ].filter(Boolean);
  const entradas = async () => {
    zona.replaceChildren(el('p', { class: 'texto-suave' }, 'Cargando…'));
    const { panelEmitidas } = await import('../../cotizaciones/emitidas.js?v=92f4191');
    const [cs, ts] = await Promise.all([
      ctx.api.from('cot_cotizaciones').select('id, numero, cliente_nombre, tercero_id').eq('empresa_id', e).is('deleted_at', null).is('madre_id', null).in('estado', ['enviada', 'aceptada']).order('numero', { ascending: false }).limit(500),
      ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).order('razon_social').limit(5000),
    ]);
    zona.replaceChildren(panelEmitidas(ctx, { cotizaciones: cs.data ?? [], clientes: ts.data ?? [], ordenes: [], alGuardar: () => ctx.refrescar() }),
      el('p', { class: 'texto-suave texto-chico' }, 'Para ligarlas a un vehículo del taller, regístralas desde la orden ("Ya cobré: traer la factura") o desde Cotizaciones → Facturas.'));
  };
  const botones = [['salidas', `Salidas: compras y gastos (${filas.length})`], ...(verEntradas ? [['entradas', 'Entradas: ventas']] : [])]
    .map(([k, t]) => [k, el('button', { type: 'button', onclick: () => { pestana = k; pintar(); } }, t)]);
  function pintar() {
    botones.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === pestana)));
    if (pestana === 'entradas') entradas(); else zona.replaceChildren(...salidas());
  }
  pintar();

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Bandeja de documentos'),
        el('p', { class: 'texto-suave' }, 'Lo que falta cargar: fotos de boletas y facturas, y lo que llega del SII. Cada documento se carga ligado a su vehículo, tercero o categoría.'))),
    botones.length > 1 ? el('div', { class: 'segmento', role: 'group', 'aria-label': 'Tipo de documentos' }, botones.map(([, b]) => b)) : null,
    zona);
}
