// Documentos de empresa: carpetas con sus documentos, estado de la versión vigente y avisos de vencimiento.
import { el } from '../../../core/ui/dom.js?v=af5b0f2';
import { icono } from '../../../core/ui/iconos.js?v=af5b0f2';
import { boton } from '../../../core/ui/tabla.js?v=af5b0f2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=af5b0f2';
import { avisar } from '../../../core/ui/aviso.js?v=af5b0f2';
import { urlFirmada } from '../../../core/adjuntos.js?v=af5b0f2';
import { fechaLarga } from '../../../core/ui/formato.js?v=af5b0f2';
import { cargarDocumentos, CHIP, textoEstado } from '../datos.js?v=af5b0f2';
import { CARPETAS } from '../sugeridos.js?v=af5b0f2';
import { subirVersion } from './tipo.js?v=af5b0f2';

let buscar = '';

export default async function vista(ctx) {
  const { carpetas, tipos } = await cargarDocumentos(ctx);
  const puede = { crear: ctx.puede('acreditacion', 'crear'), editar: ctx.puede('acreditacion', 'editar'), eliminar: ctx.puede('acreditacion', 'eliminar') };
  const activos = tipos.filter((t) => t.activo);
  const cuenta = (k) => activos.filter((t) => t.estado.k === k).length;

  const fila = (t) => {
    const e = t.estado;
    const ultima = e.vigentes?.[0];
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' },
        el('a', { href: ctx.ruta('acreditacion.tipo', { id: t.id }) }, el('strong', {}, t.nombre)),
        el('span', { class: 'texto-suave texto-chico' }, [
          t.multi && e.vigentes?.length ? e.vigentes.map((d) => d.titular || 'Sin titular').join(' · ') : null,
          ultima ? `${t.multi ? 'último' : 'versión'} del ${fechaLarga(ultima.fecha)}${ultima.vence ? ` · vence ${fechaLarga(ultima.vence)}` : ''}` : null,
          t.docs.length > 1 ? `${t.docs.length} archivos` : null,
        ].filter(Boolean).join(' · '))),
      el('span', { class: `chip ${CHIP[e.k][0]}` }, textoEstado(e)),
      el('div', { class: 'doc-acciones' },
        ultima?.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver ${t.nombre}`, onclick: () => abrir(ctx, ultima.archivo) }, icono('ojo', { tam: 16 })) : null,
        puede.crear ? el('button', { type: 'button', class: 'boton-icono', title: 'Subir nueva versión', 'aria-label': `Subir ${t.nombre}`, onclick: () => subirVersion(ctx, t) }, icono('descargar', { tam: 16 })) : null));
  };

  const q = buscar.trim().toLowerCase();
  const grupos = carpetas.map((c) => {
    const lista = tipos.filter((t) => t.carpeta_id === c.id && t.activo && (!q || t.nombre.toLowerCase().includes(q)));
    if (q && !lista.length) return null;
    return el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, icono('carpeta', { tam: 18 }), ` ${c.nombre}`),
        el('div', { class: 'listado-acciones' },
          puede.crear ? boton('Agregar documento', { icono: 'mas', onclick: () => nuevoTipo(ctx, carpetas, c.id) }) : null,
          puede.editar ? el('button', { type: 'button', class: 'boton-icono', title: 'Renombrar carpeta', 'aria-label': `Renombrar ${c.nombre}`, onclick: () => carpeta(ctx, c, tipos) }, icono('editar', { tam: 16 })) : null)),
      lista.length ? lista.map(fila) : el('p', { class: 'texto-suave' }, 'Sin documentos en esta carpeta.'));
  }).filter(Boolean);

  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'Buscar documento…', value: buscar, 'aria-label': 'Buscar documento' });
  buscador.addEventListener('input', () => { buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const acciones = [buscador];
  if (puede.crear) acciones.push(boton('Nueva carpeta', { icono: 'carpeta', onclick: () => carpeta(ctx, null, tipos) }));
  if (puede.crear && !carpetas.length) acciones.push(boton('Cargar carpetas sugeridas', { icono: 'mas', tipo: 'primario', onclick: (ev) => sugeridas(ctx, ev.currentTarget) }));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Documentos de empresa'), el('div', { class: 'listado-acciones' }, acciones)),
    activos.length ? el('div', { class: 'resumen-chips' },
      cuenta('venc') ? el('span', { class: 'chip chip-venc' }, `${cuenta('venc')} vencidos`) : null,
      cuenta('prox') ? el('span', { class: 'chip chip-prox' }, `${cuenta('prox')} por vencer`) : null,
      cuenta('sin') ? el('span', { class: 'chip chip-pend' }, `${cuenta('sin')} sin archivo`) : null,
      el('span', { class: 'chip chip-ok' }, `${cuenta('ok') + cuenta('cargado')} al día`)) : null,
    grupos.length ? grupos : el('p', { class: 'texto-suave' }, carpetas.length ? 'Sin resultados.' : 'Aún no hay carpetas. Carga las sugeridas o crea las tuyas.'),
    tipos.some((t) => !t.activo) ? el('p', { class: 'texto-suave texto-chico' }, 'Desactivados: ',
      tipos.filter((t) => !t.activo).flatMap((t, i) => [i ? ' · ' : '', el('a', { href: ctx.ruta('acreditacion.tipo', { id: t.id }) }, t.nombre)])) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Cada subida es una versión: manda la de fecha más reciente. Los documentos que vencen avisan antes según sus días de aviso.'));
}

export async function abrir(ctx, ruta) {
  try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); }
}

function carpeta(ctx, c, tipos) {
  const vacia = c && !tipos.some((t) => t.carpeta_id === c.id);
  abrirFormulario({
    titulo: c ? 'Carpeta' : 'Nueva carpeta',
    mensaje: c && !vacia ? 'Para eliminar la carpeta, primero mueve o desactiva sus documentos.' : null,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre ?? '' },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: String(c?.orden ?? 0) },
      ...(vacia && ctx.puede('acreditacion', 'eliminar') ? [{ id: 'eliminar', etiqueta: 'Eliminar esta carpeta', opciones: [['no', 'No'], ['si', 'Sí, eliminarla']], valor: 'no' }] : []),
    ],
    alGuardar: async (v) => {
      const r = v.eliminar === 'si'
        ? await ctx.api.from('acr_carpetas').delete().eq('id', c.id)
        : c
          ? await ctx.api.from('acr_carpetas').update({ nombre: v.nombre.trim(), orden: Number(v.orden) || 0 }).eq('id', c.id)
          : await ctx.api.from('acr_carpetas').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), orden: Number(v.orden) || 0 });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe una carpeta con ese nombre.' : r.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });
}

function nuevoTipo(ctx, carpetas, carpetaId) {
  abrirFormulario({
    titulo: 'Agregar documento',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre del documento', requerido: true, ayuda: 'Ej.: Certificado de vigencia, Póliza de responsabilidad civil.' },
      { id: 'carpeta_id', etiqueta: 'Carpeta', opciones: carpetas.map((c) => [c.id, c.nombre]), valor: carpetaId },
      { id: 'vence', etiqueta: '¿Vence?', opciones: [['no', 'No'], ['si', 'Sí, pide fecha de vencimiento']], valor: 'no' },
      { id: 'multi', etiqueta: '¿Varios vigentes a la vez?', opciones: [['no', 'No, manda la versión más reciente'], ['si', 'Sí, uno por titular (ej.: e-RUT de cada socio)']], valor: 'no' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('acr_tipos').insert({
        empresa_id: ctx.empresa.id, carpeta_id: v.carpeta_id, nombre: v.nombre.trim(), vence: v.vence === 'si', multi: v.multi === 'si',
      });
      if (error) throw new Error(error.code === '23505' ? 'Ya existe ese documento en la carpeta.' : error.message);
      avisar('Documento agregado. Ya puedes subir su archivo.'); ctx.refrescar();
    },
  });
}

async function sugeridas(ctx, b) {
  b.disabled = true;
  try {
    for (const [i, [nombre, docs]] of CARPETAS.entries()) {
      const { data: c, error } = await ctx.api.from('acr_carpetas').insert({ empresa_id: ctx.empresa.id, nombre, orden: i + 1 }).select('id').single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('acr_tipos').insert(docs.map(([n, vence, multi], j) => ({ empresa_id: ctx.empresa.id, carpeta_id: c.id, nombre: n, vence, multi, orden: j + 1 })));
      if (e2) throw new Error(e2.message);
    }
    avisar('Carpetas sugeridas cargadas. Cámbialas a tu gusto.');
    ctx.refrescar();
  } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
}
