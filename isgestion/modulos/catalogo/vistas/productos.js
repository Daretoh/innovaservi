// Catálogo de equipamiento: productos en tarjetas con foto, agrupados por categoría y sección (como el catálogo
// de Canva), con filtros, ficha para crear y editar, PDF del catálogo y Excel.
// Ruta: #/catalogo.productos
import { el } from '../../../core/ui/dom.js?v=11ce3f7';
import { icono } from '../../../core/ui/iconos.js?v=11ce3f7';
import { boton } from '../../../core/ui/tabla.js?v=11ce3f7';
import { abrirFormulario } from '../../../core/ui/modal.js?v=11ce3f7';
import { avisar } from '../../../core/ui/aviso.js?v=11ce3f7';
import { dinero } from '../../../core/ui/formato.js?v=11ce3f7';
import { cargarCatalogo, urlsFotos, subirFoto, agrupar, cargarEstilos } from '../datos.js?v=11ce3f7';

const filtro = { categoria: '', marca: '', texto: '', inactivos: false };   // se mantiene al refrescar

export default async function vista(ctx) {
  cargarEstilos();
  const datos = await cargarCatalogo(ctx);
  const urls = await urlsFotos(ctx, [...datos.productos.map((p) => p.foto_ruta), ...datos.marcas.map((m) => m.logo_ruta)]);
  const puedeEditar = ctx.puede('catalogo', 'editar');
  if (filtro.categoria && !datos.categoriaDe.has(filtro.categoria)) filtro.categoria = '';

  const cuerpo = el('div', { class: 'cat-cuerpo' });
  const contador = el('span', { class: 'texto-suave' });

  function visibles() {
    const q = filtro.texto.trim().toLowerCase();
    return datos.productos.filter((p) => (filtro.inactivos || p.activo)
      && (!filtro.categoria || p.categoria_id === filtro.categoria)
      && (!filtro.marca || p.marca_id === filtro.marca)
      && (!q || [p.nombre, p.seccion, p.descripcion, p.material, p.procedencia, datos.marcaDe.get(p.marca_id)?.nombre]
        .filter(Boolean).join(' ').toLowerCase().includes(q)));
  }

  function pintar() {
    const lista = visibles();
    contador.textContent = `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;
    const grupos = agrupar(datos, lista);
    if (!grupos.length) {
      cuerpo.replaceChildren(el('div', { class: 'cat-vacio' }, icono('etiqueta', { tam: 28 }),
        el('p', {}, datos.productos.length ? 'No hay productos con ese filtro.' : 'Aún no hay productos en el catálogo.'),
        !datos.categorias.length && ctx.puede('catalogo', 'crear') ? el('a', { href: ctx.ruta('catalogo.ajustes') }, 'Crea primero las categorías') : null));
      return;
    }
    cuerpo.replaceChildren(...grupos.map((g) => el('section', { class: 'cat-categoria' },
      el('h2', { class: 'cat-titulo' }, g.categoria.nombre, el('span', { class: 'texto-suave texto-chico' }, ` · ${g.total}`)),
      g.categoria.descripcion ? el('p', { class: 'texto-suave' }, g.categoria.descripcion) : null,
      ...g.secciones.map((s) => el('div', { class: 'cat-seccion' },
        s.nombre ? el('h3', { class: 'cat-subtitulo' }, s.nombre) : null,
        el('div', { class: 'cat-grilla' }, s.productos.map((p) => tarjeta(ctx, datos, urls, p, puedeEditar))))))));
  }

  // ---- Filtros
  const segmento = el('div', { class: 'segmento cat-segmento', role: 'group', 'aria-label': 'Categoría' },
    [['', 'Todas'], ...datos.categorias.map((c) => [c.id, c.nombre])].map(([v, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(filtro.categoria === v) }, t);
      b.addEventListener('click', () => {
        filtro.categoria = v;
        for (const x of segmento.children) x.setAttribute('aria-pressed', String(x === b));
        pintar();
      });
      return b;
    }));
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar producto, marca o material…', 'aria-label': 'Buscar', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; pintar(); });
  const marca = el('select', { class: 'campo campo-filtro', 'aria-label': 'Marca' },
    el('option', { value: '' }, 'Todas las marcas'),
    datos.marcas.map((m) => el('option', { value: m.id, selected: filtro.marca === m.id }, m.nombre)));
  marca.addEventListener('change', () => { filtro.marca = marca.value; pintar(); });
  const inactivos = datos.productos.some((p) => !p.activo)
    ? el('label', { class: 'casilla' }, Object.assign(el('input', { type: 'checkbox' }), { checked: filtro.inactivos,
      onchange: (ev) => { filtro.inactivos = ev.target.checked; pintar(); } }), 'Ver inactivos')
    : null;

  // ---- Acciones
  const acciones = [];
  if (ctx.puede('catalogo', 'exportar')) {
    acciones.push(boton('Excel', { icono: 'descargar', onclick: (ev) => conCarga(ev, () => excel(ctx, datos)) }));
    acciones.push(boton('PDF del catálogo', { icono: 'documento', onclick: () => elegirPdf(ctx, datos) }));
  }
  if (ctx.puede('catalogo', 'crear') && datos.categorias.length) {
    acciones.push(boton('Nuevo producto', { icono: 'mas', tipo: 'primario', onclick: () => editar(ctx, datos, null) }));
  }

  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Catálogo de equipamiento'),
      el('div', { class: 'listado-acciones' }, acciones)),
    datos.categorias.length > 1 ? segmento : null,
    el('div', { class: 'listado-acciones cat-filtros' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), marca, inactivos, contador),
    cuerpo);
}

async function conCarga(ev, fn) {
  const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
  try { await fn(); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
}

function tarjeta(ctx, datos, urls, p, puedeEditar) {
  const m = datos.marcaDe.get(p.marca_id);
  const url = urls.get(p.foto_ruta);
  const logo = m?.logo_ruta ? urls.get(m.logo_ruta) : null;
  const abrir = puedeEditar ? () => editar(ctx, datos, p) : null;
  return el('article', { class: `cat-tarjeta ${p.activo ? '' : 'inactiva'} ${abrir ? 'cat-editable' : ''}`,
    tabindex: abrir ? 0 : null, role: abrir ? 'button' : null, 'aria-label': abrir ? `Editar ${p.nombre}` : null,
    onclick: abrir, onkeydown: abrir ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } } : null },
    el('div', { class: 'cat-foto' }, url ? el('img', { src: url, alt: p.nombre, loading: 'lazy' }) : icono('camara', { tam: 32 })),
    el('div', { class: 'cat-info' },
      el('strong', { class: 'cat-nombre' }, p.nombre),
      p.descripcion ? el('span', { class: 'cat-desc' }, p.descripcion) : null,
      el('span', { class: 'cat-ficha' },
        p.material ? el('span', {}, el('b', {}, 'Material: '), p.material) : null,
        p.procedencia ? el('span', {}, el('b', {}, 'Procedencia: '), p.procedencia) : null),
      el('div', { class: 'cat-pie' },
        logo ? el('img', { class: 'cat-logo', src: logo, alt: m.nombre }) : m ? el('span', { class: 'chip' }, m.nombre) : null,
        p.precio != null ? el('span', { class: 'cat-precio', title: p.precio_en_pdf ? 'Sale en el PDF' : 'Precio de referencia (no sale en el PDF)' }, dinero(p.precio)) : null,
        p.activo ? null : el('span', { class: 'chip chip-na' }, 'Inactivo'))));
}

// ---- Crear o editar un producto
function editar(ctx, datos, p) {
  const unicos = (k) => [...new Set(datos.productos.map((x) => x[k]).filter(Boolean))].sort();
  const sino = [['si', 'Sí'], ['no', 'No']];
  const campos = [
    { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: p?.nombre ?? '' },
    { id: 'categoria_id', etiqueta: 'Categoría', opciones: datos.categorias.map((c) => [c.id, c.nombre]), valor: p?.categoria_id ?? (filtro.categoria || datos.categorias[0]?.id) },
    { id: 'seccion', etiqueta: 'Sección', valor: p?.seccion ?? '', sugerencias: unicos('seccion'), ayuda: 'Grupo dentro de la categoría (ej.: Tapas Plus, Enganches).' },
    { id: 'marca_id', etiqueta: 'Marca', opciones: [['', 'Sin marca'], ...datos.marcas.map((m) => [m.id, m.nombre])], valor: p?.marca_id ?? '' },
    { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', filas: 2, valor: p?.descripcion ?? '' },
    { id: 'material', etiqueta: 'Material', valor: p?.material ?? '', sugerencias: unicos('material') },
    { id: 'procedencia', etiqueta: 'Procedencia', valor: p?.procedencia ?? '', sugerencias: unicos('procedencia') },
    { id: 'precio', etiqueta: 'Precio neto de referencia', tipo: 'number', valor: p?.precio ?? '', ayuda: 'Opcional. Se sugiere al escribir el producto en una cotización.' },
    { id: 'precio_en_pdf', etiqueta: 'Mostrar el precio en el PDF', opciones: sino, valor: p?.precio_en_pdf ? 'si' : 'no' },
    { id: 'activo', etiqueta: 'Activo (sale en el PDF y al cotizar)', opciones: sino, valor: p && !p.activo ? 'no' : 'si' },
    { id: 'orden', etiqueta: 'Orden en la categoría', tipo: 'number', valor: p?.orden ?? '' },
    { id: 'foto', etiqueta: p?.foto_ruta ? 'Cambiar foto' : 'Foto', tipo: 'file', accept: 'image/*', multiple: false },
    { id: 'notas', etiqueta: 'Notas internas (no salen en el PDF)', tipo: 'textarea', filas: 2, valor: p?.notas ?? '' },
  ];
  abrirFormulario({
    titulo: p ? 'Editar producto' : 'Nuevo producto',
    campos,
    alGuardar: async (v) => {
      const fila = {
        nombre: v.nombre.trim(), categoria_id: v.categoria_id, seccion: v.seccion.trim() || null, marca_id: v.marca_id || null,
        descripcion: v.descripcion.trim() || null, material: v.material.trim() || null, procedencia: v.procedencia.trim() || null,
        precio: v.precio === '' ? null : Math.max(0, Math.round(Number(v.precio) || 0)), precio_en_pdf: v.precio_en_pdf === 'si',
        activo: v.activo === 'si', orden: v.orden === '' ? 0 : Math.round(Number(v.orden) || 0), notas: v.notas.trim() || null,
      };
      let id = p?.id;
      if (id) {
        const { error } = await ctx.api.from('cat_productos').update(fila).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await ctx.api.from('cat_productos').insert({ ...fila, empresa_id: ctx.empresa.id }).select('id').single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      if (v.foto?.size) {
        const ruta = await subirFoto(ctx, v.foto, 'cat_productos', id);
        const { error } = await ctx.api.from('cat_productos').update({ foto_ruta: ruta }).eq('id', id);
        if (error) throw new Error(error.message);
      }
      avisar(p ? 'Producto guardado.' : 'Producto creado.');
      ctx.refrescar();
    },
  });
  // Eliminar, dentro del mismo formulario (solo con permiso)
  if (p && ctx.puede('catalogo', 'eliminar')) {
    const dialogo = [...document.querySelectorAll('dialog.modal')].pop();
    dialogo?.querySelector('.modal-pie')?.prepend(boton('Eliminar', { icono: 'basura', class: 'boton boton-secundario cat-eliminar', onclick: () => abrirFormulario({
      titulo: 'Eliminar producto', mensaje: `"${p.nombre}" deja de verse en el catálogo, en el PDF y al cotizar.`, campos: [], textoGuardar: 'Eliminar',
      alGuardar: async () => {
        const { error } = await ctx.api.from('cat_productos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
        if (error) throw new Error(error.message);
        dialogo.close(); dialogo.remove();
        avisar('Producto eliminado.');
        ctx.refrescar();
      },
    }) }));
  }
}

// ---- PDF: elegir categorías y si van los precios
function elegirPdf(ctx, datos) {
  const conPrecio = datos.productos.some((p) => p.precio != null && p.precio_en_pdf);
  abrirFormulario({
    titulo: 'PDF del catálogo',
    mensaje: 'Sale con el logo y el color de la empresa. Solo productos activos.',
    campos: [
      { id: 'categorias', etiqueta: 'Categorías', tipo: 'checks', opciones: datos.categorias.map((c) => [c.id, c.nombre]), valor: datos.categorias.map((c) => c.id) },
      ...(conPrecio ? [{ id: 'precios', etiqueta: 'Precios', opciones: [['si', 'Mostrar los marcados "en el PDF"'], ['no', 'Sin precios']], valor: 'si' }] : []),
      { id: 'marcas', etiqueta: 'Página de marcas', opciones: [['si', 'Incluir'], ['no', 'No incluir']], valor: 'si' },
    ],
    textoGuardar: 'Descargar PDF',
    alGuardar: async (v) => {
      if (!v.categorias.length) throw new Error('Elige al menos una categoría.');
      const { pdfCatalogo } = await import('../pdf.js?v=11ce3f7');
      await pdfCatalogo(ctx, datos, { categorias: v.categorias, precios: v.precios === 'si', marcas: v.marcas === 'si' });
      avisar('PDF descargado.');
    },
  });
}

async function excel(ctx, datos) {
  const { exportarExcel } = await import('../../../core/excel.js?v=11ce3f7');
  const filas = agrupar(datos, datos.productos).flatMap((g) => g.secciones.flatMap((s) => s.productos.map((p) => [
    g.categoria.nombre, s.nombre, p.nombre, datos.marcaDe.get(p.marca_id)?.nombre ?? '', p.descripcion ?? '', p.material ?? '', p.procedencia ?? '',
    p.precio, p.activo ? 'Sí' : 'No'])));
  await exportarExcel(ctx, {
    titulo: 'Catálogo de equipamiento', nombre: 'catalogo-equipamiento',
    columnas: ['Categoría', 'Sección', 'Producto', 'Marca', 'Descripción', 'Material', 'Procedencia', { t: 'Precio neto', tipo: 'dinero' }, 'Activo'],
    filas,
  });
  avisar('Excel descargado.');
}
