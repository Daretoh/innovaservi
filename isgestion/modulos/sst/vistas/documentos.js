// Documentos preventivos con control de versiones: lista por tipo con la versión vigente y la próxima
// revisión; detalle con el historial de versiones, subir nueva versión y ver cualquiera.
// Rutas: #/sst.documentos · #/sst.documentos?id=<documento>
import { el } from '../../../core/ui/dom.js?v=0cc60b3';
import { icono } from '../../../core/ui/iconos.js?v=0cc60b3';
import { boton } from '../../../core/ui/tabla.js?v=0cc60b3';
import { abrirFormulario } from '../../../core/ui/modal.js?v=0cc60b3';
import { avisar } from '../../../core/ui/aviso.js?v=0cc60b3';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=0cc60b3';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=0cc60b3';

export const TIPOS_DOC = [['pts', 'Procedimiento de trabajo seguro (PTS)'], ['iper', 'Matriz IPER y procedimiento'], ['programa', 'Programa preventivo'],
  ['ley_karin', 'Protocolo Ley Karin'], ['matriz_epp', 'Matriz de EPP'], ['capacitacion', 'Material de capacitación'], ['evaluacion', 'Evaluación de aprendizaje'],
  ['irl', 'Información de riesgos laborales (IRL)'], ['otro', 'Otro documento preventivo']];
const nombreTipo = Object.fromEntries(TIPOS_DOC);
export const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];

// Vigente = la versión más reciente; próxima revisión = fecha vigente + revisar_meses
export function estadoDocumento(d) {
  const v = [...(d.sst_documento_versiones ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))[0] ?? null;
  if (!v) return { vigente: null, k: 'sin', texto: 'Sin versión' };
  if (!d.revisar_meses) return { vigente: v, k: 'ok', texto: 'Vigente' };
  const r = new Date(`${v.fecha}T12:00`); r.setMonth(r.getMonth() + d.revisar_meses);
  const revisar = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`;
  const dias = Math.round((new Date(`${revisar}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 864e5);
  return { vigente: v, revisar, k: dias < 0 ? 'venc' : dias <= 30 ? 'prox' : 'ok', texto: dias < 0 ? `Revisión vencida (${fechaLarga(revisar)})` : `Revisar el ${fechaLarga(revisar)}` };
}
export const CHIP = { venc: 'chip-venc', prox: 'chip-prox', ok: 'chip-ok', sin: 'chip-pend' };
const puedeIA = (ctx) => ctx.puede('sst', 'crear') || ctx.puede('sst', 'editar');

export default async function vista(ctx) {
  return ctx.params.id ? detalle(ctx) : lista(ctx);
}

const abrir = async (ctx, ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } };

export const cargarCategorias = async (ctx) => (await ctx.api.from('sst_doc_categorias').select('id, nombre, orden').eq('empresa_id', ctx.empresa.id).order('orden').order('nombre')).data ?? [];

