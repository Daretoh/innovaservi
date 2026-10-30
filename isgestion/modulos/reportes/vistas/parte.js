// Parte de trabajo: datos del informe, fotos y videos por etapa, vista previa, confirmar y reabrir.
// Ruta: #/reportes.parte?id=<parte_id>
import { el } from '../../../core/ui/dom.js?v=ca87e0a';
import { icono } from '../../../core/ui/iconos.js?v=ca87e0a';
import { boton } from '../../../core/ui/tabla.js?v=ca87e0a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=ca87e0a';
import { avisar } from '../../../core/ui/aviso.js?v=ca87e0a';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=ca87e0a';
import { fechaLarga, nombreDia, fechaCorta } from '../../../core/ui/formato.js?v=ca87e0a';
import { cargarParte, ETAPAS, nombreTercero, comprimirFoto, urlsFirmadas, faenasDistintas } from '../datos.js?v=ca87e0a';

const MAX_VIDEO = 25 * 1024 * 1024;
let etapaSubida = 'antes';

export default async function vista(ctx) {
  const datos = await cargarParte(ctx, ctx.params.id);
  const volver = el('a', { class: 'volver', href: ctx.ruta('reportes.lista') }, icono('volver', { tam: 16 }), 'Partes de trabajo');
  if (!datos.parte) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Parte no encontrado'));
  const { parte, faenas, media } = datos;
  const confirmado = parte.estado === 'confirmado';
  const editable = !confirmado && ctx.puede('reportes', 'editar') && ctx.puede('reportes', 'crear');
  const urls = await urlsFirmadas(ctx.api, media.map((m) => m.ruta));
  const distintas = faenasDistintas(faenas);
  const varias = distintas.length > 1;

  // ---- Datos (se guardan al salir de cada campo)
  const campo = (id, etiqueta, valor, largo = false) => {
    const c = largo
      ? Object.assign(el('textarea', { class: 'campo', rows: 3, disabled: !editable, id: `p-${id}` }), { value: valor ?? '' })
      : el('input', { class: 'campo', value: valor ?? '', disabled: !editable, id: `p-${id}` });
    c.addEventListener('change', async () => {
      const { error } = await ctx.api.from('rep_partes').update({ [id]: c.value.trim() || null }).eq('id', parte.id);
      if (error) avisar(error.message, 'error'); else avisar('Guardado.');
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `p-${id}` }, etiqueta), c);
  };

  // ---- Subida de fotos y videos
  const entrada = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
  const progreso = el('span', { class: 'texto-suave' });
  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files];
    if (!archivos.length) return;
    let ok = 0; let orden = media.length;
    for (const [i, a] of archivos.entries()) {
      progreso.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
      try {
        const video = a.type.startsWith('video/');
        if (video && a.size > MAX_VIDEO) throw new Error(`${a.name}: el video supera 25 MB.`);
        const archivo = video ? a : await comprimirFoto(a);
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'reportes', archivo, tabla: 'rep_partes', registroId: parte.id, maxBytes: MAX_VIDEO });
        const { error } = await ctx.api.from('rep_media').insert({
          parte_id: parte.id, empresa_id: ctx.empresa.id, ruta, tipo: video ? 'video' : 'foto', etapa: etapaSubida,
          faena_id: distintas.length === 1 ? distintas[0].faena_id : null, orden: orden++, nombre: a.name, tamano: archivo.size,
        });
        if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
        ok += 1;
      } catch (e) { avisar(e.message, 'error'); }
    }
    avisar(`Se subieron ${ok} de ${archivos.length}.`);
    ctx.refrescar();
  });
  const selEtapa = el('select', { class: 'campo campo-filtro', 'aria-label': 'Etapa de las fotos que vas a subir' },
    ETAPAS.map(([k, t]) => el('option', { value: k, selected: k === etapaSubida }, `Subir como: ${t}`)));
  selEtapa.addEventListener('change', () => { etapaSubida = selEtapa.value; });

  // ---- Galería por etapa
  const mover = async (m, lista, dir) => {
    const i = lista.indexOf(m); const otro = lista[i + dir];
    if (!otro) return;
    const [a, b] = [m.orden, otro.orden === m.orden ? m.orden + dir : otro.orden];
    const r1 = await ctx.api.from('rep_media').update({ orden: b }).eq('id', m.id);
    const r2 = await ctx.api.from('rep_media').update({ orden: a }).eq('id', otro.id);
    if (r1.error || r2.error) avisar((r1.error ?? r2.error).message, 'error');
    ctx.refrescar();
  };
  // Secciones dentro del parte (ej.: Cámara 1 / Cámara 2): las que ya tienen las fotos, en orden de aparición
  const secciones = [...new Set(media.map((m) => m.seccion).filter(Boolean))];
  const ponerSeccion = async (m, valor) => {
    const { error } = await ctx.api.from('rep_media').update({ seccion: valor || null }).eq('id', m.id);
    if (error) avisar(error.message, 'error');
    ctx.refrescar();
  };
  const tarjeta = (m, lista) => {
    const url = urls.get(m.ruta);
    const selector = el('select', { class: 'campo', disabled: !editable, 'aria-label': 'Etapa' }, ETAPAS.map(([k, t]) => el('option', { value: k, selected: m.etapa === k }, t)));
    selector.addEventListener('change', async () => { const { error } = await ctx.api.from('rep_media').update({ etapa: selector.value }).eq('id', m.id); if (error) avisar(error.message, 'error'); ctx.refrescar(); });
    const selFaena = varias ? el('select', { class: 'campo', disabled: !editable, 'aria-label': 'Faena' },
      el('option', { value: '' }, 'Sin faena'), distintas.map((f) => el('option', { value: f.faena_id, selected: m.faena_id === f.faena_id }, f.ope_faenas?.titulo ?? 'Faena'))) : null;
    selFaena?.addEventListener('change', async () => { const { error } = await ctx.api.from('rep_media').update({ faena_id: selFaena.value || null }).eq('id', m.id); if (error) avisar(error.message, 'error'); ctx.refrescar(); });
    const selSeccion = editable || m.seccion ? el('select', { class: 'campo', disabled: !editable, 'aria-label': 'Sección', title: 'Sección del informe (ej.: Cámara 1 / Cámara 2)' },
      el('option', { value: '' }, 'Sin sección'), secciones.map((x) => el('option', { value: x, selected: m.seccion === x }, x)), el('option', { value: '__nueva' }, 'Nueva sección…')) : null;
    selSeccion?.addEventListener('change', () => {
      if (selSeccion.value !== '__nueva') { ponerSeccion(m, selSeccion.value); return; }
      selSeccion.value = m.seccion ?? '';
      abrirFormulario({ titulo: 'Nueva sección', mensaje: 'Para separar en el informe dos trabajos de una misma faena (ej.: Cámara 1 y Cámara 2).',
        campos: [{ id: 'nombre', etiqueta: 'Nombre de la sección', requerido: true }], textoGuardar: 'Crear',
        alGuardar: async (v) => ponerSeccion(m, v.nombre.trim().slice(0, 60)) });
    });
    return el('div', { class: 'media-tarjeta' },
      m.tipo === 'video'
        ? el('a', { class: 'media-video', href: url, target: '_blank', rel: 'noopener' }, icono('video', { tam: 32 }), el('span', { class: 'texto-chico' }, 'Video'))
        : el('a', { href: url, target: '_blank', rel: 'noopener' }, el('img', { src: url, alt: m.nombre ?? 'Foto', loading: 'lazy' })),
      selector, selFaena, selSeccion,
      editable ? el('div', { class: 'media-acciones' },
        el('button', { type: 'button', class: 'boton-icono', title: 'Mover antes', 'aria-label': 'Mover antes', onclick: () => mover(m, lista, -1) }, icono('volver', { tam: 15 })),
        el('button', { type: 'button', class: 'boton-icono', title: 'Mover después', 'aria-label': 'Mover después', onclick: () => mover(m, lista, 1) }, icono('derecha', { tam: 15 })),
        el('button', {
          type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar archivo',
          onclick: async () => {
            const { error } = await ctx.api.from('rep_media').delete().eq('id', m.id);
            if (error) { avisar(error.message, 'error'); return; }
            await eliminarArchivo(ctx.api, m.ruta).catch(() => {});
            avisar('Eliminado.'); ctx.refrescar();
          },
        }, icono('basura', { tam: 15 }))) : null);
  };
  const galeria = ETAPAS.map(([k, t]) => {
    const lista = media.filter((m) => m.etapa === k);
    if (!lista.length) return null;
    return el('div', { class: 'galeria-etapa' }, el('h3', {}, `${t} (${lista.length})`), el('div', { class: 'galeria' }, lista.map((m) => tarjeta(m, lista))));
  }).filter(Boolean);
  const sinOrdenar = media.filter((m) => m.etapa === 'sin').length;

  // ---- Acciones del informe
  const acciones = [];
  acciones.push(boton('Vista previa', { icono: 'ojo', onclick: (ev) => previa(ctx, datos, ev.currentTarget) }));
  if (!confirmado && ctx.puede('reportes', 'editar')) acciones.push(boton('Confirmar informe', { icono: 'check', tipo: 'primario', onclick: () => confirmar(ctx, datos) }));
  if (confirmado && parte.pdf_ruta) acciones.push(boton('Descargar PDF', { icono: 'descargar', onclick: async () => { try { window.open(await urlFirmada(ctx.api, parte.pdf_ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }));
  if (confirmado && ctx.puede('reportes', 'editar')) acciones.push(boton('Reabrir', { icono: 'editar', onclick: () => reabrir(ctx, parte) }));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {},
        el('h1', {}, nombreTercero(parte.terceros)),
        el('p', { class: 'texto-suave' }, [parte.ope_sitios?.nombre ?? parte.lugar, fechaLarga(parte.fecha)].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${confirmado ? 'chip-ok' : 'chip-prox'}` }, confirmado ? `Confirmado ${new Date(parte.confirmado_at).toLocaleDateString('es-CL')}` : 'Borrador'), acciones)),
    confirmado ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Informe confirmado: el parte está bloqueado. Para cambiarlo, reábrelo y vuelve a confirmar.') : null,
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Faenas incluidas'),
        faenas.length ? faenas.map((f) => el('p', {}, `${nombreDia(f.fecha)} ${fechaCorta(f.fecha)} — ${f.ope_faenas?.titulo ?? ''}`)) : el('p', { class: 'texto-suave' }, 'Sin faenas (parte suelto).')),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos del informe'),
        campo('solicitado_por', 'Solicitado por', parte.solicitado_por),
        campo('responsable', 'Responsable de la faena', parte.responsable),
        campo('lugar', 'Lugar', parte.lugar),
        campo('trabajo', 'Trabajo realizado (una línea por trabajo; se suman los títulos de las faenas)', parte.trabajo, true),
        campo('observaciones', 'Observaciones', parte.observaciones, true))),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, `Fotos y videos (${media.length})`),
        editable ? el('div', { class: 'listado-acciones' }, selEtapa, boton('Subir fotos o videos', { icono: 'camara', tipo: 'primario', onclick: () => entrada.click() }), progreso, entrada) : null),
      sinOrdenar ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${sinOrdenar} sin ordenar: asígnales una etapa (Antes, Proceso, Después o Registro documental); las sin ordenar no van al informe.`) : null,
      galeria.length ? galeria : el('p', { class: 'texto-suave' }, 'Aún no hay fotos. Elige la etapa y súbelas; desde el celular puedes tomarlas en el momento.'),
      el('p', { class: 'texto-suave texto-chico' }, 'Las fotos se achican antes de subir (lado mayor 1.600 px). Los videos (hasta 25 MB) se guardan pero no van al PDF.')),
  );
}

async function previa(ctx, datos, b) {
  b.disabled = true;
  try {
    const { generarInforme } = await import('../informe.js?v=ca87e0a');
    const doc = await generarInforme(ctx, datos);
    window.open(doc.output('bloburl'), '_blank', 'noopener');
  } catch (e) { avisar(`No se pudo generar: ${e.message}`, 'error'); } finally { b.disabled = false; }
}

function confirmar(ctx, datos) {
  const fotos = datos.media.filter((m) => m.tipo === 'foto' && m.etapa !== 'sin').length;
  abrirFormulario({
    titulo: 'Confirmar informe',
    mensaje: `Se genera el PDF con ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}, se guarda y el parte queda bloqueado. Puedes reabrirlo después si hay que corregir.`,
    campos: [],
    textoGuardar: 'Confirmar',
    alGuardar: async () => {
      const { generarInforme } = await import('../informe.js?v=ca87e0a');
      const doc = await generarInforme(ctx, datos);
      const archivo = new File([doc.output('blob')], `informe-${datos.parte.fecha}.pdf`, { type: 'application/pdf' });
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'reportes', archivo, tabla: 'rep_partes', registroId: datos.parte.id });
      const anterior = datos.parte.pdf_ruta;
      const { error } = await ctx.api.from('rep_partes').update({ estado: 'confirmado', pdf_ruta: ruta, confirmado_at: new Date().toISOString(), confirmado_por: ctx.usuario.id }).eq('id', datos.parte.id);
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      if (anterior) await eliminarArchivo(ctx.api, anterior).catch(() => {});
      avisar('Informe confirmado y guardado.');
      ctx.refrescar();
    },
  });
}

function reabrir(ctx, parte) {
  abrirFormulario({
    titulo: 'Reabrir parte',
    mensaje: 'El parte vuelve a borrador para corregirlo. El PDF actual se reemplaza cuando confirmes de nuevo.',
    campos: [],
    textoGuardar: 'Reabrir',
    alGuardar: async () => {
      const { error } = await ctx.api.from('rep_partes').update({ estado: 'borrador' }).eq('id', parte.id);
      if (error) throw new Error(error.message);
      avisar('Parte reabierto.');
      ctx.refrescar();
    },
  });
}
