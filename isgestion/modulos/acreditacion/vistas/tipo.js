// Un documento de empresa: versiones (la vigente arriba), subir una nueva y ajustes del documento.
// Ruta: #/acreditacion.tipo?id=<tipo>
import { el } from '../../../core/ui/dom.js?v=14ad9ff';
import { icono } from '../../../core/ui/iconos.js?v=14ad9ff';
import { boton } from '../../../core/ui/tabla.js?v=14ad9ff';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14ad9ff';
import { leerVence } from '../../../core/ui/leer-vence.js?v=14ad9ff';
import { avisar } from '../../../core/ui/aviso.js?v=14ad9ff';
import { subirArchivo, eliminarArchivo } from '../../../core/adjuntos.js?v=14ad9ff';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=14ad9ff';
import { cargarDocumentos, estadoVersion, vigentes, CHIP, textoEstado } from '../datos.js?v=14ad9ff';
import { abrir } from './documentos.js?v=14ad9ff';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export default async function vista(ctx) {
  const { carpetas, tipos } = await cargarDocumentos(ctx);
  const t = tipos.find((x) => x.id === ctx.params.id);
  const volver = el('a', { class: 'volver', href: ctx.ruta('acreditacion.documentos') }, icono('volver', { tam: 16 }), 'Documentos de empresa');
  if (!t) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Documento no encontrado'));
  const vig = new Set(vigentes(t, t.docs).map((d) => d.id));
  const versiones = [...t.docs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));

  const eliminar = (d) => abrirFormulario({
    titulo: 'Eliminar versión', mensaje: `Se elimina la versión del ${fechaLarga(d.fecha)}${d.titular ? ` (${d.titular})` : ''} y su archivo.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('acr_documentos').update({ deleted_at: new Date().toISOString() }).eq('id', d.id);
      if (error) throw new Error(error.message);
      if (d.archivo && ctx.puede('acreditacion', 'eliminar')) await eliminarArchivo(ctx.api, d.archivo).catch(() => {});
      avisar('Versión eliminada.'); ctx.refrescar();
    },
  });

  const filas = versiones.map((d) => {
    const e = estadoVersion(d, t);
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' },
        el('strong', {}, `${d.titular ? `${d.titular} · ` : ''}${fechaLarga(d.fecha)}`),
        el('span', { class: 'texto-suave texto-chico' }, [d.vence ? `vence ${fechaLarga(d.vence)}` : null, d.nota, d.archivo ? null : 'sin archivo'].filter(Boolean).join(' · '))),
      vig.has(d.id) ? el('span', { class: `chip ${CHIP[e.k][0]}` }, textoEstado(e)) : el('span', { class: 'chip chip-na' }, 'Anterior'),
      el('div', { class: 'doc-acciones' },
        d.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': 'Ver archivo', onclick: () => abrir(ctx, d.archivo) }, icono('ojo', { tam: 16 })) : null,
        ctx.puede('acreditacion', 'editar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar versión', onclick: () => eliminar(d) }, icono('basura', { tam: 16 })) : null));
  });

  const acciones = [];
  if (ctx.puede('acreditacion', 'crear')) acciones.push(boton('Subir nueva versión', { icono: 'descargar', tipo: 'primario', onclick: () => subirVersion(ctx, t) }));
  if (ctx.puede('acreditacion', 'editar')) acciones.push(boton('Ajustes', { icono: 'editar', onclick: () => ajustes(ctx, t, carpetas) }));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, t.nombre), el('p', { class: 'texto-suave' }, [carpetas.find((c) => c.id === t.carpeta_id)?.nombre,
        t.vence ? `vence · aviso ${t.dias_aviso} días antes` : 'no vence', t.multi ? 'varios vigentes (uno por titular)' : null, t.activo ? null : 'desactivado'].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${CHIP[t.estado.k][0]}` }, textoEstado(t.estado)), acciones)),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Versiones (${versiones.length})`),
      filas.length ? filas : el('p', { class: 'texto-suave' }, 'Aún no hay archivos.')));
}

export function subirVersion(ctx, t) {
  abrirFormulario({
    titulo: `Subir · ${t.nombre}`,
    mensaje: t.multi ? 'Este documento admite varios vigentes: indica a quién corresponde. Una versión nueva del mismo titular reemplaza a la anterior.' : 'La versión nueva pasa a ser la vigente; las anteriores quedan en el historial.',
    campos: [
      { id: 'archivo', etiqueta: 'Archivo (PDF, imagen, Word o Excel; hasta 25 MB)', tipo: 'file', accept: ARCHIVOS.join(','), requerido: true },
      ...(t.multi ? [{ id: 'titular', etiqueta: '¿A quién corresponde?', requerido: true, ayuda: 'Ej.: la empresa, un socio.' }] : [{ id: 'titular', etiqueta: 'Detalle (opcional)' }]),
      { id: 'fecha', etiqueta: 'Fecha del documento', tipo: 'date', requerido: true, valor: hoyISO() },
      ...(t.vence ? [{ id: 'vence', etiqueta: 'Vence', tipo: 'date', requerido: true, accion: leerVence({ tipo: /vigencia/i.test(t.nombre) ? 'vigencia' : t.id, emision: 'fecha', fuentes: async (x) => [x.archivo] }) }] : []),
      { id: 'nota', etiqueta: 'Nota' },
    ],
    textoGuardar: 'Subir',
    alGuardar: async (v) => {
      if (!v.archivo?.size) throw new Error('Elige el archivo.');
      if (v.vence && v.vence < v.fecha) throw new Error('El vencimiento no puede ser anterior a la fecha del documento.');
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'acreditacion', archivo: v.archivo, tabla: 'acr_documentos', tipos: ARCHIVOS });
      const { error } = await ctx.api.from('acr_documentos').insert({
        empresa_id: ctx.empresa.id, tipo_id: t.id, titular: v.titular.trim() || null, fecha: v.fecha, vence: v.vence || null, archivo: ruta, nota: v.nota.trim() || null,
      });
      if (error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      avisar('Versión subida.'); ctx.refrescar();
    },
  });
}

function ajustes(ctx, t, carpetas) {
  abrirFormulario({
    titulo: `Ajustes · ${t.nombre}`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: t.nombre },
      { id: 'carpeta_id', etiqueta: 'Carpeta', opciones: carpetas.map((c) => [c.id, c.nombre]), valor: t.carpeta_id },
      { id: 'vence', etiqueta: '¿Vence?', opciones: [['no', 'No'], ['si', 'Sí']], valor: t.vence ? 'si' : 'no' },
      { id: 'dias_aviso', etiqueta: 'Avisar días antes del vencimiento', tipo: 'number', valor: String(t.dias_aviso) },
      { id: 'multi', etiqueta: '¿Varios vigentes a la vez?', opciones: [['no', 'No'], ['si', 'Sí, uno por titular']], valor: t.multi ? 'si' : 'no' },
      { id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Desactivado (no aparece en la lista)']], valor: String(t.activo) },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('acr_tipos').update({
        nombre: v.nombre.trim(), carpeta_id: v.carpeta_id, vence: v.vence === 'si', dias_aviso: Math.min(365, Math.max(0, Number(v.dias_aviso) || 0)),
        multi: v.multi === 'si', activo: v.activo === 'true',
      }).eq('id', t.id);
      if (error) throw new Error(error.code === '23505' ? 'Ya existe ese documento en la carpeta.' : error.message);
      avisar('Ajustes guardados.'); ctx.refrescar();
    },
  });
}
