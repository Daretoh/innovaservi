// Ficha de un producto del catálogo: datos y ficha técnica, galería (fotos con origen y "publicar en la web", videos,
// carrusel de vista previa, traer fotos desde un enlace), versiones por camioneta con precio, costo y margen.
// Los costos y márgenes solo se ven con el permiso aprobar. Los datos se guardan al salir del campo.
// Ruta: #/catalogo.producto?id=<id>&p=<pestaña>
import { el } from '../../../core/ui/dom.js?v=dd03031';
import { icono } from '../../../core/ui/iconos.js?v=dd03031';
import { boton } from '../../../core/ui/tabla.js?v=dd03031';
import { abrirFormulario } from '../../../core/ui/modal.js?v=dd03031';
import { avisar } from '../../../core/ui/aviso.js?v=dd03031';
import { dinero } from '../../../core/ui/formato.js?v=dd03031';
import {
  cargarCatalogo, cargarProducto, urlsFotos, subirFoto, cargarEstilos, guardarCosto, margen, nombreVersion, anios,
  traerDesdeEnlace, abrirCarrusel, MARCAS_VEHICULO, CABINAS,
} from '../datos.js?v=dd03031';

let pestana = 'datos';   // se mantiene al refrescar

export default async function vista(ctx) {
  cargarEstilos();
  const volver = el('a', { class: 'volver', href: ctx.ruta('catalogo.productos') }, icono('volver', { tam: 16 }), 'Catálogo');
  const [cat, datos] = await Promise.all([cargarCatalogo(ctx), cargarProducto(ctx, ctx.params.id)]);
  if (!datos) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Producto no encontrado'));
  if (ctx.params.p) pestana = ctx.params.p;
  const { producto: p, fotos, versiones, costoDe, conCostos } = datos;
  const editable = ctx.puede('catalogo', 'editar');
  const urls = await urlsFotos(ctx, fotos.map((f) => f.ruta));

  const guardar = async (cambios, aviso = 'Guardado.') => {
    const { error } = await ctx.api.from('cat_productos').update(cambios).eq('id', p.id);
    if (error) { avisar(error.message, 'error'); return false; }
    Object.assign(p, cambios); if (aviso) avisar(aviso); return true;
  };

  // ---- Cabecera: foto, nombre, chips y "publicar en la web"
  const marca = cat.marcaDe.get(p.marca_id);
  const principal = urls.get(p.foto_ruta);
  const interruptor = (campo, texto, ayuda) => {
    const c = Object.assign(el('input', { type: 'checkbox', disabled: !editable }), { checked: !!p[campo] });
    c.addEventListener('change', async () => { if (!(await guardar({ [campo]: c.checked }))) c.checked = !c.checked; });
    return el('label', { class: 'casilla', title: ayuda }, c, texto);
  };
  const cabecera = el('header', { class: 'cat-ficha-cab' },
    el('button', { type: 'button', class: 'cat-ficha-foto', 'aria-label': 'Ver fotos', disabled: !fotos.length,
      onclick: () => abrirCarrusel(fotos.filter((f) => urls.has(f.ruta)).map((f) => ({ url: urls.get(f.ruta) })), Math.max(0, fotos.findIndex((f) => f.ruta === p.foto_ruta))) },
    principal ? el('img', { src: principal, alt: p.nombre }) : icono('camara', { tam: 32 })),
    el('div', { class: 'cat-ficha-titulo' },
      el('h1', {}, p.nombre),
      el('div', { class: 'resumen-chips' },
        el('span', { class: 'chip' }, cat.categoriaDe.get(p.categoria_id)?.nombre ?? 'Sin categoría'),
        p.seccion ? el('span', { class: 'chip' }, p.seccion) : null,
        marca ? el('span', { class: 'chip' }, marca.nombre) : null,
        p.modelo ? el('span', { class: 'chip' }, `Modelo ${p.modelo}`) : null,
        el('span', { class: 'texto-suave' }, `${fotos.length} fotos · ${versiones.length} ${versiones.length === 1 ? 'versión' : 'versiones'}`)),
      el('div', { class: 'cat-ficha-interruptores' },
        interruptor('activo', 'Activo', 'Sale en el PDF y al cotizar'),
        interruptor('publicar_web', 'Publicar en la web', 'Se mostrará en el catálogo web (fase 2)'),
        ctx.puede('catalogo', 'eliminar') ? boton('Eliminar producto', { icono: 'basura', class: 'boton boton-secundario boton-chico cat-eliminar', onclick: () => abrirFormulario({
          titulo: 'Eliminar producto', mensaje: `"${p.nombre}" deja de verse en el catálogo, en el PDF, en la web y al cotizar.`, campos: [], textoGuardar: 'Eliminar',
          alGuardar: async () => { if (await guardar({ deleted_at: new Date().toISOString() }, 'Producto eliminado.')) location.hash = ctx.ruta('catalogo.productos'); },
        }) }) : null)));

  // ---- Pestañas
  const PESTANAS = [['datos', 'Datos'], ['fotos', `Fotos y videos (${fotos.length})`], ['versiones', `Versiones por camioneta (${versiones.length})`]];
  const cuerpo = el('div', { class: 'cat-ficha-cuerpo' });
  const barra = el('div', { class: 'segmento', role: 'tablist' }, PESTANAS.map(([id, t]) => el('button', {
    type: 'button', role: 'tab', 'aria-pressed': String(pestana === id),
    onclick: (ev) => { pestana = id; for (const b of barra.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); pintar(); },
  }, t)));
  const pintar = () => cuerpo.replaceChildren(
    pestana === 'fotos' ? tabFotos(ctx, p, fotos, versiones, urls, guardar, editable)
      : pestana === 'versiones' ? tabVersiones(ctx, p, versiones, costoDe, conCostos, editable)
        : tabDatos(ctx, cat, p, costoDe, conCostos, guardar, editable));
  pintar();

  return el('section', { class: 'listado' }, volver, cabecera, barra, cuerpo);
}

