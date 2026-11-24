// Documentos preventivos con control de versiones: lista por tipo con la versión vigente y la próxima
// revisión; detalle con el historial de versiones, subir nueva versión y ver cualquiera.
// Rutas: #/sst.documentos · #/sst.documentos?id=<documento>
import { el } from '../../../core/ui/dom.js?v=10113d4';
import { icono } from '../../../core/ui/iconos.js?v=10113d4';
import { boton } from '../../../core/ui/tabla.js?v=10113d4';
import { abrirFormulario } from '../../../core/ui/modal.js?v=10113d4';
import { avisar } from '../../../core/ui/aviso.js?v=10113d4';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=10113d4';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=10113d4';

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

async function lista(ctx) {
  const [res, cats] = await Promise.all([
    ctx.api.from('sst_documentos').select('*, sst_documento_versiones(id, version, fecha, archivo, created_at)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('codigo').order('titulo'),
    cargarCategorias(ctx),
  ]);
  if (res.error) throw res.error;
  const data = res.data;
  const est = data.filter((d) => d.activo).map(estadoDocumento);
  const puede = { crear: ctx.puede('sst', 'crear'), editar: ctx.puede('sst', 'editar'), eliminar: ctx.puede('sst', 'eliminar') };
  const mover = (d) => abrirFormulario({
    titulo: `Mover ${[d.codigo, d.titulo].filter(Boolean).join(' · ')}`,
    campos: [{ id: 'categoria', etiqueta: 'A la categoría', opciones: [['', 'Sin categoría'], ...cats.map((c) => [c.id, c.nombre])], valor: d.categoria_id ?? '' }],
    textoGuardar: 'Mover',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sst_documentos').update({ categoria_id: v.categoria || null }).eq('id', d.id);
      if (error) throw new Error(error.message);
      avisar('Documento movido.'); ctx.refrescar();
    },
  });
  const fila = (d) => {
    const s = estadoDocumento(d);
    return el('div', { class: `doc-fila sst-doc${d.activo ? '' : ' fila-inactiva'}` },
      el('a', { class: 'doc-nombre', href: ctx.ruta('sst.documentos', { id: d.id }) }, el('strong', {}, [d.codigo, d.titulo].filter(Boolean).join(' · '), d.borrador ? el('span', { class: 'chip chip-prox' }, 'Borrador') : null),
        el('span', { class: 'texto-suave texto-chico' }, [d.area, s.vigente ? `versión ${s.vigente.version} del ${fechaLarga(s.vigente.fecha)}` : null, d.activo ? null : 'obsoleto'].filter(Boolean).join(' · '))),
      el('div', { class: 'doc-acciones' },
        d.activo ? el('span', { class: `chip ${CHIP[s.k]}` }, s.k === 'ok' ? 'Vigente' : s.texto) : el('span', { class: 'chip chip-na' }, 'Obsoleto'),
        puede.editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Mover a otra categoría', 'aria-label': `Mover ${d.titulo}`, onclick: () => mover(d) }, icono('carpeta', { tam: 16 })) : null));
  };
  const categoria = (c, ds) => {
    const renombrar = () => abrirFormulario({
      titulo: 'Renombrar categoría', campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c.nombre }, { id: 'orden', etiqueta: 'Orden (menor va primero)', tipo: 'number', valor: String(c.orden ?? 0) }],
      alGuardar: async (v) => {
        const { error } = await ctx.api.from('sst_doc_categorias').update({ nombre: v.nombre.trim(), orden: Number(v.orden) || 0 }).eq('id', c.id);
        if (error) throw new Error(error.code === '23505' ? 'Ya hay una categoría con ese nombre.' : error.message);
        avisar('Categoría guardada.'); ctx.refrescar();
      },
    });
    const quitar = () => abrirFormulario({
      titulo: `Eliminar la categoría ${c.nombre}`, mensaje: 'Está vacía: se elimina y no afecta a ningún documento.', campos: [], textoGuardar: 'Eliminar',
      alGuardar: async () => { const { error } = await ctx.api.from('sst_doc_categorias').delete().eq('id', c.id); if (error) throw new Error(error.message); avisar('Categoría eliminada.'); ctx.refrescar(); },
    });
    return el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, icono('carpeta', { tam: 18 }), ` ${c ? c.nombre : 'Sin categoría'} (${ds.length})`),
        c ? el('div', { class: 'listado-acciones' },
          puede.crear ? boton('Agregar aquí', { icono: 'mas', onclick: () => formDocumento(ctx, null, c.id) }) : null,
          puede.editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Renombrar u ordenar', 'aria-label': `Renombrar ${c.nombre}`, onclick: renombrar }, icono('editar', { tam: 16 })) : null,
          puede.eliminar && !ds.length ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar categoría (vacía)', 'aria-label': `Eliminar ${c.nombre}`, onclick: quitar }, icono('basura', { tam: 16 })) : null) : null),
      ds.length ? ds.map(fila) : el('p', { class: 'texto-suave texto-chico' }, 'Vacía. Agrega un documento o mueve uno aquí.'));
  };
  const nuevaCategoria = () => abrirFormulario({
    titulo: 'Nueva categoría', campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, ayuda: 'Ej.: Documentos generales, Cermaq Chinquihue, Planes de emergencia.' }],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('sst_doc_categorias').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), orden: (cats.at(-1)?.orden ?? 0) + 1 });
      if (error) throw new Error(error.code === '23505' ? 'Ya hay una categoría con ese nombre.' : error.message);
      avisar('Categoría creada.'); ctx.refrescar();
    },
  });
  const sinCat = data.filter((d) => !d.categoria_id || !cats.some((c) => c.id === d.categoria_id));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Documentos preventivos'),
      el('div', { class: 'listado-acciones' },
        el('a', { class: 'boton', href: ctx.ruta('sst.cargos') }, icono('users', { tam: 16 }), 'Documentos por cargo'),
        puede.crear ? boton('Nueva categoría', { icono: 'carpeta', onclick: nuevaCategoria }) : null,
        puede.crear ? boton('Nuevo documento', { icono: 'mas', tipo: 'primario', onclick: () => formDocumento(ctx) }) : null)),
    data.length ? el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Documentos en uso'), el('strong', {}, String(est.length))),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${est.some((s) => s.k === 'venc') ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, 'Revisión vencida'), el('strong', {}, String(est.filter((s) => s.k === 'venc').length))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Por revisar en 30 días'), el('strong', {}, String(est.filter((s) => s.k === 'prox').length)))) : null,
    cats.map((c) => categoria(c, data.filter((d) => d.categoria_id === c.id))),
    sinCat.length ? categoria(null, sinCat) : null,
    !data.length && !cats.length ? el('p', { class: 'texto-suave' }, 'Sin documentos. Crea las categorías (carpetas) y sube los PTS, la matriz IPER, el programa preventivo, el protocolo Ley Karin, la matriz de EPP, el material de capacitación y la IRL.') : null);
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

