// Salud de la plataforma (Supervisor): el último resultado de las revisiones. Las externas (sitio, GitHub, Supabase,
// Cloudflare, OpenFactura, Meta, Anthropic) las hace el guion local supervisor/revisar.mjs, que tiene los tokens; las
// internas de la base (pg_cron, push, tamaño, RLS, consultas lentas) corren cada día con pg_cron o con el botón.
// Esta pantalla solo lee con_salud_* (es_equipo()); no llama a ningún servicio externo.
import { el } from '../../core/ui/dom.js?v=a90bd70';
import { icono } from '../../core/ui/iconos.js?v=a90bd70';
import { boton } from '../../core/ui/tabla.js?v=a90bd70';
import { avisar } from '../../core/ui/aviso.js?v=a90bd70';

const ORDEN = ['Sitio', 'GitHub', 'Supabase', 'Seguridad', 'Pruebas', 'Migraciones', 'Edge Functions', 'Calidad', 'Rendimiento',
  'pg_cron', 'Push', 'Cloudflare', 'OpenFactura', 'WhatsApp', 'Anthropic', 'Correo', 'Respaldos'];
const PESO = { error: 3, aviso: 2, info: 1, ok: 0 };
const TEXTO = { ok: 'OK', aviso: 'Aviso', error: 'Error', info: 'Info' };
const CHIP = { ok: 'chip-ok', aviso: 'chip-prox', error: 'chip-venc', info: 'chip-na' };
const fecha = (iso) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hace = (iso) => { const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? `hace ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`; };
const chip = (estado) => el('span', { class: `chip ${CHIP[estado]}` }, TEXTO[estado]);

// El dato de cada revisión: tabla si es una lista de objetos, pares si es un objeto
function detalle(dato) {
  if (dato == null) return null;
  const txt = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (Array.isArray(dato)) {
    if (!dato.length) return null;
    if (typeof dato[0] !== 'object') return el('p', { class: 'texto-suave texto-chico' }, dato.map(txt).join(' · '));
    const cols = [...new Set(dato.flatMap((f) => Object.keys(f)))].slice(0, 8);
    return el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla sal-tabla' },
      el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c.replaceAll('_', ' '))))),
      el('tbody', {}, dato.slice(0, 50).map((f) => el('tr', {}, cols.map((c) => el('td', {}, txt(f[c]).slice(0, 200))))))));
  }
  if (typeof dato === 'object') {
    const pares = Object.entries(dato).filter(([, v]) => !(Array.isArray(v) && !v.length));
    if (!pares.length) return null;
    return el('dl', { class: 'sal-pares' }, pares.flatMap(([k, v]) => [el('dt', {}, k.replaceAll('_', ' ')),
      el('dd', {}, Array.isArray(v) && v.length && typeof v[0] !== 'object' ? v.map(txt).join(', ') : txt(v).slice(0, 600))]));
  }
  return el('p', { class: 'texto-suave texto-chico' }, txt(dato));
}