async function formDocumento(ctx, d = null, categoriaId = null) {
  const cats = await cargarCategorias(ctx);
  abrirFormulario({
    titulo: d ? d.titulo : 'Nuevo documento preventivo',
    campos: [
      { id: 'categoria', etiqueta: 'Categoría (carpeta donde queda)', opciones: [['', 'Sin categoría'], ...cats.map((c) => [c.id, c.nombre])], valor: d ? d.categoria_id ?? '' : categoriaId ?? cats[0]?.id ?? '' },
      { id: 'tipo', etiqueta: 'Tipo de documento', opciones: TIPOS_DOC, valor: d?.tipo ?? 'pts', ayuda: 'Sirve para las entregas (por ejemplo, un PTS se entrega como PTS).' },
      { id: 'codigo', etiqueta: 'Código (opcional)', valor: d?.codigo ?? '', ayuda: 'Ej.: PTS-001' },
      { id: 'titulo', etiqueta: 'Título', requerido: true, valor: d?.titulo ?? '' },
      { id: 'area', etiqueta: 'Proceso, faena o área', valor: d?.area ?? '' },
      { id: 'revisar', etiqueta: 'Revisar cada (meses, vacío = sin revisión periódica)', tipo: 'number', valor: d?.revisar_meses ?? '12' },
      ...(d ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Vigente en uso'], ['false', 'Obsoleto (fuera de uso)']], valor: String(d.activo) }] : []),
      ...(d ? [] : [{ id: 'version', etiqueta: 'Versión inicial', valor: '1' }, { id: 'fecha', etiqueta: 'Fecha de aprobación', tipo: 'date', valor: hoyISO() },
        { id: 'aprobado', etiqueta: 'Aprobado por' }, { id: 'archivo', etiqueta: 'Archivo (PDF, Word, Excel, PowerPoint o imagen). Vacío = escribirlo aquí en el editor', tipo: 'file', accept: ARCHIVOS.join(',') }]),
    ],
    alGuardar: async (v) => {
      const revisar = v.revisar === '' ? null : Math.round(Number(v.revisar));
      const datos = { categoria_id: v.categoria || null, tipo: v.tipo, codigo: v.codigo.trim() || null, titulo: v.titulo.trim(), area: v.area.trim() || null, revisar_meses: revisar || null, ...(d ? { activo: v.activo === 'true' } : {}) };
      if (d) {
        const { error } = await ctx.api.from('sst_documentos').update(datos).eq('id', d.id);
        if (error) throw new Error(error.code === '23505' ? 'Ya existe un documento con ese código.' : error.message);
        avisar('Documento guardado.'); ctx.refrescar(); return;
      }
      const { data: doc, error } = await ctx.api.from('sst_documentos').insert({ ...datos, empresa_id: ctx.empresa.id }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Ya existe un documento con ese código.' : error.message);
      // Sin archivo: se escribe en el editor (Empezar en blanco) y se guarda como versión desde ahí
      if (!v.archivo?.size) { avisar('Documento creado: escríbelo y guárdalo como versión.'); location.hash = ctx.ruta('sst.editar', { id: doc.id }); return; }
      await guardarVersion(ctx, doc.id, { version: v.version || '1', fecha: v.fecha, aprobado: v.aprobado, cambios: 'Versión inicial', archivo: v.archivo });
      avisar('Documento creado.'); location.hash = ctx.ruta('sst.documentos', { id: doc.id });
    },
  });
}

export async function guardarVersion(ctx, documentoId, v) {
  const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'sst', archivo: v.archivo, tabla: 'sst_documento_versiones', registroId: documentoId, tipos: ARCHIVOS });
  const { error } = await ctx.api.from('sst_documento_versiones').insert({ documento_id: documentoId, empresa_id: ctx.empresa.id, version: String(v.version).trim(), fecha: v.fecha || hoyISO(),
    aprobado_por: v.aprobado?.trim() || null, cambios: v.cambios?.trim() || null, archivo: ruta, contenido: v.contenido ?? null });
  if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.code === '23505' ? 'Esa versión ya existe.' : error.message); }
}

