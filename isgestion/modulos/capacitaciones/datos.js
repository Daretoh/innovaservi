// Datos comunes de Capacitaciones: biblioteca (áreas y contenidos), enlaces incrustables (YouTube, Instagram, TikTok),
// subida de archivos (videos hasta 200 MB por partes a R2, se achican si pesan más), nombres de trabajadores
// (cap_personas, sin RUT) y "Marcar como visto" (cuenta propia o los 4 últimos dígitos del RUT en la tablet).
import { el } from '../../core/ui/dom.js?v=503c912';
import { icono } from '../../core/ui/iconos.js?v=503c912';
import { boton } from '../../core/ui/tabla.js?v=503c912';
import { avisar } from '../../core/ui/aviso.js?v=503c912';
import { subirArchivo, urlsFirmadas, limiteVideo, megas } from '../../core/adjuntos.js?v=503c912';
import { comprimirFoto, esImagen } from '../../core/imagenes.js?v=503c912';
import { prepararVideo } from '../../core/video.js?v=503c912';
import { panelSubida } from '../../core/ui/subida.js?v=503c912';

export const TIPOS = [['video', 'Video'], ['enlace', 'Enlace (YouTube, Instagram, TikTok…)'], ['documento', 'PDF o documento'], ['imagen', 'Imagen'], ['guia', 'Guía escrita']];
export const TIPO_CORTO = { video: 'Video', enlace: 'Enlace', documento: 'PDF', imagen: 'Imagen', guia: 'Guía' };
export const ICONO_TIPO = { video: 'play', enlace: 'enlace', documento: 'documento', imagen: 'camara', guia: 'lista' };

