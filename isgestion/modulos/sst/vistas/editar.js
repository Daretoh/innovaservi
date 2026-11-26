// Documento preventivo editable con chat de IA (SST 007, pedido de Enzo y Yocelyn, 2026-11-24). El documento mismo es la
// plantilla: se ve como hoja, se corrige haciendo clic en el texto, y al lado un chat propone cambios (aplicar, descartar
// o seguir pidiendo). Tocar un bloque lo marca para el chat. Lo que se edita queda como borrador (se guarda solo) hasta
// "Guardar versión", que arma el PDF o Word con el logo y el color de la empresa y lo deja como versión nueva.
// Ruta: #/sst.editar?id=<documento>
import { el } from '../../../core/ui/dom.js?v=d971811';
import { icono } from '../../../core/ui/iconos.js?v=d971811';
import { boton } from '../../../core/ui/tabla.js?v=d971811';
import { abrirFormulario } from '../../../core/ui/modal.js?v=d971811';
import { avisar } from '../../../core/ui/aviso.js?v=d971811';
import { urlFirmada } from '../../../core/adjuntos.js?v=d971811';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=d971811';
import { guardarVersion, estadoDocumento } from './documentos.js?v=d971811';
import { leerContenido, pedirIA, exportarWord, exportarPdf, descargar, nombreArchivo, esDocx, esPdf, MIME_DOCX } from '../revisar-ia.js?v=d971811';

const ACCION = { reemplazar: 'Cambiar', insertar_despues: 'Agregar', eliminar: 'Quitar', titulo_seccion: 'Cambiar título', nueva_seccion: 'Nueva sección' };
const vacioBloque = () => ({ tipo: 'parrafo', texto: '', items: [], columnas: [], filas: [] });

function css() {
  for (const [id, f] of [['sst-revisar-css', '../revisar.css'], ['sst-editar-css', '../editar.css']]) {
    if (!document.getElementById(id)) document.head.append(el('link', { id, rel: 'stylesheet', href: new URL(f, import.meta.url).href }));
  }
}

