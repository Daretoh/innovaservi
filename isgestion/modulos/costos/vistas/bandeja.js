// Bandeja "Por cargar" (2026-11-10, pedido de Enzo): sacar o elegir de una vez muchas fotos de boletas y facturas
// (ej.: 20 al volver de terreno) y cargarlas después una por una en el lector. Cada foto es una fila de fin_bandeja
// (Costos 008) con su archivo en R2 (<empresa>/costos/…). "Cargar" abre el lector con la foto ya puesta; al registrar
// el gasto la foto pasa a ser su archivo y el lector sigue con la siguiente de la bandeja.
// Ruta: #/costos.bandeja
import { el } from '../../../core/ui/dom.js?v=0cc60b3';
import { icono } from '../../../core/ui/iconos.js?v=0cc60b3';
import { boton } from '../../../core/ui/tabla.js?v=0cc60b3';
import { avisar } from '../../../core/ui/aviso.js?v=0cc60b3';
import { subirArchivo, urlsFirmadas, eliminarArchivo } from '../../../core/adjuntos.js?v=0cc60b3';
import { botonesFotos, tomarFotos } from '../../../core/ui/camara.js?v=0cc60b3';
import { comprimirFoto, esImagen, esPdf } from '../../../core/imagenes.js?v=0cc60b3';
import { fechaLarga, diaLocal, dinero, hoyISO } from '../../../core/ui/formato.js?v=0cc60b3';
import { llamarDte, estadoDte, NOMBRE_DTE } from '../../../core/dte.js?v=0cc60b3';

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

// Trae las compras del SII si la última revisión tiene más de `minutos` (2026-11-18, pedido de Enzo: que lleguen
// solas, sin subirlas). Una sola búsqueda a la vez. Devuelve el texto del resultado, o null si no hizo falta.
export async function traerSiHaceFalta(ctx, minutos = 30) {
  if (!ctx.puede('costos', 'editar')) return null;
  const est = await estadoDte(ctx);
  if (!est.conectado || est.prueba) return null;
  const hace = est.compras_at ? Date.now() - Date.parse(est.compras_at) : Infinity;
  if (hace < minutos * 60e3 && !trayendo) return null;
  trayendo ??= traerComprasSii(ctx).finally(() => { trayendo = null; });
  return trayendo;
}

