// Proyectos: datos compartidos de las vistas (proyectos, partidas, modelos de SketchUp), cálculos (totales con IVA),
// vínculo con el inventario del modelo y el selector de proyecto. Migrado del prototipo cotizador.html.
import { el } from '../../core/ui/dom.js?v=40804ef';
import { icono } from '../../core/ui/iconos.js?v=40804ef';
import { boton } from '../../core/ui/tabla.js?v=40804ef';
import { abrirFormulario } from '../../core/ui/modal.js?v=40804ef';
import { avisar } from '../../core/ui/aviso.js?v=40804ef';
import { dinero } from '../../core/ui/formato.js?v=40804ef';
import { urlFirmada, urlsFirmadas, subirArchivo, almacen } from '../../core/adjuntos.js?v=40804ef';

export const ESTADOS = [['por_cotizar', 'Por cotizar'], ['cotizado', 'Cotizado'], ['aprobado', 'Aprobado'],
  ['comprado', 'Comprado'], ['alternativa', 'Alternativa'], ['descartado', 'Descartado']];
export const NOMBRE_ESTADO = Object.fromEntries(ESTADOS);
export const NO_SUMA = new Set(['alternativa', 'descartado']);
export const CATEGORIAS = ['Material', 'Mueble', 'Iluminación', 'Fabricación', 'Equipamiento', 'Servicio', 'Decoración'];
export const UNIDADES = ['un', 'm', 'm²', 'gl', 'kg', 'caja', 'pa'];
export const FUENTES = [['usuario', 'Tu lista'], ['modelo', 'Modelo SketchUp'], ['estimado', 'Estimado']];
export const IVA = 0.19;

// ---------------------------------------------------------------- Cálculos
export const clp = (n) => dinero(n);
export const tienePrecio = (x) => Number(x.precio) > 0;
export const subtotal = (x) => (Number(x.precio) || 0) * (Number(x.cantidad) || 0);
export const vigentes = (l) => l.filter((x) => !NO_SUMA.has(x.estado));
export const suma = (l) => vigentes(l).reduce((s, x) => s + subtotal(x), 0);
export const sinPrecioN = (l) => vigentes(l).filter((x) => !tienePrecio(x)).length;
export const gDe = (x) => x.grupo || 'General';
export const alerta = (x) => /revisar|confirmar|medir/i.test(x.nota || '');
export const esArchivo = (u) => !!u && !/^https?:/i.test(u);
export const neto = (total) => total / (1 + IVA);

// "General" primero, el resto como vienen y las que empiezan con "Del modelo" al final
export function ordenGrupos(gs) {
  const peso = (g) => (/^general$/i.test(g) ? 0 : /^del modelo/i.test(g) ? 3 : 1);
  return [...gs].sort((a, b) => peso(a) - peso(b));
}
export const zonasDe = (p, partidas) => [...new Set([...(p?.zonas ?? []), ...partidas.map((x) => x.zona)])];

// Números: "12.990", "$12.990", "12990" (precio) y "1,5" o "1.5" (cantidad). null = vacío, undefined = no válido.
export function leerNum(s, campo) {
  s = String(s ?? '').replace(/[$\s]/g, '');
  if (s === '') return null;
  if (campo === 'precio' || s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return Number.isNaN(v) || v < 0 ? undefined : v;
}
export const fmtNum = (v, campo) => (v == null || v === '' ? '' : campo === 'precio'
  ? Math.round(Number(v)).toLocaleString('es-CL') : String(Number(v)).replace('.', ','));
export const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const fechaCL = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '');
export const hoyLargo = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------- Preferencias del navegador (por empresa)
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
export const actualGuardado = (ctx) => lsGet(`isg.proyectos.actual.${ctx.empresa.id}`, null);
export const guardarActual = (ctx, id) => lsSet(`isg.proyectos.actual.${ctx.empresa.id}`, id);
// Lo desplegado (zonas y áreas): todo parte cerrado y se recuerda lo que el usuario abre
export function plegado(ctx) {
  const k = `isg.proyectos.abiertos.${ctx.empresa.id}`;
  const abiertos = lsGet(k, {});
  return {
    abierto: (c) => abiertos[c] === true,
    poner: (c, v) => { if (v) abiertos[c] = true; else delete abiertos[c]; lsSet(k, abiertos); },
    alternar(c) { this.poner(c, !this.abierto(c)); },
  };
}

