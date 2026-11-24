// Novedades de la plataforma (Núcleo 025): solo el equipo. Lista (borradores y publicadas) y editor: título, texto,
// pantalla (módulo y pestaña; vacío = general), empresas (ninguna marcada = todas), imagen (R2, <uuid>/novedades/<uuid>.jpg) y
// puntos de sugerencias que resuelve. Publicar los deja Hecha con respuesta y avisa a quien los envió.
// ?punto=<id> abre una nueva con ese punto ligado y su pantalla (desde Sugerencias → "Crear novedad").
import { el } from '../../core/ui/dom.js?v=9dd99fc';
import { icono } from '../../core/ui/iconos.js?v=9dd99fc';
import { avisar } from '../../core/ui/aviso.js?v=9dd99fc';
import { almacen, urlsFirmadas } from '../../core/adjuntos.js?v=9dd99fc';
import { comprimirFoto, esImagen } from '../../core/imagenes.js?v=9dd99fc';
import { cargarManifiestos } from '../../core/modulos.js?v=9dd99fc';
import { ESTADOS } from '../../core/sugerencias.js?v=9dd99fc';

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export default async function vista(ctx) {
  const [nov, emp, pts, manifiestos] = await Promise.all([
    ctx.api.from('nov_novedades').select('*, nov_menciones(punto_id)').order('created_at', { ascending: false }),
    ctx.api.from('empresas').select('id, razon_social, nombre_fantasia').order('razon_social'),
    ctx.api.from('sug_puntos').select('id, texto, estado, pantalla, pantalla_nombre, modulo, sug_sugerencias(numero, autor_nombre, empresa_nombre)').order('updated_at', { ascending: false, nullsFirst: false }).limit(300),
    cargarManifiestos(),
  ]);
  for (const r of [nov, emp, pts]) if (r.error) throw new Error(r.error.message);
  const pantallas = manifiestos.flatMap((m) => (m.menu ?? []).filter((it) => !it.oculto).map((it) => ({ id: it.id, modulo: m.id, nombre: `${m.nombre} › ${it.label}` })));
  const urls = await urlsFirmadas(ctx.api, nov.data.map((n) => n.imagen_ruta).filter(Boolean)).catch(() => new Map());
  const cont = el('div');

  function editor(n) {
    const nueva = !n.id;
    const titulo = el('input', { type: 'text', maxlength: 120, value: n.titulo ?? '', placeholder: 'Ej.: Ahora puedes rayar los pantallazos' });
    const texto = el('textarea', { rows: 6, maxlength: 4000, placeholder: 'Qué cambió y cómo se usa. Líneas con "- " salen como lista.' });
    texto.value = n.texto ?? '';
    const pantalla = el('select', {}, el('option', { value: '' }, 'General (no es de una pantalla)'),
      ...pantallas.map((p) => el('option', { value: p.id, selected: p.id === n.pantalla }, p.nombre)));
    const empresas = el('div', { class: 'nov-c-empresas' }, ...emp.data.map((e) => el('label', {},
      el('input', { type: 'checkbox', value: e.id, checked: (n.empresas ?? []).includes(e.id) }), e.nombre_fantasia || e.razon_social)));
    let imagen = n.imagen_ruta ?? null, archivoNuevo = null;
    const vistaImg = el('div', { class: 'nov-c-img' });
    const pintarImg = () => vistaImg.replaceChildren(
      archivoNuevo ? el('img', { src: URL.createObjectURL(archivoNuevo), alt: '' }) : imagen && urls.get(imagen) ? el('img', { src: urls.get(imagen), alt: '' }) : el('span', { class: 'texto-suave texto-chico' }, 'Sin imagen'),
      (archivoNuevo || imagen) ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => { archivoNuevo = null; imagen = null; pintarImg(); } }, 'Quitar') : null);
    const elegir = el('input', { type: 'file', accept: 'image/*' });
    elegir.addEventListener('change', async () => { const f = elegir.files[0]; if (f && esImagen(f)) { archivoNuevo = await comprimirFoto(f, 1600).catch(() => f); pintarImg(); } elegir.value = ''; });
    pintarImg();
    const ligados = new Set((n.nov_menciones ?? []).map((m) => m.punto_id));
    const buscar = el('input', { type: 'search', placeholder: 'Buscar sugerencia por N°, texto o autor' });
    const lista = el('div', { class: 'nov-c-puntos' });
    const pintarPuntos = () => {
      const q = buscar.value.trim().toLowerCase();
      const filas = pts.data.filter((p) => ligados.has(p.id) || !q || `${p.sug_sugerencias?.numero} ${p.texto} ${p.sug_sugerencias?.autor_nombre} ${p.pantalla_nombre}`.toLowerCase().includes(q)).slice(0, 40);
      lista.replaceChildren(...filas.map((p) => {
        const c = el('input', { type: 'checkbox', checked: ligados.has(p.id) });
        c.addEventListener('change', () => { if (c.checked) ligados.add(p.id); else ligados.delete(p.id); });
        return el('label', { class: 'nov-c-punto' }, c,
          el('span', {}, el('strong', {}, `N° ${p.sug_sugerencias?.numero ?? '?'}`), ` · ${p.sug_sugerencias?.autor_nombre ?? ''} · `,
            el('span', { class: `chip ${ESTADOS[p.estado][1]}` }, ESTADOS[p.estado][0]), ` ${p.pantalla_nombre ?? ''}`, el('br'), el('span', { class: 'texto-suave' }, p.texto.slice(0, 160))));
      }));
    };
    buscar.addEventListener('input', pintarPuntos);
    pintarPuntos();

    async function guardar(publicar) {
      if (!titulo.value.trim() || !texto.value.trim()) { avisar('Escribe el título y el texto.', 'error'); return; }
      const p = pantallas.find((x) => x.id === pantalla.value);
      try {
        if (archivoNuevo) {
          const ruta = `${crypto.randomUUID()}/novedades/${crypto.randomUUID()}.jpg`;   // forma que exige el Worker de R2
          const { error } = await almacen(ctx.api).upload(ruta, archivoNuevo, { contentType: 'image/jpeg', upsert: false });
          if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
          imagen = ruta;
        }
        const marcadas = [...empresas.querySelectorAll('input:checked')].map((c) => c.value);
        const fila = { titulo: titulo.value.trim(), texto: texto.value.trim(), pantalla: p?.id ?? null, modulo: p?.modulo ?? null, pantalla_nombre: p?.nombre ?? null,
          imagen_ruta: imagen, empresas: marcadas.length ? marcadas : null };
        const r = nueva ? await ctx.api.from('nov_novedades').insert(fila).select('id').single() : await ctx.api.from('nov_novedades').update(fila).eq('id', n.id).select('id').single();
        if (r.error) throw new Error(r.error.message);
        const id = r.data.id;
        const { error: e1 } = await ctx.api.from('nov_menciones').delete().eq('novedad_id', id);
        if (e1) throw new Error(e1.message);
        if (ligados.size) { const { error: e2 } = await ctx.api.from('nov_menciones').insert([...ligados].map((punto_id) => ({ novedad_id: id, punto_id }))); if (e2) throw new Error(e2.message); }
        if (publicar) { const { error: e3 } = await ctx.api.rpc('nov_publicar', { p_id: id }); if (e3) throw new Error(e3.message); }
        avisar(publicar ? `Publicada.${ligados.size ? ' Se avisó a quienes la sugirieron.' : ''}` : 'Guardada.');
        location.hash = '#/novedades';
        ctx.refrescar();
      } catch (e) { avisar(e.message, 'error'); }
    }

    return el('section', { class: 'tarjeta nov-c-editor' },
      el('h2', {}, nueva ? 'Nueva novedad' : n.estado === 'publicada' ? 'Editar novedad publicada' : 'Editar borrador'),
      el('label', { class: 'campo' }, el('span', {}, 'Título'), titulo),
      el('label', { class: 'campo' }, el('span', {}, 'Qué cambió'), texto),
      el('label', { class: 'campo' }, el('span', {}, 'Pantalla (la ven solo quienes tienen ese módulo)'), pantalla),
      el('div', { class: 'campo' }, el('span', {}, 'Empresas (ninguna marcada = todas)'), empresas),
      el('div', { class: 'campo' }, el('span', {}, 'Imagen (opcional)'), vistaImg, elegir),
      el('div', { class: 'campo' }, el('span', {}, 'Viene de las sugerencias (al publicar quedan Hecha y se avisa)'), buscar, lista),
      el('div', { class: 'nov-c-acciones' },
        el('a', { class: 'boton boton-secundario', href: '#/novedades' }, 'Cancelar'),
        n.estado !== 'publicada' ? el('button', { type: 'button', class: 'boton boton-secundario', onclick: () => guardar(false) }, 'Guardar borrador') : null,
        el('button', { type: 'button', class: 'boton boton-primario', onclick: () => guardar(true) }, n.estado === 'publicada' ? 'Guardar' : 'Publicar')));
  }

  // Abrir el editor: ?nueva=1, ?id=<novedad> o ?punto=<punto de sugerencia>
  if (ctx.params.nueva || ctx.params.id || ctx.params.punto) {
    let n = ctx.params.id ? nov.data.find((x) => x.id === ctx.params.id) ?? {} : {};
    if (ctx.params.punto) {
      const p = pts.data.find((x) => x.id === ctx.params.punto);
      n = { pantalla: p?.pantalla ?? null, nov_menciones: p ? [{ punto_id: p.id }] : [] };
    }
    cont.append(editor(n));
    return el('section', { class: 'vista' }, el('h1', {}, icono('brillo'), 'Novedades'), cont);
  }

  return el('section', { class: 'vista' },
    el('h1', {}, icono('brillo'), 'Novedades'),
    el('p', { class: 'texto-suave' }, 'Lo que ven los usuarios en Novedades (menú, debajo de Tareas) y en su Inicio. Publica cuando la versión ya está en innovaservi.cl.'),
    el('div', { class: 'nov-c-barra' }, el('a', { class: 'boton boton-primario', href: '#/novedades?nueva=1' }, icono('mas', { tam: 16 }), 'Nueva novedad')),
    nov.data.length ? el('div', { class: 'nov-c-lista' }, ...nov.data.map((n) => el('a', { class: 'tarjeta nov-c-fila', href: `#/novedades?id=${n.id}` },
      el('span', { class: `chip ${n.estado === 'publicada' ? 'chip-ok' : 'chip-na'}` }, n.estado === 'publicada' ? 'Publicada' : 'Borrador'),
      el('strong', {}, n.titulo),
      el('span', { class: 'texto-suave texto-chico' }, [n.pantalla_nombre || 'General', n.empresas ? `${n.empresas.length} empresa${n.empresas.length === 1 ? '' : 's'}` : 'Todas las empresas',
        (n.nov_menciones ?? []).length ? `${n.nov_menciones.length} sugerencia${n.nov_menciones.length === 1 ? '' : 's'}` : null, fecha(n.publicada_at || n.created_at)].filter(Boolean).join(' · ')))))
      : el('div', { class: 'estado-vacio' }, icono('brillo', { tam: 24 }), el('p', {}, 'Todavía no hay novedades.')));
}
