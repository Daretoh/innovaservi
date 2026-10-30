// Detalle de una tarea (como InnovaGestión): datos editables, estado (pendiente / en proceso / terminada), prioridad
// inteligente, seguimiento con observaciones y cambios, @menciones que avisan a la persona, botón Recordar a los
// responsables, y archivos y fotos (elegir, pegar un pantallazo con Ctrl+V o arrastrar sobre la tarea).
import { el } from '../../../core/ui/dom.js?v=b52224b';
import { icono } from '../../../core/ui/iconos.js?v=b52224b';
import { boton } from '../../../core/ui/tabla.js?v=b52224b';
import { abrirFormulario } from '../../../core/ui/modal.js?v=b52224b';
import { avisar } from '../../../core/ui/aviso.js?v=b52224b';
import { subirArchivo, eliminarArchivo, urlsFirmadas, urlFirmada } from '../../../core/adjuntos.js?v=b52224b';
import { comprimirFoto, esImagen } from '../../../core/imagenes.js?v=b52224b';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=b52224b';
import { PRIORIDADES, nombrePrioridad, ESTADOS, REPETIR, prioridad, diasAbierta, mencionados } from '../datos.js?v=b52224b';

const MAX = 25 * 1024 * 1024;
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export async function abrirDetalle(ctx, t, { usuarios, alCambiar }) {
  const e = ctx.empresa.id;
  const yo = ctx.usuario.id;
  const nombre = new Map(usuarios.map((u) => [u.user_id, u.nombre]));
  const edita = ctx.puede('tareas', 'editar');
  const participa = edita || [t.responsable_id, t.responsable2_id, t.created_by].includes(yo);
  let cambio = false;

  const fondo = el('div', { class: 'seg-modal tar2-modal' });
  const caja = el('div', { class: 'seg-caja tar2-caja' });
  fondo.append(caja);
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); document.removeEventListener('paste', pegar); if (cambio) alCambiar(); };
  const tecla = (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) cerrar(); };
  fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);

  async function pintar() {
    const [{ data: tt }, obs, adj] = await Promise.all([
      ctx.api.from('tar_tareas').select('*').eq('id', t.id).single(),
      ctx.api.from('tar_obs').select('*').eq('tarea_id', t.id).order('created_at'),
      ctx.api.from('tar_adjuntos').select('*').eq('tarea_id', t.id).order('created_at'),
    ]);
    if (tt) t = tt;
    const pr = prioridad(t);
    const urls = await urlsFirmadas(ctx.api, (adj.data ?? []).filter((a) => a.tipo === 'foto').map((a) => a.ruta)).catch(() => new Map());

    // Estado
    const estados = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' }, ESTADOS.map(([k, n]) => el('button', {
      type: 'button', 'aria-pressed': String(t.estado === k), disabled: !participa, onclick: async () => {
        const { data: sig, error } = await ctx.api.rpc('tar_estado', { p_tarea: t.id, p_estado: k });
        if (error) { avisar(error.message, 'error'); return; }
        cambio = true; avisar(k === 'hecha' && sig ? 'Terminada. La siguiente ya quedó creada.' : `Tarea ${n.toLowerCase()}.`); pintar();
      } }, n)));

    // Seguimiento con @menciones
    const texto = el('textarea', { class: 'campo', rows: 2, placeholder: 'Escribe una observación. Usa @ para mencionar a alguien.', disabled: !participa });
    const sugerencias = el('div', { class: 'tar2-sug', hidden: true });
    texto.addEventListener('input', () => {
      const antes = texto.value.slice(0, texto.selectionStart);
      const m = antes.match(/@([\p{L} ]{0,30})$/u);
      const l = m ? usuarios.filter((u) => u.nombre.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 6) : [];
      sugerencias.hidden = !l.length;
      sugerencias.replaceChildren(...l.map((u) => el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => {
        const ini = antes.length - m[0].length;
        texto.value = `${texto.value.slice(0, ini)}@${u.nombre} ${texto.value.slice(texto.selectionStart)}`;
        sugerencias.hidden = true; texto.focus();
      } }, `@${u.nombre}`)));
    });
    const comentar = async () => {
      const v = texto.value.trim(); if (!v) return;
      const { error } = await ctx.api.from('tar_obs').insert({ empresa_id: e, tarea_id: t.id, texto: v });
      if (error) { avisar(error.message, 'error'); return; }
      const ments = mencionados(v, usuarios).filter((u) => u.user_id !== yo);
      if (ments.length) {
        const { error: e2 } = await ctx.api.from('tar_avisos').insert(ments.map((u) => ({ empresa_id: e, tarea_id: t.id, user_id: u.user_id, tipo: 'mencion', texto: v.slice(0, 300) })));
        if (e2) avisar(`La observación quedó, pero no se pudo avisar: ${e2.message}`, 'error');
        else avisar(`Avisado: ${ments.map((u) => u.nombre).join(', ')}.`);
      }
      cambio = true; pintar();
    };
    const recordar = async () => {
      const a = [t.responsable_id, t.responsable2_id].filter((x) => x && x !== yo);
      if (!a.length) { avisar('No hay otro responsable a quien recordarle.', 'error'); return; }
      const { error } = await ctx.api.from('tar_avisos').insert(a.map((u) => ({ empresa_id: e, tarea_id: t.id, user_id: u, tipo: 'recordatorio' })));
      if (error) { avisar(error.message, 'error'); return; }
      avisar(`Recordatorio enviado a ${a.map((u) => nombre.get(u) ?? '').join(' y ')}.`);
    };

    // Datos (quien edita)
    const editarDatos = () => abrirFormulario({
      titulo: 'Editar tarea',
      campos: [
        { id: 'titulo', etiqueta: 'Tarea', requerido: true, valor: t.titulo },
        { id: 'detalle', etiqueta: 'Detalle', tipo: 'textarea', valor: t.detalle ?? '' },
        { id: 'fecha', etiqueta: 'Vence', tipo: 'date', valor: t.fecha ?? '' },
        { id: 'prioridad', etiqueta: 'Prioridad', opciones: PRIORIDADES, valor: t.prioridad },
        { id: 'responsable', etiqueta: 'Responsable', opciones: [['', 'Sin asignar'], ...usuarios.map((u) => [u.user_id, u.nombre])], valor: t.responsable_id ?? '' },
        { id: 'responsable2', etiqueta: '2.º responsable', opciones: [['', 'Ninguno'], ...usuarios.map((u) => [u.user_id, u.nombre])], valor: t.responsable2_id ?? '' },
        { id: 'repetir', etiqueta: 'Repetir', opciones: REPETIR, valor: t.repetir },
      ],
      alGuardar: async (v) => {
        if (v.repetir !== 'no' && !v.fecha) throw new Error('Una tarea que se repite necesita fecha.');
        const { error } = await ctx.api.from('tar_tareas').update({ titulo: v.titulo.trim(), detalle: v.detalle.trim() || null, fecha: v.fecha || null, prioridad: v.prioridad,
          responsable_id: v.responsable || null, responsable2_id: v.responsable2 && v.responsable2 !== v.responsable ? v.responsable2 : null, repetir: v.repetir }).eq('id', t.id);
        if (error) throw new Error(error.message);
        cambio = true; pintar();
      },
    });
    const eliminar = () => abrirFormulario({ titulo: 'Eliminar tarea', mensaje: `"${t.titulo}" sale de la lista (queda en la auditoría).`, campos: [], textoGuardar: 'Eliminar',
      alGuardar: async () => { const { error } = await ctx.api.from('tar_tareas').update({ deleted_at: new Date().toISOString() }).eq('id', t.id); if (error) throw new Error(error.message); cambio = true; cerrar(); } });

    // Archivos
    const entrada = el('input', { type: 'file', multiple: true, hidden: true, accept: 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv' });
    entrada.addEventListener('change', () => subir([...entrada.files]));
    const quitar = async (a) => {
      const { error } = await ctx.api.from('tar_adjuntos').delete().eq('id', a.id);
      if (error) { avisar(error.message, 'error'); return; }
      eliminarArchivo(ctx.api, a.ruta).catch(() => {});
      cambio = true; pintar();
    };
    const ver = async (a) => { try { window.open(await urlFirmada(ctx.api, a.ruta, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };
    const archivos = adj.data ?? [];

    caja.replaceChildren(
      el('div', { class: 'seg-cab' },
        el('div', {}, el('h2', {}, t.titulo),
          el('p', { class: 'texto-suave' }, [`Responsable: ${nombre.get(t.responsable_id) ?? 'sin asignar'}`, t.responsable2_id ? `2.º: ${nombre.get(t.responsable2_id) ?? ''}` : null,
            t.fecha ? `vence ${fechaLarga(t.fecha)}` : 'sin fecha', `${diasAbierta(t)} d abierta`, t.created_by ? `creó ${nombre.get(t.created_by) ?? '—'}` : null].filter(Boolean).join(' · '))),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
      el('div', { class: 'tar2-barra' }, estados,
        el('span', { class: `chip ${pr.p === 'alta' ? 'chip-venc' : pr.p === 'media' ? 'chip-prox' : 'chip-pend'}`, title: pr.por }, `Prioridad ${nombrePrioridad[pr.p].toLowerCase()}`, pr.sube ? ` ↑ (${pr.por.toLowerCase()})` : ''),
        el('span', { class: 'tar2-acciones' },
          participa ? boton('Recordar', { icono: 'campana', onclick: recordar }) : null,
          edita ? boton('Editar', { icono: 'editar', onclick: editarDatos }) : null,
          ctx.puede('tareas', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar tarea', onclick: eliminar }, icono('basura', { tam: 16 })) : null)),
      t.detalle ? el('p', { class: 'tar2-detalle' }, t.detalle) : null,
      el('h3', {}, `Archivos y fotos (${archivos.length})`),
      el('div', { class: 'tar2-adjuntos' },
        archivos.map((a) => el('div', { class: 'tar2-adj' },
          a.tipo === 'foto' && urls.get(a.ruta) ? el('button', { type: 'button', class: 'tar2-mini', onclick: () => ver(a) }, el('img', { src: urls.get(a.ruta), alt: a.nombre, loading: 'lazy' }))
            : el('button', { type: 'button', class: 'tar2-mini tar2-doc', onclick: () => ver(a) }, icono(a.tipo === 'video' ? 'video' : 'documento', { tam: 22 })),
          el('span', { class: 'texto-chico tar2-adj-nombre', title: a.nombre }, a.nombre),
          el('span', { class: 'texto-chico texto-suave' }, `${nombre.get(a.autor) ?? ''} · ${fechaLarga(diaLocal(a.created_at))}`),
          a.autor === yo || ctx.puede('tareas', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${a.nombre}`, onclick: () => quitar(a) }, icono('basura', { tam: 14 })) : null)),
        participa ? el('button', { type: 'button', class: 'tar2-mini tar2-subir', onclick: () => entrada.click() }, icono('mas', { tam: 20 }), el('span', { class: 'texto-chico' }, 'Adjuntar')) : null, entrada),
      participa ? el('p', { class: 'texto-suave texto-chico' }, 'Fotos, videos, PDF, Office o ZIP hasta 25 MB. También puedes pegar un pantallazo (Ctrl+V) o arrastrar archivos sobre la tarea.') : null,
      el('h3', {}, 'Seguimiento'),
      el('div', { class: 'tar2-obs' }, (obs.data ?? []).length ? (obs.data ?? []).map((o) => el('div', { class: `tar2-o ${o.tipo === 'cambio' ? 'tar2-cambio' : ''}` },
        el('span', { class: 'texto-chico texto-suave' }, `${nombre.get(o.autor) ?? 'Sistema'} · ${fechaLarga(diaLocal(o.created_at))} ${hora(o.created_at)}`),
        el('span', {}, o.texto))) : el('p', { class: 'texto-suave texto-chico' }, 'Sin observaciones.')),
      participa ? el('div', { class: 'tar2-comentar' }, texto, sugerencias, el('div', {}, boton('Agregar observación', { icono: 'mas', tipo: 'primario', onclick: comentar }))) : null);
  }

  async function subir(lista) {
    if (!participa) return;
    let ok = 0;
    for (const f of lista) {
      try {
        if (f.size > MAX) throw new Error(`${f.name}: supera 25 MB.`);
        const foto = esImagen(f);
        const archivo = foto ? await comprimirFoto(f, 1600) : f;
        const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'tareas', archivo, tabla: 'tar_tareas', registroId: t.id, maxBytes: MAX });
        const { error } = await ctx.api.from('tar_adjuntos').insert({ empresa_id: e, tarea_id: t.id, ruta, nombre: (f.name || 'pantallazo.png').slice(0, 120),
          tipo: foto ? 'foto' : f.type.startsWith('video/') ? 'video' : 'doc', tamano: archivo.size });
        if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
        ok += 1;
      } catch (err) { avisar(err.message, 'error'); }
    }
    if (ok) { avisar(`${ok} archivo${ok === 1 ? '' : 's'} adjuntado${ok === 1 ? '' : 's'}.`); cambio = true; pintar(); }
  }
  // Pegar pantallazos y arrastrar archivos sobre la tarea abierta
  document.addEventListener('paste', pegar);
  function pegar(ev) {
    const fs = [...(ev.clipboardData?.files ?? [])];
    if (!fs.length) return;
    ev.preventDefault(); subir(fs.map((f, i) => (f.name ? f : new File([f], `pantallazo-${i + 1}.png`, { type: f.type }))));
  }
  caja.addEventListener('dragover', (ev) => { if (participa && ev.dataTransfer?.types?.includes('Files')) { ev.preventDefault(); caja.classList.add('tar2-soltar'); } });
  caja.addEventListener('dragleave', (ev) => { if (!caja.contains(ev.relatedTarget)) caja.classList.remove('tar2-soltar'); });
  caja.addEventListener('drop', (ev) => { ev.preventDefault(); caja.classList.remove('tar2-soltar'); if (ev.dataTransfer?.files?.length) subir([...ev.dataTransfer.files]); });

  caja.append(el('div', { class: 'cargando-bloque', 'aria-busy': 'true' }, el('span', { class: 'cargador' })));
  await pintar().catch((err) => { avisar(err.message, 'error'); cerrar(); });
}