// ---------------------------------------------------------------- Base de datos
const revisar = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

export async function cargarProyectos(ctx) {
  const [p, m] = await Promise.all([
    ctx.api.from('pro_proyectos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('orden').order('created_at'),
    ctx.api.from('pro_modelos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('created_at'),
  ]);
  return { proyectos: revisar(p), modelos: revisar(m) };
}

export async function cargarPartidas(ctx, proyectoId) {
  return revisar(await ctx.api.from('pro_partidas').select('*').eq('empresa_id', ctx.empresa.id)
    .eq('proyecto_id', proyectoId).is('deleted_at', null).order('orden').order('created_at'));
}

// Todo lo que una vista necesita del proyecto elegido (o el primero)
export async function cargarTodo(ctx) {
  const { proyectos, modelos } = await cargarProyectos(ctx);
  const pedido = ctx.params.p || actualGuardado(ctx);
  const proyecto = proyectos.find((p) => p.id === pedido) ?? proyectos[0] ?? null;
  if (proyecto) guardarActual(ctx, proyecto.id);
  const partidas = proyecto ? await cargarPartidas(ctx, proyecto.id) : [];
  const modelo = modeloDe(proyecto, modelos);
  const inventario = modelo ? await cargarInventario(ctx, modelo).catch(() => null) : null;
  return { proyectos, modelos, proyecto, partidas, modelo, inventario };
}

export async function guardarPartida(ctx, x, cambios) {
  const r = await ctx.api.from('pro_partidas').update(cambios).eq('id', x.id).select('*').single();
  revisar(r);
  Object.assign(x, r.data);
  return x;
}
export async function guardarProyecto(ctx, p, cambios) {
  const r = await ctx.api.from('pro_proyectos').update(cambios).eq('id', p.id).select('*').single();
  revisar(r);
  Object.assign(p, r.data);
  return p;
}
export async function insertarPartidas(ctx, filas) {
  return revisar(await ctx.api.from('pro_partidas').insert(filas.map((f) => ({ empresa_id: ctx.empresa.id, ...f }))).select('*'));
}
export async function crearProyecto(ctx, { nombre, cliente = '' }, orden = 0) {
  return revisar(await ctx.api.from('pro_proyectos').insert({ empresa_id: ctx.empresa.id, nombre, cliente, zonas: ['General'], orden })
    .select('*').single());
}

// Orden para insertar entre dos filas (orden de punto flotante; si no cabe se renumera)
export function ordenEntre(antes, despues) {
  if (antes == null && despues == null) return 1024;
  if (antes == null) return despues - 1024;
  if (despues == null) return antes + 1024;
  return (antes + despues) / 2;
}
// Renumera el orden de las partidas de un proyecto si dos quedaron muy juntas
export async function renumerar(ctx, partidas) {
  const cambios = partidas.map((x, i) => ({ x, orden: (i + 1) * 1024 })).filter((c) => c.x.orden !== c.orden);
  for (const c of cambios) { await guardarPartida(ctx, c.x, { orden: c.orden }); }
}

// ---------------------------------------------------------------- Modelo de SketchUp
export const normTxt = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Modelo del proyecto: el elegido; sin elegir, el que tiene el mismo código o nombre; sin_modelo = ninguno
export function modeloDe(p, modelos) {
  if (!p || p.sin_modelo) return null;
  if (p.modelo_id) return modelos.find((m) => m.id === p.modelo_id) ?? null;
  return modelos.find((m) => normTxt(m.nombre) === normTxt(p.nombre)) ?? null;
}

const cacheInv = new Map();
export async function cargarInventario(ctx, modelo) {
  if (!modelo?.inventario_ruta) return null;
  if (cacheInv.has(modelo.inventario_ruta)) return cacheInv.get(modelo.inventario_ruta);
  const url = await urlFirmada(ctx.api, modelo.inventario_ruta, 300);
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo leer el inventario del modelo.');
  const inv = await r.json();
  inv.items ??= [];
  cacheInv.set(modelo.inventario_ruta, inv);
  return inv;
}

export const llave2 = (c) => String(c || '').split('|').slice(1).join('|');   // la clave sin el recinto
export function mapasInv(inv) {
  const m = new Map(); const m2 = new Map(); const m3 = new Map(); const mn = new Map();
  for (const it of inv?.items ?? []) {
    m.set(it.clave, it);
    const k = llave2(it.clave); m2.set(k, (m2.get(k) || 0) + it.cant);
    if (it.m3d) { if (!m3.has(k)) m3.set(k, it.m3d); if (!mn.has(it.nombre)) mn.set(it.nombre, it.m3d); }
  }
  return { inv, m, m2, m3, mn };
}
// Cantidad según el modelo: { cant, dif } | { cant, fija } | { falta } | { presente } | null (sin vínculo)
export function estadoModelo(x, mp) {
  if ((!x.clave && !x.modelo) || !mp?.inv) return null;
  let base;
  if (x.modelo) {
    const its = mp.inv.items.filter((i) => i.nombre === x.modelo && i.tipo !== 'pieza');
    if (its.length) base = its.reduce((s, i) => s + i.cant, 0);
    else if (mp.inv.items.some((i) => i.padre === x.modelo)) return { presente: true };
  } else {
    const it = mp.m.get(x.clave);
    base = it ? it.cant : mp.m2.get(llave2(x.clave));
  }
  if (base === undefined) return { falta: true };
  const cant = Math.ceil(base * (Number(x.factor) || 1) - 1e-9);
  const dif = Number(x.cantidad) !== cant;
  return x.fija && dif ? { cant, fija: true } : { cant, dif };
}
export function m3dDe(x, mp) {
  if (!mp?.inv) return null;
  if (x.modelo) return mp.mn.get(x.modelo) || null;
  if (!x.clave) return null;
  const it = mp.m.get(x.clave);
  return it?.m3d || mp.m3.get(llave2(x.clave)) || null;
}
// Objetos del inventario que corresponden a una partida
export function instanciasDe(x, inv) {
  if (!inv) return [];
  if (x.modelo) return inv.items.filter((i) => i.nombre === x.modelo && i.tipo !== 'pieza');
  if (!x.clave) return [];
  const exacto = inv.items.find((i) => i.clave === x.clave);
  return exacto ? [exacto] : inv.items.filter((i) => llave2(i.clave) === llave2(x.clave));
}
export const medTxt = (m) => `${(m || []).map((v) => String(v).replace('.', ',')).join(' x ')} cm`;

// Texto y botón del vínculo con el modelo bajo el ítem
export function chipModelo(em, alUsar) {
  if (!em) return null;
  if (em.falta) return el('div', { class: 'pro-modelo pro-modelo-falta' }, 'Ya no está en el modelo');
  if (em.fija) return el('div', { class: 'pro-modelo' }, `Modelo: ${em.cant} · se mantiene la tuya`);
  if (em.dif) return el('div', { class: 'pro-modelo pro-modelo-dif' }, `Modelo: ${em.cant} `,
    alUsar ? el('button', { type: 'button', onclick: () => alUsar(em.cant) }, 'Usar') : null);
  if (em.presente) return el('div', { class: 'pro-modelo' }, 'Está en el modelo');
  return null;
}

// ---------------------------------------------------------------- Interfaz común
export function cargarEstilos() {
  if (document.getElementById('proyectos-css')) return;
  document.head.append(el('link', { id: 'proyectos-css', rel: 'stylesheet', href: new URL('./proyectos.css?v=40804ef', import.meta.url).href }));
}

// Pestañas de proyecto (arriba de cada vista) y "Nuevo proyecto"
export function selectorProyecto(ctx, d, vista) {
  const ir = (id) => { guardarActual(ctx, id); location.hash = ctx.ruta(vista, { p: id }); };
  const nuevo = ctx.puede('proyectos', 'crear')
    ? boton('Nuevo proyecto', { icono: 'carpeta', onclick: () => abrirFormulario({
      titulo: 'Nuevo proyecto',
      campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, ayuda: 'Si se llama igual que un modelo exportado de SketchUp, queda ligado solo.' },
        { id: 'cliente', etiqueta: 'Cliente' }],
      alGuardar: async (v) => {
        const p = await crearProyecto(ctx, { nombre: v.nombre.trim(), cliente: (v.cliente || '').trim() }, d.proyectos.length);
        avisar('Proyecto creado'); ir(p.id);
      },
    }) }) : null;
  return el('div', { class: 'pro-selector' },
    el('div', { class: 'segmento pro-proyectos', role: 'group', 'aria-label': 'Proyecto' },
      d.proyectos.map((p) => el('button', { type: 'button', 'aria-pressed': String(p.id === d.proyecto?.id), onclick: () => ir(p.id) }, p.nombre))),
    nuevo);
}

