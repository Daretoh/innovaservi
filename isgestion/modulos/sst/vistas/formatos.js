// Formatos del cliente (SST 009): lista, subir un formato nuevo, ajustar sus campos y rellenarlo.
// Rutas: #/sst.formatos · #/sst.formatos?id=<formato>[&l=<llenado>][&modo=ajustar]
// Rellenar: se escribe sobre el PDF del cliente (los campos detectados, o tocando cualquier parte de la hoja para un
// texto suelto). Lo no rellenado queda en blanco para completarlo en terreno. "Imprimir PDF" escribe sobre el original:
// queda el formato del cliente tal cual, sin nada de ISgestión.
import { el } from '../../../core/ui/dom.js?v=10113d4';
import { icono } from '../../../core/ui/iconos.js?v=10113d4';
import { boton } from '../../../core/ui/tabla.js?v=10113d4';
import { abrirFormulario } from '../../../core/ui/modal.js?v=10113d4';
import { avisar } from '../../../core/ui/aviso.js?v=10113d4';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=10113d4';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=10113d4';
import { cargarPdfJs, detectarCampos, pdfRellenado, datosDeFaena, DATOS, MARCAS, SIGUIENTE_MARCA } from '../formatos.js?v=10113d4';

export const TIPOS_FORMATO = [['ast', 'AST (análisis seguro de trabajo)'], ['permiso', 'Permiso de trabajo'], ['otro', 'Otro formato']];
const nombreTipo = { ast: 'AST', permiso: 'Permiso de trabajo', otro: 'Formato' };

function css() {
  if (!document.getElementById('sst-formatos-css')) document.head.append(el('link', { id: 'sst-formatos-css', rel: 'stylesheet', href: new URL('../formatos.css?v=10113d4', import.meta.url).href }));
}

export default async function vista(ctx) {
  css();
  return ctx.params.id ? hoja(ctx) : lista(ctx);
}

// Abre (o crea) el llenado de un formato para una faena-día, con los datos de la faena propuestos
export async function abrirLlenado(ctx, formato, { faenaId = null, fecha = hoyISO(), titulo = null } = {}) {
  if (faenaId) {
    const { data: ya } = await ctx.api.from('sst_formato_llenados').select('id').eq('formato_id', formato.id).eq('faena_id', faenaId).eq('fecha', fecha).is('deleted_at', null).maybeSingle();
    if (ya) { location.hash = ctx.ruta('sst.formatos', { id: formato.id, l: ya.id }); return; }
  }
  const d = await datosDeFaena(ctx, faenaId, fecha);
  const valores = {};
  for (const c of formato.campos ?? []) if (c.dato && d[c.dato]) valores[c.id] = d[c.dato];
  const { data, error } = await ctx.api.from('sst_formato_llenados').insert({ empresa_id: ctx.empresa.id, formato_id: formato.id, faena_id: faenaId, fecha, titulo, valores }).select('id').single();
  if (error) throw new Error(error.message);
  location.hash = ctx.ruta('sst.formatos', { id: formato.id, l: data.id });
}

