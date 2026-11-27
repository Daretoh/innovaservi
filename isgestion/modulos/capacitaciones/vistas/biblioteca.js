// Capacitaciones → Biblioteca: contenidos en tarjetas por área (destacados arriba), con filtro por área y tipo y búsqueda.
// Cada tarjeta abre su ficha (vistas/contenido.js). Quien tiene una ficha de trabajador ve qué ya vio o aprobó.
// Ruta: #/capacitaciones.biblioteca
import { el } from '../../../core/ui/dom.js?v=625a797';
import { icono } from '../../../core/ui/iconos.js?v=625a797';
import { boton } from '../../../core/ui/tabla.js?v=625a797';
import { abrirFormulario } from '../../../core/ui/modal.js?v=625a797';
import { avisar } from '../../../core/ui/aviso.js?v=625a797';
import { normalizar } from '../../../core/ui/combo.js?v=625a797';
import { cargarBiblioteca, miPersona, miAvance, urlsDe, red, subirContenido, cargarEstilos, TIPOS, TIPO_CORTO, ICONO_TIPO, duracion } from '../datos.js?v=625a797';

const filtro = { area: '', tipo: '', texto: '' };   // se mantiene al refrescar

export default async function vista(ctx) {
  cargarEstilos();
  const [datos, persona] = await Promise.all([cargarBiblioteca(ctx), miPersona(ctx)]);
  const [avance, urls] = await Promise.all([miAvance(ctx, persona), urlsDe(ctx, datos.contenidos.filter((c) => c.tipo === 'imagen').map((c) => c.archivo_ruta))]);
  if (filtro.area && filtro.area !== '-' && !datos.areaDe.has(filtro.area)) filtro.area = '';
  const cuerpo = el('div', { class: 'cap-cuerpo' });
  const contador = el('span', { class: 'texto-suave' });

  const visibles = () => {
    const q = normalizar(filtro.texto);
    return datos.contenidos.filter((c) => (!filtro.area || (filtro.area === '-' ? !c.area_id : c.area_id === filtro.area))
      && (!filtro.tipo || c.tipo === filtro.tipo)
      && (!q || q.split(/\s+/).every((w) => normalizar([c.titulo, c.descripcion, datos.areaDe.get(c.area_id)?.nombre, ...(c.etiquetas ?? [])].join(' ')).includes(w))));
  };

  function pintar() {
    const lista = visibles();
    contador.textContent = `${lista.length} ${lista.length === 1 ? 'contenido' : 'contenidos'}`;
    if (!lista.length) {
      cuerpo.replaceChildren(el('div', { class: 'cap-vacio' }, icono('birrete', { tam: 30 }),
        el('p', {}, datos.contenidos.length ? 'No hay contenidos con ese filtro.' : 'Aún no hay contenidos en la biblioteca.'),
        !datos.contenidos.length && ctx.puede('capacitaciones', 'crear') ? el('p', { class: 'texto-suave texto-chico' }, 'Sube un video, pega un enlace de YouTube, Instagram o TikTok, o escribe una guía.') : null));
      return;
    }
    const secciones = [];
    const destacados = lista.filter((c) => c.destacado);
    if (destacados.length && !filtro.area) secciones.push(['Destacados', destacados]);
    const grupos = [...datos.areas.map((a) => [a.nombre, lista.filter((c) => c.area_id === a.id && !(c.destacado && !filtro.area))]),
      ['Sin área', lista.filter((c) => !c.area_id && !(c.destacado && !filtro.area))]];
    secciones.push(...grupos.filter(([, l]) => l.length));
    cuerpo.replaceChildren(...secciones.map(([titulo, l]) => el('section', { class: 'cap-area' },
      el('h2', { class: 'cap-titulo' }, titulo, el('span', { class: 'texto-suave texto-chico' }, ` · ${l.length}`)),
      el('div', { class: 'cap-grilla' }, l.map((c) => tarjeta(ctx, datos, urls, avance, c))))));
  }

  const segmento = el('div', { class: 'segmento cap-segmento', role: 'group', 'aria-label': 'Área' },
    [['', 'Todas'], ...datos.areas.map((a) => [a.id, a.nombre]), ...(datos.contenidos.some((c) => !c.area_id) && datos.areas.length ? [['-', 'Sin área']] : [])].map(([v, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(filtro.area === v) }, t);
      b.addEventListener('click', () => { filtro.area = v; for (const x of segmento.children) x.setAttribute('aria-pressed', String(x === b)); pintar(); });
      return b;
    }));
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar por título, área o etiqueta…', 'aria-label': 'Buscar', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; pintar(); });
  const tipo = el('select', { class: 'campo campo-filtro', 'aria-label': 'Tipo' }, el('option', { value: '' }, 'Todos los tipos'),
    TIPOS.map(([v]) => el('option', { value: v, selected: filtro.tipo === v }, TIPO_CORTO[v])));
  tipo.addEventListener('change', () => { filtro.tipo = tipo.value; pintar(); });

  const acciones = [];
  if (ctx.puede('capacitaciones', 'crear')) {
    if (!datos.areas.length && ctx.puede('capacitaciones', 'editar')) acciones.push(el('a', { class: 'boton boton-secundario', href: ctx.ruta('capacitaciones.areas') }, icono('ajustes', { tam: 16 }), 'Crear áreas'));
    acciones.push(boton('Nuevo contenido', { icono: 'mas', tipo: 'primario', onclick: () => editarContenido(ctx, datos, null) }));
  }

  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Biblioteca de capacitaciones'), el('div', { class: 'listado-acciones' }, acciones)),
    datos.areas.length ? segmento : null,
    el('div', { class: 'listado-acciones cap-filtros' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), tipo, contador),
    cuerpo);
}

