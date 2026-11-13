// Datos compartidos del Catálogo de equipamiento: categorías, marcas y productos de la empresa activa,
// fotos con URL firmada y la hoja de estilos del módulo.
import { el } from '../../core/ui/dom.js?v=60a60f0';
import { icono } from '../../core/ui/iconos.js?v=60a60f0';
import { urlsFirmadas, subirArchivo } from '../../core/adjuntos.js?v=60a60f0';
import { comprimirFoto, esImagen } from '../../core/imagenes.js?v=60a60f0';

export async function cargarCatalogo(ctx, { conEliminados = false } = {}) {
  const sinEliminar = (q) => (conEliminados ? q : q.is('deleted_at', null));
  const [cats, marcas, prods] = await Promise.all([
    sinEliminar(ctx.api.from('cat_categorias').select('*').eq('empresa_id', ctx.empresa.id)).order('orden').order('nombre'),
    sinEliminar(ctx.api.from('cat_marcas').select('*').eq('empresa_id', ctx.empresa.id)).order('orden').order('nombre'),
    sinEliminar(ctx.api.from('cat_productos').select('*').eq('empresa_id', ctx.empresa.id)).order('orden').order('nombre'),
  ]);
  for (const r of [cats, marcas, prods]) if (r.error) throw new Error(r.error.message);
  return {
    categorias: cats.data, marcas: marcas.data, productos: prods.data,
    marcaDe: new Map(marcas.data.map((m) => [m.id, m])),
    categoriaDe: new Map(cats.data.map((c) => [c.id, c])),
  };
}

// URL firmadas de las fotos (Map ruta → url); sin permiso o sin archivo quedan fuera
export async function urlsFotos(ctx, rutas) {
  try { return await urlsFirmadas(ctx.api, [...new Set(rutas.filter(Boolean))], 3600); } catch { return new Map(); }
}

// Sube una foto (comprimida) a la carpeta del catálogo y devuelve su ruta
export async function subirFoto(ctx, archivo, tabla, registroId) {
  if (!esImagen(archivo)) throw new Error('Elige una imagen (JPG, PNG o WEBP).');
  const foto = archivo.type === 'image/png' ? archivo : await comprimirFoto(archivo, 1200);
  const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'catalogo', archivo: foto, tabla, registroId });
  return ruta;
}

// Productos agrupados por categoría y sección, en el orden del catálogo
export function agrupar(datos, productos) {
  return datos.categorias.map((c) => {
    const suyos = productos.filter((p) => p.categoria_id === c.id);
    const secciones = [];
    for (const p of suyos) {
      const nombre = p.seccion || '';
      let s = secciones.find((x) => x.nombre === nombre);
      if (!s) secciones.push((s = { nombre, productos: [] }));
      s.productos.push(p);
    }
    return { categoria: c, secciones, total: suyos.length };
  }).filter((g) => g.total);
}

export function cargarEstilos() {
  if (document.getElementById('catalogo-css')) return;
  document.head.append(el('link', { id: 'catalogo-css', rel: 'stylesheet', href: new URL('./catalogo.css?v=60a60f0', import.meta.url).href }));
}

// ---- Fase 1 del catálogo web (002): versiones por camioneta, galería y costos

export const MARCAS_VEHICULO = ['Chevrolet', 'Ford', 'Great Wall', 'JAC', 'Jeep', 'Kia', 'Maxus', 'Mazda', 'Mitsubishi', 'Nissan', 'Peugeot', 'Ram', 'Renault', 'SsangYong', 'Subaru', 'Suzuki', 'Toyota', 'Volkswagen'];
export const CABINAS = ['Cabina doble', 'Cabina simple', 'Cabina extendida'];

// "2021 en adelante", "2019–2023", "2025"
export function anios(v) {
  if (v.anio_desde && v.anio_hasta) return v.anio_desde === v.anio_hasta ? String(v.anio_desde) : `${v.anio_desde}–${v.anio_hasta}`;
  if (v.anio_desde) return `${v.anio_desde} en adelante`;
  if (v.anio_hasta) return `hasta ${v.anio_hasta}`;
  return '';
}
export const nombreVersion = (v) => [v.vehiculo_marca, v.vehiculo_modelo, v.cabina, anios(v)].filter(Boolean).join(' ');