async function lista(ctx) {
  const [fs, ls, cli] = await Promise.all([
    ctx.api.from('sst_formatos').select('id, nombre, tipo, tercero_id, campos, activo, created_at').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('nombre'),
    ctx.api.from('sst_formato_llenados').select('id, formato_id, faena_id, fecha, titulo, archivo, updated_at, created_at, ope_faenas(titulo)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(40),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
  ]);
  if (fs.error) throw fs.error;
  const clientes = cli.data ?? [];
  const nomCli = (id) => { const c = clientes.find((x) => x.id === id); return c ? c.nombre_fantasia || c.razon_social : 'General (todos los clientes)'; };
  const subir = () => abrirFormulario({
    titulo: 'Subir formato del cliente',
    mensaje: 'El PDF tal como lo entrega el cliente (en blanco). ISgestión busca solo las casillas y espacios para rellenar; después puedes ajustarlos.',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, ayuda: 'Ej.: AST Cermaq, Permiso de trabajo crítico Cermaq.' },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_FORMATO, valor: 'ast' },
      { id: 'cliente', etiqueta: 'Cliente', opciones: [['', 'General (todos los clientes)'], ...clientes.map((c) => [c.id, c.nombre_fantasia || c.razon_social])] },
      { id: 'archivo', etiqueta: 'PDF del formato', tipo: 'file', accept: 'application/pdf,.pdf', requerido: true, multiple: false },
    ],
    textoGuardar: 'Subir',
    alGuardar: async (v) => {
      if (!v.archivo?.size) throw new Error('Elige el PDF.');
      const bytes = new Uint8Array(await v.archivo.arrayBuffer());
      const { paginas, campos } = await detectarCampos(bytes, (t) => avisar(t));
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'sst', archivo: v.archivo, tabla: 'sst_formatos', tipos: ['application/pdf'] });
      const { data, error } = await ctx.api.from('sst_formatos').insert({ empresa_id: ctx.empresa.id, tercero_id: v.cliente || null, nombre: v.nombre.trim(), tipo: v.tipo, archivo: ruta, paginas, campos }).select('id').single();
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      avisar(`Formato subido: ${campos.length} campos encontrados. Revisa y ajusta los que falten.`);
      location.hash = ctx.ruta('sst.formatos', { id: data.id, modo: 'ajustar' });
    },
  });
  const porCliente = new Map();
  for (const f of fs.data) { const k = f.tercero_id ?? ''; if (!porCliente.has(k)) porCliente.set(k, []); porCliente.get(k).push(f); }
  const nomFormato = (id) => fs.data.find((f) => f.id === id)?.nombre ?? 'Formato';
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Formatos del cliente'), el('p', { class: 'texto-suave' }, 'AST, permisos de trabajo y otros formatos del cliente: se rellenan aquí y se imprimen tal cual el formato del cliente (sin nada de ISgestión). Lo que se completa en terreno se deja en blanco.')),
      el('div', { class: 'listado-acciones' }, ctx.puede('sst', 'crear') ? boton('Subir formato', { icono: 'mas', tipo: 'primario', onclick: subir }) : null)),
    fs.data.length ? [...porCliente.entries()].map(([k, lista]) => el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, nomCli(k)),
      lista.map((f) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, f.nombre), el('span', { class: 'texto-suave texto-chico' }, `${nombreTipo[f.tipo]} · ${(f.campos ?? []).length} campos`)),
        el('div', { class: 'doc-acciones' },
          ctx.puede('sst', 'crear') || ctx.puede('ope', 'crear') ? boton('Rellenar', { icono: 'editar', tipo: 'primario', onclick: async () => { try { await abrirLlenado(ctx, f); } catch (e) { avisar(e.message, 'error'); } } }) : null,
          ctx.puede('sst', 'editar') ? boton('Ajustar campos', { icono: 'ajustes', onclick: () => { location.hash = ctx.ruta('sst.formatos', { id: f.id, modo: 'ajustar' }); } }) : null)))))
      : el('p', { class: 'texto-suave' }, 'Aún no hay formatos. Sube la AST o el permiso de trabajo del cliente en PDF.'),
    ls.data?.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Rellenados recientes'),
      ls.data.map((x) => el('a', { class: 'doc-fila', href: ctx.ruta('sst.formatos', { id: x.formato_id, l: x.id }) },
        el('div', { class: 'doc-nombre' }, el('strong', {}, `${nomFormato(x.formato_id)}${x.ope_faenas?.titulo ? ` · ${x.ope_faenas.titulo}` : x.titulo ? ` · ${x.titulo}` : ''}`),
          el('span', { class: 'texto-suave texto-chico' }, fechaLarga(x.fecha))),
        el('span', { class: `chip ${x.archivo ? 'chip-ok' : 'chip-prox'}` }, x.archivo ? 'PDF listo' : 'Borrador')))) : null);
}

