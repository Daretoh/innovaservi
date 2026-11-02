// Datos compartidos del Catálogo de equipamiento: categorías, marcas y productos de la empresa activa,
// fotos con URL firmada y la hoja de estilos del módulo.
import { el } from '../../core/ui/dom.js?v=53d5117';
import { urlsFirmadas, subirArchivo } from '../../core/adjuntos.js?v=53d5117';
import { comprimirFoto, esImagen } from '../../core/imagenes.js?v=53d5117';

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
  document.head.append(el('link', { id: 'catalogo-css', rel: 'stylesheet', href: new URL('./catalogo.css?v=53d5117', import.meta.url).href }));
}