// Bandeja de documentos (2026-11-12; desde el 2026-11-24 es la única entrada de Costos, pedido de Enzo). Pestañas
// como el SII:
// - Compras: lo que falta cargar. "Del SII" = facturas recibidas a nuestro RUT (declaradas, llegan solas);
//   "Fotos y escaneos" = boletas, tickets y papeles subidos. Aquí mismo se sube, se registra un gasto sin papel o a mano.
// - Las ventas por registrar pasaron a Ventas y cobros (vistaVentas, más abajo)
let trayendo = null;   // una sola búsqueda en el SII a la vez (dos al mismo tiempo duplicaban documentos)
let origen = 'todas';
export default async function vista(ctx) {
  const e = ctx.empresa.id;
  // Enlaces antiguos a la pestaña de ventas
  if (['entradas', 'ventas'].includes(ctx.params.pestana)) { location.replace(ctx.ruta('costos.ventas')); return el('p', {}, ''); }
  const puedeCrear = ctx.puede('costos', 'crear');
  const puedeSii = ctx.puede('costos', 'editar');
  const [{ data, error }, us, hechos, par, sueldos, esperan] = await Promise.all([
    pendientesBandeja(ctx),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e }),
    ctx.api.from('fin_bandeja').select('id', { count: 'exact', head: true }).eq('empresa_id', e).eq('estado', 'registrado')
      .gte('updated_at', new Date(Date.now() - 7 * 864e5).toISOString()),
    puedeSii ? ctx.api.rpc('fin_bandeja_parecido', { p_empresa: e }) : Promise.resolve({ data: [] }),
    // Pagos de sueldos que llegaron de Remuneraciones (Remuneraciones 012) y todavía no tienen la transferencia
    puedeSii ? ctx.api.from('fin_registros').select('id, fecha, concepto, total, notas').eq('empresa_id', e).not('remu_ref', 'is', null).is('archivo', null).is('deleted_at', null).order('fecha') : Promise.resolve({ data: [] }),
    // Pagos con comprobante que esperan la factura del proveedor (Costos 015)
    ctx.api.from('fin_registros').select('id, fecha, concepto, total, tercero_id, terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia)').eq('empresa_id', e).eq('espera_factura', true).is('deleted_at', null).order('fecha'),
  ]);
  if (error) throw error;
  const filas = data ?? [];
  const parecido = new Map((par.data ?? []).map((x) => [x.bandeja_id, x]));
  const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
  const urls = await urlsFirmadas(ctx.api, filas.map((f) => f.ruta)).catch(() => new Map());

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
        // (Costos 014) También gastos antiguos sin RUT con el mismo monto y fecha: "Es el mismo" le pasa los datos del SII
        p ? el('span', { class: 'texto-chico ban-aviso' }, icono('alerta', { tam: 13 }), p.certeza === 'factura' ? ' Es la factura de un pago que la esperaba: ' : p.certeza === 'monto' ? ' ¿Ya está en Gastos? Mismo monto y fecha: ' : ' ¿Ya está en Gastos? ',
          el('a', { href: ctx.ruta('costos.registro', { id: p.registro_id }) }, `${p.concepto ?? 'Ver gasto'}${p.folio ? ` (N° ${p.folio})` : ''} · ${fechaLarga(p.fecha)}`), ' ',
          puedeSii ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', title: 'El gasto ya cargado toma el N°, el RUT y el PDF del SII y el documento sale de la Bandeja',
            onclick: async (ev) => {
              const b = ev.currentTarget; b.disabled = true;
              const { error: er } = await ctx.api.rpc('fin_bandeja_es_el_mismo', { p_bandeja: f.id, p_registro: p.registro_id });
              if (er) { avisar(er.message, 'error'); b.disabled = false; return; }
              avisar('Listo: el gasto quedó con los datos del SII.'); ctx.refrescar();
            } }, 'Es el mismo') : null) : null),
      el('td', {}, d ? `${NOMBRE_DTE[d.td] ?? 'Documento'} N° ${d.folio}` : '—'),
      el('td', { class: 'fac-fecha' }, d?.fecha ? fechaLarga(d.fecha) : ''),
      el('td', { class: 'num' }, d?.total != null ? dinero(d.total) : ''),
      el('td', { class: 'texto-chico texto-suave' }, d ? `Del SII · ${cuando}` : [cuando, quien.get(f.created_by)].filter(Boolean).join(' · ')),
      el('td', {}, el('div', { class: 'ban-acciones-fila' },
        url ? el('a', { class: 'boton boton-secundario boton-chico', href: url, target: '_blank', rel: 'noopener', title: 'Ver el documento', 'aria-label': 'Ver el documento' }, icono('ojo', { tam: 14 })) : null,
        boton('Cargar', { icono: 'editar', tipo: 'primario', class: 'boton boton-primario boton-chico', onclick: () => cargar(f) }),
        el('button', { type: 'button', class: 'boton-icono', title: 'Descartar', 'aria-label': 'Descartar', onclick: descartar }, icono('basura', { tam: 15 })))));
  };
  const juntarTodos = async (ev) => {
    const b = ev.currentTarget;
    if (b.dataset.seguro !== '1') {
      b.dataset.seguro = '1'; b.textContent = `Toca de nuevo: juntar ${parecido.size} con su gasto`;
      setTimeout(() => { if (b.isConnected) { b.dataset.seguro = ''; b.textContent = `Juntar los que ya están en Gastos (${parecido.size})`; } }, 4000);
      return;
    }
    b.disabled = true;
    let ok = 0; const usados = new Set();
    for (const p of parecido.values()) {
      if (usados.has(p.registro_id)) continue;   // un gasto se junta con un solo documento
      const { error: er } = await ctx.api.rpc('fin_bandeja_es_el_mismo', { p_bandeja: p.bandeja_id, p_registro: p.registro_id });
      if (!er) { ok += 1; usados.add(p.registro_id); }
    }
    avisar(ok === 1 ? '1 documento se juntó con su gasto.' : `${ok} documentos se juntaron con su gasto.`);
    ctx.refrescar();
  };
  const delSii = filas.filter((f) => f.origen === 'sii');
  const subidas = filas.filter((f) => f.origen !== 'sii');
  const deOrigen = () => (origen === 'sii' ? delSii : origen === 'fotos' ? subidas : filas);
  const tabla = () => (deOrigen().length
    ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla ban-tabla' },
      el('thead', {}, el('tr', {}, ['Origen', 'Proveedor', 'Documento', 'Fecha', 'Total', 'Llegó', ''].map((c, i) => el('th', { class: i === 4 ? 'num' : null }, c)))),
      el('tbody', {}, deOrigen().map(fila))))
    : el('p', { class: 'texto-suave' }, filas.length ? 'No hay documentos de este tipo por cargar.' : 'No hay documentos por cargar.'));

  // ---- Compras del SII: botón y, en producción, solas al abrir si pasaron 30 minutos (nunca dos a la vez)
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
      if (!est.prueba && hace > 30 * 60e3) traer();
    });
  }

  // ---- Pestañas
  const zona = el('div', {});
  const filtro = () => el('div', { class: 'segmento', role: 'group', 'aria-label': 'Origen' },
    [['todas', `Todas (${filas.length})`], ['sii', `Del SII (${delSii.length})`], ['fotos', `Fotos y escaneos (${subidas.length})`]].map(([k, t]) =>
      el('button', { type: 'button', 'aria-pressed': String(origen === k), onclick: () => { origen = k; pintar(); } }, t)));
  const AYUDA = {
    todas: 'Del SII = facturas que otros emitieron a nuestro RUT (declaradas, llegan solas). Fotos y escaneos = boletas, tickets y papeles subidos.',
    sii: 'Facturas que otros emitieron a nuestro RUT: son declaradas (sirven para el IVA) y llegan solas, no hace falta subirlas.',
    fotos: 'Boletas, tickets y papeles subidos. La boleta no es declarable; si una foto es una factura, revisa que no esté también en "Del SII".',
  };
  // Sueldos pagados sin la transferencia: se sube aquí y queda como respaldo del gasto
  const subirTransferencia = (g) => {
    const entrada = el('input', { type: 'file', accept: 'image/*,application/pdf', hidden: true, onchange: async () => {
      const a = entrada.files?.[0]; if (!a) return;
      try {
        const archivo = esPdf(a) ? a : await comprimirFoto(a, 2000);
        const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo, tabla: 'fin_registros' });
        const { error: er } = await ctx.api.from('fin_registros').update({ archivo: ruta }).eq('id', g.id);
        if (er) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(er.message); }
        avisar('Transferencia guardada.'); ctx.refrescar();
      } catch (err) { avisar(err.message, 'error'); }
    } });
    entrada.click();
  };
  const sueldosSinRespaldo = () => ((sueldos.data ?? []).length ? el('div', { class: 'ficha doc-grupo ban-sueldos' },
    el('strong', {}, `Sueldos pagados sin la transferencia (${sueldos.data.length})`),
    el('p', { class: 'texto-suave texto-chico' }, 'Llegan solos de Remuneraciones al confirmar un pago (ya están en Gastos, categoría Mano de obra). Sube la transferencia del banco para respaldarlos.'),
    sueldos.data.map((g) => el('div', { class: 'ban-sueldo' },
      el('span', {}, el('a', { href: ctx.ruta('costos.registro', { id: g.id }) }, g.concepto), el('span', { class: 'texto-suave texto-chico' }, ` · ${fechaLarga(g.fecha)}${g.notas ? ` · ${g.notas}` : ''}`)),
      el('strong', {}, dinero(g.total)),
      boton('Subir transferencia', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => subirTransferencia(g) })))) : null);
  // Pagos que esperan su factura: cuántos días llevan; al llegar del SII aparece arriba "Es la factura de un pago"
  const quitarEspera = async (ev, g) => {
    const b = ev.currentTarget; b.disabled = true;
    const { error: er } = await ctx.api.from('fin_registros').update({ espera_factura: false }).eq('id', g.id);
    if (er) { avisar(er.message, 'error'); b.disabled = false; return; }
    avisar('Ya no espera factura.'); ctx.refrescar();
  };
  const esperandoFactura = () => ((esperan.data ?? []).length ? el('details', { class: 'ficha doc-grupo ban-sueldos', open: true },
    el('summary', {}, el('strong', {}, `Esperando factura (${esperan.data.length})`),
      el('span', { class: 'texto-suave texto-chico' }, ' · pagos con comprobante; la factura del proveedor aún no llega')),
    el('p', { class: 'texto-suave texto-chico' }, 'Cuando la factura llegue del SII aparece en la lista con "Es la factura de un pago" y se junta con un toque. Si llegó por otro lado o no llegará, quita la marca.'),
    esperan.data.map((g) => {
      const dias = Math.round((Date.parse(hoyISO()) - Date.parse(g.fecha)) / 864e5);
      return el('div', { class: 'ban-sueldo' },
        el('span', {}, el('a', { href: ctx.ruta('costos.registro', { id: g.id }) }, g.concepto),
          el('span', { class: 'texto-suave texto-chico' }, ` · ${[g.terceros?.nombre_fantasia || g.terceros?.razon_social || 'sin proveedor', fechaLarga(g.fecha)].join(' · ')}`),
          el('span', { class: `texto-chico ${dias > 30 ? 'texto-error' : 'texto-suave'}` }, ` · hace ${dias} ${dias === 1 ? 'día' : 'días'}`)),
        el('strong', {}, dinero(g.total)),
        ctx.puede('costos', 'editar') ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: (ev) => quitarEspera(ev, g) }, 'Ya no espera') : null);
    })) : null);
  const compras = () => [
    esperandoFactura(),
    sueldosSinRespaldo(),
    puedeCrear ? el('div', { class: 'ficha doc-grupo ban-subir' },
      el('div', {}, el('strong', {}, 'Subir'),
        el('p', { class: 'texto-suave texto-chico' }, 'Saca o elige todas las fotos o PDF de una vez (ej.: las boletas al volver de terreno); quedan aquí y después se cargan una por una.')),
      el('div', { class: 'listado-acciones' }, fotos.camara, fotos.galeria,
        boton('Gasto sin papel', { icono: 'dinero', title: 'Solo si no hay boleta, factura ni ticket (ej.: propina, feria). No es declarable.', onclick: () => import('./subir.js?v=0cc60b3').then((m) => m.sinDocumento(ctx)) }),
        el('a', { class: 'boton boton-secundario', href: ctx.ruta('costos.registro', { tipo: 'gasto' }), title: 'Escribir todos los datos, sin foto' }, icono('editar', { tam: 16 }), 'A mano'),
        progreso)) : null,
    el('div', { class: 'listado-acciones ban-barra' },
      filtro(),
      puedeSii ? boton('Traer del SII', { icono: 'descargar', onclick: traer }) : null,
      // (2026-11-24, pedido de Enzo: que salgan de la Bandeja los que ya están subidos) Junta todos los avisos de una vez
      puedeSii && parecido.size ? boton(`Juntar los que ya están en Gastos (${parecido.size})`, { icono: 'check', title: 'Cada gasto ya cargado toma el N°, el RUT y el PDF del SII y el documento sale de la Bandeja', onclick: juntarTodos }) : null,
      deOrigen().length ? boton(`Cargar el primero (${deOrigen().length})`, { icono: 'derecha', tipo: 'primario', onclick: () => cargar(deOrigen()[0]) }) : null),
    puedeSii ? estadoSii : null,
    el('p', { class: 'texto-suave texto-chico' }, AYUDA[origen]),
    tabla(),
    hechos.count ? el('p', { class: 'texto-suave texto-chico' }, `${hechos.count} ${hechos.count === 1 ? 'documento cargado' : 'documentos cargados'} desde la bandeja en los últimos 7 días. `,
      el('a', { href: ctx.ruta('costos.registros') }, 'Ver en Gastos')) : null,
  ].filter(Boolean);
  function pintar() { zona.replaceChildren(...compras().filter(Boolean)); }
  pintar();

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Bandeja de compras'),
        el('p', { class: 'texto-suave' }, 'Todas las compras y gastos entran por aquí: lo que llega del SII y las fotos que se suben. Cada documento se carga ligado a su vehículo, tercero o categoría y pasa a Gastos.'))),
    zona);
}

// Ventas por registrar (antes pestaña "Ventas" de la Bandeja): desde el 2026-11-24 están arriba en Facturas
// (Finanzas → Ventas y cobros), que las trae solas del SII. La ruta queda para enlaces antiguos.
export async function vistaVentas(ctx) {
  location.replace(ctx.puede('cotizaciones', 'ver') ? ctx.ruta('cotizaciones.oc') : ctx.ruta('costos.ingresos'));
  return el('p', { class: 'texto-suave' }, 'Abriendo Facturas…');
}