// Lista por carpetas (2026-11-27, pedido de Enzo: "que sepamos qué estamos viendo"): buscador y filtros por estado
// arriba; cada categoría es una carpeta desplegable (cerradas salvo las que se dejaron abiertas, recordado en el
// navegador); dentro, una tabla con código, documento, versión vigente, estado y acciones. Los obsoletos van aparte.
async function lista(ctx) {
  css();
  const [res, cats] = await Promise.all([
    ctx.api.from('sst_documentos').select('*, sst_documento_versiones(id, version, fecha, archivo, created_at)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('codigo').order('titulo'),
    cargarCategorias(ctx),
  ]);
  if (res.error) throw res.error;
  const data = res.data.map((d) => ({ ...d, s: estadoDocumento(d) }));
  const activos = data.filter((d) => d.activo);
  const puede = { crear: ctx.puede('sst', 'crear'), editar: ctx.puede('sst', 'editar'), eliminar: ctx.puede('sst', 'eliminar') };

  // Carpetas abiertas (por empresa, en este navegador)
  const clave = `isg.sst.carpetas.${ctx.empresa.id}`;
  let abiertas = new Set();
  try { abiertas = new Set(JSON.parse(localStorage.getItem(clave) || '[]')); } catch { /* sin almacenamiento */ }
  const recordar = () => { try { localStorage.setItem(clave, JSON.stringify([...abiertas])); } catch { /* */ } };

  const mover = (d) => abrirFormulario({
    titulo: `Mover ${[d.codigo, d.titulo].filter(Boolean).join(' · ')}`,
    campos: [{ id: 'categoria', etiqueta: 'A la carpeta', opciones: [['', 'Sin carpeta'], ...cats.map((c) => [c.id, c.nombre])], valor: d.categoria_id ?? '' }],
    textoGuardar: 'Mover',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sst_documentos').update({ categoria_id: v.categoria || null }).eq('id', d.id);
      if (error) throw new Error(error.message);
      if (v.categoria) { abiertas.add(v.categoria); recordar(); }
      avisar('Documento movido.'); ctx.refrescar();
    },
  });
  const renombrar = (c) => abrirFormulario({
    titulo: 'Renombrar carpeta', campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c.nombre }, { id: 'orden', etiqueta: 'Orden (menor va primero)', tipo: 'number', valor: String(c.orden ?? 0) }],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sst_doc_categorias').update({ nombre: v.nombre.trim(), orden: Number(v.orden) || 0 }).eq('id', c.id);
      if (error) throw new Error(error.code === '23505' ? 'Ya hay una carpeta con ese nombre.' : error.message);
      avisar('Carpeta guardada.'); ctx.refrescar();
    },
  });
  const quitar = (c) => abrirFormulario({
    titulo: `Eliminar la carpeta ${c.nombre}`, mensaje: 'Está vacía: se elimina y no afecta a ningún documento.', campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { const { error } = await ctx.api.from('sst_doc_categorias').delete().eq('id', c.id); if (error) throw new Error(error.message); avisar('Carpeta eliminada.'); ctx.refrescar(); },
  });
  const nuevaCategoria = () => abrirFormulario({
    titulo: 'Nueva carpeta', campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, ayuda: 'Ej.: Documentos generales, Cermaq Chinquihue, Planes de emergencia.' }],
    alGuardar: async (v) => {
      const { data: c, error } = await ctx.api.from('sst_doc_categorias').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), orden: (cats.at(-1)?.orden ?? 0) + 1 }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Ya hay una carpeta con ese nombre.' : error.message);
      abiertas.add(c.id); recordar();
      avisar('Carpeta creada.'); ctx.refrescar();
    },
  });

  // ---------- Filtros ----------
  const ESTADOS = [['todos', 'Todos', (d) => d.activo], ['revisar', 'Por revisar', (d) => d.activo && d.s.k === 'prox'], ['venc', 'Revisión vencida', (d) => d.activo && d.s.k === 'venc'],
    ['borrador', 'Con borrador', (d) => d.activo && !!d.borrador], ['sin', 'Sin versión', (d) => d.activo && d.s.k === 'sin'], ['obsoletos', 'Obsoletos', (d) => !d.activo]];
  let estado = 'todos'; let texto = '';
  const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nombreCat = Object.fromEntries(cats.map((c) => [c.id, c.nombre]));
  const regla = (k) => ESTADOS.find((e) => e[0] === k)[2];
  const coincide = (d) => regla(estado)(d) && (!texto || norm([d.codigo, d.titulo, d.area, nombreTipo[d.tipo], nombreCat[d.categoria_id]].join(' ')).includes(texto));
  const cuantos = (k) => data.filter(regla(k)).length;

  // ---------- Una fila (documento) ----------
  const fila = (d) => {
    const s = d.s; const ir = ctx.ruta('sst.documentos', { id: d.id });
    return el('tr', { class: `sd-fila${d.activo ? '' : ' fila-inactiva'}`, onclick: (ev) => { if (!ev.target.closest('a, button')) location.hash = ir; } },
      el('td', { class: 'sd-cod' }, d.codigo ? el('span', { class: 'sd-codigo' }, d.codigo) : el('span', { class: 'texto-suave' }, '—')),
      el('td', { class: 'sd-doc' }, el('a', { href: ir, class: 'sd-titulo' }, d.titulo),
        d.borrador ? el('span', { class: 'chip chip-prox sd-chip' }, 'Borrador') : null,
        el('div', { class: 'texto-suave texto-chico' }, [nombreTipo[d.tipo], d.area].filter(Boolean).join(' · '))),
      el('td', { class: 'sd-ver texto-chico' }, s.vigente ? [el('strong', {}, `v${s.vigente.version}`), el('div', { class: 'texto-suave' }, fechaLarga(s.vigente.fecha))] : el('span', { class: 'texto-suave' }, 'Sin versión')),
      el('td', { class: 'sd-estado' }, d.activo ? el('span', { class: `chip ${CHIP[s.k]}` }, s.k === 'ok' ? 'Vigente' : s.k === 'sin' ? 'Sin versión' : s.k === 'venc' ? 'Vencida' : 'Por revisar') : el('span', { class: 'chip chip-na' }, 'Obsoleto'),
        s.revisar && d.activo ? el('div', { class: 'texto-suave texto-chico' }, `revisar ${fechaLarga(s.revisar)}`) : null),
      el('td', { class: 'sd-acc' },
        s.vigente ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver la versión vigente', 'aria-label': `Ver ${d.titulo}`, onclick: () => abrir(ctx, s.vigente.archivo) }, icono('ojo', { tam: 16 })) : null,
        el('a', { class: 'boton-icono', href: ctx.ruta('sst.editar', { id: d.id }), title: puedeIA(ctx) ? 'Abrir en el editor' : 'Ver documento', 'aria-label': `Editar ${d.titulo}` }, icono('editar', { tam: 16 })),
        puede.editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Mover a otra carpeta', 'aria-label': `Mover ${d.titulo}`, onclick: () => mover(d) }, icono('carpeta', { tam: 16 })) : null));
  };
  const tabla = (ds) => el('div', { class: 'sd-tabla-cont' }, el('table', { class: 'sd-tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Código'), el('th', {}, 'Documento'), el('th', {}, 'Vigente'), el('th', {}, 'Estado'), el('th', { 'aria-label': 'Acciones' }))),
    el('tbody', {}, ds.map(fila))));

  // ---------- Una carpeta ----------
  const carpeta = (id, nombre, ds, todos, c, filtrando) => {
    const venc = todos.filter((d) => d.activo && d.s.k === 'venc').length; const prox = todos.filter((d) => d.activo && d.s.k === 'prox').length;
    const bor = todos.filter((d) => d.activo && d.borrador).length;
    const accion = (ic, titulo, fn) => el('button', { type: 'button', class: 'boton-icono', title: titulo, 'aria-label': `${titulo}: ${nombre}`, onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); } }, icono(ic, { tam: 16 }));
    const det = el('details', { class: 'sd-carpeta', open: filtrando ? true : abiertas.has(id) },
      el('summary', {},
        el('span', { class: 'sd-flecha' }, icono('derecha', { tam: 16 })),
        icono('carpeta', { tam: 18 }),
        el('span', { class: 'sd-nombre' }, nombre),
        el('span', { class: 'sd-cuenta' }, filtrando && ds.length !== todos.length ? `${ds.length} de ${todos.length}` : `${todos.length} doc.`),
        venc ? el('span', { class: 'chip chip-venc' }, `${venc} vencida${venc === 1 ? '' : 's'}`) : null,
        prox ? el('span', { class: 'chip chip-prox' }, `${prox} por revisar`) : null,
        bor ? el('span', { class: 'chip chip-pend' }, `${bor} borrador${bor === 1 ? '' : 'es'}`) : null,
        el('span', { class: 'rv-espaciador' }),
        c ? el('span', { class: 'sd-acc-carpeta' },
          puede.crear ? accion('mas', 'Nuevo documento en esta carpeta', () => formDocumento(ctx, null, c.id)) : null,
          puede.editar ? accion('editar', 'Renombrar u ordenar', () => renombrar(c)) : null,
          puede.eliminar && !todos.length ? accion('basura', 'Eliminar carpeta (vacía)', () => quitar(c)) : null) : null),
      ds.length ? tabla(ds) : el('p', { class: 'texto-suave texto-chico sd-vacia' }, 'Carpeta vacía. Agrega un documento con el + o mueve uno aquí.'));
    det.addEventListener('toggle', () => { if (filtrando) return; if (det.open) abiertas.add(id); else abiertas.delete(id); recordar(); });
    return det;
  };

  // ---------- Pintar ----------
  const cuerpo = el('div', { class: 'sd-carpetas' });
  const resumen = el('p', { class: 'texto-suave texto-chico sd-resumen' });
  const filtros = el('div', { class: 'sd-filtros' });
  function pintar() {
    filtros.replaceChildren(...ESTADOS.map(([k, t]) => {
      const n = cuantos(k);
      if (k !== 'todos' && k !== estado && !n) return null;
      return el('button', { type: 'button', class: `sd-filtro${k === estado ? ' activo' : ''}${k === 'venc' ? ' alerta' : ''}`, 'aria-pressed': String(k === estado), onclick: () => { estado = k; pintar(); } }, t, el('span', {}, String(n)));
    }).filter(Boolean));
    const filtrando = !!texto || estado !== 'todos';
    const vis = data.filter(coincide);
    const enCarpeta = (id) => (d) => (id ? d.categoria_id === id : (!d.categoria_id || !nombreCat[d.categoria_id]));
    const base = estado === 'obsoletos' ? data.filter((d) => !d.activo) : activos;
    const bloques = [...cats.map((c) => [c.id, c.nombre, c]), [null, 'Sin carpeta', null]].map(([id, nombre, c]) => {
      const todos = base.filter(enCarpeta(id)); const ds = vis.filter(enCarpeta(id));
      if (filtrando && !ds.length) return null;
      if (!id && !todos.length) return null;
      return carpeta(id ?? 'sin', nombre, ds, todos, c, filtrando);
    }).filter(Boolean);
    const obsoletos = data.filter((d) => !d.activo);
    if (!filtrando && obsoletos.length) {
      const det = el('details', { class: 'sd-carpeta sd-obsoletos', open: abiertas.has('obsoletos') },
        el('summary', {}, el('span', { class: 'sd-flecha' }, icono('derecha', { tam: 16 })), icono('basura', { tam: 18 }), el('span', { class: 'sd-nombre' }, 'Obsoletos (fuera de uso)'), el('span', { class: 'sd-cuenta' }, `${obsoletos.length} doc.`)),
        tabla(obsoletos));
      det.addEventListener('toggle', () => { if (det.open) abiertas.add('obsoletos'); else abiertas.delete('obsoletos'); recordar(); });
      bloques.push(det);
    }
    resumen.textContent = filtrando ? `${vis.length} documento${vis.length === 1 ? '' : 's'} encontrado${vis.length === 1 ? '' : 's'}` : `${activos.length} documentos en uso en ${cats.length} carpeta${cats.length === 1 ? '' : 's'}`;
    cuerpo.replaceChildren(...(bloques.length ? bloques : [el('p', { class: 'texto-suave sd-vacia' }, data.length ? 'Ningún documento coincide.' : 'Sin documentos. Crea las carpetas y sube los PTS, la matriz IPER, el programa preventivo, el protocolo Ley Karin, la matriz de EPP, el material de capacitación y la IRL.')]));
  }
  const buscador = el('input', { type: 'search', class: 'campo sd-buscar', placeholder: 'Buscar por código, nombre, área o carpeta…', 'aria-label': 'Buscar documentos',
    oninput: (ev) => { texto = norm(ev.currentTarget.value.trim()); pintar(); } });
  const todas = (abrir) => cuerpo.querySelectorAll('details.sd-carpeta').forEach((d) => { d.open = abrir; });
  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Documentos preventivos'), resumen),
      el('div', { class: 'listado-acciones' },
        el('a', { class: 'boton', href: ctx.ruta('sst.cargos') }, icono('users', { tam: 16 }), 'Documentos por cargo'),
        puede.crear ? boton('Nueva carpeta', { icono: 'carpeta', onclick: nuevaCategoria }) : null,
        puede.crear ? boton('Nuevo documento', { icono: 'mas', tipo: 'primario', onclick: () => formDocumento(ctx) }) : null)),
    el('div', { class: 'sd-barra' },
      el('label', { class: 'sd-buscar-caja' }, icono('buscar', { tam: 16 }), buscador),
      filtros,
      el('span', { class: 'sd-abrir' },
        el('button', { type: 'button', class: 'boton-icono', title: 'Abrir todas las carpetas', 'aria-label': 'Abrir todas las carpetas', onclick: () => todas(true) }, icono('abajo', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-icono', title: 'Cerrar todas las carpetas', 'aria-label': 'Cerrar todas las carpetas', onclick: () => todas(false) }, icono('arriba', { tam: 16 })))),
    cuerpo);
}

function css() {
  if (!document.getElementById('sst-documentos-css')) document.head.append(el('link', { id: 'sst-documentos-css', rel: 'stylesheet', href: new URL('../documentos.css?v=0cc60b3', import.meta.url).href }));
}

function eliminar(ctx, d) {
  abrirFormulario({
    titulo: `Eliminar ${[d.codigo, d.titulo].filter(Boolean).join(' · ')}`,
    mensaje: 'El documento sale de Documentos preventivos. Sus versiones quedan guardadas en la base (para recuperarlo, pídeselo al equipo de ISgestión). Si solo dejó de usarse, mejor márcalo como obsoleto en "Nombre y datos".',
    campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('sst_documentos').update({ deleted_at: new Date().toISOString() }).eq('id', d.id);
      if (error) throw new Error(error.message);
      avisar('Documento eliminado.'); location.hash = ctx.ruta('sst.documentos');
    },
  });
}

const filaVersion = (ctx, x, vigente) => el('div', { class: 'doc-fila' },
  el('div', { class: 'doc-nombre' },
    el('strong', {}, `Versión ${x.version}`), vigente ? el('span', { class: 'chip chip-ok' }, 'Vigente') : el('span', { class: 'chip chip-na' }, 'Reemplazada'),
    el('span', { class: 'texto-suave texto-chico' }, [`aprobada ${fechaLarga(x.fecha)}`, x.aprobado_por ? `por ${x.aprobado_por}` : null].filter(Boolean).join(' ')),
    x.cambios ? el('span', { class: 'texto-chico' }, x.cambios) : null),
  el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver versión ${x.version}`, onclick: () => abrir(ctx, x.archivo) }, icono('ojo', { tam: 16 })));

async function detalle(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('sst.documentos') }, icono('volver', { tam: 16 }), 'Documentos preventivos');
  const { data: d, error } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(*)').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!d || d.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Documento no encontrado'));
  // Al volver, la lista deja abierta la carpeta de este documento
  if (d.categoria_id) { try { const k = `isg.sst.carpetas.${ctx.empresa.id}`; const a = new Set(JSON.parse(localStorage.getItem(k) || '[]')); a.add(d.categoria_id); localStorage.setItem(k, JSON.stringify([...a])); } catch { /* */ } }
  const carpetaDe = d.categoria_id ? (await ctx.api.from('sst_doc_categorias').select('nombre').eq('id', d.categoria_id).maybeSingle()).data?.nombre : null;
  const s = estadoDocumento(d);
  const versiones = [...d.sst_documento_versiones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  const nueva = () => abrirFormulario({
    titulo: `Nueva versión · ${d.titulo}`,
    mensaje: s.vigente ? `Vigente: versión ${s.vigente.version} del ${fechaLarga(s.vigente.fecha)}. La anterior queda en el historial.` : null,
    campos: [
      { id: 'version', etiqueta: 'N° de versión', requerido: true, valor: s.vigente ? String((Number(s.vigente.version) || 0) + 1 || '') : '1' },
      { id: 'fecha', etiqueta: 'Fecha de aprobación', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'aprobado', etiqueta: 'Aprobado por' },
      { id: 'cambios', etiqueta: 'Qué cambió', tipo: 'textarea', requerido: true },
      { id: 'archivo', etiqueta: 'Archivo', tipo: 'file', accept: ARCHIVOS.join(','), requerido: true },
    ],
    textoGuardar: 'Subir versión',
    alGuardar: async (v) => {
      if (!v.archivo?.size) throw new Error('Elige el archivo.');
      await guardarVersion(ctx, d.id, v);
      avisar('Versión subida.'); ctx.refrescar();
    },
  });
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('p', { class: 'texto-suave texto-chico sd-ruta' }, icono('carpeta', { tam: 14 }), carpetaDe ?? 'Sin carpeta'), el('h1', {}, [d.codigo, d.titulo].filter(Boolean).join(' · ')), el('p', { class: 'texto-suave' }, [nombreTipo[d.tipo], d.area, d.revisar_meses ? `revisión cada ${d.revisar_meses} meses` : null].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' },
        el('span', { class: `chip ${d.activo ? CHIP[s.k] : 'chip-na'}` }, d.activo ? s.texto : 'Obsoleto'),
        s.vigente ? boton('Ver vigente', { icono: 'ojo', onclick: () => abrir(ctx, s.vigente.archivo) }) : null,
        el('a', { class: 'boton boton-primario', href: ctx.ruta('sst.editar', { id: d.id }) }, icono('editar', { tam: 16 }), puedeIA(ctx) ? (d.borrador ? 'Seguir editando' : 'Abrir y editar') : 'Ver documento'),
        ctx.puede('sst', 'crear') ? boton('Subir archivo como versión', { icono: 'mas', onclick: nueva }) : null,
        ctx.puede('sst', 'editar') ? boton('Nombre y datos', { icono: 'ajustes', onclick: () => formDocumento(ctx, d) }) : null,
        ctx.puede('sst', 'eliminar') ? boton('Eliminar', { icono: 'basura', onclick: () => eliminar(ctx, d) }) : null)),
    d.borrador ? el('p', { class: 'aviso-bandeja' }, icono('editar', { tam: 16 }), `Hay un borrador sin guardar como versión (${new Date(d.borrador_at).toLocaleString('es-CL')}).`) : null,
    // Versiones (sugerencia #65): la vigente a la vista y las anteriores plegadas en "Versiones anteriores" (se guardan
    // todas; solo no saturan la ficha)
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Versión vigente'),
      versiones.length ? filaVersion(ctx, versiones[0], true) : el('p', { class: 'texto-suave' }, 'Aún no hay versiones guardadas.'),
      versiones.length > 1 ? el('details', { class: 'doc-anteriores' },
        el('summary', {}, icono('abajo', { tam: 14 }), `Versiones anteriores (${versiones.length - 1})`,
          el('span', { class: 'texto-suave texto-chico' }, ` · la última del ${fechaLarga(versiones[1].fecha)}`)),
        versiones.slice(1).map((x) => filaVersion(ctx, x, false))) : null),
    d.notas ? el('p', { class: 'texto-suave' }, d.notas) : null);
}