async function hoja(ctx) {
  const { data: f, error } = await ctx.api.from('sst_formatos').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('sst.formatos') }, icono('volver', { tam: 16 }), 'Formatos del cliente');
  if (!f || f.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Formato no encontrado'));
  let ll = null;
  if (ctx.params.l) {
    const r = await ctx.api.from('sst_formato_llenados').select('*, ope_faenas(titulo)').eq('id', ctx.params.l).maybeSingle();
    ll = r.data;
    if (!ll || ll.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'No se encontró el formato rellenado'));
  }
  const ajustar = ctx.params.modo === 'ajustar' && ctx.puede('sst', 'editar');
  const puedeEscribir = ctx.puede('sst', 'crear') || ctx.puede('sst', 'editar') || ctx.puede('ope', 'crear') || ctx.puede('ope', 'editar');
  const campos = structuredClone(f.campos ?? []);
  const valores = { ...(ll?.valores ?? {}) };
  const extras = structuredClone(ll?.extras ?? []);
  const bytes = new Uint8Array(await (await fetch(await urlFirmada(ctx.api, f.archivo, 300))).arrayBuffer());
  const L = await cargarPdfJs();
  const pdf = await L.getDocument({ data: bytes.slice(0) }).promise;

  // ---------- Guardado (rellenar: valores y textos sueltos; ajustar: campos) ----------
  const estado = el('span', { class: 'texto-suave texto-chico' }, ajustar ? `${campos.length} campos` : ll?.updated_at ? `Guardado ${new Date(ll.updated_at).toLocaleString('es-CL')}` : '');
  let reloj = null;
  const guardar = (ya = false) => {
    clearTimeout(reloj);
    const hacer = async () => {
      estado.textContent = 'Guardando…';
      const r = ajustar ? await ctx.api.from('sst_formatos').update({ campos }).eq('id', f.id) : await ctx.api.from('sst_formato_llenados').update({ valores, extras }).eq('id', ll.id);
      estado.textContent = r.error ? 'No se pudo guardar' : ajustar ? `${campos.length} campos · guardado` : `Guardado ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
      if (r.error) avisar(r.error.message, 'error');
    };
    if (ya) return hacer();
    reloj = setTimeout(hacer, 1200);
  };
  if (!ajustar && ll) window.addEventListener('hashchange', () => { if (reloj) guardar(true); }, { once: true });

  // ---------- Páginas con su capa de campos ----------
  const paginas = el('div', { class: 'fm-paginas' });
  let seleccion = null; const panel = el('div', { class: 'ficha fm-panel', hidden: true });
  const capas = [];
  // Ancho disponible: el de la sección (menos el panel al ajustar); la hoja nunca más ancha que la pantalla
  const escala = () => Math.min(1.6, Math.max(320, (pantallaEl?.clientWidth || 860) - (ajustar && window.innerWidth > 900 ? 290 : 0) - 4) / (f.paginas?.[0]?.[0] || 612));
  let pantallaEl = null;
  async function pintarPaginas() {
    paginas.replaceChildren(); capas.length = 0;
    const s = escala();
    for (let pi = 0; pi < pdf.numPages; pi++) {
      const pg = await pdf.getPage(pi + 1);
      const vp = pg.getViewport({ scale: s * (window.devicePixelRatio > 1 ? 2 : 1) });
      const cv = el('canvas', { class: 'fm-lienzo', width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      const vp1 = pg.getViewport({ scale: 1 });
      const capa = el('div', { class: `fm-capa${ajustar ? ' fm-ajustar' : ''}`, style: `width:${vp1.width * s}px;height:${vp1.height * s}px` });
      const hojaEl = el('div', { class: 'fm-hoja', style: `width:${vp1.width * s}px` }, cv, capa);
      cv.style.width = `${vp1.width * s}px`;
      capas.push({ capa, s, pi });
      paginas.append(el('div', { class: 'texto-suave texto-chico fm-pag' }, `Página ${pi + 1} de ${pdf.numPages}`), hojaEl);
      eventosCapa(capa, s, pi);
    }
    pintarCampos();
  }
  const pos = (c, s) => `left:${c.x * s}px;top:${c.y * s}px;width:${c.w * s}px;height:${c.h * s}px`;
  function pintarCampos() {
    for (const { capa, s, pi } of capas) {
      capa.replaceChildren();
      for (const c of campos.filter((x) => x.pagina === pi)) {
        if (ajustar) {
          const caja = el('div', { class: `fm-campo fm-${c.tipo}${seleccion === c ? ' fm-sel' : ''}`, style: pos(c, s), title: [c.tipo, c.dato].filter(Boolean).join(' · ') },
            c.dato ? el('span', { class: 'fm-dato' }, DATOS.find(([k]) => k === c.dato)?.[1] ?? c.dato) : null);
          caja.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); elegir(c); });
          capa.append(caja);
          continue;
        }
        const tam = Math.max(8, Math.min(13, c.h * s * 0.6));
        if (c.tipo === 'marca') {
          const b = el('button', { type: 'button', class: `fm-campo fm-marca${valores[c.id] ? ' fm-lleno' : ''}`, style: `${pos(c, s)};font-size:${Math.min(c.h, c.w) * s * 0.7}px`, disabled: !puedeEscribir, title: 'Toca: ✓ cumple, x no cumple, N no aplica, vacío' }, MARCAS[valores[c.id]] ?? '');
          b.addEventListener('click', () => { const v = SIGUIENTE_MARCA[valores[c.id] ?? '']; if (v) valores[c.id] = v; else delete valores[c.id]; b.textContent = MARCAS[v] ?? ''; b.classList.toggle('fm-lleno', !!v); guardar(); });
          capa.append(b);
        } else {
          const t = el(c.tipo === 'multilinea' ? 'textarea' : 'input', { class: 'fm-campo fm-texto', style: `${pos(c, s)};font-size:${tam}px`, disabled: !puedeEscribir, 'aria-label': c.etiqueta || 'Campo', placeholder: c.dato ? (DATOS.find(([k]) => k === c.dato)?.[1] ?? '') : '' });
          t.value = valores[c.id] ?? '';
          t.addEventListener('input', () => { if (t.value) valores[c.id] = t.value; else delete valores[c.id]; guardar(); });
          capa.append(t);
        }
      }
      if (!ajustar) for (const x of extras.filter((e) => e.pagina === pi)) capa.append(extraEl(x, s));
    }
  }
  // Texto suelto (tocar una parte de la hoja sin campo)
  function extraEl(x, s) {
    const t = el('textarea', { class: 'fm-campo fm-texto fm-extra', style: `${pos(x, s)};font-size:${Math.max(8, Math.min(13, (x.h ?? 13) * s * 0.6))}px`, disabled: !puedeEscribir, placeholder: 'Escribe…' });
    t.value = x.texto ?? '';
    t.addEventListener('input', () => { x.texto = t.value; guardar(); });
    t.addEventListener('blur', () => { if (!t.value.trim()) { extras.splice(extras.indexOf(x), 1); t.remove(); guardar(); } });
    return t;
  }
  function eventosCapa(capa, s, pi) {
    if (!ajustar) {
      if (!puedeEscribir || !ll) return;
      capa.addEventListener('click', (ev) => {
        if (ev.target !== capa) return;
        const r = capa.getBoundingClientRect();
        const x = { pagina: pi, x: Math.round(((ev.clientX - r.left) / s) * 10) / 10, y: Math.round(((ev.clientY - r.top) / s - 7) * 10) / 10, w: 170, h: 13, texto: '' };
        extras.push(x); const t = extraEl(x, s); capa.append(t); t.focus();
      });
      return;
    }
    // Ajustar: arrastrar en un lugar vacío crea un campo
    let ini = null; let guia = null;
    capa.addEventListener('pointerdown', (ev) => {
      if (ev.target !== capa) return;
      const r = capa.getBoundingClientRect(); ini = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      guia = el('div', { class: 'fm-campo fm-guia' }); capa.append(guia); capa.setPointerCapture(ev.pointerId);
    });
    capa.addEventListener('pointermove', (ev) => {
      if (!ini) return; const r = capa.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
      Object.assign(guia.style, { left: `${Math.min(ini.x, x)}px`, top: `${Math.min(ini.y, y)}px`, width: `${Math.abs(x - ini.x)}px`, height: `${Math.abs(y - ini.y)}px` });
    });
    capa.addEventListener('pointerup', (ev) => {
      if (!ini) return; const r = capa.getBoundingClientRect(); const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const c = { pagina: pi, x: Math.min(ini.x, x) / s, y: Math.min(ini.y, y) / s, w: Math.abs(x - ini.x) / s, h: Math.abs(y - ini.y) / s };
      ini = null; guia.remove();
      if (c.w < 6 || c.h < 6) { // un toque: campo de texto de una línea
        Object.assign(c, { y: c.y - 7, w: 150, h: 14 });
      }
      for (const k of ['x', 'y', 'w', 'h']) c[k] = Math.round(c[k] * 10) / 10;
      c.tipo = c.w <= 40 && c.h <= 30 ? 'marca' : c.h >= 30 ? 'multilinea' : 'texto';
      c.id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      campos.push(c); elegir(c); guardar();
    });
  }
  function elegir(c) {
    seleccion = c; pintarCampos();
    const tipo = el('select', { class: 'campo' }, [['texto', 'Texto (una línea)'], ['multilinea', 'Texto (varias líneas)'], ['marca', 'Casilla para marcar']].map(([k, t]) => el('option', { value: k, selected: c.tipo === k }, t)));
    tipo.addEventListener('change', () => { c.tipo = tipo.value; pintarCampos(); guardar(); });
    const dato = el('select', { class: 'campo', 'data-nativo': '' }, DATOS.map(([k, t]) => el('option', { value: k, selected: (c.dato ?? '') === k }, t)));
    dato.addEventListener('change', () => { if (dato.value) c.dato = dato.value; else delete c.dato; pintarCampos(); guardar(); });
    const mover = (dx, dy, dw = 0, dh = 0) => { c.x += dx; c.y += dy; c.w = Math.max(5, c.w + dw); c.h = Math.max(5, c.h + dh); pintarCampos(); guardar(); };
    panel.hidden = false;
    panel.replaceChildren(
      el('div', { class: 'listado-cabecera' }, el('strong', {}, 'Campo elegido'), el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => { seleccion = null; panel.hidden = true; pintarCampos(); } }, icono('cerrar', { tam: 16 }))),
      el('label', { class: 'texto-chico' }, 'Tipo'), tipo,
      el('label', { class: 'texto-chico' }, 'Se rellena solo con'), dato,
      el('div', { class: 'fm-flechas' },
        boton('←', { onclick: () => mover(-1, 0) }), boton('→', { onclick: () => mover(1, 0) }), boton('↑', { onclick: () => mover(0, -1) }), boton('↓', { onclick: () => mover(0, 1) }),
        boton('Más ancho', { onclick: () => mover(0, 0, 4) }), boton('Más angosto', { onclick: () => mover(0, 0, -4) }), boton('Más alto', { onclick: () => mover(0, 0, 0, 2) }), boton('Más bajo', { onclick: () => mover(0, 0, 0, -2) })),
      boton('Eliminar campo', { icono: 'basura', onclick: () => { campos.splice(campos.indexOf(c), 1); seleccion = null; panel.hidden = true; pintarCampos(); guardar(); } }));
  }

  // ---------- Acciones ----------
  const imprimir = async (b) => {
    b.disabled = true;
    try {
      await guardar(true);
      const salida = await pdfRellenado(bytes, { campos }, { valores, extras });
      const archivo = new File([salida], `${f.nombre}${ll?.fecha ? ` ${ll.fecha}` : ''}.pdf`.replace(/[^\w .-]+/g, ' '), { type: 'application/pdf' });
      const u = URL.createObjectURL(archivo); window.open(u, '_blank', 'noopener');
      // Se guarda una copia del PDF generado (reemplaza la anterior)
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: ctx.puede('sst', 'crear') ? 'sst' : 'ope', archivo, tabla: 'sst_formato_llenados', registroId: ll.id, tipos: ['application/pdf'] });
      const anterior = ll.archivo;
      const { error: e } = await ctx.api.from('sst_formato_llenados').update({ archivo: ruta }).eq('id', ll.id);
      if (e) throw new Error(e.message);
      ll.archivo = ruta; if (anterior) eliminarArchivo(ctx.api, anterior).catch(() => {});
    } catch (err) { avisar(err.message, 'error'); } finally { b.disabled = false; }
  };
  const reproponer = async () => {
    const d = await datosDeFaena(ctx, ll.faena_id, ll.fecha);
    let n = 0;
    for (const c of campos) if (c.dato && d[c.dato] && !valores[c.id]) { valores[c.id] = d[c.dato]; n++; }
    pintarCampos(); guardar(); avisar(n ? `${n} campos completados con los datos de la faena.` : 'No había campos vacíos con datos de la faena.');
  };
  const redetectar = () => abrirFormulario({
    titulo: 'Buscar los campos de nuevo', mensaje: 'Se reemplazan los campos de este formato por los que se encuentren ahora (se pierden los ajustes hechos a mano).', campos: [], textoGuardar: 'Buscar',
    alGuardar: async () => { const r = await detectarCampos(bytes, (t) => avisar(t)); campos.splice(0, campos.length, ...r.campos); await guardar(true); pintarCampos(); },
  });
  const quitar = () => abrirFormulario({
    titulo: ajustar ? `Quitar el formato ${f.nombre}` : 'Quitar este formato rellenado', campos: [], textoGuardar: 'Quitar',
    mensaje: ajustar ? 'Deja de aparecer para rellenar. Lo ya rellenado se conserva.' : 'Sale de la lista. El formato del cliente sigue disponible.',
    alGuardar: async () => {
      const r = ajustar ? await ctx.api.from('sst_formatos').update({ deleted_at: new Date().toISOString() }).eq('id', f.id) : await ctx.api.from('sst_formato_llenados').update({ deleted_at: new Date().toISOString() }).eq('id', ll.id);
      if (r.error) throw new Error(r.error.message);
      location.hash = ctx.ruta('sst.formatos');
    },
  });
  const datosFormato = () => abrirFormulario({
    titulo: 'Datos del formato', campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: f.nombre }, { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_FORMATO, valor: f.tipo }],
    alGuardar: async (v) => { const { error: e } = await ctx.api.from('sst_formatos').update({ nombre: v.nombre.trim(), tipo: v.tipo }).eq('id', f.id); if (e) throw new Error(e.message); ctx.refrescar(); },
  });

  const titulo = ajustar ? `Ajustar campos · ${f.nombre}` : `${f.nombre}${ll?.ope_faenas?.titulo ? ` · ${ll.ope_faenas.titulo}` : ''}`;
  const acciones = ajustar
    ? [boton('Datos del formato', { icono: 'editar', onclick: datosFormato }), boton('Buscar campos de nuevo', { icono: 'revisar', onclick: redetectar }), boton('Quitar formato', { icono: 'basura', onclick: quitar }),
      boton('Listo', { icono: 'check', tipo: 'primario', onclick: async () => { await guardar(true); location.hash = ctx.ruta('sst.formatos'); } })]
    : [ll?.faena_id ? boton('Completar con la faena', { icono: 'camion', onclick: reproponer }) : null,
      ctx.puede('sst', 'editar') ? boton('Ajustar campos', { icono: 'ajustes', onclick: () => { location.hash = ctx.ruta('sst.formatos', { id: f.id, modo: 'ajustar' }); } }) : null,
      ll && puedeEscribir ? boton('Quitar', { icono: 'basura', onclick: quitar }) : null,
      boton('Imprimir PDF', { icono: 'descargar', tipo: 'primario', onclick: (ev) => imprimir(ev.currentTarget) })];
  const ayuda = ajustar
    ? 'Arrastra sobre la hoja para crear un campo (un toque crea uno de texto). Toca un campo para cambiar su tipo, decir con qué dato se rellena solo, moverlo o eliminarlo. Los cambios se guardan solos.'
    : 'Escribe en los espacios y toca las casillas (✓ cumple, x no cumple, N no aplica). Para escribir donde no hay campo, toca esa parte de la hoja. Lo que quede vacío se completa en terreno. "Imprimir PDF" deja el formato del cliente tal cual, con lo escrito.';
  const pantalla = el('section', { class: 'listado' }, volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, titulo), el('p', { class: 'texto-suave' }, [ll ? fechaLarga(ll.fecha) : null, estado.textContent ? null : null].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, estado, acciones)),
    el('p', { class: 'texto-suave texto-chico' }, ayuda),
    !ajustar && !ll ? el('p', { class: 'aviso-bandeja' }, 'Vista del formato. Para rellenarlo, vuelve y toca Rellenar.') : null,
    el('div', { class: 'fm-grid' }, paginas, ajustar ? panel : null));
  pantallaEl = pantalla;
  requestAnimationFrame(() => pintarPaginas().catch((e) => avisar(e.message, 'error')));
  return pantalla;
}