export function sinProyectos(ctx, d, titulo) {
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, titulo)),
    selectorProyecto(ctx, d, 'proyectos.hoja'),
    el('div', { class: 'pro-vacio' }, icono('carpeta', { tam: 30 }),
      el('p', {}, 'Aún no hay proyectos.'),
      el('p', { class: 'texto-suave' }, ctx.puede('proyectos', 'crear') ? 'Crea uno con "Nuevo proyecto", o trae los del prototipo desde Modelo SketchUp → Traer respaldo.' : 'Pide a quien administra que cree el primero.')));
}

// Abre el link de una partida: página web directo; archivo propio con URL firmada
export async function abrirLink(ctx, url) {
  if (!url) return;
  const destino = esArchivo(url) ? await urlFirmada(ctx.api, url, 300) : url;
  window.open(destino, '_blank', 'noopener');
}
// URL para mostrar las imágenes (las propias con URL firmada)
export async function urlsImagenes(ctx, partidas) {
  const propias = [...new Set(partidas.map((x) => x.img).filter(esArchivo))];
  const firmadas = propias.length ? await urlsFirmadas(ctx.api, propias, 3600).catch(() => new Map()) : new Map();
  return (img) => (!img ? null : esArchivo(img) ? firmadas.get(img) ?? null : img);
}

