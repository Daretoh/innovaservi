// Almacenamiento (Consola 004, 2026-11-18): los archivos del bucket R2 'isgestion' con su peso, cuándo se subieron,
// cuándo se abrieron por última vez (archivos_acceso, lo anota el Worker) y qué fila los usa (con_archivos_refs).
// Filtros por empresa, módulo, tipo, estado y antigüedad; se eliminan marcando. Al eliminar, primero se quitan las
// referencias en la base (con_archivos_quitar: adjuntos con borrado lógico, filas de galería fuera) y después el
// archivo en R2 (Worker /eliminar-equipo). Solo se pueden eliminar huérfanos o archivos de galerías y adjuntos; lo que
// usa otra tabla (boletas, facturas, documentos de RRHH…) se borra desde su módulo. Solo el equipo (es_equipo()).
import { el } from '../../core/ui/dom.js?v=96471b3';
import { icono } from '../../core/ui/iconos.js?v=96471b3';
import { boton } from '../../core/ui/tabla.js?v=96471b3';
import { avisar } from '../../core/ui/aviso.js?v=96471b3';
import { abrirFormulario } from '../../core/ui/modal.js?v=96471b3';
import { urlFirmada, megas } from '../../core/adjuntos.js?v=96471b3';

const BORRABLES = new Set(['adjuntos', 'tal_media', 'rep_media', 'cat_fotos', 'tar_adjuntos']);
const TIPOS = { video: 'Video', foto: 'Foto', pdf: 'PDF', otro: 'Otro' };
const ESTADOS = [['', 'Todos'], ['huerfano', 'Huérfanos (nadie los usa)'], ['uso', 'En uso'], ['nunca', 'Nunca abiertos (desde que se anota)'], ['30', 'Sin abrir en 30 días'], ['90', 'Sin abrir en 90 días']];
const ORDENES = [['peso', 'Más pesados'], ['viejo', 'Más antiguos'], ['nuevo', 'Más nuevos'], ['acceso', 'Abiertos hace más tiempo']];
const MOSTRAR = 200;
const MODULOS = { taller: 'Taller', reportes: 'Reportes', costos: 'Costos', rrhh: 'RRHH', acreditacion: 'Acreditación', cotizaciones: 'Cotizaciones', catalogo: 'Catálogo', sst: 'SST', tareas: 'Tareas', ope: 'Faenas', cierres: 'Cierres', remu: 'Remuneraciones', nucleo: 'Núcleo', documentos: 'Documentos', flota: 'Flota', marcaje: 'Marcaje' };

let cache = null;   // { archivos, cargado } — los filtros no vuelven a pedir los datos
const filtro = { empresa: '', modulo: '', tipo: '', estado: '', orden: 'peso', antes: '', texto: '', limite: MOSTRAR };
const marcados = new Set();

const workerUrl = () => globalThis.__isgArchivosUrl;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const dias = (iso) => (Date.now() - Date.parse(iso)) / 864e5;
const uuidDe = (k) => k.split('/').pop().slice(0, 36);   // igual que con_archivos_refs (hay subcarpetas: ope/prep)
function tipoDe(o) {
  const e = (o.k.split('.').pop() || '').toLowerCase(); const ct = o.ct || '';
  if (ct.startsWith('video') || ['mp4', 'mov', 'webm', '3gp', 'm4v'].includes(e)) return 'video';
  if (ct.startsWith('image') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(e)) return 'foto';
  if (ct.includes('pdf') || e === 'pdf') return 'pdf';
  return 'otro';
}

async function pedirWorker(ctx, ruta, opciones = {}) {
  const { data: { session } } = await ctx.api.auth.getSession();
  const r = await fetch(`${workerUrl()}${ruta}`, { ...opciones, headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ''}` } });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status} del servidor de archivos`);
  return cuerpo;
}