export default async function vista(ctx) {
  css();
  const lista = ctx.ruta('sst.documentos');
  const { data: d, error } = await ctx.api.from('sst_documentos').select('*, sst_documento_versiones(*)').eq('id', ctx.params.id).maybeSingle();
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: d ? ctx.ruta('sst.documentos', { id: d.id }) : lista }, icono('volver', { tam: 16 }), d ? 'Documento' : 'Documentos preventivos');
  if (!d || d.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Documento no encontrado'));
  const editable = ctx.puede('sst', 'crear') || ctx.puede('sst', 'editar');
  const s = estadoDocumento(d);
  const vig = s.vigente;
  const titulo = [d.codigo, d.titulo].filter(Boolean).join(' · ');
  const cab = el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, titulo),
    el('p', { class: 'texto-suave' }, vig ? `Vigente: versión ${vig.version} del ${fechaLarga(vig.fecha)}` : 'Sin versión guardada')));

  let doc = d.borrador ?? vig?.contenido ?? null;
  if (doc) doc = structuredClone(doc);
  const cuerpo = el('div', {});
  const pantalla = el('section', { class: 'listado' }, volver, cab, cuerpo);

  // ---------- Borrador: se guarda solo ----------
  let reloj = null; let sucio = false;
  const estadoGuardado = el('span', { class: 'texto-suave texto-chico' }, d.borrador ? `Borrador guardado ${new Date(d.borrador_at).toLocaleString('es-CL')}` : 'Sin cambios');
  async function guardarBorrador(ya = false) {
    sucio = true;
    clearTimeout(reloj);
    const hacer = async () => {
      if (!sucio || !editable) return;
      estadoGuardado.textContent = 'Guardando…';
      const { error: e } = await ctx.api.from('sst_documentos').update({ borrador: doc }).eq('id', d.id);
      if (e) { estadoGuardado.textContent = 'No se pudo guardar el borrador'; avisar(e.message, 'error'); return; }
      sucio = false; estadoGuardado.textContent = `Borrador guardado ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    };
    if (ya) return hacer();
    reloj = setTimeout(hacer, 1500);
  }
  const alSalir = () => { if (sucio) guardarBorrador(true); };
  window.addEventListener('hashchange', alSalir, { once: true });

  // ---------- Aún no es editable: pasar la versión vigente (Word o PDF) a secciones y bloques ----------
  if (!doc) {
    const deVersion = vig && (esDocx(vig.archivo) || esPdf(vig.archivo));
    const enBlanco = () => { doc = { titulo: d.titulo, subtitulo: d.area ?? '', codigo: d.codigo ?? '', version: vig ? String((Number(vig.version) || 0) + 1) : '1', cambios: '', secciones: [{ titulo: '1. Objetivo', bloques: [vacioBloque()] }] }; guardarBorrador(true).then(editor); };
    const pasar = async (b) => {
      b.disabled = true; b.classList.add('cargando');
      try {
        avisar('Pasando el documento a editable. Suele tardar menos de un minuto…');
        const blob = await (await fetch(await urlFirmada(ctx.api, vig.archivo, 120))).blob();
        const nombre = vig.archivo.split('/').pop().replace(/^[0-9a-f-]{36}-/, '');
        const contenido = await leerContenido(new File([blob], nombre, { type: blob.type || (esDocx(nombre) ? MIME_DOCX : 'application/pdf') }), nombre);
        const r = await pedirIA(ctx.api, { empresa_id: ctx.empresa.id, accion: 'estructurar', nombre: titulo, contenido });
        doc = r.documento; doc.codigo ||= d.codigo ?? ''; doc.version ||= vig.version; doc.cambios = '';
        await guardarBorrador(true);
        editor();
      } catch (err) { avisar(err.message, 'error'); b.disabled = false; b.classList.remove('cargando'); }
    };
    cuerpo.append(el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Pasar a editable'),
      el('p', {}, deVersion
        ? 'La versión vigente es un archivo (Word o PDF). Para editarlo aquí y pedirle cambios a la IA, primero se pasa a texto editable: se transcribe tal cual, sin cambiar nada. Revisa que quede completo antes de guardar una versión.'
        : 'La versión vigente no es Word ni PDF (o no hay versión). Puedes empezar el documento en blanco.'),
      editable ? el('div', { class: 'listado-acciones' },
        deVersion ? boton('Pasar a editable', { icono: 'editar', tipo: 'primario', onclick: (ev) => pasar(ev.currentTarget) }) : null,
        boton('Empezar en blanco', { icono: 'mas', onclick: enBlanco })) : el('p', { class: 'texto-suave' }, 'Necesitas permiso para crear o editar en Prevención SST.')));
    return pantalla;
  }


  editor();
  return pantalla;

  // ---------- Editor + chat ----------
  function editor() {
    let seleccion = null;            // { s, b, sec, blo, texto }
    const deshacer = [];             // copias del documento antes de aplicar cambios de la IA
    const papel = el('article', { class: 'rv-papel ed-papel' });
    const chipSel = el('div', { class: 'ed-sel', hidden: true });
    const historial = [];
    const mensajes = el('div', { class: 'ed-mensajes', 'aria-live': 'polite' },
      el('div', { class: 'ed-msg ed-ia' }, 'Hola. Edita el texto haciendo clic sobre él, o pídeme cambios: toca un párrafo, tabla o lista para que sepa a qué te refieres, y escríbeme abajo. Ej.: "agrega el riesgo de caída a distinto nivel en esta tabla" o "redacta mejor este paso".'));
    const entrada = el('textarea', { class: 'campo ed-entrada', rows: 3, placeholder: 'Escribe lo que quieres cambiar…', disabled: !editable });
    const enviar = boton('Enviar', { icono: 'chat', tipo: 'primario', onclick: () => preguntar() });
    entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); preguntar(); } });
    const bDeshacer = boton('Deshacer', { icono: 'deshacer', onclick: () => { if (!deshacer.length) return; doc = deshacer.pop(); bDeshacer.disabled = !deshacer.length; pintar(); guardarBorrador(); } });
    bDeshacer.disabled = true;

    const editableEl = (obj, clave, etiqueta = 'span', clase = '') => el(etiqueta, {
      class: clase, contenteditable: editable ? 'true' : 'false', spellcheck: 'true',
      oninput: (ev) => { obj[clave] = ev.currentTarget.innerText.trim(); guardarBorrador(); },
    }, obj[clave] ?? '');
    const marcar = (si, bi, nodo) => {
      papel.querySelectorAll('.ed-marcado').forEach((x) => x.classList.remove('ed-marcado'));
      const sec = doc.secciones[si]; const blo = bi == null ? null : sec?.bloques[bi];
      const texto = String(window.getSelection?.() ?? '').trim().slice(0, 1500);
      seleccion = { s: si, b: bi, sec, blo, texto };
      nodo.classList.add('ed-marcado');
      chipSel.hidden = false;
      chipSel.replaceChildren(icono('enlace', { tam: 14 }),
        el('span', {}, `${sec?.titulo || `Sección ${si + 1}`}${bi == null ? ' (título)' : ` · ${{ parrafo: 'párrafo', lista: 'lista', numerada: 'lista numerada', tabla: 'tabla' }[blo?.tipo] ?? 'bloque'} ${bi + 1}`}${texto ? `: «${texto.slice(0, 60)}${texto.length > 60 ? '…' : ''}»` : ''}`),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar selección', onclick: () => { seleccion = null; chipSel.hidden = true; papel.querySelectorAll('.ed-marcado').forEach((x) => x.classList.remove('ed-marcado')); } }, icono('cerrar', { tam: 14 })));
    };
    const vistaBloque = (b, editar) => {
      const ed = (obj, k, tag) => (editar ? editableEl(obj, k, tag) : el(tag, {}, obj[k] ?? ''));
      if (b.tipo === 'parrafo') return ed(b, 'texto', 'p');
      if (b.tipo === 'lista' || b.tipo === 'numerada') return el(b.tipo === 'lista' ? 'ul' : 'ol', {}, (b.items || []).map((_, i) => ed(b.items, i, 'li')));
      if (b.tipo === 'tabla') {
        const n = (b.columnas || []).length;
        return el('div', { class: 'rv-tabla' }, el('table', {},
          el('thead', {}, el('tr', {}, (b.columnas || []).map((_, i) => ed(b.columnas, i, 'th')))),
          el('tbody', {}, (b.filas || []).map((f) => { while (f.length < n) f.push(''); return el('tr', {}, f.slice(0, n).map((_, i) => ed(f, i, 'td'))); }))));
      }
      return null;
    };
    function pintar() {
      papel.replaceChildren(
        el('header', { class: 'rv-papel-cab' },
          ctx.empresa.logo_url ? el('img', { class: 'rv-logo', alt: '' }) : null,
          el('div', {}, editableEl(doc, 'titulo', 'h1'), editableEl(doc, 'subtitulo', 'p', 'rv-sub'), el('p', { class: 'texto-suave texto-chico' }, `${ctx.empresa.razon_social}${ctx.empresa.rut ? ` · RUT ${ctx.empresa.rut}` : ''}`)),
          el('dl', {}, el('dt', {}, 'Código'), editableEl(doc, 'codigo', 'dd'), el('dt', {}, 'Versión'), el('dd', {}, doc.version || '—'))),
        ...(doc.secciones || []).map((sec, si) => el('section', {},
          (() => { const h = editableEl(sec, 'titulo', 'h2'); h.addEventListener('click', () => marcar(si, null, h)); return h; })(),
          (sec.bloques || []).map((b, bi) => {
            const caja = el('div', { class: 'ed-bloque' }, vistaBloque(b, true));
            caja.addEventListener('mouseup', () => marcar(si, bi, caja));
            return caja;
          }))));
      const img = papel.querySelector('.rv-logo');
      if (img) urlFirmada(ctx.api, ctx.empresa.logo_url, 300).then((u) => { img.src = u; }).catch(() => img.remove());
      // Mantener la marca después de volver a pintar (si el bloque sigue)
      if (seleccion) {
        const si = doc.secciones.indexOf(seleccion.sec); const bi = seleccion.blo ? seleccion.sec?.bloques.indexOf(seleccion.blo) : null;
        if (si < 0 || bi === -1) { seleccion = null; chipSel.hidden = true; }
        else { seleccion.s = si; seleccion.b = bi; const n = bi == null ? papel.querySelectorAll('section')[si]?.querySelector('h2') : papel.querySelectorAll('section')[si]?.querySelectorAll('.ed-bloque')[bi]; n?.classList.add('ed-marcado'); }
      }
    }

    // Cambios de la IA: se resuelven contra los objetos del documento al recibirlos (así aplicar uno no corre los otros)
    const resolver = (c) => {
      const sec = doc.secciones[c.seccion] ?? null;
      const blo = sec && c.bloque >= 0 ? sec.bloques[c.bloque] ?? null : null;
      return { ...c, sec, blo };
    };
    const aplicar = (c) => {
      const si = doc.secciones.indexOf(c.sec);
      if (si < 0 && c.accion !== 'nueva_seccion') throw new Error('Esa sección ya no existe.');
      const bloques = c.sec?.bloques;
      const bi = c.blo ? bloques.indexOf(c.blo) : -1;
      if (['reemplazar', 'eliminar'].includes(c.accion) && bi < 0) throw new Error('Esa parte ya cambió; pídelo de nuevo.');
      const nuevo = { ...vacioBloque(), ...(c.bloque_nuevo ?? {}) };
      if (c.accion === 'reemplazar') { bloques[bi] = nuevo; c.blo = nuevo; }
      else if (c.accion === 'insertar_despues') bloques.splice(bi + 1, 0, nuevo);
      else if (c.accion === 'eliminar') bloques.splice(bi, 1);
      else if (c.accion === 'titulo_seccion') c.sec.titulo = c.titulo;
      else if (c.accion === 'nueva_seccion') doc.secciones.splice(Math.max(si, -1) + 1, 0, { titulo: c.titulo || 'Nueva sección', bloques: c.bloque_nuevo?.texto || c.bloque_nuevo?.items?.length || c.bloque_nuevo?.filas?.length ? [nuevo] : [vacioBloque()] });
    };
    const tarjetaCambio = (c) => {
      const estado = el('div', { class: 'ed-cambio-acc' });
      const caja = el('div', { class: 'ed-cambio' },
        el('div', { class: 'ed-cambio-cab' }, el('span', { class: 'chip chip-prox' }, ACCION[c.accion] ?? c.accion),
          el('span', { class: 'texto-chico' }, `${c.sec?.titulo || (c.accion === 'nueva_seccion' ? 'Nueva sección' : '')}${c.blo ? ` · bloque ${c.bloque + 1}` : ''}`)),
        c.motivo ? el('p', { class: 'texto-chico' }, c.motivo) : null,
        ['reemplazar', 'insertar_despues', 'nueva_seccion'].includes(c.accion) && c.bloque_nuevo ? el('div', { class: 'ed-previa rv-papel' }, c.accion === 'nueva_seccion' ? el('h2', {}, c.titulo) : null, vistaBloque({ ...vacioBloque(), ...c.bloque_nuevo }, false))
          : c.accion === 'titulo_seccion' ? el('p', { class: 'texto-chico' }, el('strong', {}, c.titulo))
            : c.accion === 'eliminar' && c.blo ? el('div', { class: 'ed-previa ed-quitar rv-papel' }, vistaBloque(c.blo, false)) : null,
        estado);
      const hecho = (t, clase) => estado.replaceChildren(el('span', { class: `chip ${clase}` }, t));
      estado.append(
        boton('Aplicar', { icono: 'check', tipo: 'primario', onclick: () => {
          try { deshacer.push(structuredClone(doc)); /* las copias rompen las referencias: se vuelven a resolver al deshacer */ aplicar(c); bDeshacer.disabled = false; pintar(); guardarBorrador(); hecho('Aplicado', 'chip-ok'); c.listo = true; }
          catch (err) { deshacer.pop(); avisar(err.message, 'error'); }
        } }),
        boton('Descartar', { icono: 'cerrar', onclick: () => { hecho('Descartado', 'chip-na'); c.listo = true; } }));
      return caja;
    };
    async function preguntar() {
      const texto = entrada.value.trim();
      if (!texto || !editable) return;
      entrada.value = '';
      mensajes.append(el('div', { class: 'ed-msg ed-yo' }, texto, seleccion ? el('div', { class: 'texto-suave texto-chico' }, `Sobre: ${chipSel.textContent}`) : null));
      const espera = el('div', { class: 'ed-msg ed-ia ed-espera' }, 'Pensando…');
      mensajes.append(espera); mensajes.scrollTop = mensajes.scrollHeight;
      enviar.disabled = true;
      try {
        await guardarBorrador(true);
        const r = await pedirIA(ctx.api, { empresa_id: ctx.empresa.id, accion: 'chat', nombre: titulo, documento: doc, mensaje: texto,
          seleccion: seleccion ? { seccion: seleccion.s, bloque: seleccion.b ?? -1, texto: seleccion.texto } : null, historial });
        historial.push({ rol: 'yo', texto }, { rol: 'ia', texto: r.respuesta });
        const cambios = (r.cambios ?? []).map(resolver);
        espera.replaceWith(el('div', { class: 'ed-msg ed-ia' }, r.respuesta || 'Listo.',
          cambios.length > 1 ? el('div', { class: 'ed-cambio-acc' }, boton(`Aplicar los ${cambios.length}`, { icono: 'check', onclick: (ev) => {
            const pend = cambios.filter((c) => !c.listo);
            deshacer.push(structuredClone(doc));
            try { for (const c of pend) { aplicar(c); c.listo = true; } bDeshacer.disabled = false; pintar(); guardarBorrador(); ev.currentTarget.closest('.ed-msg').querySelectorAll('.ed-cambio-acc').forEach((x) => x.replaceChildren(el('span', { class: 'chip chip-ok' }, 'Aplicado'))); }
            catch (err) { avisar(err.message, 'error'); }
          } })) : null,
          cambios.map(tarjetaCambio)));
      } catch (err) { espera.replaceWith(el('div', { class: 'ed-msg ed-ia ed-error' }, err.message)); }
      finally { enviar.disabled = false; mensajes.scrollTop = mensajes.scrollHeight; }
    }

    // Guardar como versión nueva: PDF (o Word) con el logo y el color de la empresa
    const guardar = () => abrirFormulario({
      titulo: 'Guardar como versión nueva',
      mensaje: vig ? `Vigente: versión ${vig.version} del ${fechaLarga(vig.fecha)}. Queda en el historial.` : null,
      campos: [
        { id: 'version', etiqueta: 'N° de versión', requerido: true, valor: vig ? String((Number(vig.version) || 0) + 1 || '') : '1' },
        { id: 'fecha', etiqueta: 'Fecha de aprobación', tipo: 'date', requerido: true, valor: hoyISO() },
        { id: 'aprobado', etiqueta: 'Aprobado por' },
        { id: 'cambios', etiqueta: 'Qué cambió', tipo: 'textarea', requerido: true, valor: doc.cambios || historial.filter((h) => h.rol === 'yo').map((h) => h.texto).join('; ').slice(0, 500) },
        { id: 'formato', etiqueta: 'Archivo de la versión', opciones: [['pdf', 'PDF (para entregar y firmar)'], ['docx', 'Word']], valor: 'pdf' },
      ],
      textoGuardar: 'Guardar versión',
      alGuardar: async (v) => {
        const final = { ...structuredClone(doc), version: String(v.version).trim(), codigo: doc.codigo || d.codigo || '', cambios: v.cambios.trim() };
        const archivo = v.formato === 'docx'
          ? new File([await exportarWord(ctx, final)], nombreArchivo(final, 'docx'), { type: MIME_DOCX })
          : new File([await exportarPdf(ctx, final)], nombreArchivo(final, 'pdf'), { type: 'application/pdf' });
        await guardarVersion(ctx, d.id, { version: v.version, fecha: v.fecha, aprobado: v.aprobado, cambios: v.cambios, archivo, contenido: final });
        clearTimeout(reloj); sucio = false;
        await ctx.api.from('sst_documentos').update({ borrador: null }).eq('id', d.id);
        avisar(`Versión ${v.version} guardada.`);
        location.hash = ctx.ruta('sst.documentos', { id: d.id });
      },
    });
    const vistaPrevia = async (b) => {
      b.disabled = true;
      try { const u = URL.createObjectURL(await exportarPdf(ctx, doc)); window.open(u, '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } finally { b.disabled = false; }
    };
    const descartarBorrador = () => abrirFormulario({
      titulo: 'Descartar el borrador', mensaje: 'Se pierden los cambios sin guardar y el documento vuelve a la versión vigente.', campos: [], textoGuardar: 'Descartar',
      alGuardar: async () => { clearTimeout(reloj); sucio = false; const { error: e } = await ctx.api.from('sst_documentos').update({ borrador: null }).eq('id', d.id); if (e) throw new Error(e.message); ctx.refrescar(); },
    });

    pintar();
    cuerpo.replaceChildren(
      el('div', { class: 'rv-barra-acciones' }, estadoGuardado, el('span', { class: 'rv-espaciador' }), bDeshacer,
        boton('Vista previa PDF', { icono: 'ojo', onclick: (ev) => vistaPrevia(ev.currentTarget) }),
        boton('Descargar Word', { icono: 'descargar', onclick: async () => { try { descargar(await exportarWord(ctx, doc), nombreArchivo(doc, 'docx')); } catch (err) { avisar(err.message, 'error'); } } }),
        editable && d.borrador !== undefined ? boton('Descartar borrador', { icono: 'basura', onclick: descartarBorrador }) : null,
        ctx.puede('sst', 'crear') ? boton('Guardar versión', { icono: 'check', tipo: 'primario', onclick: guardar }) : null),
      el('div', { class: 'ed-grid' },
        el('div', { class: 'ed-hoja' }, el('p', { class: 'texto-suave texto-chico' }, 'Haz clic en cualquier texto para corregirlo. Toca un bloque (o marca un texto) para que el chat sepa de qué hablas.'), papel),
        el('aside', { class: 'ed-chat ficha' },
          el('div', { class: 'ed-chat-cab' }, icono('chat', { tam: 18 }), el('strong', {}, 'Pedir cambios a la IA')),
          mensajes, chipSel,
          el('div', { class: 'ed-escribir' }, entrada, enviar),
          el('p', { class: 'texto-suave texto-chico' }, 'Propone cambios; tú decides si se aplican. Revisa siempre antes de guardar la versión.'))));
  }
}