export const nombreCompleto = (p) => (p ? [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') : '');
export const duracion = (min) => (min == null ? '' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

export async function cargarBiblioteca(ctx) {
  const [areas, cont] = await Promise.all([
    ctx.api.from('cap_areas').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('orden').order('nombre'),
    ctx.api.from('cap_contenidos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('orden').order('created_at', { ascending: false }),
  ]);
  for (const r of [areas, cont]) if (r.error) throw new Error(r.error.message);
  return { areas: areas.data, contenidos: cont.data, areaDe: new Map(areas.data.map((a) => [a.id, a])), contenidoDe: new Map(cont.data.map((c) => [c.id, c])) };
}

// Persona ligada a la cuenta en esta empresa (o null: la tablet, cuentas sin ficha)
export async function miPersona(ctx) {
  const { data } = await ctx.api.rpc('cap_mi_persona', { p_empresa: ctx.empresa.id });
  return data ?? null;
}

// Avance propio (Map contenido → fila)
export async function miAvance(ctx, persona) {
  if (!persona) return new Map();
  const { data } = await ctx.api.from('cap_avance').select('*').eq('empresa_id', ctx.empresa.id).eq('persona_id', persona);
  return new Map((data ?? []).map((a) => [a.contenido_id, a]));
}

// Trabajadores de la empresa (para quien edita o evalúa)
export async function cargarPersonas(ctx, { todas = false } = {}) {
  const { data, error } = await ctx.api.rpc('cap_personas', { p_empresa: ctx.empresa.id });
  if (error) throw new Error(error.message);
  const lista = data.filter((p) => todas || p.estado === 'activo')
    .map((p) => ({ id: p.persona_id, cargo: p.cargo, estado: p.estado, nombre: nombreCompleto(p) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const de = new Map(data.map((p) => [p.persona_id, { id: p.persona_id, cargo: p.cargo, estado: p.estado, nombre: nombreCompleto(p) }]));
  return { lista, de };
}

export async function urlsDe(ctx, rutas) {
  try { return await urlsFirmadas(ctx.api, [...new Set(rutas.filter(Boolean))], 3600); } catch { return new Map(); }
}

// ---- Enlaces: de qué red es y cómo incrustarlo (si se puede)
export function red(url) {
  let u; try { u = new URL(url); } catch { return { nombre: 'Enlace', src: null }; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be' || h.endsWith('youtube.com')) {
    const id = h === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
    return { nombre: 'YouTube', src: id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null, vertical: u.pathname.startsWith('/shorts/') };
  }
  if (h.endsWith('instagram.com')) {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
    return { nombre: 'Instagram', src: m ? `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed` : null, vertical: true };
  }
  if (h.endsWith('tiktok.com')) {
    const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
    return { nombre: 'TikTok', src: id ? `https://www.tiktok.com/embed/v2/${id}` : null, vertical: true };
  }
  if (h.endsWith('facebook.com') || h === 'fb.watch') return { nombre: 'Facebook', src: null };
  if (h.endsWith('vimeo.com')) {
    const id = u.pathname.match(/^\/(\d+)/)?.[1];
    return { nombre: 'Vimeo', src: id ? `https://player.vimeo.com/video/${id}` : null };
  }
  return { nombre: h, src: null };
}

// ---- Subir el archivo de un contenido: videos (con avance), imágenes comprimidas, PDF
export async function subirContenido(ctx, archivo, tipo) {
  if (tipo === 'video' && !archivo.type.startsWith('video/')) throw new Error('Elige un archivo de video.');
  if (tipo === 'imagen' && !esImagen(archivo)) throw new Error('Elige una imagen (JPG, PNG o WEBP).');
  if (tipo === 'documento' && archivo.type !== 'application/pdf' && !archivo.type.startsWith('image/')) throw new Error('Elige un PDF.');
  const panel = tipo === 'video' ? panelSubida() : null;
  try {
    let a = archivo;
    if (tipo === 'video') a = await prepararVideo(archivo, { maximo: limiteVideo(), alProgreso: (f, t) => panel.estado(t, f) });
    else if (tipo === 'imagen' && archivo.type !== 'image/png') a = await comprimirFoto(archivo, 1600);
    panel?.estado(`Subiendo ${a.name} (${megas(a.size)})`, 0);
    const { ruta } = await subirArchivo(ctx.api, {
      empresaId: ctx.empresa.id, modulo: 'capacitaciones', archivo: a, tabla: 'cap_contenidos',
      maxBytes: tipo === 'video' ? limiteVideo() : undefined, alProgreso: panel ? (s, t) => panel.estado(`Subiendo ${a.name} (${megas(t)})`, s / t) : null,
    });
    return { archivo_ruta: ruta, archivo_nombre: archivo.name, archivo_mime: a.type, archivo_tamano: a.size };
  } finally { panel?.cerrar(); }
}

// ---- "Marcar como visto"
// Con persona ligada a la cuenta se marca a sí mismo; si no (tablet), pide los 4 últimos dígitos del RUT.
export async function marcarVisto(ctx, contenido, { persona = null } = {}) {
  if (persona) {
    const { data, error } = await ctx.api.rpc('cap_marcar_visto', { p_empresa: ctx.empresa.id, p_contenido: contenido.id });
    if (error) throw new Error(error.message);
    return data;
  }
  const quien = await pedirRut(ctx, `Marcar "${contenido.titulo}" como visto`);
  if (!quien) return null;
  const { data, error } = await ctx.api.rpc('cap_marcar_visto', { p_empresa: ctx.empresa.id, p_contenido: contenido.id, p_persona: quien.id, p_clave: quien.clave });
  if (error) throw new Error(error.message);
  return data;
}

// Ventana con teclado: 4 últimos dígitos del RUT (sin dígito verificador) → elegir el nombre. Devuelve { id, nombre, clave } o null.
export function pedirRut(ctx, titulo = 'Identifícate') {
  return new Promise((resolver) => {
    let clave = '';
    const puntos = el('div', { class: 'cap-puntos', 'aria-live': 'polite' });
    const mensaje = el('p', { class: 'texto-error', role: 'alert' });
    const nombres = el('div', { class: 'cap-nombres' });
    const pintar = () => puntos.replaceChildren(...[0, 1, 2, 3].map((i) => el('span', { class: i < clave.length ? 'lleno' : '' })));
    const cerrar = (r) => { dialogo.close(); dialogo.remove(); resolver(r); };
    const buscar = async () => {
      mensaje.textContent = ''; nombres.replaceChildren();
      const { data, error } = await ctx.api.rpc('cap_buscar', { p_empresa: ctx.empresa.id, p_clave: clave });
      if (error) { mensaje.textContent = error.message; return; }
      if (!data.length) { mensaje.textContent = 'No hay un trabajador activo con esos números.'; clave = ''; pintar(); return; }
      const c = clave;
      if (data.length === 1) { nombres.append(el('p', { class: 'texto-suave' }, '¿Eres tú?')); }
      nombres.append(...data.map((p) => boton(p.nombre, { tipo: 'primario', class: 'boton boton-primario cap-quien', onclick: () => cerrar({ id: p.persona_id, nombre: p.nombre, clave: c }) })));
    };
    const tecla = (k) => {
      if (k === 'borrar') clave = clave.slice(0, -1);
      else if (k === 'limpiar') clave = '';
      else if (clave.length < 4) clave += k;
      pintar();
      nombres.replaceChildren(); mensaje.textContent = '';
      if (clave.length === 4) buscar();
    };
    const teclado = el('div', { class: 'cap-teclado' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'limpiar', '0', 'borrar'].map((k) => el('button', {
      type: 'button', class: 'cap-tecla', 'aria-label': k === 'borrar' ? 'Borrar' : k === 'limpiar' ? 'Limpiar' : k, onclick: () => tecla(k),
    }, k === 'borrar' ? icono('volver', { tam: 20 }) : k === 'limpiar' ? 'C' : k)));
    const dialogo = el('dialog', { class: 'modal', 'aria-label': titulo },
      el('header', { class: 'modal-cabecera' }, el('h2', {}, titulo),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, icono('cerrar'))),
      el('div', { class: 'modal-cuerpo cap-rut' },
        el('p', {}, 'Escribe los 4 últimos números de tu RUT (sin el dígito verificador)'), puntos, teclado, mensaje, nombres));
    dialogo.addEventListener('keydown', (ev) => {
      if (/^\d$/.test(ev.key)) tecla(ev.key);
      else if (ev.key === 'Backspace') tecla('borrar');
    });
    dialogo.addEventListener('cancel', () => resolver(null));
    pintar();
    document.body.append(dialogo);
    dialogo.showModal();
  });
}

export async function conCarga(ev, fn) {
  const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
  try { await fn(); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
}

export function cargarEstilos() {
  if (document.getElementById('capacitaciones-css')) return;
  document.head.append(el('link', { id: 'capacitaciones-css', rel: 'stylesheet', href: new URL('./capacitaciones.css?v=503c912', import.meta.url).href }));
}
