// Capacitaciones → Sesiones: capacitaciones hechas o programadas, con asistentes, evaluación y respaldo firmado.
// Ruta: #/capacitaciones.sesiones
import { el } from '../../../core/ui/dom.js?v=2c59c76';
import { boton, listado } from '../../../core/ui/tabla.js?v=2c59c76';
import { abrirFormulario } from '../../../core/ui/modal.js?v=2c59c76';
import { exportarExcel } from '../../../core/excel.js?v=2c59c76';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=2c59c76';
import { cargarEstilos, cargarBiblioteca, conCarga, duracion } from '../datos.js?v=2c59c76';

export default async function vista(ctx) {
  cargarEstilos();
  const [ses, asis] = await Promise.all([
    ctx.api.from('cap_sesiones').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }),
    ctx.api.from('cap_asistentes').select('sesion_id, asistio, aprobado').eq('empresa_id', ctx.empresa.id),
  ]);
  if (ses.error) throw new Error(ses.error.message);
  const de = (id) => (asis.data ?? []).filter((a) => a.sesion_id === id);
  const filas = ses.data.map((s) => ({ s, asistentes: de(s.id).filter((a) => a.asistio).length, aprobados: de(s.id).filter((a) => a.aprobado).length }));
  const acciones = [];
  if (ctx.puede('capacitaciones', 'exportar') && filas.length) acciones.push(boton('Excel', { icono: 'descargar', onclick: (ev) => conCarga(ev, () => exportarExcel(ctx, {
    titulo: 'Sesiones de capacitación', nombre: 'sesiones-capacitacion',
    columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Tema', 'Relator', 'Duración', 'Lugar', { t: 'Asistentes', tipo: 'numero' }, { t: 'Aprobados', tipo: 'numero' }, 'Estado', 'Respaldo'],
    filas: filas.map((f) => [f.s.fecha, f.s.tema, f.s.relator ?? '', duracion(f.s.duracion_min), f.s.lugar ?? '', f.asistentes, f.s.con_evaluacion ? f.aprobados : null,
      f.s.estado === 'cerrada' ? 'Cerrada' : 'Abierta', f.s.respaldo_ruta || f.s.entrega_id ? 'Sí' : 'No']),
  })) }));
  if (ctx.puede('capacitaciones', 'crear')) acciones.push(boton('Nueva sesión', { icono: 'mas', tipo: 'primario', onclick: () => nuevaSesion(ctx) }));
  return listado({
    titulo: 'Sesiones de capacitación',
    acciones,
    vacio: 'Aún no hay sesiones registradas.',
    alFila: (f) => { location.hash = ctx.ruta('capacitaciones.sesion', { id: f.s.id }); },
    columnas: [
      { titulo: 'Fecha', valor: (f) => fechaLarga(f.s.fecha) },
      { titulo: 'Tema', valor: (f) => el('strong', {}, f.s.tema) },
      { titulo: 'Relator', valor: (f) => f.s.relator ?? '' },
      { titulo: 'Asistentes', valor: (f) => String(f.asistentes) },
      { titulo: 'Evaluación', valor: (f) => (f.s.con_evaluacion ? `${f.aprobados} aprobados` : '—') },
      { titulo: 'Respaldo', valor: (f) => (f.s.respaldo_ruta || f.s.entrega_id ? el('span', { class: 'chip chip-ok' }, 'Sí') : el('span', { class: 'chip chip-pend' }, 'Falta')) },
      { titulo: 'Estado', valor: (f) => el('span', { class: `chip ${f.s.estado === 'cerrada' ? 'chip-ok' : 'chip-na'}` }, f.s.estado === 'cerrada' ? 'Cerrada' : 'Abierta') },
    ],
    filas,
  });
}

// Formulario de una sesión (nueva o editar)
export async function formularioSesion(ctx, s = null) {
  const bib = await cargarBiblioteca(ctx);
  abrirFormulario({
    titulo: s ? 'Editar sesión' : 'Nueva sesión',
    campos: [
      { id: 'tema', etiqueta: 'Tema', requerido: true, valor: s?.tema ?? '', ayuda: 'Ej.: Manejo manual de cargas, Uso de EPP.' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: s?.fecha ?? hoyISO() },
      { id: 'relator', etiqueta: 'Relator', valor: s?.relator ?? '' },
      { id: 'duracion_min', etiqueta: 'Duración (minutos)', tipo: 'number', valor: s?.duracion_min ?? '' },
      { id: 'lugar', etiqueta: 'Lugar', valor: s?.lugar ?? '' },
      { id: 'descripcion', etiqueta: 'Temario (una línea por punto)', tipo: 'textarea', filas: 4, valor: s?.descripcion ?? '' },
      { id: 'contenidos', etiqueta: 'Contenidos de la biblioteca usados', tipo: 'checks', valor: s?.contenidos ?? [],
        opciones: bib.contenidos.filter((c) => c.publicado).map((c) => [c.id, `${c.titulo}${bib.areaDe.get(c.area_id) ? ` · ${bib.areaDe.get(c.area_id).nombre}` : ''}`]) },
      { id: 'con_evaluacion', etiqueta: 'Con evaluación (nota de 1 a 7)', opciones: [['no', 'No'], ['si', 'Sí']], valor: s?.con_evaluacion ? 'si' : 'no' },
      { id: 'nota_minima', etiqueta: 'Nota mínima para aprobar', tipo: 'number', valor: s?.nota_minima ?? 4 },
    ],
    textoGuardar: s ? 'Guardar' : 'Crear',
    alGuardar: async (v) => {
      const nota = Number(String(v.nota_minima).replace(',', '.'));
      if (!(nota >= 1 && nota <= 7)) throw new Error('La nota mínima va de 1 a 7.');
      const fila = {
        tema: v.tema.trim(), fecha: v.fecha, relator: v.relator.trim() || null, lugar: v.lugar.trim() || null, descripcion: v.descripcion.trim() || null,
        duracion_min: v.duracion_min === '' ? null : Math.max(0, Math.round(Number(v.duracion_min) || 0)), contenidos: v.contenidos,
        con_evaluacion: v.con_evaluacion === 'si', nota_minima: Math.round(nota * 10) / 10,
      };
      if (s) {
        const { error } = await ctx.api.from('cap_sesiones').update(fila).eq('id', s.id);
        if (error) throw new Error(error.message);
        ctx.refrescar();
      } else {
        const { data, error } = await ctx.api.from('cap_sesiones').insert({ ...fila, empresa_id: ctx.empresa.id }).select('id').single();
        if (error) throw new Error(error.message);
        location.hash = ctx.ruta('capacitaciones.sesion', { id: data.id });
      }
    },
  });
}
const nuevaSesion = (ctx) => formularioSesion(ctx);