// =========================================================== Datos y ficha técnica
function tabDatos(ctx, cat, p, costoDe, conCostos, guardar, editable) {
  const unicos = (k) => [...new Set(cat.productos.map((x) => x[k]).filter(Boolean))].sort();
  const lista = (id, opciones) => el('datalist', { id: `cat-l-${id}` }, opciones.map((o) => el('option', { value: o })));
  const campo = (id, etiqueta, { tipo = 'text', opciones = null, sugerencias = null, ayuda = null, numero = false, bool = false } = {}) => {
    let ctl;
    if (opciones) {
      ctl = el('select', { class: 'campo', id: `c-${id}`, disabled: !editable }, opciones.map(([v, t]) => el('option', { value: v, selected: String(p[id] ?? '') === v }, t)));
    } else if (tipo === 'textarea') {
      ctl = Object.assign(el('textarea', { class: 'campo', id: `c-${id}`, rows: 3, disabled: !editable }), { value: p[id] ?? '' });
    } else {
      ctl = el('input', { class: 'campo', id: `c-${id}`, type: tipo, value: p[id] ?? '', disabled: !editable, min: tipo === 'number' ? 0 : null, list: sugerencias ? `cat-l-${id}` : null, autocomplete: sugerencias ? 'off' : null });
    }
    ctl.addEventListener('change', () => {
      let v = ctl.value.trim();
      if (bool) v = v === 'true';
      else if (numero) v = v === '' ? null : Math.max(0, Math.round(Number(v) || 0));
      else if (v === '' && id !== 'categoria_id') v = null;
      if (id === 'nombre' && !v) { avisar('El nombre no puede quedar vacío.', 'error'); ctl.value = p.nombre; return; }
      guardar({ [id]: v });
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `c-${id}` }, etiqueta), ctl, sugerencias ? lista(id, sugerencias) : null,
      ayuda ? el('span', { class: 'texto-suave texto-chico' }, ayuda) : null);
  };

  // Costo base y margen (solo con aprobar)
  let costoBase = null;
  if (conCostos) {
    const c = costoDe.get('base');
    const info = el('span', { class: 'texto-suave texto-chico' });
    const pintarMargen = () => {
      const m = margen(p.precio, c?.costo ?? null);
      info.textContent = m ? `Margen ${dinero(m.monto)}${m.pct != null ? ` (${m.pct} %)` : ''} sobre el precio neto.` : 'Con precio y costo se calcula el margen.';
    };
    const costo = el('input', { class: 'campo', id: 'c-costo', type: 'number', min: 0, value: c?.costo ?? '', disabled: !editable });
    const prov = el('input', { class: 'campo', id: 'c-proveedor', value: c?.proveedor ?? '', disabled: !editable, placeholder: 'Ej.: Bulder' });
    const guardarC = async () => {
      try { await guardarCosto(ctx, p.id, null, costo.value, prov.value.trim()); avisar('Costo guardado.'); ctx.refrescar(); } catch (e) { avisar(e.message, 'error'); }
    };
    costo.addEventListener('change', guardarC); prov.addEventListener('change', guardarC);
    pintarMargen();
    costoBase = el('fieldset', { class: 'tarjeta cat-costo' }, el('legend', {}, icono('candado', { tam: 14 }), ' Costo (solo con permiso de costos)'),
      el('div', { class: 'cat-dos' },
        el('div', { class: 'form-fila' }, el('label', { for: 'c-costo' }, 'Costo neto'), costo),
        el('div', { class: 'form-fila' }, el('label', { for: 'c-proveedor' }, 'Proveedor'), prov)),
      info);
  }

  return el('div', { class: 'cat-datos' },
    el('div', { class: 'tarjeta cat-form' },
      campo('nombre', 'Nombre'),
      el('div', { class: 'cat-dos' },
        campo('categoria_id', 'Categoría', { opciones: cat.categorias.map((c) => [c.id, c.nombre]) }),
        campo('seccion', 'Sección', { sugerencias: unicos('seccion') })),
      el('div', { class: 'cat-dos' },
        campo('marca_id', 'Marca', { opciones: [['', 'Sin marca'], ...cat.marcas.map((m) => [m.id, m.nombre])] }),
        campo('modelo', 'Modelo del producto', { ayuda: 'Ej.: BULX15 2.0 Power. Une las versiones de varias camionetas.' })),
      campo('descripcion', 'Descripción', { tipo: 'textarea' }),
      el('div', { class: 'cat-dos' },
        campo('material', 'Material', { sugerencias: unicos('material') }),
        campo('procedencia', 'Procedencia', { sugerencias: unicos('procedencia') })),
      el('div', { class: 'cat-dos' },
        campo('garantia', 'Garantía', { sugerencias: unicos('garantia') }),
        campo('orden', 'Orden en la categoría', { tipo: 'number', numero: true })),
      el('div', { class: 'cat-dos' },
        campo('precio', 'Precio neto de referencia', { tipo: 'number', numero: true, ayuda: 'Si el precio cambia según la camioneta, va en cada versión.' }),
        campo('precio_en_pdf', 'Precio en el PDF', { opciones: [['false', 'No'], ['true', 'Sí']], bool: true })),
      campo('notas', 'Notas internas (no salen en el PDF ni en la web)', { tipo: 'textarea' }),
      p.origen_url ? el('p', { class: 'texto-suave texto-chico' }, 'Traído desde: ', el('a', { href: p.origen_url, target: '_blank', rel: 'noopener noreferrer' }, new URL(p.origen_url).hostname)) : null),
    el('div', { class: 'cat-lateral' }, costoBase, fichaTecnica(p, guardar, editable)));
}

