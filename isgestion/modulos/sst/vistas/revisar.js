// Revisar con IA (SST 004): la prevencionista sube un Word o PDF (o elige la versión vigente de un documento
// preventivo), recibe observaciones (formato, redacción, normativa chilena, riesgos, EPP), marca las que acepta y
// obtiene la versión corregida, que puede retocar aquí y descargar en Word o PDF con el logo y el color de la empresa,
// o guardar como nueva versión en Documentos preventivos.
// Rutas: #/sst.revisar · ?documento=<id>&version=<id> · ?revision=<id> (reabrir una revisión anterior)
import { el } from '../../../core/ui/dom.js?v=4b574d1';
import { icono } from '../../../core/ui/iconos.js?v=4b574d1';
import { boton } from '../../../core/ui/tabla.js?v=4b574d1';
import { abrirFormulario } from '../../../core/ui/modal.js?v=4b574d1';
import { avisar } from '../../../core/ui/aviso.js?v=4b574d1';
import { urlFirmada } from '../../../core/adjuntos.js?v=4b574d1';
import { fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=4b574d1';
import { TIPOS_DOC, guardarVersion, estadoDocumento } from './documentos.js?v=4b574d1';
import { leerContenido, pedirIA, exportarWord, exportarPdf, descargar, nombreArchivo, esDocx, esPdf, MIME_DOCX } from '../revisar-ia.js?v=4b574d1';

const CATEGORIA = { formato: 'Formato', redaccion: 'Redacción', normativa: 'Normativa', riesgo_faltante: 'Riesgo que falta', clasificacion: 'Mal clasificado', epp: 'EPP', coherencia: 'Coherencia', otro: 'Otro' };
const GRAVEDAD = { alta: ['Alta', 'chip-venc'], media: ['Media', 'chip-prox'], baja: ['Baja', 'chip-pend'] };

function cargarCss() {
  if (document.getElementById('sst-revisar-css')) return;
  document.head.append(el('link', { id: 'sst-revisar-css', rel: 'stylesheet', href: new URL('../revisar.css?v=4b574d1', import.meta.url).href }));
}

export default async function vista(ctx) {
  cargarCss();
  const puede = ctx.puede('sst', 'crear') || ctx.puede('sst', 'editar');
  const destinoVolver = ctx.params.documento ? ctx.ruta('sst.documentos', { id: ctx.params.documento }) : ctx.ruta('sst.documentos');
  const volver = el('a', { class: 'volver', href: destinoVolver }, icono('volver', { tam: 16 }), 'Documentos preventivos');
  if (!puede) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Revisar con IA'), el('p', { class: 'texto-suave' }, 'Tu rol no puede crear ni editar en Prevención SST.'));

  // Estado de la pantalla
  const e = { documento: null, version: null, revision: null, contenido: null, nombre: '', documentoIA: null, ocupado: false };
  const cuerpo = el('div', { class: 'rv' });
  const poner = (...hijos) => cuerpo.replaceChildren(...hijos.flat().filter((h) => h != null && h !== false));

  if (ctx.params.documento) {
    const { data } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(*)').eq('id', ctx.params.documento).maybeSingle();
    e.documento = data;
    if (data && ctx.params.version) e.version = data.sst_documento_versiones.find((v) => v.id === ctx.params.version) ?? null;
  }
  if (ctx.params.revision) {
    const { data, error } = await ctx.api.from('sst_revisiones_ia').select('*').eq('id', ctx.params.revision).maybeSingle();
    if (error) throw error;
    e.revision = data;
    if (data?.documento_id && !e.documento) {
      const { data: d } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(*)').eq('id', data.documento_id).maybeSingle();
      e.documento = d;
      e.version = d?.sst_documento_versiones.find((v) => v.id === data.version_id) ?? null;
    }
    e.nombre = data?.archivo_nombre ?? '';
    e.documentoIA = data?.documento ?? null;
  }

  // ---------- Paso 1: elegir el documento ----------
  async function revisar(archivo, nombre) {
    if (e.ocupado) return;
    e.ocupado = true;
    try {
      pintarEspera('Leyendo el documento…');
      e.contenido = await leerContenido(archivo, nombre);
      e.nombre = nombre;
      pintarEspera('La IA está revisando el documento. Suele tardar entre 30 segundos y 2 minutos; no cierres esta pantalla.');
      const r = await pedirIA(ctx.api, { empresa_id: ctx.empresa.id, accion: 'revisar', nombre, contenido: e.contenido, documento_id: e.documento?.id ?? null, version_id: e.version?.id ?? null });
      e.revision = r.revision; e.documentoIA = null;
      history.replaceState(null, '', ctx.ruta('sst.revisar', { revision: r.revision.id }));
      pintarObservaciones();
    } catch (err) { avisar(err.message, 'error'); pintarInicio(); } finally { e.ocupado = false; }
  }
  async function archivoDeVersion(v) {
    const blob = await (await fetch(await urlFirmada(ctx.api, v.archivo, 120))).blob();
    const nombre = v.archivo.split('/').pop().replace(/^[0-9a-f-]{36}-/, '');
    return { blob: new File([blob], nombre, { type: blob.type || (esDocx(nombre) ? MIME_DOCX : 'application/pdf') }), nombre };
  }

  async function pintarInicio() {
    const entrada = el('input', { type: 'file', accept: '.docx,.pdf,application/pdf,' + MIME_DOCX, class: 'oculto', onchange: () => { const f = entrada.files[0]; if (f) revisar(f, f.name); } });
    const v = e.version;
    const deVersion = v && (esDocx(v.archivo) || esPdf(v.archivo));
    const { data: previas } = await ctx.api.from('sst_revisiones_ia').select('id, archivo_nombre, tipo_documento, created_at, documento_id, observaciones, documento')
      .eq('empresa_id', ctx.empresa.id).order('created_at', { ascending: false }).limit(15);
    poner(
      el('div', { class: 'ficha rv-inicio' },
        el('p', {}, 'Sube un documento preventivo (inventario de riesgos, PTS, IRL, matriz, programa, protocolo) y la IA lo revisa con la normativa chilena (D.S. N° 44, Ley N° 16.744, D.S. N° 594 y otras): formato, redacción, riesgos que faltan, peligros mal clasificados y EPP. Tú eliges qué observaciones aceptar y recibes la versión corregida con el logo y los colores de la empresa.'),
        el('div', { class: 'rv-fuentes' },
          deVersion ? boton(`Revisar la versión ${v.version} de ${e.documento.codigo || e.documento.titulo}`, { icono: 'revisar', tipo: 'primario', onclick: async () => {
            try { const a = await archivoDeVersion(v); revisar(a.blob, a.nombre); } catch (err) { avisar(err.message, 'error'); }
          } }) : null,
          boton('Subir Word o PDF', { icono: 'arriba', tipo: deVersion ? 'secundario' : 'primario', onclick: () => entrada.click() }), entrada),
        e.documento ? el('p', { class: 'texto-suave texto-chico' }, `La revisión queda ligada a ${[e.documento.codigo, e.documento.titulo].filter(Boolean).join(' · ')}.`) : null,
        el('p', { class: 'texto-suave texto-chico' }, 'La IA propone; la revisión final y la aprobación son de Prevención de Riesgos. Máximo 40 revisiones por día en la empresa.')),
      previas?.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Revisiones anteriores'),
        previas.map((p) => el('a', { class: 'doc-fila', href: ctx.ruta('sst.revisar', { revision: p.id }) },
          el('div', { class: 'doc-nombre' }, el('strong', {}, p.archivo_nombre || 'Documento'),
            el('span', { class: 'texto-suave texto-chico' }, [p.tipo_documento, fechaLarga(diaLocal(p.created_at)), `${(p.observaciones || []).length} observaciones`].filter(Boolean).join(' · '))),
          el('span', { class: `chip ${p.documento ? 'chip-ok' : 'chip-pend'}` }, p.documento ? 'Con versión corregida' : 'Solo observaciones')))) : null);
  }

  function pintarEspera(texto) {
    poner(el('div', { class: 'ficha rv-espera', role: 'status' }, el('div', { class: 'rv-barra' }, el('span')), el('p', {}, texto)));
  }

  // ---------- Paso 2: observaciones ----------
  function pintarObservaciones() {
    const r = e.revision;
    const obs = r.observaciones || [];
    const marcadas = new Set(r.aceptadas ?? obs.filter((o) => o.gravedad !== 'baja').map((o) => String(o.id)));
    const contador = el('span');
    const generar = boton('', { icono: 'revisar', tipo: 'primario', onclick: () => corregir() });
    const actualizar = () => { contador.textContent = `${marcadas.size} de ${obs.length} aceptadas`; generar.lastChild.textContent = `Generar versión corregida (${marcadas.size})`; generar.disabled = !marcadas.size; };
    generar.append(document.createTextNode(''));
    const nota = el('textarea', { class: 'campo', rows: 2, placeholder: 'Indicaciones para la versión corregida (opcional). Ej.: mantener el código P-28, agregar el mandante.' });
    const tarjeta = (o) => {
      const caja = el('input', { type: 'checkbox', checked: marcadas.has(String(o.id)), onchange: () => { if (caja.checked) marcadas.add(String(o.id)); else marcadas.delete(String(o.id)); fila.classList.toggle('rv-rechazada', !caja.checked); actualizar(); } });
      const [gt, gc] = GRAVEDAD[o.gravedad] ?? GRAVEDAD.baja;
      const fila = el('label', { class: `ficha rv-obs${marcadas.has(String(o.id)) ? '' : ' rv-rechazada'}` },
        el('div', { class: 'rv-obs-cab' }, caja, el('span', { class: `chip ${gc}` }, gt), el('span', { class: 'chip chip-na' }, CATEGORIA[o.categoria] ?? o.categoria), el('span', { class: 'texto-suave texto-chico' }, o.donde)),
        o.actual ? el('p', { class: 'rv-actual' }, el('strong', {}, 'Actual: '), o.actual) : null,
        el('p', { class: 'rv-propuesta' }, el('strong', {}, 'Propuesta: '), o.propuesta),
        o.fundamento ? el('p', { class: 'texto-suave texto-chico' }, o.fundamento) : null);
      return fila;
    };
    const todas = (v) => { obs.forEach((o) => (v ? marcadas.add(String(o.id)) : marcadas.delete(String(o.id)))); pintarObservacionesCon(marcadas); };
    const pintarObservacionesCon = (m) => { r.aceptadas = [...m]; pintarObservaciones(); };
    async function corregir() {
      if (e.ocupado) return;
      if (!e.contenido) {
        // Reabierta desde el historial: se vuelve a leer el archivo de la versión o se pide de nuevo
        try {
          if (e.version && (esDocx(e.version.archivo) || esPdf(e.version.archivo))) { const a = await archivoDeVersion(e.version); e.contenido = await leerContenido(a.blob, a.nombre); }
        } catch { /* se pide abajo */ }
        if (!e.contenido) {
          const entrada = el('input', { type: 'file', accept: '.docx,.pdf,application/pdf,' + MIME_DOCX });
          entrada.onchange = async () => { const f = entrada.files[0]; if (!f) return; try { e.contenido = await leerContenido(f, f.name); corregir(); } catch (err) { avisar(err.message, 'error'); } };
          avisar(`Vuelve a elegir el archivo ${e.nombre || 'original'} para generar la versión corregida.`);
          entrada.click();
          return;
        }
      }
      e.ocupado = true;
      r.aceptadas = [...marcadas];
      try {
        pintarEspera(`Armando la versión corregida con ${marcadas.size} observaciones. Suele tardar menos de un minuto.`);
        const res = await pedirIA(ctx.api, { empresa_id: ctx.empresa.id, accion: 'corregir', revision_id: r.id, aceptadas: [...marcadas], contenido: e.contenido, nota: nota.value });
        e.documentoIA = res.documento; r.documento = res.documento;
        pintarDocumento();
      } catch (err) { avisar(err.message, 'error'); pintarObservaciones(); } finally { e.ocupado = false; }
    }
    actualizar();
    const grupos = ['alta', 'media', 'baja'].map((g) => [g, obs.filter((o) => (o.gravedad ?? 'baja') === g)]).filter(([, xs]) => xs.length);
    poner(
      el('div', { class: 'ficha rv-resumen' },
        el('div', {}, el('strong', {}, r.tipo_documento || e.nombre), el('p', {}, r.resumen),
          el('p', { class: 'texto-suave texto-chico' }, [e.nombre, `revisado el ${fechaLarga(diaLocal(r.created_at || new Date().toISOString()))}`].filter(Boolean).join(' · '))),
        el('div', { class: 'rv-conteo' }, grupos.map(([g, xs]) => el('span', { class: `chip ${GRAVEDAD[g][1]}` }, `${xs.length} ${GRAVEDAD[g][0].toLowerCase()}`)))),
      el('div', { class: 'rv-barra-acciones' }, contador,
        boton('Aceptar todas', { icono: 'check', onclick: () => todas(true) }), boton('Ninguna', { icono: 'cerrar', onclick: () => todas(false) }),
        e.documentoIA ? boton('Ver versión corregida', { icono: 'documento', onclick: () => pintarDocumento() }) : null),
      ...grupos.map(([g, xs]) => el('div', { class: 'rv-grupo' }, el('h2', {}, `Gravedad ${GRAVEDAD[g][0].toLowerCase()} (${xs.length})`), xs.map(tarjeta))),
      el('div', { class: 'ficha rv-generar' }, el('label', { class: 'texto-chico' }, 'Indicaciones adicionales'), nota, el('div', { class: 'rv-fuentes' }, generar)));
  }

  // ---------- Paso 3: documento corregido ----------
  function editable(obj, clave, etiqueta = 'span', clase = '') {
    return el(etiqueta, { class: clase, contenteditable: 'true', spellcheck: 'true', oninput: (ev) => { obj[clave] = ev.currentTarget.innerText.trim(); sucio = true; } }, obj[clave] ?? '');
  }
  let sucio = false;
  async function guardarEdiciones() {
    if (!sucio || !e.revision) return;
    const { error } = await ctx.api.from('sst_revisiones_ia').update({ documento: e.documentoIA }).eq('id', e.revision.id);
    if (!error) sucio = false;
  }

  function pintarDocumento() {
    const d = e.documentoIA;
    const bloque = (b) => {
      if (b.tipo === 'parrafo') return editable(b, 'texto', 'p');
      if (b.tipo === 'lista' || b.tipo === 'numerada') return el(b.tipo === 'lista' ? 'ul' : 'ol', {}, (b.items || []).map((_, i) => editable(b.items, i, 'li')));
      if (b.tipo === 'tabla') {
        const n = (b.columnas || []).length;
        return el('div', { class: 'rv-tabla' }, el('table', {},
          el('thead', {}, el('tr', {}, (b.columnas || []).map((_, i) => editable(b.columnas, i, 'th')))),
          el('tbody', {}, (b.filas || []).map((f) => { while (f.length < n) f.push(''); return el('tr', {}, f.slice(0, n).map((_, i) => editable(f, i, 'td'))); }))));
      }
      return null;
    };
    const ocupar = async (fn, texto) => { try { await guardarEdiciones(); await fn(); } catch (err) { avisar(err.message || texto, 'error'); } };
    poner(
      el('div', { class: 'rv-barra-acciones' },
        boton('Volver a las observaciones', { icono: 'volver', onclick: () => ocupar(async () => pintarObservaciones()) }),
        el('span', { class: 'rv-espaciador' }),
        boton('Descargar Word', { icono: 'descargar', onclick: () => ocupar(async () => descargar(await exportarWord(ctx, d), nombreArchivo(d, 'docx'))) }),
        boton('Descargar PDF', { icono: 'descargar', onclick: () => ocupar(async () => descargar(await exportarPdf(ctx, d), nombreArchivo(d, 'pdf'))) }),
        ctx.puede('sst', 'crear') ? boton('Guardar en Documentos preventivos', { icono: 'carpeta', tipo: 'primario', onclick: () => ocupar(() => guardarEnSst()) }) : null),
      el('p', { class: 'texto-suave texto-chico' }, 'Puedes corregir cualquier texto haciendo clic sobre él. Revisa siempre el contenido antes de aprobarlo.'),
      el('article', { class: 'rv-papel' },
        el('header', { class: 'rv-papel-cab' },
          ctx.empresa.logo_url ? el('img', { class: 'rv-logo', alt: '' }) : null,
          el('div', {}, editable(d, 'titulo', 'h1'), editable(d, 'subtitulo', 'p', 'rv-sub'), el('p', { class: 'texto-suave texto-chico' }, `${ctx.empresa.razon_social}${ctx.empresa.rut ? ` · RUT ${ctx.empresa.rut}` : ''}`)),
          el('dl', {}, el('dt', {}, 'Código'), editable(d, 'codigo', 'dd'), el('dt', {}, 'Versión'), editable(d, 'version', 'dd'))),
        (d.secciones || []).map((s) => el('section', {}, editable(s, 'titulo', 'h2'), (s.bloques || []).map(bloque)))),
      d.cambios ? el('div', { class: 'ficha' }, el('strong', {}, 'Qué cambió: '), editable(d, 'cambios', 'span')) : null);
    const img = cuerpo.querySelector('.rv-logo');
    if (img) urlFirmada(ctx.api, ctx.empresa.logo_url, 300).then((u) => { img.src = u; }).catch(() => img.remove());
    window.addEventListener('hashchange', guardarEdiciones, { once: true });
  }

  async function guardarEnSst() {
    const d = e.documentoIA;
    const formato = { id: 'formato', etiqueta: 'Formato del archivo', opciones: [['pdf', 'PDF (para entregar y firmar)'], ['docx', 'Word (editable)']], valor: 'pdf' };
    const generarArchivo = async (f) => (f === 'docx'
      ? new File([await exportarWord(ctx, d)], nombreArchivo(d, 'docx'), { type: MIME_DOCX })
      : new File([await exportarPdf(ctx, d)], nombreArchivo(d, 'pdf'), { type: 'application/pdf' }));
    const doc = e.documento;
    if (doc) {
      const s = estadoDocumento(doc);
      abrirFormulario({
        titulo: `Nueva versión · ${doc.titulo}`,
        mensaje: s.vigente ? `Vigente: versión ${s.vigente.version} del ${fechaLarga(s.vigente.fecha)}. La anterior queda en el historial.` : null,
        campos: [
          { id: 'version', etiqueta: 'N° de versión', requerido: true, valor: d.version || (s.vigente ? String((Number(s.vigente.version) || 0) + 1) : '1') },
          { id: 'fecha', etiqueta: 'Fecha de aprobación', tipo: 'date', requerido: true, valor: hoyISO() },
          { id: 'aprobado', etiqueta: 'Aprobado por' },
          { id: 'cambios', etiqueta: 'Qué cambió', tipo: 'textarea', requerido: true, valor: `${d.cambios || ''} (Revisado con IA.)`.trim() },
          formato,
        ],
        textoGuardar: 'Guardar versión',
        alGuardar: async (v) => {
          await guardarVersion(ctx, doc.id, { ...v, archivo: await generarArchivo(v.formato) });
          avisar('Versión guardada en Documentos preventivos.'); location.hash = ctx.ruta('sst.documentos', { id: doc.id });
        },
      });
      return;
    }
    abrirFormulario({
      titulo: 'Guardar en Documentos preventivos',
      campos: [
        { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_DOC, valor: /pts|procedimiento/i.test(d.titulo) ? 'pts' : /riesgo|irl|inventario/i.test(d.titulo) ? 'irl' : 'otro' },
        { id: 'codigo', etiqueta: 'Código', valor: /^[\w.-]{2,30}$/.test(d.codigo || '') ? d.codigo : '' },
        { id: 'titulo', etiqueta: 'Título', requerido: true, valor: [d.titulo, d.subtitulo].filter(Boolean).join(' · ').slice(0, 200) },
        { id: 'area', etiqueta: 'Área o proceso' },
        { id: 'revisar', etiqueta: 'Revisar cada (meses, vacío = sin revisión periódica)', tipo: 'number', valor: '12' },
        { id: 'version', etiqueta: 'Versión', requerido: true, valor: d.version || '1' },
        { id: 'fecha', etiqueta: 'Fecha de aprobación', tipo: 'date', requerido: true, valor: hoyISO() },
        { id: 'aprobado', etiqueta: 'Aprobado por' },
        formato,
      ],
      textoGuardar: 'Guardar documento',
      alGuardar: async (v) => {
        const revisar = v.revisar === '' ? null : Math.round(Number(v.revisar));
        const { data: nuevo, error } = await ctx.api.from('sst_documentos').insert({ empresa_id: ctx.empresa.id, tipo: v.tipo, codigo: v.codigo.trim() || null, titulo: v.titulo.trim(), area: v.area.trim() || null, revisar_meses: revisar || null }).select('id').single();
        if (error) throw new Error(error.code === '23505' ? 'Ya existe un documento con ese código: ábrelo y revisa desde ahí para agregar una versión.' : error.message);
        await guardarVersion(ctx, nuevo.id, { version: v.version, fecha: v.fecha, aprobado: v.aprobado, cambios: `${d.cambios || 'Versión inicial'} (Revisado con IA.)`, archivo: await generarArchivo(v.formato) });
        avisar('Documento guardado en Documentos preventivos.'); location.hash = ctx.ruta('sst.documentos', { id: nuevo.id });
      },
    });
  }

  if (e.revision && e.documentoIA) pintarDocumento();
  else if (e.revision) pintarObservaciones();
  else await pintarInicio();

  return el('section', { class: 'listado' }, volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Revisar con IA'),
      el('p', { class: 'texto-suave' }, e.documento ? [e.documento.codigo, e.documento.titulo].filter(Boolean).join(' · ') : 'Documentos preventivos'))),
    cuerpo);
}