export default async function vista(ctx) {
  const { data: ejecuciones, error } = await ctx.api.from('con_salud_ejecuciones').select('*').order('created_at', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  const elegida = ctx.params.e ? ejecuciones.find((e) => e.id === ctx.params.e) : null;
  const guion = ejecuciones.find((e) => e.origen === 'guion');
  const base = ejecuciones.find((e) => e.origen === 'base');
  const completo = ejecuciones.find((e) => e.origen === 'guion' && e.completo);

  // Lo vigente: la última del guion y, encima, la revisión interna más nueva (mismas revisiones de la base)
  const ids = elegida ? [elegida.id] : [guion?.id, base?.id].filter(Boolean);
  let chequeos = [];
  if (ids.length) {
    const r = await ctx.api.from('con_salud_chequeos').select('*').in('ejecucion_id', ids).order('id');
    if (r.error) throw new Error(r.error.message);
    const fechaDe = new Map(ejecuciones.map((e) => [e.id, e.created_at]));
    const porClave = new Map();
    for (const c of r.data) {
      const k = `${c.area}|${c.nombre}`; const previo = porClave.get(k);
      if (!previo || fechaDe.get(c.ejecucion_id) > fechaDe.get(previo.ejecucion_id)) porClave.set(k, { ...c, cuando: fechaDe.get(c.ejecucion_id) });
    }
    chequeos = [...porClave.values()];
  }
  // La última regresión completa se conserva aunque la revisión diaria no la traiga
  if (!elegida && completo && completo.id !== guion?.id) {
    const r = await ctx.api.from('con_salud_chequeos').select('*').eq('ejecucion_id', completo.id).eq('area', 'Pruebas');
    for (const c of r.data ?? []) chequeos.push({ ...c, cuando: completo.created_at });
  }

  const cuenta = (e) => chequeos.filter((c) => c.estado === e).length;
  const viejo = !guion || Date.now() - Date.parse(guion.created_at) > 36 * 36e5;
  const soloProblemas = ctx.params.ver === 'problemas';

  const revisarBase = boton('Revisar la base ahora', { icono: 'reloj', onclick: async () => {
    const { error: e } = await ctx.api.rpc('con_salud_revisar');
    if (e) { avisar(e.message, 'error'); return; }
    avisar('Revisión de la base guardada.'); location.hash = ctx.ruta('salud'); ctx.refrescar();
  } });
  const copiar = boton('Copiar resumen', { icono: 'copiar', onclick: async () => {
    const lineas = [`Salud de ISgestión (${fecha(new Date().toISOString())}): ${cuenta('ok')} ok, ${cuenta('aviso')} avisos, ${cuenta('error')} errores`];
    for (const c of chequeos.filter((x) => x.estado === 'error' || x.estado === 'aviso')) lineas.push(`- [${TEXTO[c.estado]}] ${c.area} · ${c.nombre}: ${c.detalle}`);
    try { await navigator.clipboard.writeText(lineas.join('\n')); avisar('Resumen copiado.'); } catch { avisar('No se pudo copiar.', 'error'); }
  } });
  const ir = (ver) => { location.hash = ctx.ruta('salud', { ...(elegida ? { e: elegida.id } : {}), ...(ver ? { ver } : {}) }); };
  const filtro = el('div', { class: 'pestanas sal-filtro', role: 'tablist' },
    el('button', { type: 'button', role: 'tab', 'aria-selected': String(!soloProblemas), onclick: () => ir(null) }, `Todo (${chequeos.length})`),
    el('button', { type: 'button', role: 'tab', 'aria-selected': String(soloProblemas), onclick: () => ir('problemas') }, `Avisos y errores (${cuenta('aviso') + cuenta('error')})`));

  const tarjeta = (t, v, sub, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, v), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null);
  const tarjetas = el('div', { class: 'fin-tarjetas' },
    tarjeta('Revisión completa (guion)', guion ? hace(guion.created_at) : 'Nunca', guion ? `${fecha(guion.created_at)} · ${guion.equipo ?? ''}` : 'Correr node supervisor/revisar.mjs', viejo ? 'fin-alerta' : ''),
    tarjeta('Revisión de la base', base ? hace(base.created_at) : 'Nunca', base ? `${fecha(base.created_at)} · ${base.equipo === 'pg_cron' ? 'automática' : base.equipo}` : 'Cada día a las 08:00 con pg_cron'),
    tarjeta('Errores', String(cuenta('error')), cuenta('error') ? 'atender' : 'ninguno', cuenta('error') ? 'fin-alerta' : ''),
    tarjeta('Avisos', String(cuenta('aviso')), `${cuenta('ok')} revisiones en orden`),
    tarjeta('Pruebas de seguridad', completo ? hace(completo.created_at) : 'Nunca', 'node supervisor/revisar.mjs --completo'));

  // Revisiones por área, en orden fijo; las de más peso primero dentro del área
  const areas = [...new Set(chequeos.map((c) => c.area))].sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99));
  const bloques = areas.map((area) => {
    const items = chequeos.filter((c) => c.area === area && (!soloProblemas || c.estado === 'error' || c.estado === 'aviso'))
      .sort((a, b) => PESO[b.estado] - PESO[a.estado]);
    if (!items.length) return null;
    const peor = items.reduce((p, c) => (PESO[c.estado] > PESO[p] ? c.estado : p), 'ok');
    return el('section', { class: `ficha sal-area sal-${peor}` },
      el('header', { class: 'sal-area-cabecera' }, el('h2', {}, area), chip(peor)),
      el('ul', { class: 'sal-lista' }, items.map((c) => {
        const d = detalle(c.dato);
        const fila = el('div', { class: 'sal-fila' }, chip(c.estado),
          el('div', { class: 'sal-texto' }, el('strong', {}, c.nombre), el('span', { class: 'texto-suave' }, c.detalle)),
          el('span', { class: 'texto-suave texto-chico sal-cuando', title: fecha(c.cuando) }, hace(c.cuando)));
        return el('li', {}, d ? el('details', {}, el('summary', {}, fila), el('div', { class: 'sal-detalle' }, d)) : fila);
      })));
  }).filter(Boolean);

  const historial = el('details', { class: 'ficha sal-historial' }, el('summary', {}, el('h2', {}, 'Historial (90 días)')),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Fecha', 'Origen', 'Desde', 'OK', 'Avisos', 'Errores', 'Duración'].map((t) => el('th', {}, t)))),
      el('tbody', {}, ejecuciones.map((e) => el('tr', { class: `fila-enlace${elegida?.id === e.id ? ' resaltada' : ''}`, title: 'Ver esta revisión', onclick: () => { location.hash = ctx.ruta('salud', { e: e.id }); } },
        el('td', {}, fecha(e.created_at)), el('td', {}, e.origen === 'guion' ? (e.completo ? 'Guion + pruebas' : 'Guion') : 'Base'),
        el('td', {}, e.equipo ?? ''), el('td', {}, String(e.ok)), el('td', {}, String(e.avisos)),
        el('td', {}, e.errores ? el('span', { class: 'chip chip-venc' }, String(e.errores)) : '0'),
        el('td', {}, e.duracion_ms != null ? `${(e.duracion_ms / 1000).toFixed(1)} s` : '')))))));

  // ---- En palabras simples: qué hay que mirar y qué hacer (lo técnico queda abajo, plegado)
  const todos = chequeos.filter((c) => c.estado === 'error' || c.estado === 'aviso')
    .map((c) => ({ ...c, ...explicar(c) })).sort((a, b) => PESO[b.estado] - PESO[a.estado]);
  // Lo que no pide hacer nada ahora ("Nada urgente…") va aparte, en una línea
  const despues = todos.filter((p) => p.estado === 'aviso' && /^Nada/.test(p.hacer));
  const problemas = todos.filter((p) => !despues.includes(p));
  const enOrden = [...new Set(chequeos.filter((c) => c.estado === 'ok').map((c) => explicar(c).titulo))];
  const nErr = problemas.filter((p) => p.estado === 'error').length;
  const titular = !chequeos.length ? 'Todavía no hay revisiones'
    : nErr ? `Hay ${nErr === 1 ? 'algo que necesita' : `${nErr} cosas que necesitan`} atención`
    : problemas.length ? `Todo funciona · ${problemas.length === 1 ? 'hay 1 cosa' : `hay ${problemas.length} cosas`} para mirar`
    : 'Todo funciona bien';
  const simple = el('div', { class: 'sal-simple' },
    el('div', { class: `ficha sal-titular sal-${nErr ? 'error' : problemas.length ? 'aviso' : 'ok'}` },
      icono(nErr ? 'alerta' : 'check', { tam: 28 }),
      el('div', {}, el('strong', {}, titular),
        el('span', { class: 'texto-suave' }, guion ? `Revisado ${hace(guion.created_at)}. Se revisa solo todos los días a las 08:15.` : 'Se revisa solo todos los días a las 08:15.'))),
    viejo && !elegida ? el('p', { class: 'sal-aviso sal-aviso-fuerte' }, icono('alerta', { tam: 16 }),
      ` La revisión automática no corre desde ${guion ? hace(guion.created_at) : 'nunca'}. Corre en el PC de la oficina: revisa que esté encendido.`) : null,
    problemas.length ? el('ul', { class: 'sal-simple-lista' }, problemas.map((p) => el('li', { class: `ficha sal-simple-item sal-${p.estado}` },
      el('div', { class: 'sal-simple-cabeza' }, el('strong', {}, p.titulo), el('span', { class: `chip ${CHIP[p.estado]}` }, p.estado === 'error' ? 'Atender' : 'Mirar')),
      el('p', {}, p.que),
      el('p', { class: 'sal-hacer' }, el('b', {}, 'Qué hacer: '), p.hacer)))) : null,
    despues.length ? el('p', { class: 'texto-suave sal-en-orden sal-despues' }, icono('reloj', { tam: 16 }), ` Para más adelante, sin urgencia: ${[...new Set(despues.map((p) => p.titulo))].join(', ')}.`) : null,
    enOrden.length ? el('p', { class: 'texto-suave sal-en-orden' }, icono('check', { tam: 16 }), ` En orden: ${enOrden.join(', ')}.`) : null);

  return el('section', { class: 'listado sal' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, icono('escudo'), ' Salud de la plataforma'),
      el('div', { class: 'listado-acciones' }, copiar)),
    elegida ? el('p', { class: 'sal-aviso' }, icono('reloj', { tam: 16 }), ` Viendo la revisión del ${fecha(elegida.created_at)}. `, el('a', { href: ctx.ruta('salud') }, 'Volver a la vigente')) : null,
    simple,
    el('details', { class: 'sal-tecnico', ...(elegida || ctx.params.ver ? { open: '' } : {}) },
      el('summary', {}, el('h2', {}, 'Detalle técnico')),
      el('div', { class: 'sal-tecnico-acciones' }, revisarBase),
      tarjetas,
      filtro,
      bloques.length ? el('div', { class: 'sal-areas' }, bloques)
        : el('div', { class: 'estado-vacio' }, icono('check', { tam: 28 }), el('p', {}, soloProblemas ? 'Sin avisos ni errores.' : 'Todavía no hay revisiones.')),
      historial));
}