// Ficha técnica: pares etiqueta–valor (Tipo de producto, Medidas, Peso…)
function fichaTecnica(p, guardar, editable) {
  const filas = el('div', { class: 'cat-ficha-tec' });
  const leer = () => [...filas.children].map((f) => ({ e: f.querySelector('.cat-e').value.trim(), v: f.querySelector('.cat-v').value.trim() })).filter((x) => x.e && x.v);
  const fila = (x = { e: '', v: '' }) => {
    const e = el('input', { class: 'campo cat-e', value: x.e, placeholder: 'Ej.: Medidas', disabled: !editable, 'aria-label': 'Característica' });
    const v = el('input', { class: 'campo cat-v', value: x.v, placeholder: 'Valor', disabled: !editable, 'aria-label': 'Valor' });
    const r = el('div', { class: 'cat-ficha-fila' }, e, v,
      editable ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar', title: 'Quitar', onclick: () => { r.remove(); guardar({ ficha: leer() }); } }, icono('basura', { tam: 16 })) : null);
    for (const c of [e, v]) c.addEventListener('change', () => guardar({ ficha: leer() }));
    return r;
  };
  filas.append(...(p.ficha ?? []).map(fila));
  return el('section', { class: 'tarjeta cat-bloque' },
    el('h2', {}, 'Ficha técnica'),
    el('p', { class: 'texto-suave texto-chico' }, 'Características que se muestran en la web como tabla.'),
    filas,
    editable ? boton('Agregar característica', { icono: 'mas', onclick: () => { const n = fila(); filas.append(n); n.querySelector('input').focus(); } }) : null,
    !(p.ficha ?? []).length && !editable ? el('p', { class: 'texto-suave' }, 'Sin características.') : null);
}

// =========================================================== Galería
function tabFotos(ctx, p, fotos, versiones, urls, guardar, editable) {
  const nombreV = new Map(versiones.map((v) => [v.id, nombreVersion(v)]));
  const verFotos = fotos.filter((f) => urls.has(f.ruta)).map((f) => ({ url: urls.get(f.ruta), id: f.id }));
  const cambiar = async (f, cambios) => {
    const { error } = await ctx.api.from('cat_fotos').update(cambios).eq('id', f.id);
    if (error) { avisar(error.message, 'error'); return false; } return true;
  };
  const mover = async (k, d) => {
    const otra = fotos[k + d]; if (!otra) return;
    const a = fotos[k];
    // Renumera todo (orden 0..n) para que el cambio sea siempre exacto
    const nuevo = [...fotos]; nuevo[k] = otra; nuevo[k + d] = a;
    for (const [n, f] of nuevo.entries()) if (f.orden !== n) await cambiar(f, { orden: n });
    ctx.refrescar();
  };

  const tarjetas = fotos.map((f, k) => {
    const esPrincipal = f.ruta === p.foto_ruta;
    const web = Object.assign(el('input', { type: 'checkbox', disabled: !editable }), { checked: f.publicar_web });
    web.addEventListener('change', async () => { if (!(await cambiar(f, { publicar_web: web.checked }))) web.checked = !web.checked; else avisar(web.checked ? 'Se publicará en la web.' : 'No se publicará en la web.'); });
    const origen = f.origen_url ? (() => { try { return new URL(f.origen_url).hostname.replace(/^www\./, ''); } catch { return 'otra página'; } })() : null;
    return el('figure', { class: `cat-galeria-foto ${esPrincipal ? 'principal' : ''}` },
      el('button', { type: 'button', class: 'cat-galeria-img', 'aria-label': `Ver foto ${k + 1}`, onclick: () => abrirCarrusel(verFotos, Math.max(0, verFotos.findIndex((x) => x.id === f.id))) },
        urls.get(f.ruta) ? el('img', { src: urls.get(f.ruta), alt: '', loading: 'lazy' }) : icono('camara', { tam: 28 })),
      el('figcaption', {},
        el('div', { class: 'cat-galeria-info' },
          esPrincipal ? el('span', { class: 'chip chip-ok' }, 'Principal') : null,
          f.version_id ? el('span', { class: 'chip', title: 'Foto de esta camioneta' }, nombreV.get(f.version_id) ?? 'Versión') : null,
          origen ? el('span', { class: 'texto-suave texto-chico', title: f.origen_url }, `Copia de ${origen}`) : el('span', { class: 'texto-suave texto-chico' }, 'Propia')),
        el('div', { class: 'cat-galeria-acciones' },
          el('label', { class: 'casilla texto-chico', title: 'Mostrar esta foto en la web' }, web, 'Web'),
          editable ? el('span', { class: 'cat-galeria-botones' },
            el('button', { type: 'button', class: 'boton-icono', title: 'Mover antes', 'aria-label': 'Mover antes', disabled: k === 0, onclick: () => mover(k, -1) }, icono('volver', { tam: 16 })),
            el('button', { type: 'button', class: 'boton-icono', title: 'Mover después', 'aria-label': 'Mover después', disabled: k === fotos.length - 1, onclick: () => mover(k, 1) }, icono('derecha', { tam: 16 })),
            esPrincipal ? null : el('button', { type: 'button', class: 'boton-icono', title: 'Usar como principal', 'aria-label': 'Usar como principal', onclick: async () => { if (await guardar({ foto_ruta: f.ruta }, 'Foto principal cambiada.')) ctx.refrescar(); } }, icono('check', { tam: 16 })),
            ctx.puede('catalogo', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar de la galería', 'aria-label': 'Quitar de la galería', onclick: async () => {
              if (esPrincipal && fotos.length > 1) { avisar('Elige otra foto principal antes de quitar esta.', 'error'); return; }
              if (await cambiar(f, { deleted_at: new Date().toISOString() })) { if (esPrincipal) await guardar({ foto_ruta: null }, null); avisar('Foto quitada.'); ctx.refrescar(); }
            } }, icono('basura', { tam: 16 })) : null) : null)));
  });

  // Subir fotos propias (varias a la vez)
  const subir = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  subir.addEventListener('change', async () => {
    const lista = [...subir.files]; if (!lista.length) return;
    avisar(`Subiendo ${lista.length} ${lista.length === 1 ? 'foto' : 'fotos'}…`);
    let orden = fotos.length; let primera = null;
    try {
      for (const f of lista) {
        const ruta = await subirFoto(ctx, f, 'cat_fotos', p.id);
        const { error } = await ctx.api.from('cat_fotos').insert({ empresa_id: ctx.empresa.id, producto_id: p.id, ruta, orden: orden++, publicar_web: true });
        if (error) throw new Error(error.message);
        primera ??= ruta;
      }
      if (!p.foto_ruta && primera) await guardar({ foto_ruta: primera }, null);
      avisar('Fotos agregadas.');
    } catch (e) { avisar(e.message, 'error'); }
    ctx.refrescar();
  });

  const acciones = editable && ctx.puede('catalogo', 'crear') ? el('div', { class: 'listado-acciones' },
    boton('Subir fotos', { icono: 'camara', tipo: 'primario', onclick: () => subir.click() }),
    boton('Traer fotos desde un enlace', { icono: 'descargar', onclick: () => traerFotos(ctx, p, versiones) }),
    verFotos.length ? boton('Ver como carrusel', { icono: 'ojo', onclick: () => abrirCarrusel(verFotos) }) : null, subir) : null;

  return el('div', { class: 'cat-galeria-tab' },
    acciones,
    el('p', { class: 'texto-suave texto-chico' }, 'Las fotos copiadas de otra página quedan guardadas en ISgestión (no dependen de esa página) y muestran de dónde vinieron. Marca "Web" solo en las que tengas permiso para publicar: fotos propias, de la marca o autorizadas por el proveedor.'),
    fotos.length ? el('div', { class: 'cat-galeria' }, tarjetas) : el('div', { class: 'cat-vacio' }, icono('camara', { tam: 28 }), el('p', {}, 'Sin fotos todavía.')),
    videos(ctx, p, guardar, editable));
}