// Un producto con su galería, versiones y (con permiso aprobar) costos
export async function cargarProducto(ctx, id) {
  const conCostos = ctx.puede('catalogo', 'aprobar');
  const [p, fotos, versiones, costos] = await Promise.all([
    ctx.api.from('cat_productos').select('*').eq('id', id).eq('empresa_id', ctx.empresa.id).maybeSingle(),
    ctx.api.from('cat_fotos').select('*').eq('producto_id', id).is('deleted_at', null).order('orden').order('created_at'),
    ctx.api.from('cat_versiones').select('*').eq('producto_id', id).is('deleted_at', null).order('vehiculo_marca').order('vehiculo_modelo').order('anio_desde'),
    conCostos ? ctx.api.from('cat_costos').select('*').eq('producto_id', id) : Promise.resolve({ data: [] }),
  ]);
  for (const r of [p, fotos, versiones, costos]) if (r.error) throw new Error(r.error.message);
  if (!p.data || p.data.deleted_at) return null;
  const costoDe = new Map((costos.data ?? []).map((c) => [c.version_id ?? 'base', c]));
  return { producto: p.data, fotos: fotos.data, versiones: versiones.data, costoDe, conCostos };
}

// Guarda (o borra, con monto vacío) el costo del producto o de una versión
export async function guardarCosto(ctx, productoId, versionId, costo, proveedor = null) {
  let q = ctx.api.from('cat_costos').select('id').eq('producto_id', productoId);
  q = versionId ? q.eq('version_id', versionId) : q.is('version_id', null);
  const { data: actual } = await q.maybeSingle();
  if (costo == null || costo === '') {
    if (actual) { const { error } = await ctx.api.from('cat_costos').delete().eq('id', actual.id); if (error) throw new Error(error.message); }
    return;
  }
  const fila = { costo: Math.max(0, Math.round(Number(costo) || 0)), proveedor: proveedor || null };
  const { error } = actual
    ? await ctx.api.from('cat_costos').update(fila).eq('id', actual.id)
    : await ctx.api.from('cat_costos').insert({ ...fila, empresa_id: ctx.empresa.id, producto_id: productoId, version_id: versionId });
  if (error) throw new Error(error.message);
}

// Margen sobre el precio neto: "$ 120.000 (24 %)"
export function margen(precio, costo) {
  if (precio == null || costo == null) return null;
  const m = Number(precio) - Number(costo);
  return { monto: m, pct: Number(precio) ? Math.round((m / Number(precio)) * 100) : null };
}

// Llama a la función del servidor que lee otra página o copia sus fotos
export async function traerDesdeEnlace(ctx, cuerpo) {
  const { data, error } = await ctx.api.functions.invoke('catalogo-traer', { body: { empresa_id: ctx.empresa.id, ...cuerpo } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context?.json())?.error ?? msg; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Carrusel a pantalla completa (vista previa de cómo se verá en la web): flechas, miniaturas, teclado y deslizar
export function abrirCarrusel(fotos, inicio = 0) {
  if (!fotos.length) return;
  let i = inicio;
  const img = el('img', { class: 'car-img', alt: '' });
  const contador = el('span', { class: 'car-contador' });
  const minis = el('div', { class: 'car-minis' }, fotos.map((f, k) => el('button', { type: 'button', class: 'car-mini', 'aria-label': `Foto ${k + 1}`, onclick: () => ir(k) }, el('img', { src: f.url, alt: '' }))));
  const ir = (k) => {
    i = (k + fotos.length) % fotos.length;
    img.src = fotos[i].url; contador.textContent = `${i + 1} / ${fotos.length}`;
    [...minis.children].forEach((b, n) => b.classList.toggle('activa', n === i));
    minis.children[i]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  const cerrar = () => { document.removeEventListener('keydown', teclas); caja.close(); caja.remove(); };
  const teclas = (ev) => { if (ev.key === 'ArrowLeft') ir(i - 1); if (ev.key === 'ArrowRight') ir(i + 1); };
  const flecha = (d, ic, t) => el('button', { type: 'button', class: `car-flecha car-${d}`, 'aria-label': t, onclick: () => ir(i + (d === 'izq' ? -1 : 1)) }, icono(ic, { tam: 26 }));
  const escena = el('div', { class: 'car-escena' }, img, fotos.length > 1 ? flecha('izq', 'volver', 'Anterior') : null, fotos.length > 1 ? flecha('der', 'derecha', 'Siguiente') : null);
  let x0 = null;
  escena.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  escena.addEventListener('touchend', (ev) => { if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) ir(i + (dx < 0 ? 1 : -1)); x0 = null; });
  const caja = el('dialog', { class: 'car-dialogo', 'aria-label': 'Fotos' },
    el('div', { class: 'car-barra' }, contador, el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    escena, fotos.length > 1 ? minis : null);
  caja.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  caja.addEventListener('click', (ev) => { if (ev.target === caja) cerrar(); });
  document.addEventListener('keydown', teclas);
  document.body.append(caja); caja.showModal(); ir(i);
}