async function detalle(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('sst.documentos') }, icono('volver', { tam: 16 }), 'Documentos preventivos');
  const { data: d, error } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(*)').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  if (!d || d.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Documento no encontrado'));
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
      el('div', {}, el('h1', {}, [d.codigo, d.titulo].filter(Boolean).join(' · ')), el('p', { class: 'texto-suave' }, [nombreTipo[d.tipo], d.area, d.revisar_meses ? `revisión cada ${d.revisar_meses} meses` : null].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' },
        el('span', { class: `chip ${d.activo ? CHIP[s.k] : 'chip-na'}` }, d.activo ? s.texto : 'Obsoleto'),
        s.vigente ? boton('Ver vigente', { icono: 'ojo', onclick: () => abrir(ctx, s.vigente.archivo) }) : null,
        el('a', { class: 'boton boton-primario', href: ctx.ruta('sst.editar', { id: d.id }) }, icono('editar', { tam: 16 }), puedeIA(ctx) ? (d.borrador ? 'Seguir editando' : 'Abrir y editar') : 'Ver documento'),
        ctx.puede('sst', 'crear') ? boton('Subir archivo como versión', { icono: 'mas', onclick: nueva }) : null,
        ctx.puede('sst', 'editar') ? boton('Nombre y datos', { icono: 'ajustes', onclick: () => formDocumento(ctx, d) }) : null,
        ctx.puede('sst', 'eliminar') ? boton('Eliminar', { icono: 'basura', onclick: () => eliminar(ctx, d) }) : null)),
    d.borrador ? el('p', { class: 'aviso-bandeja' }, icono('editar', { tam: 16 }), `Hay un borrador sin guardar como versión (${new Date(d.borrador_at).toLocaleString('es-CL')}).`) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Versiones (${versiones.length})`),
      versiones.map((x, i) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' },
          el('strong', {}, `Versión ${x.version}`), i === 0 ? el('span', { class: 'chip chip-ok' }, 'Vigente') : el('span', { class: 'chip chip-na' }, 'Reemplazada'),
          el('span', { class: 'texto-suave texto-chico' }, [`aprobada ${fechaLarga(x.fecha)}`, x.aprobado_por ? `por ${x.aprobado_por}` : null].filter(Boolean).join(' ')),
          x.cambios ? el('span', { class: 'texto-chico' }, x.cambios) : null),
        el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver versión ${x.version}`, onclick: () => abrir(ctx, x.archivo) }, icono('ojo', { tam: 16 }))))),
    d.notas ? el('p', { class: 'texto-suave' }, d.notas) : null);
}