// Videos: enlaces de YouTube o de la marca (la web los mostrará en el carrusel)
function videos(ctx, p, guardar, editable) {
  const lista = el('ul', { class: 'cat-ajustes' }, (p.videos ?? []).map((u, k) => el('li', { class: 'cat-ajuste' },
    icono('video', { tam: 18 }), el('a', { class: 'cat-recorte', href: u, target: '_blank', rel: 'noopener noreferrer' }, u),
    editable ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar video', title: 'Quitar', onclick: async () => {
      if (await guardar({ videos: p.videos.filter((_, n) => n !== k) }, 'Video quitado.')) ctx.refrescar();
    } }, icono('basura', { tam: 16 })) : null)));
  return el('section', { class: 'tarjeta cat-bloque' },
    el('header', { class: 'listado-cabecera' }, el('h2', {}, 'Videos'),
      editable ? boton('Agregar video', { icono: 'mas', onclick: () => abrirFormulario({
        titulo: 'Agregar video', campos: [{ id: 'url', etiqueta: 'Enlace (YouTube u otro)', tipo: 'url', requerido: true }],
        alGuardar: async (v) => {
          const u = v.url.trim();
          if (!/^https:\/\//.test(u)) throw new Error('El enlace debe empezar con https://');
          if (await guardar({ videos: [...(p.videos ?? []), u] }, 'Video agregado.')) ctx.refrescar();
        },
      }) }) : null),
    (p.videos ?? []).length ? lista : el('p', { class: 'texto-suave' }, 'Sin videos.'));
}

