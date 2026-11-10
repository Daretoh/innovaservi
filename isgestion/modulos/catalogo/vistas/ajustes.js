// Categorías y marcas del catálogo: nombre, orden y frase de la categoría; nombre, presentación y logo de la marca.
// Ruta: #/catalogo.ajustes
import { el } from '../../../core/ui/dom.js?v=96d87cf';
import { icono } from '../../../core/ui/iconos.js?v=96d87cf';
import { boton } from '../../../core/ui/tabla.js?v=96d87cf';
import { abrirFormulario } from '../../../core/ui/modal.js?v=96d87cf';
import { avisar } from '../../../core/ui/aviso.js?v=96d87cf';
import { cargarCatalogo, urlsFotos, subirFoto, cargarEstilos } from '../datos.js?v=96d87cf';

export default async function vista(ctx) {
  cargarEstilos();
  const datos = await cargarCatalogo(ctx);
  const urls = await urlsFotos(ctx, datos.marcas.map((m) => m.logo_ruta));
  const cuantos = (campo, id) => datos.productos.filter((p) => p[campo] === id).length;

  const fila = (tabla, x, extra, enUso) => el('li', { class: 'cat-ajuste' },
    extra,
    el('div', { class: 'cat-ajuste-texto' },
      el('strong', {}, x.nombre),
      x.descripcion ? el('span', { class: 'texto-suave texto-chico cat-recorte' }, x.descripcion) : null),
    el('span', { class: 'texto-suave texto-chico' }, `${enUso} ${enUso === 1 ? 'producto' : 'productos'}`),
    ctx.puede('catalogo', 'editar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${x.nombre}`, onclick: () => editar(ctx, tabla, x) }, icono('editar', { tam: 16 })) : null,
    ctx.puede('catalogo', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${x.nombre}`, onclick: () => eliminar(ctx, tabla, x, enUso) }, icono('basura', { tam: 16 })) : null);

  const bloque = (titulo, tabla, lista, campo, extra) => el('section', { class: 'tarjeta cat-bloque' },
    el('header', { class: 'listado-cabecera' }, el('h2', {}, titulo),
      ctx.puede('catalogo', 'crear') ? boton(tabla === 'cat_categorias' ? 'Nueva categoría' : 'Nueva marca', { icono: 'mas', onclick: () => editar(ctx, tabla, null) }) : null),
    lista.length ? el('ul', { class: 'cat-ajustes' }, lista.map((x) => fila(tabla, x, extra?.(x), cuantos(campo, x.id))))
      : el('p', { class: 'texto-suave' }, 'Aún no hay ninguna.'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Categorías y marcas')),
    el('p', { class: 'texto-suave' }, 'Las categorías ordenan el catálogo y su PDF (una página o más por categoría). La presentación de cada marca sale en la página de marcas del PDF.'),
    el('div', { class: 'cat-ajustes-cols' },
      bloque('Categorías', 'cat_categorias', datos.categorias, 'categoria_id'),
      bloque('Marcas', 'cat_marcas', datos.marcas, 'marca_id', (m) => el('span', { class: 'cat-logo-caja' },
        urls.get(m.logo_ruta) ? el('img', { src: urls.get(m.logo_ruta), alt: '' }) : icono('etiqueta', { tam: 18 })))));
}

function editar(ctx, tabla, x) {
  const esMarca = tabla === 'cat_marcas';
  abrirFormulario({
    titulo: `${x ? 'Editar' : 'Nueva'} ${esMarca ? 'marca' : 'categoría'}`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: x?.nombre ?? '' },
      { id: 'descripcion', etiqueta: esMarca ? 'Presentación de la marca (sale en el PDF)' : 'Frase bajo el título (opcional)', tipo: 'textarea', filas: esMarca ? 5 : 2, valor: x?.descripcion ?? '' },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: x?.orden ?? '' },
      ...(esMarca ? [{ id: 'logo', etiqueta: x?.logo_ruta ? 'Cambiar logo' : 'Logo', tipo: 'file', accept: 'image/*', multiple: false }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), descripcion: v.descripcion.trim() || null, orden: v.orden === '' ? 0 : Math.round(Number(v.orden) || 0) };
      let id = x?.id;
      if (id) {
        const { error } = await ctx.api.from(tabla).update(datos).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await ctx.api.from(tabla).insert({ ...datos, empresa_id: ctx.empresa.id }).select('id').single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      if (esMarca && v.logo?.size) {
        const ruta = await subirFoto(ctx, v.logo, tabla, id);
        const { error } = await ctx.api.from(tabla).update({ logo_ruta: ruta }).eq('id', id);
        if (error) throw new Error(error.message);
      }
      avisar('Guardado.');
      ctx.refrescar();
    },
  });
}

function eliminar(ctx, tabla, x, enUso) {
  if (tabla === 'cat_categorias' && enUso) { avisar('La categoría tiene productos: muévelos o elimínalos primero.', 'error'); return; }
  abrirFormulario({
    titulo: 'Eliminar', mensaje: `Se elimina "${x.nombre}".${enUso ? ` ${enUso} productos quedan sin marca.` : ''}`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      if (tabla === 'cat_marcas' && enUso) {
        const { error } = await ctx.api.from('cat_productos').update({ marca_id: null }).eq('marca_id', x.id);
        if (error) throw new Error(error.message);
      }
      const { error } = await ctx.api.from(tabla).update({ deleted_at: new Date().toISOString() }).eq('id', x.id);
      if (error) throw new Error(error.message);
      avisar('Eliminado.');
      ctx.refrescar();
    },
  });
}