const archivoDe = (f) => (f instanceof File && f.size ? f : null);

// Ficha completa de una partida (o nueva con valores prellenados). alGuardar(fila guardada)
export function fichaPartida(ctx, d, x, { prellenado = null, alGuardar } = {}) {
  const base = x ?? prellenado ?? { zona: zonasDe(d.proyecto, d.partidas)[0] ?? 'General', estado: 'por_cotizar', fuente: 'usuario', unidad: 'un', cantidad: 1 };
  const unicos = (k) => [...new Set(d.partidas.map((y) => y[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const editable = x ? ctx.puede('proyectos', 'editar') : ctx.puede('proyectos', 'crear');
  abrirFormulario({
    titulo: x ? 'Ficha de la partida' : 'Nueva partida',
    textoGuardar: editable ? 'Guardar' : 'Cerrar',
    campos: [
      { id: 'item', etiqueta: 'Ítem', requerido: true, valor: base.item ?? '' },
      { id: 'detalle', etiqueta: 'Detalle (medidas, color, referencia)', valor: base.detalle ?? '' },
      { id: 'sku', etiqueta: 'Código o SKU', valor: base.sku ?? '' },
      { id: 'material', etiqueta: 'Material común', valor: base.material ?? '', sugerencias: unicos('material'), ayuda: 'Las partidas con el mismo material común se juntan en la lista de compra.' },
      { id: 'zona', etiqueta: 'Zona', requerido: true, valor: base.zona ?? '', sugerencias: zonasDe(d.proyecto, d.partidas) },
      { id: 'grupo', etiqueta: 'Área', valor: base.grupo ?? '', sugerencias: unicos('grupo'), ayuda: 'Vacío = General.' },
      { id: 'categoria', etiqueta: 'Categoría', valor: base.categoria ?? '', sugerencias: [...new Set([...CATEGORIAS, ...unicos('categoria')])] },
      { id: 'estado', etiqueta: 'Estado', opciones: ESTADOS, valor: base.estado ?? 'por_cotizar' },
      { id: 'cantidad', etiqueta: 'Cantidad', valor: fmtNum(base.cantidad, 'cantidad'), ayuda: 'Admite decimales (1,5).' },
      { id: 'unidad', etiqueta: 'Unidad', valor: base.unidad ?? 'un', sugerencias: UNIDADES },
      { id: 'precio', etiqueta: 'Precio unitario (con IVA)', valor: fmtNum(base.precio, 'precio'), ayuda: 'Vacío = por cotizar.' },
      { id: 'tienda', etiqueta: 'Proveedor', valor: base.tienda ?? '', sugerencias: unicos('tienda') },
      { id: 'fecha_precio', etiqueta: 'Fecha del precio', tipo: 'date', valor: base.fecha_precio ?? '' },
      { id: 'url', etiqueta: 'Link (tienda o archivo)', valor: esArchivo(base.url) ? '' : base.url ?? '', ayuda: esArchivo(base.url) ? 'Tiene un archivo subido; escribe un link para reemplazarlo.' : 'https://…' },
      { id: 'archivo', etiqueta: 'O subir un archivo (plano PDF)', tipo: 'file', accept: 'application/pdf,image/*', multiple: false },
      { id: 'img', etiqueta: 'Imagen (link)', valor: esArchivo(base.img) ? '' : base.img ?? '', ayuda: esArchivo(base.img) ? 'Tiene una imagen subida; escribe un link para reemplazarla.' : 'https://…' },
      { id: 'imagen', etiqueta: 'O subir una imagen', tipo: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: false },
      { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', filas: 2, valor: base.nota ?? '', ayuda: 'Con "revisar", "confirmar" o "medir" se muestra como alerta.' },
      { id: 'fuente', etiqueta: 'La cantidad sale de', opciones: FUENTES, valor: base.fuente ?? 'usuario' },
      { id: 'factor', etiqueta: 'Unidades por objeto del modelo', valor: fmtNum(base.factor, 'cantidad'), ayuda: 'Ej.: 3 listones por hilera. Vacío = 1.' },
      { id: 'fija', etiqueta: 'Cantidad fija', opciones: [['no', 'Se compara con el modelo'], ['si', 'Se mantiene la mía aunque el modelo cambie']], valor: base.fija ? 'si' : 'no' },
    ],
    alGuardar: async (v) => {
      if (!editable) return;
      const cantidad = leerNum(v.cantidad, 'cantidad'); const precio = leerNum(v.precio, 'precio'); const factor = leerNum(v.factor, 'cantidad');
      if (cantidad === undefined) throw new Error('La cantidad debe ser un número mayor o igual a 0.');
      if (precio === undefined) throw new Error('El precio debe ser un número mayor o igual a 0.');
      if (factor === undefined || factor === 0) throw new Error('Las unidades por objeto deben ser mayores que 0.');
      const link = (s) => { s = (s || '').trim(); if (s && !/^https?:\/\//i.test(s)) throw new Error('Los links deben empezar con https://'); return s; };
      const cambios = {
        item: v.item.trim(), detalle: v.detalle.trim(), sku: v.sku.trim(), material: v.material.trim(), zona: v.zona.trim() || 'General',
        grupo: v.grupo.trim() === 'General' ? '' : v.grupo.trim(), categoria: v.categoria.trim(), estado: v.estado, cantidad, unidad: v.unidad.trim(),
        precio, tienda: v.tienda.trim(), nota: v.nota.trim(), fuente: v.fuente, factor, fija: v.fija === 'si',
        fecha_precio: v.fecha_precio || (precio && precio !== Number(base.precio) ? hoyISO() : base.fecha_precio ?? null),
        url: link(v.url) || (esArchivo(base.url) ? base.url : ''), img: link(v.img) || (esArchivo(base.img) ? base.img : ''),
      };
      if (!x) Object.assign(cambios, { proyecto_id: d.proyecto.id, clave: base.clave ?? null, modelo: base.modelo ?? null, orden: ordenEntre(d.partidas.at(-1)?.orden, null) });
      let fila = x ? await guardarPartida(ctx, x, cambios) : (await insertarPartidas(ctx, [cambios]))[0];
      const sube = async (archivo, campo) => {
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'proyectos', archivo, tabla: 'pro_partidas', registroId: fila.id });
        fila = await guardarPartida(ctx, fila, { [campo]: ruta });
      };
      if (archivoDe(v.archivo)) await sube(archivoDe(v.archivo), 'url');
      if (archivoDe(v.imagen)) await sube(archivoDe(v.imagen), 'img');
      if (!d.proyecto.zonas.includes(fila.zona)) await guardarProyecto(ctx, d.proyecto, { zonas: [...d.proyecto.zonas, fila.zona] });
      avisar(x ? 'Partida actualizada' : 'Partida agregada');
      alGuardar?.(fila);
    },
  });
}

// ---------------------------------------------------------------- Subir la exportación de SketchUp
// Archivos del exportador: inventario_<id>.json (o .js) y la carpeta modelos3d_<id> con un .js por mueble.
const leerJsInventario = (txt) => {
  const t = txt.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const i = t.indexOf('{'); const j = t.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('El archivo no es un inventario del exportador.');
  return JSON.parse(t.slice(i, j + 1));
};
// window.M3D_LISTO("<id>", "<nombre>", {…}) → { id, nombre, datos }
export function leerMalla(txt) {
  const m = txt.match(/M3D_LISTO\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('formato');
  return { id: JSON.parse(m[1]), nombre: JSON.parse(m[2]), datos: JSON.parse(m[3]) };
}

export function subirExportacion(ctx, d, alTerminar) {
  const estado = el('p', { class: 'texto-suave', 'aria-live': 'polite' }, 'Elige el inventario y, si tiene muebles en 3D, la carpeta de mallas.');
  const inv = el('input', { type: 'file', class: 'campo', accept: '.json,.js,application/json,text/javascript', id: 'pro-inv' });
  const carpeta = el('input', { type: 'file', class: 'campo', id: 'pro-mallas', multiple: true, accept: '.js' });
  const proyectoSel = el('select', { class: 'campo', id: 'pro-del-proyecto' }, el('option', { value: '' }, 'Ninguno por ahora'),
    d.proyectos.map((p) => el('option', { value: p.id, selected: p.id === d.proyecto?.id }, p.nombre)));
  carpeta.webkitdirectory = true;
  const subir = boton('Subir', { tipo: 'primario', type: 'submit' });
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const form = el('form', { class: 'modal-cuerpo' },
    el('p', { class: 'modal-mensaje' }, 'Sube lo que escribe exportar_al_cotizador.rb en la carpeta COTIZADOR PROYECTOS. Las mallas que ya están subidas no se vuelven a subir.'),
    el('div', { class: 'form-fila' }, el('label', { for: 'pro-inv' }, 'Inventario (inventario_<id>.json)'), inv),
    el('div', { class: 'form-fila' }, el('label', { for: 'pro-mallas' }, 'Carpeta de mallas 3D (modelos3d_<id>)'), carpeta),
    el('div', { class: 'form-fila' }, el('label', { for: 'pro-del-proyecto' }, 'Proyecto de este modelo'), proyectoSel,
      el('span', { class: 'texto-suave texto-chico' }, 'El modelo toma su nombre y queda ligado a él.')),
    estado, error,
    el('div', { class: 'modal-pie' }, boton('Cancelar', { onclick: () => cerrar() }), subir));
  const dialogo = el('dialog', { class: 'modal', 'aria-label': 'Subir exportación de SketchUp' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, 'Subir exportación de SketchUp'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))), form);
  const cerrar = () => { dialogo.close(); dialogo.remove(); };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); error.textContent = '';
    const archivo = inv.files[0];
    if (!archivo) { error.textContent = 'Elige el archivo del inventario.'; return; }
    subir.disabled = true; subir.classList.add('cargando');
    try {
      const datos = leerJsInventario(await archivo.text());
      if (!Array.isArray(datos.items)) throw new Error('El archivo no es un inventario del exportador (no trae items).');
      const codigo = String(datos.proyecto || archivo.name.replace(/^inventario_|\.(json|js)$/g, '')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'modelo';
      const elegido = d.proyectos.find((p) => p.id === proyectoSel.value) ?? null;
      const nombre = elegido?.nombre || datos.nombre || d.proyectos.find((p) => normTxt(p.nombre) === normTxt(codigo))?.nombre || codigo;
      // El modelo: el mismo código ya subido o uno nuevo
      let modelo = d.modelos.find((m) => m.codigo === codigo);
      if (!modelo) {
        modelo = revisar(await ctx.api.from('pro_modelos').insert({ empresa_id: ctx.empresa.id, codigo, nombre, archivo: datos.archivo ?? null, fecha: datos.fecha ?? null })
          .select('*').single());
      }
      estado.textContent = 'Subiendo el inventario…';
      const json = new File([JSON.stringify(datos)], `inventario_${codigo}.json`, { type: 'application/json' });
      const ruta = `${ctx.empresa.id}/proyectos/${modelo.id}/inventario-${Date.now()}.json`;
      const sub = await almacen(ctx.api).upload(ruta, json, { contentType: 'application/json' });
      if (sub.error) throw new Error(`No se pudo subir el inventario: ${sub.error.message}`);
      const anterior = modelo.inventario_ruta;
      modelo = revisar(await ctx.api.from('pro_modelos').update({ nombre: elegido ? nombre : modelo.nombre || nombre, archivo: datos.archivo ?? modelo.archivo, fecha: datos.fecha ?? null, inventario_ruta: ruta, n_items: datos.items.length })
        .eq('id', modelo.id).select('*').single());
      if (anterior) await almacen(ctx.api).remove([anterior]).catch(() => {});
      // Mallas nuevas
      const { data: ya } = await ctx.api.from('pro_mallas').select('m3d').eq('modelo_id', modelo.id).is('deleted_at', null);
      const tiene = new Set((ya ?? []).map((m) => m.m3d));
      const usadas = new Set(datos.items.map((i) => i.m3d).filter(Boolean));
      const archivos = [...carpeta.files].filter((f) => /\.js$/i.test(f.name) && usadas.has(f.name.replace(/\.js$/i, '')) && !tiene.has(f.name.replace(/\.js$/i, '')));
      let n = 0; let malas = 0;
      for (const f of archivos) {
        estado.textContent = `Subiendo mallas 3D: ${n + 1} de ${archivos.length}…`;
        try {
          const m = leerMalla(await f.text());
          const r = `${ctx.empresa.id}/proyectos/${modelo.id}/${m.id}.json`;
          const s = await almacen(ctx.api).upload(r, new File([JSON.stringify(m.datos)], `${m.id}.json`, { type: 'application/json' }), { contentType: 'application/json' });
          if (s.error) throw new Error(s.error.message);
          revisar(await ctx.api.from('pro_mallas').insert({ empresa_id: ctx.empresa.id, modelo_id: modelo.id, m3d: m.id, nombre: m.nombre, ruta: r }));
          n++;
        } catch { malas++; }
      }
      if (elegido && elegido.modelo_id !== modelo.id) await guardarProyecto(ctx, elegido, { modelo_id: modelo.id, sin_modelo: false });
      const faltan = [...usadas].filter((id) => !tiene.has(id)).length - n;
      cerrar();
      avisar(`Modelo "${modelo.nombre}" al día: ${datos.items.length} objetos, ${n} mallas nuevas${malas ? `, ${malas} no se pudieron leer` : ''}${faltan > 0 ? `, ${faltan} sin archivo` : ''}.`, malas ? 'error' : 'ok');
      alTerminar?.(modelo);
    } catch (e) {
      error.textContent = e.message;
    } finally { subir.disabled = false; subir.classList.remove('cargando'); }
  });
  document.body.append(dialogo);
  dialogo.showModal();
}

// ---------------------------------------------------------------- Traer el respaldo del prototipo
// Respaldo JSON del botón "Respaldo" del prototipo: { proyectos, partidas, borradas, base_version }
export function traerRespaldo(ctx, d, alTerminar) {
  abrirFormulario({
    titulo: 'Traer respaldo del prototipo',
    mensaje: 'Carga los proyectos y partidas del respaldo JSON del cotizador local (botón "Respaldo"). Se agregan como proyectos nuevos; los que ya existen con el mismo nombre se saltan.',
    textoGuardar: 'Traer',
    campos: [{ id: 'archivo', etiqueta: 'Respaldo (.json)', tipo: 'file', accept: 'application/json,.json', multiple: false, requerido: true }],
    alGuardar: async (v) => {
      const f = archivoDe(v.archivo);
      if (!f) throw new Error('Elige el archivo del respaldo.');
      let r; try { r = JSON.parse(await f.text()); } catch { throw new Error('El archivo no es un respaldo del cotizador.'); }
      if (!Array.isArray(r.proyectos) || !Array.isArray(r.partidas)) throw new Error('El archivo no es un respaldo del cotizador.');
      const borradas = new Set(r.borradas ?? []);
      let np = 0; let nx = 0;
      for (const p of r.proyectos) {
        if (d.proyectos.some((q) => normTxt(q.nombre) === normTxt(p.nombre))) continue;
        const nuevo = await crearProyecto(ctx, { nombre: p.nombre, cliente: p.cliente || '' }, d.proyectos.length + np);
        const modelo = p.inventario && p.inventario !== '-' ? d.modelos.find((m) => m.codigo === p.inventario) : null;
        await guardarProyecto(ctx, nuevo, { zonas: p.zonas?.length ? p.zonas : ['General'], sin_modelo: p.inventario === '-', modelo_id: modelo?.id ?? null });
        const num = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? null : Number(n));
        const fecha = (t) => (/^\d{2}-\d{2}-\d{4}$/.test(t || '') ? t.split('-').reverse().join('-') : null);
        const link = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
        const filas = r.partidas.filter((x) => x.proyecto === p.id && !borradas.has(x.id)).map((x, i) => ({
          proyecto_id: nuevo.id, zona: x.zona || 'General', grupo: x.grupo || '', categoria: x.categoria || '', item: x.item || '', detalle: x.detalle || '',
          material: x.material || '', unidad: x.unidad || 'un', cantidad: num(x.cantidad), precio: num(x.precio) == null ? null : Math.round(num(x.precio)),
          fecha_precio: fecha(x.fecha_precio), tienda: x.tienda || '', sku: x.sku || '', url: link(x.url), img: link(x.img),
          estado: NOMBRE_ESTADO[x.estado] ? x.estado : 'por_cotizar', fuente: ['usuario', 'modelo', 'estimado'].includes(x.fuente) ? x.fuente : 'usuario',
          nota: [x.nota, x.url && !link(x.url) ? `Archivo local: ${x.url}` : ''].filter(Boolean).join(' · '),
          clave: x.clave || null, modelo: x.modelo || null, factor: num(x.factor) || null, fija: !!x.fija, orden: (i + 1) * 1024,
        }));
        for (let i = 0; i < filas.length; i += 200) await insertarPartidas(ctx, filas.slice(i, i + 200));
        np++; nx += filas.length;
      }
      avisar(`${np} ${np === 1 ? 'proyecto traído' : 'proyectos traídos'} con ${nx} partidas.`);
      alTerminar?.();
    },
  });
}