// Cada revisión dicha en simple: nombre, qué significa lo que encontró y qué hacer. Lo no listado usa un texto general.
const PIDE = 'Copia el resumen (botón de arriba) y pégaselo a Claude para que lo revise.';
const SIMPLE = {
  'innovaservi.cl/isgestion responde': ['La página abre', 'La página de ISgestión no abrió o tardó mucho.', 'Ábrela tú en el navegador. Si no abre, avísale a Claude.'],
  'Versión publicada = main': ['La página tiene lo último', 'Hay cambios hechos que todavía no están publicados en la página.', 'Nada urgente: se publican cuando pidas "publicar".'],
  'Carga de archivos principales del sitio': ['Velocidad de la página', 'La página está tardando en cargar sus archivos.', PIDE],
  'isgestion: privado y al día': ['Código guardado en GitHub', 'Hay cambios en el PC que no se han subido a GitHub (la copia de respaldo del código).', 'Pídele a Claude que suba los cambios pendientes.'],
  'innovaservi: publicación y Pages': ['Publicación de la página', 'La última publicación no terminó bien o quedó a medias.', PIDE],
  'Proyecto activo': ['Base de datos encendida', 'La base de datos está pausada o con problemas: la app no funciona.', 'Entra a supabase.com y reactívala (Restore), o avísale a Claude.'],
  'Proyectos antiguos (aparte de ISgestión)': ['InnovaGestión y OS antiguos', 'Son sistemas aparte; no afectan a ISgestión.', 'Nada.'],
  'Avisos de Supabase (seguridad)': ['Recomendaciones de seguridad de Supabase', 'Supabase sugiere ajustes menores de seguridad. No hay nada abierto ni expuesto.', 'Nada urgente; se ordenan en una mejora futura.'],
  'Avisos de Supabase (rendimiento)': ['Recomendaciones de velocidad de Supabase', 'Supabase sugiere índices y ajustes para que algunas consultas sean más rápidas.', 'Nada urgente; se aplican en una mejora de velocidad.'],
  'Desplegadas': ['Funciones del servidor', 'Alguna función del servidor (facturas, WhatsApp, lectura con IA) no está al día con su código.', PIDE],
  'Errores en 24 h': ['Fallas del servidor', 'Alguna función del servidor (facturas, WhatsApp, lectura con IA) falló ayer.', 'Si fueron pocas, nada. Si se repite, copia el resumen y pásaselo a Claude.'],
  'Errores de la API (app) en 24 h': ['Acciones rechazadas', 'La base rechazó varias acciones de los usuarios (por ejemplo, guardar algo sin un dato obligatorio).', PIDE],
  'Errores de la base en 24 h': ['Errores al guardar', 'Hubo errores al guardar datos. Muchos son avisos normales a los usuarios.', 'Si se repite mucho, copia el resumen y pásaselo a Claude.'],
  'Tiempo de respuesta de la base (app, 24 h)': ['Velocidad de la base', 'La base está respondiendo lento a la app.', PIDE],
  'Respuesta de Supabase desde aquí': ['Conexión con la base', 'La conexión con la base está lenta desde la oficina.', 'Revisa el internet; si sigue, avísale a Claude.'],
  'Consultas lentas': ['Consultas lentas', 'Algunas búsquedas en la base tardan más de lo normal.', PIDE],
  'Auditoría de seguridad (0 filas)': ['Revisión de seguridad', 'La revisión encontró algo que no cumple las reglas de seguridad.', 'Avísale a Claude hoy.'],
  'Tablas sin RLS': ['Revisión de seguridad', 'Hay una tabla sin protección por empresa y permisos.', 'Avísale a Claude hoy.'],
  'Políticas abiertas (true)': ['Revisión de seguridad', 'Hay datos sin protección por empresa y permisos.', 'Avísale a Claude hoy.'],
  'Tamaño de la base': ['Espacio de la base', 'La base se está llenando (el plan gratis tiene 500 MB).', 'Avísale a Claude para ordenar o pasar a un plan pagado.'],
  'Conexiones': ['Conexiones a la base', 'Hay muchas conexiones abiertas al mismo tiempo.', PIDE],
  'Lista vs aplicadas': ['Cambios de la base pendientes', 'Hay cambios a la base preparados que todavía no se aplican (algunos esperan tu VB).', 'Nada urgente. Cuando des el VB a esas mejoras, se aplican.'],
  'Secretos de las Edge Functions': ['Claves de los servicios', 'Falta alguna clave de un servicio externo en el servidor.', PIDE],
  'SMTP de Supabase': ['Correos de la app', 'Los correos (invitaciones, cambio de contraseña) podrían no estar saliendo.', PIDE],
  'Bucket R2 isgestion': ['Archivos y fotos', 'El lugar donde se guardan las fotos y documentos no responde o se está llenando.', 'Avísale a Claude hoy.'],
  'Worker isgestion-archivos': ['Archivos y fotos', 'El servicio que entrega las fotos y documentos no responde.', 'Avísale a Claude hoy.'],
  'Claves por empresa': ['Facturación electrónica', 'La conexión con OpenFactura (facturas del SII) tiene un problema.', 'Avísale a Claude antes de emitir facturas.'],
  'Meta (token y números)': ['WhatsApp', 'Hubo mensajes de WhatsApp que no se pudieron enviar (Meta todavía bloquea los envíos).', 'Sigue pendiente el caso de soporte con Meta.'],
  'Clave de la API (lectura con IA y bot)': ['Lectura con IA', 'La lectura de documentos con IA no está funcionando.', 'Revisa en console.anthropic.com que queden créditos, o avísale a Claude.'],
  'Último respaldo de la base de ISgestión': ['Respaldo de los datos', 'Hace más de una semana que no se saca un respaldo de los datos (Supabase gratis no los guarda).', 'Pídele a Claude: "saca un respaldo de ISgestión".'],
  'Regresión de seguridad': ['Pruebas de seguridad', 'Muchas pruebas de seguridad no se pueden correr porque usaban datos de ejemplo que ya no están.', 'Está propuesta la tarea para rehacerlas.'],
  'Avisos push': ['Avisos al teléfono', 'Los avisos al teléfono no están saliendo.', PIDE],
};
function explicar(c) {
  const s = SIMPLE[c.nombre];
  if (s) return { titulo: s[0], que: s[1], hacer: s[2] };
  if (c.area === 'pg_cron') return { titulo: 'Tareas automáticas', que: `La tarea automática "${c.nombre}" (avisos diarios, horas de los fijos o esta revisión) falló o no ha corrido.`, hacer: PIDE };
  return { titulo: c.nombre, que: c.detalle, hacer: PIDE };
}