// Copiar fotos de otra página a la galería (elige cuáles)
function traerFotos(ctx, p, versiones) {
  abrirFormulario({
    titulo: 'Traer fotos desde un enlace',
    mensaje: 'Pega el enlace de la ficha del producto (proveedor o marca). Se leen sus fotos y eliges cuáles copiar.',
    campos: [
      { id: 'url', etiqueta: 'Enlace', tipo: 'url', requerido: true, valor: p.origen_url ?? '' },
      ...(versiones.length ? [{ id: 'version_id', etiqueta: 'Fotos de', opciones: [['', 'Todo el producto'], ...versiones.map((v) => [v.id, nombreVersion(v)])], valor: '' }] : []),
    ],
    textoGuardar: 'Leer la página',
    alGuardar: async (v) => {
      const ficha = await traerDesdeEnlace(ctx, { accion: 'leer', url: v.url.trim() });
      if (!ficha.imagenes?.length) throw new Error('No encontré fotos en esa página.');
      elegirFotos(ctx, p.id, v.version_id || null, ficha);
    },
  });
}

// Elegir fotos (con miniaturas) y copiarlas
export function elegirFotos(ctx, productoId, versionId, ficha, alTerminar = null) {
  abrirFormulario({
    titulo: `Fotos encontradas (${ficha.imagenes.length})`,
    mensaje: 'Se copian a los archivos de la empresa. Quedan sin publicar en la web hasta que lo marques.',
    campos: [{ id: 'imagenes', etiqueta: 'Fotos a copiar', tipo: 'checks', opciones: ficha.imagenes.map((u) => [u, u.split('/').pop()]), valor: ficha.imagenes.slice(0, 20) }],
    textoGuardar: 'Copiar fotos',
    alGuardar: async (v) => {
      if (!v.imagenes.length) throw new Error('Elige al menos una foto.');
      if (v.imagenes.length > 20) throw new Error('Máximo 20 fotos por vez.');
      const r = await traerDesdeEnlace(ctx, { accion: 'fotos', producto_id: productoId, version_id: versionId, imagenes: v.imagenes, origen_url: ficha.url });
      avisar(`${r.subidas} ${r.subidas === 1 ? 'foto copiada' : 'fotos copiadas'}${r.errores.length ? ` · ${r.errores.length} con error` : ''}.`, r.errores.length ? 'error' : 'ok');
      if (alTerminar) alTerminar(); else ctx.refrescar();
    },
  });
  // Miniaturas junto a cada casilla (las imágenes se ven directo desde la otra página, solo para elegir)
  const dialogo = [...document.querySelectorAll('dialog.modal')].pop();
  dialogo?.classList.add('cat-elegir');
  for (const c of dialogo?.querySelectorAll('input[name="imagenes"]') ?? []) c.parentElement.prepend(el('img', { class: 'cat-elegir-img', src: c.value, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
}

// =========================================================== Versiones por camioneta
function tabVersiones(ctx, p, versiones, costoDe, conCostos, editable) {
  const filas = versiones.map((v) => {
    const c = costoDe.get(v.id); const precio = v.precio ?? p.precio; const m = margen(precio, c?.costo ?? null);
    return el('tr', { class: `${v.activo ? '' : 'inactiva'} ${editable ? 'fila-enlace' : ''}`, onclick: editable ? () => editarVersion(ctx, p, v, c, conCostos) : null },
      el('td', {}, el('strong', {}, `${v.vehiculo_marca} ${v.vehiculo_modelo}`), v.notas ? el('div', { class: 'texto-suave texto-chico' }, v.notas) : null),
      el('td', {}, v.cabina ?? ''),
      el('td', {}, anios(v)),
      el('td', { class: 'num' }, precio != null ? dinero(precio) : '', v.precio == null && p.precio != null ? el('div', { class: 'texto-suave texto-chico' }, 'del producto') : null),
      conCostos ? el('td', { class: 'num' }, c ? dinero(c.costo) : '') : null,
      conCostos ? el('td', { class: `num ${m && m.monto < 0 ? 'texto-error' : ''}` }, m ? `${dinero(m.monto)}${m.pct != null ? ` (${m.pct} %)` : ''}` : '') : null,
      el('td', {}, v.sku ?? ''),
      el('td', {}, el('span', { class: `chip ${v.publicar_web && v.activo ? 'chip-ok' : 'chip-na'}` }, !v.activo ? 'Inactiva' : v.publicar_web ? 'Web' : 'Solo interna')));
  });
  return el('div', {},
    el('div', { class: 'listado-acciones' },
      el('p', { class: 'texto-suave' }, 'Cada versión es este producto para una camioneta: su precio, costo y código. Así se busca por camioneta en la web y se cotiza la versión exacta.'),
      ctx.puede('catalogo', 'crear') ? boton('Agregar camioneta', { icono: 'mas', tipo: 'primario', onclick: () => editarVersion(ctx, p, null, null, conCostos) }) : null),
    versiones.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Camioneta', 'Cabina', 'Años', 'Precio neto', ...(conCostos ? ['Costo', 'Margen'] : []), 'Código', 'Web'].map((t) => el('th', {}, t)))),
      el('tbody', {}, filas)))
      : el('div', { class: 'cat-vacio' }, icono('auto', { tam: 28 }), el('p', {}, 'Sin versiones: el producto vale para cualquier camioneta (consulta compatibilidad).')));
}

async function editarVersion(ctx, p, v, c, conCostos) {
  // Productos de Inventario para ligar (si la empresa lo tiene)
  const inv = ctx.puede('inventario', 'ver')
    ? (await ctx.api.from('inv_productos').select('id, sku, nombre').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('nombre')).data ?? []
    : [];
  const campos = [
    { id: 'vehiculo_marca', etiqueta: 'Marca de la camioneta', requerido: true, valor: v?.vehiculo_marca ?? '', sugerencias: MARCAS_VEHICULO },
    { id: 'vehiculo_modelo', etiqueta: 'Modelo', requerido: true, valor: v?.vehiculo_modelo ?? '' },
    { id: 'cabina', etiqueta: 'Cabina', valor: v?.cabina ?? '', sugerencias: CABINAS },
    { id: 'anio_desde', etiqueta: 'Año desde', tipo: 'number', valor: v?.anio_desde ?? '' },
    { id: 'anio_hasta', etiqueta: 'Año hasta (vacío: en adelante)', tipo: 'number', valor: v?.anio_hasta ?? '' },
    { id: 'precio', etiqueta: 'Precio neto (vacío: el del producto)', tipo: 'number', valor: v?.precio ?? '' },
    ...(conCostos ? [{ id: 'costo', etiqueta: 'Costo neto (solo con permiso de costos)', tipo: 'number', valor: c?.costo ?? '' },
      { id: 'proveedor', etiqueta: 'Proveedor', valor: c?.proveedor ?? '' }] : []),
    { id: 'sku', etiqueta: 'Código (SKU del proveedor o propio)', valor: v?.sku ?? '' },
    ...(inv.length ? [{ id: 'inv_producto_id', etiqueta: 'Producto de Inventario (stock)', opciones: [['', 'Sin ligar'], ...inv.map((x) => [x.id, `${x.sku ? `${x.sku} · ` : ''}${x.nombre}`])], valor: v?.inv_producto_id ?? '' }] : []),
    { id: 'publicar_web', etiqueta: 'Publicar en la web', opciones: [['si', 'Sí'], ['no', 'No']], valor: v && !v.publicar_web ? 'no' : 'si' },
    { id: 'activo', etiqueta: 'Activa', opciones: [['si', 'Sí'], ['no', 'No']], valor: v && !v.activo ? 'no' : 'si' },
    { id: 'notas', etiqueta: 'Notas internas', tipo: 'textarea', filas: 2, valor: v?.notas ?? '' },
  ];
  const num = (x) => (x === '' || x == null ? null : Math.round(Number(x)));
  abrirFormulario({
    titulo: v ? `Editar ${nombreVersion(v)}` : 'Agregar camioneta',
    campos,
    alGuardar: async (f) => {
      const fila = {
        vehiculo_marca: f.vehiculo_marca.trim(), vehiculo_modelo: f.vehiculo_modelo.trim(), cabina: f.cabina.trim() || null,
        anio_desde: num(f.anio_desde), anio_hasta: num(f.anio_hasta), precio: num(f.precio), sku: f.sku.trim() || null,
        inv_producto_id: f.inv_producto_id || null, publicar_web: f.publicar_web === 'si', activo: f.activo === 'si', notas: f.notas.trim() || null,
      };
      if (!inv.length) delete fila.inv_producto_id;
      let id = v?.id;
      if (id) {
        const { error } = await ctx.api.from('cat_versiones').update(fila).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await ctx.api.from('cat_versiones').insert({ ...fila, empresa_id: ctx.empresa.id, producto_id: p.id }).select('id').single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      if (conCostos) await guardarCosto(ctx, p.id, id, f.costo, f.proveedor?.trim());
      avisar('Versión guardada.');
      ctx.refrescar();
    },
  });
  if (v && ctx.puede('catalogo', 'eliminar')) {
    const dialogo = [...document.querySelectorAll('dialog.modal')].pop();
    dialogo?.querySelector('.modal-pie')?.prepend(boton('Eliminar', { icono: 'basura', class: 'boton boton-secundario cat-eliminar', onclick: async () => {
      const { error } = await ctx.api.from('cat_versiones').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
      if (error) { avisar(error.message, 'error'); return; }
      dialogo.close(); dialogo.remove(); avisar('Versión eliminada.'); ctx.refrescar();
    } }));
  }
}