async function cargar(ctx) {
  if (!workerUrl()) throw new Error('Esta organización no usa R2 (falta archivosUrl en tenants.json).');
  const objetos = [];
  let cursor = null;
  do {
    const r = await pedirWorker(ctx, `/listar${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    objetos.push(...r.objetos); cursor = r.cursor;
  } while (cursor);
  const [refs, accesos, empresas] = await Promise.all([ctx.api.rpc('con_archivos_refs'), ctx.api.from('archivos_acceso').select('ruta, ultimo, veces'), ctx.api.rpc('con_empresas')]);
  for (const r of [refs, accesos, empresas]) if (r.error) throw new Error(r.error.message);
  const porUuid = new Map();
  for (const r of refs.data ?? []) (porUuid.get(r.uuid) ?? porUuid.set(r.uuid, []).get(r.uuid)).push(r);
  const acceso = new Map(accesos.data.map((a) => [a.ruta, a]));
  const nombreEmp = new Map(empresas.data.map((e) => [e.empresa_id, e.nombre_fantasia || e.razon_social]));
  const archivos = objetos.map((o) => {
    const p = o.k.split('/');
    const personal = p[0] === 'personas';
    const usos = (porUuid.get(uuidDe(o.k)) ?? []).filter((u) => !(u.tabla === 'adjuntos' && /\(eliminado\)$/.test(u.detalle ?? '')));
    const a = acceso.get(o.k);
    return {
      ...o, tipo: tipoDe(o), modulo: personal ? p[2] : p[1],
      empresa: personal ? 'personas' : p[0],
      empresaNombre: personal ? 'Documentos personales' : (nombreEmp.get(p[0]) ?? `Empresa que ya no existe (${p[0].slice(0, 8)})`),
      nombre: p[p.length - 1].replace(/^[0-9a-f-]{36}-/, ''),
      usos, ultimo: a?.ultimo ?? null, veces: a?.veces ?? 0,
      borrable: usos.every((u) => BORRABLES.has(u.tabla)),
    };
  });
  // Desde cuándo se anota el último acceso (el primer registro); antes de eso "nunca" no significa nada
  const desde = accesos.data.reduce((m, a) => (!m || a.ultimo < m ? a.ultimo : m), null);
  return { archivos, desde, cargado: new Date() };
}

function aplicar(archivos) {
  const t = filtro.texto.trim().toLowerCase();
  const lista = archivos.filter((a) => (!filtro.empresa || a.empresa === filtro.empresa)
    && (!filtro.modulo || a.modulo === filtro.modulo)
    && (!filtro.tipo || a.tipo === filtro.tipo)
    && (!filtro.antes || a.t.slice(0, 10) < filtro.antes)
    && (!t || a.nombre.toLowerCase().includes(t) || a.usos.some((u) => (u.detalle ?? '').toLowerCase().includes(t)))
    && (filtro.estado === '' ? true
      : filtro.estado === 'huerfano' ? !a.usos.length
      : filtro.estado === 'uso' ? a.usos.length > 0
      : filtro.estado === 'nunca' ? !a.ultimo
      : !a.ultimo || dias(a.ultimo) > Number(filtro.estado)));
  const orden = {
    peso: (x, y) => y.s - x.s, viejo: (x, y) => (x.t < y.t ? -1 : 1), nuevo: (x, y) => (x.t < y.t ? 1 : -1),
    acceso: (x, y) => ((x.ultimo ?? '') < (y.ultimo ?? '') ? -1 : 1),
  }[filtro.orden];
  return lista.sort(orden);
}

export default async function vista(ctx) {
  if (!cache || ctx.params.recargar) cache = await cargar(ctx);
  const { archivos, desde } = cache;
  const raiz = el('section', { class: 'listado alm' });

  const suma = (l) => l.reduce((s, a) => s + a.s, 0);
  const videos = archivos.filter((a) => a.tipo === 'video');
  const huerfanos = archivos.filter((a) => !a.usos.length);
  const tarjeta = (t, v, sub, alAbrir) => el(alAbrir ? 'button' : 'div', { class: `ficha doc-grupo fin-tarjeta${alAbrir ? ' fin-tarjeta-boton' : ''}`, ...(alAbrir ? { type: 'button', onclick: alAbrir } : {}) },
    el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, v), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null);
  // Al filtrar desde una tarjeta o el resumen, los selectores muestran lo elegido
  const ir = (cambios) => {
    Object.assign(filtro, cambios, { limite: MOSTRAR });
    for (const c of raiz.querySelectorAll('[data-filtro]')) c.value = filtro[c.dataset.filtro];
    pintar();
  };
  const tarjetas = el('div', { class: 'fin-tarjetas' },
    tarjeta('Total en R2', megas(suma(archivos)), `${archivos.length} archivos · el plan gratis incluye 10 GB`),
    tarjeta('Videos', megas(suma(videos)), `${videos.length} videos`, () => ir({ tipo: 'video', estado: '', orden: 'peso' })),
    tarjeta('Huérfanos', megas(suma(huerfanos)), `${huerfanos.length} sin fila que los use`, () => ir({ estado: 'huerfano', tipo: '' })),
    tarjeta('Último acceso', desde ? `Desde ${fecha(desde)}` : 'Sin datos aún', 'se anota al abrir cada archivo'));

  const porGrupo = (clave, nombre) => {
    const m = new Map();
    for (const a of archivos) { const k = clave(a); const g = m.get(k) ?? { n: 0, b: 0, nombre: nombre(a) }; g.n++; g.b += a.s; m.set(k, g); }
    return [...m.entries()].sort((x, y) => y[1].b - x[1].b);
  };
  const resumen = el('details', { class: 'ficha alm-resumen' }, el('summary', {}, el('h2', {}, 'Por empresa y módulo')),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Empresa', 'Módulo', 'Archivos', 'Peso'].map((t) => el('th', {}, t)))),
      el('tbody', {}, porGrupo((a) => `${a.empresa}|${a.modulo}`, (a) => [a.empresaNombre, MODULOS[a.modulo] ?? a.modulo]).map(([k, g]) => {
        const [emp, mod] = k.split('|');
        return el('tr', { class: 'fila-enlace', title: 'Filtrar', onclick: () => ir({ empresa: emp, modulo: mod }) },
          el('td', {}, g.nombre[0]), el('td', {}, g.nombre[1]), el('td', {}, String(g.n)), el('td', {}, megas(g.b)));
      })))));

  const opciones = (lista, actual) => lista.map(([v, t]) => el('option', { value: v, selected: v === actual }, t));
  const empresas = porGrupo((a) => a.empresa, (a) => a.empresaNombre).map(([k, g]) => [k, g.nombre]);
  const modulos = porGrupo((a) => a.modulo, (a) => MODULOS[a.modulo] ?? a.modulo).map(([k, g]) => [k, g.nombre]);
  const sel = (clave, lista, etiqueta) => el('select', { class: 'campo', 'aria-label': etiqueta, 'data-filtro': clave, onchange: (ev) => ir({ [clave]: ev.target.value }) }, opciones(lista, filtro[clave]));
  const buscar = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar nombre u OT', value: filtro.texto, 'aria-label': 'Buscar',
    oninput: (ev) => { filtro.texto = ev.target.value; clearTimeout(buscar._t); buscar._t = setTimeout(() => ir({}), 250); } });
  const filtros = el('div', { class: 'alm-filtros' },
    sel('empresa', [['', 'Todas las empresas'], ...empresas], 'Empresa'),
    sel('modulo', [['', 'Todos los módulos'], ...modulos], 'Módulo'),
    sel('tipo', [['', 'Todos los tipos'], ...Object.entries(TIPOS)], 'Tipo'),
    sel('estado', ESTADOS, 'Estado'),
    el('label', { class: 'alm-antes' }, el('span', { class: 'texto-suave texto-chico' }, 'Subidos antes del'),
      el('input', { class: 'campo', type: 'date', value: filtro.antes, 'data-filtro': 'antes', onchange: (ev) => ir({ antes: ev.target.value }) })),
    sel('orden', ORDENES, 'Orden'),
    buscar);

  const barra = el('div', { class: 'alm-barra' });
  const tabla = el('div', { class: 'tabla-contenedor' });

  async function eliminar(lista) {
    const total = suma(lista);
    abrirFormulario({
      titulo: 'Eliminar archivos',
      mensaje: `Se eliminan ${lista.length} archivo${lista.length === 1 ? '' : 's'} (${megas(total)}) de R2. No se puede deshacer. `
        + 'En la base, los adjuntos quedan marcados como eliminados y las fotos o videos salen de su orden, parte o producto.',
      campos: [], textoGuardar: 'Eliminar',
      alGuardar: async () => {
        const rutas = lista.map((a) => a.k);
        for (let i = 0; i < rutas.length; i += 200) {
          const trozo = rutas.slice(i, i + 200);
          const { error } = await ctx.api.rpc('con_archivos_quitar', { p_rutas: trozo });
          if (error) throw new Error(error.message);
          await pedirWorker(ctx, '/eliminar-equipo', { method: 'POST', body: JSON.stringify({ rutas: trozo }), headers: { 'content-type': 'application/json' } });
        }
        const fuera = new Set(rutas);
        cache.archivos = cache.archivos.filter((a) => !fuera.has(a.k));
        for (const r of rutas) marcados.delete(r);
        avisar(`${rutas.length} archivo${rutas.length === 1 ? '' : 's'} eliminado${rutas.length === 1 ? '' : 's'} (${megas(total)} liberados).`);
        vista(ctx).then((n) => raiz.replaceWith(n));
      },
    });
  }

  async function ver(a) {
    try { window.open(await urlFirmada(ctx.api, a.k, 600), '_blank', 'noopener'); }
    catch { avisar('No tienes acceso a los archivos de esa empresa con tu cuenta.', 'error'); }
  }

  function pintar() {
    const lista = aplicar(cache.archivos);
    const porRuta = new Map(cache.archivos.map((a) => [a.k, a]));
    for (const k of [...marcados]) if (!porRuta.has(k)) marcados.delete(k);
    const elegidos = [...marcados].map((k) => porRuta.get(k));
    const borrablesVisibles = lista.filter((a) => a.borrable);
    const todos = el('input', { type: 'checkbox', 'aria-label': 'Marcar todos los que se pueden eliminar',
      checked: borrablesVisibles.length > 0 && borrablesVisibles.every((a) => marcados.has(a.k)),
      onchange: (ev) => { for (const a of borrablesVisibles) { if (ev.target.checked) marcados.add(a.k); else marcados.delete(a.k); } pintar(); } });
    barra.replaceChildren(...[
      el('span', { class: 'texto-suave' }, `${lista.length} archivo${lista.length === 1 ? '' : 's'} · ${megas(suma(lista))}`),
      elegidos.length ? el('strong', {}, `${elegidos.length} marcado${elegidos.length === 1 ? '' : 's'} · ${megas(suma(elegidos))}`) : null,
      el('div', { class: 'barra-espacio' }),
      elegidos.length ? boton('Quitar marcas', { onclick: () => { marcados.clear(); pintar(); } }) : null,
      boton('Eliminar marcados', { icono: 'basura', tipo: 'primario', disabled: !elegidos.length, onclick: () => eliminar(elegidos) })].filter(Boolean));
    const filas = lista.slice(0, filtro.limite).map((a) => el('tr', { class: marcados.has(a.k) ? 'resaltada' : '' },
      el('td', {}, el('input', { type: 'checkbox', 'aria-label': `Marcar ${a.nombre}`, checked: marcados.has(a.k), disabled: !a.borrable,
        title: a.borrable ? '' : 'Lo usa otra tabla: se elimina desde su módulo',
        onchange: (ev) => { if (ev.target.checked) marcados.add(a.k); else marcados.delete(a.k); pintar(); } })),
      el('td', { class: 'alm-nombre' }, el('span', {}, a.nombre), el('span', { class: 'texto-suave texto-chico' }, `${a.empresaNombre} · ${MODULOS[a.modulo] ?? a.modulo}`)),
      el('td', {}, TIPOS[a.tipo]),
      el('td', { class: 'alm-num' }, megas(a.s)),
      el('td', {}, fecha(a.t)),
      el('td', {}, a.ultimo ? `${fecha(a.ultimo)}${a.veces > 1 ? ` (${a.veces})` : ''}` : el('span', { class: 'texto-suave' }, '—')),
      el('td', {}, a.usos.length ? a.usos.map((u) => el('div', { class: 'texto-chico' }, u.detalle ? `${u.tabla} · ${u.detalle}` : u.tabla))
        : el('span', { class: 'chip chip-prox' }, 'Huérfano')),
      el('td', {}, el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver ${a.nombre}`, onclick: () => ver(a) }, icono('ojo')))));
    tabla.replaceChildren(...[
      el('table', { class: 'tabla alm-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, todos), ['Archivo', 'Tipo', 'Peso', 'Subido', 'Último acceso', 'Lo usa', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, filas)),
      lista.length > filtro.limite ? el('div', { class: 'alm-mas' }, boton(`Mostrar ${Math.min(MOSTRAR, lista.length - filtro.limite)} más`, { onclick: () => { filtro.limite += MOSTRAR; pintar(); } })) : null,
      !lista.length ? el('div', { class: 'estado-vacio' }, icono('check', { tam: 28 }), el('p', {}, 'Ningún archivo con estos filtros.')) : null].filter(Boolean));
  }
  pintar();

  raiz.append(
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, icono('carpeta'), ' Almacenamiento'),
      el('div', { class: 'listado-acciones' },
        el('span', { class: 'texto-suave texto-chico' }, `Leído ${cache.cargado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`),
        boton('Actualizar', { icono: 'reloj', onclick: async () => { cache = null; raiz.replaceWith(await vista(ctx)); } }))),
    el('p', { class: 'texto-suave' }, 'Archivos guardados en Cloudflare R2 (fotos, videos y documentos de todas las empresas). '
      + 'Solo se eliminan los que nadie usa o los de galerías y adjuntos; los demás se borran desde su módulo.'),
    tarjetas, resumen, filtros, barra, tabla);
  return raiz;
}