// Miniatura: imagen subida, portada de YouTube o el icono del tipo
function miniatura(c, urls) {
  if (c.tipo === 'imagen' && urls.get(c.archivo_ruta)) return el('img', { src: urls.get(c.archivo_ruta), alt: '', loading: 'lazy' });
  if (c.tipo === 'enlace') {
    const r = red(c.url);
    const id = r.nombre === 'YouTube' && r.src ? r.src.split('/').pop() : null;
    if (id) return el('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    return el('div', { class: 'cap-mini-icono' }, icono('enlace', { tam: 30 }));
  }
  return el('div', { class: 'cap-mini-icono' }, icono(ICONO_TIPO[c.tipo], { tam: 32 }));
}

function tarjeta(ctx, datos, urls, avance, c) {
  const a = avance.get(c.id);
  const abrir = () => { location.hash = ctx.ruta('capacitaciones.contenido', { id: c.id }); };
  return el('article', { class: `cap-tarjeta ${c.publicado ? '' : 'borrador'}`, tabindex: 0, role: 'button', 'aria-label': `Abrir ${c.titulo}`,
    onclick: abrir, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } } },
    el('div', { class: 'cap-mini' }, miniatura(c, urls),
      el('span', { class: 'cap-tipo' }, icono(ICONO_TIPO[c.tipo], { tam: 14 }), c.tipo === 'enlace' ? red(c.url).nombre : TIPO_CORTO[c.tipo])),
    el('div', { class: 'cap-info' },
      el('strong', { class: 'cap-nombre' }, c.titulo),
      c.descripcion ? el('span', { class: 'cap-desc' }, c.descripcion) : null,
      el('div', { class: 'chips-fila' },
        c.duracion_min ? el('span', { class: 'chip chip-na' }, icono('reloj', { tam: 12 }), duracion(c.duracion_min)) : null,
        c.publicado ? null : el('span', { class: 'chip chip-pend' }, 'Borrador'),
        a?.aprobado === true ? el('span', { class: 'chip chip-ok' }, 'Aprobado')
          : a?.aprobado === false ? el('span', { class: 'chip chip-venc' }, 'No aprobado')
            : a?.visto_at ? el('span', { class: 'chip chip-ok' }, icono('check', { tam: 12 }), 'Visto') : null,
        ...(c.etiquetas ?? []).slice(0, 3).map((t) => el('span', { class: 'chip chip-na' }, t)))));
}

// ---- Crear o editar un contenido (también lo usa la ficha)
export function editarContenido(ctx, datos, c) {
  const sino = [['si', 'Sí'], ['no', 'No']];
  const ayudaArchivo = c?.archivo_ruta ? `Actual: ${c.archivo_nombre ?? 'archivo'}. Elige otro solo si quieres cambiarlo.` : 'Video (hasta 200 MB; si pesa más se achica), PDF o imagen.';
  abrirFormulario({
    titulo: c ? 'Editar contenido' : 'Nuevo contenido',
    campos: [
      { id: 'titulo', etiqueta: 'Título', requerido: true, valor: c?.titulo ?? '' },
      { id: 'area_id', etiqueta: 'Área', opciones: [['', 'Sin área'], ...datos.areas.map((a) => [a.id, a.nombre])], valor: c?.area_id ?? (filtro.area && filtro.area !== '-' ? filtro.area : '') },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS, valor: c?.tipo ?? 'video', alCambiar: ({ valor }) => mostrarCampos(valor) },
      { id: 'url', etiqueta: 'Enlace', tipo: 'url', valor: c?.url ?? '', ayuda: 'Pega el enlace de YouTube, Instagram, TikTok u otra página (https://…).' },
      { id: 'archivo', etiqueta: 'Archivo (video, PDF o imagen)', tipo: 'file', accept: 'video/*,application/pdf,image/*', multiple: false, ayuda: ayudaArchivo },
      { id: 'texto', etiqueta: 'Guía o pasos (una línea por paso)', tipo: 'textarea', filas: 5, valor: c?.texto ?? '', ayuda: 'Obligatorio en una guía escrita; en los demás tipos son notas opcionales.' },
      { id: 'descripcion', etiqueta: 'Descripción corta', tipo: 'textarea', filas: 2, valor: c?.descripcion ?? '' },
      { id: 'duracion_min', etiqueta: 'Duración (minutos)', tipo: 'number', valor: c?.duracion_min ?? '' },
      { id: 'etiquetas', etiqueta: 'Etiquetas (separadas por coma)', valor: (c?.etiquetas ?? []).join(', '), ayuda: 'Ej.: pulidora rotativa, principiante.' },
      { id: 'publicado', etiqueta: 'Publicado (lo ve todo el equipo)', opciones: sino, valor: c && !c.publicado ? 'no' : 'si', ayuda: 'En borrador solo lo ve quien edita.' },
      { id: 'destacado', etiqueta: 'Destacado (sale arriba)', opciones: sino, valor: c?.destacado ? 'si' : 'no' },
      { id: 'orden', etiqueta: 'Orden en el área', tipo: 'number', valor: c?.orden ?? '' },
    ],
    alGuardar: async (v) => {
      const fila = {
        titulo: v.titulo.trim(), area_id: v.area_id || null, tipo: v.tipo, url: v.url.trim() || null, texto: v.texto.trim() || null,
        descripcion: v.descripcion.trim() || null, duracion_min: v.duracion_min === '' ? null : Math.max(0, Math.round(Number(v.duracion_min) || 0)),
        etiquetas: v.etiquetas.split(',').map((t) => t.trim()).filter(Boolean), publicado: v.publicado === 'si', destacado: v.destacado === 'si',
        orden: v.orden === '' ? 0 : Math.round(Number(v.orden) || 0),
      };
      if (fila.tipo === 'enlace' && !/^https:\/\//i.test(fila.url ?? '')) throw new Error('Pega un enlace que empiece con https://');
      if (fila.tipo === 'guia' && !fila.texto) throw new Error('Escribe los pasos de la guía.');
      const conArchivo = ['video', 'documento', 'imagen'].includes(fila.tipo);
      if (conArchivo && !v.archivo?.size && !(c?.archivo_ruta && c.tipo === fila.tipo)) throw new Error('Elige el archivo.');
      if (v.archivo?.size) Object.assign(fila, await subirContenido(ctx, v.archivo, conArchivo ? fila.tipo : (v.archivo.type.startsWith('video/') ? 'video' : v.archivo.type.startsWith('image/') ? 'imagen' : 'documento')));
      if (fila.tipo === 'enlace' && !v.archivo?.size && c?.archivo_ruta) Object.assign(fila, { archivo_ruta: null, archivo_nombre: null, archivo_mime: null, archivo_tamano: null });
      let id = c?.id;
      if (id) {
        const { error } = await ctx.api.from('cap_contenidos').update(fila).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await ctx.api.from('cap_contenidos').insert({ ...fila, empresa_id: ctx.empresa.id }).select('id').single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      avisar(c ? 'Contenido guardado.' : 'Contenido creado.');
      if (c) ctx.refrescar(); else location.hash = ctx.ruta('capacitaciones.contenido', { id });
    },
  });
  mostrarCampos(c?.tipo ?? 'video');
}

// Solo los campos del tipo elegido: enlace o archivo (la guía puede llevar un PDF de apoyo)
function mostrarCampos(tipo) {
  const dialogo = [...document.querySelectorAll('dialog.modal')].pop();
  const fila = (id) => dialogo?.querySelector(`#f-${id}`)?.closest('.form-fila');
  const url = fila('url'); const archivo = fila('archivo');
  if (url) url.hidden = tipo !== 'enlace';
  if (archivo) archivo.hidden = tipo === 'enlace';
  const etiqueta = archivo?.querySelector('label');
  if (etiqueta) etiqueta.textContent = { video: 'Video', documento: 'PDF o documento', imagen: 'Imagen', guia: 'PDF o imagen de apoyo (opcional)' }[tipo] ?? 'Archivo';
}
