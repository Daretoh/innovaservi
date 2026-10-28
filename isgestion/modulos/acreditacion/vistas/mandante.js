// Requisitos de un mandante: tabla de requisitos mensuales por mes, requisitos únicos y su configuración.
// Ruta: #/acreditacion.mandante?id=<tercero>
import { el } from '../../../core/ui/dom.js?v=30360b8';
import { icono } from '../../../core/ui/iconos.js?v=30360b8';
import { boton } from '../../../core/ui/tabla.js?v=30360b8';
import { abrirFormulario } from '../../../core/ui/modal.js?v=30360b8';
import { avisar } from '../../../core/ui/aviso.js?v=30360b8';
import { subirArchivo, eliminarArchivo } from '../../../core/adjuntos.js?v=30360b8';
import { fechaLarga, hoyISO, moverMes, nombreMes } from '../../../core/ui/formato.js?v=30360b8';
import { cargarDocumentos, cumplimientoMandante, nombreTercero, mesActual, CHIP, textoEstado } from '../datos.js?v=30360b8';
import { REQUISITOS } from '../sugeridos.js?v=30360b8';
import { abrir } from './documentos.js?v=30360b8';
import { esNomina, generarNomina } from '../nomina.js?v=30360b8';
import { seccionTrabajadores } from '../trabajadores.js?v=30360b8';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const estado = { fin: null };   // último mes visible (por defecto el actual)

export default async function vista(ctx) {
  const terceroId = ctx.params.id;
  const [{ data: c }, req, cum, docs] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('id', terceroId).maybeSingle(),
    ctx.api.from('acr_requisitos').select('*').eq('tercero_id', terceroId).order('orden').order('nombre'),
    ctx.api.from('acr_cumplimientos').select('*').eq('empresa_id', ctx.empresa.id),
    cargarDocumentos(ctx),
  ]);
  const volver = el('a', { class: 'volver', href: ctx.ruta('acreditacion.mandantes') }, icono('volver', { tam: 16 }), 'Requisitos por mandante');
  if (!c) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Mandante no encontrado'));
  if (req.error) throw req.error;
  if (cum.error) throw cum.error;
  const ids = new Set(req.data.map((r) => r.id));
  const propios = cum.data.filter((x) => ids.has(x.requisito_id));
  const k = cumplimientoMandante(req.data, propios, docs.tipos);
  const puede = { crear: ctx.puede('acreditacion', 'crear'), editar: ctx.puede('acreditacion', 'editar') };

  // Meses visibles: 6 hasta el mes actual (el actual se puede ir subiendo antes de que se exija)
  const fin = estado.fin ?? mesActual();
  const meses = Array.from({ length: 6 }, (_, i) => moverMes(fin, i - 5));
  const anterior = moverMes(mesActual(), -1);

  // Estado de un mes (o del requisito único) como botón para marcarlo
  const marca = (r, p) => {
    if (p !== 'unica' && p < r.desde) return el('span', { class: 'texto-suave' }, '—');
    const x = propios.find((y) => y.requisito_id === r.id && y.periodo === p);
    let chip;
    if (x) chip = el('span', { class: `chip ${x.estado === 'subido' ? 'chip-ok' : 'chip-na'}` }, x.estado === 'subido' ? 'Subido' : 'No aplica');
    else { const exigible = p === 'unica' || p <= anterior; chip = el('span', { class: `chip ${exigible ? 'chip-venc' : 'chip-pend'}` }, exigible ? 'Pendiente' : 'Por subir'); }
    return el('span', { class: 'celda-marca' },
      puede.editar || puede.crear
        ? el('button', { type: 'button', class: 'celda-boton', title: x ? `${x.estado === 'subido' ? 'Subido' : 'No aplica'} el ${fechaLarga(x.fecha)}${x.nota ? ` · ${x.nota}` : ''}` : 'Marcar', onclick: () => marcar(ctx, r, p, x) }, chip)
        : chip,
      x?.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver archivo', 'aria-label': 'Ver archivo', onclick: () => abrir(ctx, x.archivo) }, icono('ojo', { tam: 14 })) : null,
      // Nómina de trabajadores: se genera con quienes tuvieron horas en este mandante ese mes
      p !== 'unica' && esNomina(r) && puede.crear && (puede.editar || !x)
        ? el('button', { type: 'button', class: 'boton-icono', title: 'Generar la nómina del mes', 'aria-label': `Generar la nómina de ${nombreMes(p)}`, onclick: () => generarNomina(ctx, c, r, p, x) }, icono('documento', { tam: 14 }))
        : null);
  };
  const nombreReq = (r) => el('div', {},
    puede.editar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); requisito(ctx, c, r, docs.tipos); } }, r.nombre) : r.nombre,
    r.nota ? el('div', { class: 'texto-suave texto-chico' }, r.nota) : null,
    r.activo ? null : el('span', { class: 'chip chip-na' }, 'Inactivo'));

  const mensuales = req.data.filter((r) => r.periodicidad === 'mensual');
  const unicos = req.data.filter((r) => r.periodicidad === 'unica');
  const mover = (n) => { estado.fin = moverMes(fin, n); ctx.refrescar(); };

  const tablaMensual = mensuales.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Requisito mensual'), meses.map((p) => el('th', {}, nombreMes(p))))),
    el('tbody', {}, mensuales.map((r) => el('tr', { class: r.activo ? '' : 'fila-inactiva' }, el('td', {}, nombreReq(r)), meses.map((p) => el('td', {}, marca(r, p)))))))) : null;

  const filaUnica = (r) => {
    const tipo = r.tipo_id ? docs.tipos.find((t) => t.id === r.tipo_id) : null;
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, nombreReq(r),
        tipo ? el('a', { class: 'texto-chico', href: ctx.ruta('acreditacion.tipo', { id: tipo.id }) }, `Documento de empresa: ${tipo.nombre}`) : null),
      tipo ? el('span', { class: `chip ${CHIP[tipo.estado.k][0]}` }, textoEstado(tipo.estado))
        : marca(r, 'unica'));
  };

  const acciones = [];
  if (puede.crear) acciones.push(boton('Agregar requisito', { icono: 'mas', onclick: () => requisito(ctx, c, null, docs.tipos) }));
  if (puede.crear && !req.data.length) acciones.push(boton('Cargar requisitos sugeridos', { icono: 'mas', tipo: 'primario', onclick: (ev) => sugeridos(ctx, c, docs.tipos, ev.currentTarget) }));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, nombreTercero(c)), el('p', { class: 'texto-suave' }, req.data.length ? `${k.pct}% al día · ${k.pendientes ? `${k.pendientes} ${k.pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'nada pendiente'}` : 'Sin requisitos configurados')),
      el('div', { class: 'listado-acciones' }, acciones)),
    mensuales.length ? el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Meses anteriores', onclick: () => mover(-6) }, icono('volver')),
      el('strong', {}, `${nombreMes(meses[0])} – ${nombreMes(meses[5])}`),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Meses siguientes', onclick: () => mover(6) }, icono('derecha')),
      estado.fin ? boton('Hoy', { onclick: () => { estado.fin = null; ctx.refrescar(); } }) : null) : null,
    tablaMensual,
    unicos.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Requisitos únicos'), unicos.map(filaUnica)) : null,
    !req.data.length ? el('p', { class: 'texto-suave' }, 'Agrega lo que pide este mandante (F30-1, Previred, nómina, etc.) o carga los sugeridos.') : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Un mes se exige desde el mes siguiente (el pendiente en rojo es lo que ya debería estar subido). Los requisitos únicos ligados a un documento de empresa se cumplen con su versión vigente.'),
    ctx.puede('rrhh', 'ver') ? await seccionTrabajadores(ctx, c).catch((err) => el('p', { class: 'texto-error' }, `Acreditación de trabajadores: ${err.message}`)) : null);
}

// Marcar un mes (o el requisito único): subido con archivo opcional, o no aplica; o quitar la marca
function marcar(ctx, r, periodo, x) {
  abrirFormulario({
    titulo: `${r.nombre} · ${periodo === 'unica' ? 'único' : nombreMes(periodo)}`,
    mensaje: x ? `${x.estado === 'subido' ? 'Subido' : 'No aplica'} el ${fechaLarga(x.fecha)}.` : 'Marca que lo subiste a la plataforma del mandante. El archivo es opcional (sirve de respaldo).',
    campos: [
      { id: 'estado', etiqueta: 'Estado', opciones: [['subido', 'Subido'], ['no_aplica', 'No aplica este mes'], ...(x ? [['quitar', 'Quitar la marca (queda pendiente)']] : [])], valor: x?.estado ?? 'subido' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: x?.fecha ?? hoyISO() },
      { id: 'archivo', etiqueta: x?.archivo ? 'Reemplazar archivo (opcional)' : 'Archivo de respaldo (opcional)', tipo: 'file', accept: ARCHIVOS.join(',') },
      { id: 'nota', etiqueta: 'Nota', valor: x?.nota ?? '' },
    ],
    alGuardar: async (v) => {
      if (v.estado === 'quitar') {
        const { error } = await ctx.api.from('acr_cumplimientos').delete().eq('id', x.id);
        if (error) throw new Error(error.message);
        if (x.archivo) await eliminarArchivo(ctx.api, x.archivo).catch(() => {});
        avisar('Marca quitada.'); ctx.refrescar(); return;
      }
      const nuevo = v.archivo?.size
        ? (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'acreditacion', archivo: v.archivo, tabla: 'acr_cumplimientos', tipos: ARCHIVOS })).ruta
        : null;
      const datos = { estado: v.estado, fecha: v.fecha || hoyISO(), nota: v.nota.trim() || null, ...(nuevo ? { archivo: nuevo } : {}) };
      const r2 = x
        ? await ctx.api.from('acr_cumplimientos').update(datos).eq('id', x.id)
        : await ctx.api.from('acr_cumplimientos').insert({ ...datos, empresa_id: ctx.empresa.id, requisito_id: r.id, periodo });
      if (r2.error) { if (nuevo) await eliminarArchivo(ctx.api, nuevo).catch(() => {}); throw new Error(r2.error.message); }
      if (nuevo && x?.archivo) await eliminarArchivo(ctx.api, x.archivo).catch(() => {});
      avisar('Guardado.'); ctx.refrescar();
    },
  });
}

function requisito(ctx, c, r, tipos) {
  abrirFormulario({
    titulo: r ? 'Requisito' : `Nuevo requisito · ${nombreTercero(c)}`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: r?.nombre ?? '', ayuda: 'Ej.: Certificado F30-1, Planillas Previred, Nómina de trabajadores.' },
      { id: 'periodicidad', etiqueta: 'Periodicidad', opciones: [['mensual', 'Mensual'], ['unica', 'Una vez (o según su vencimiento)']], valor: r?.periodicidad ?? 'mensual' },
      { id: 'tipo_id', etiqueta: 'Si es único: documento de empresa que lo cumple', opciones: [['', 'Ninguno (se marca a mano)'], ...tipos.filter((t) => t.activo).map((t) => [t.id, t.nombre])], valor: r?.tipo_id ?? '' },
      { id: 'desde', etiqueta: 'Se exige desde el mes', tipo: 'month', requerido: true, valor: r?.desde ?? mesActual() },
      { id: 'nota', etiqueta: 'Nota (dónde se sube, quién lo emite)', valor: r?.nota ?? '' },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: String(r?.orden ?? 0) },
      ...(r ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo (no cuenta para el %)'], ...(ctx.puede('acreditacion', 'eliminar') ? [['eliminar', 'Eliminar con su historial']] : [])], valor: String(r.activo) }] : []),
    ],
    textoGuardar: r ? 'Guardar' : 'Agregar',
    alGuardar: async (v) => {
      if (v.activo === 'eliminar') {
        const { error } = await ctx.api.from('acr_requisitos').delete().eq('id', r.id);
        if (error) throw new Error(error.message);
        avisar('Requisito eliminado.'); ctx.refrescar(); return;
      }
      const datos = {
        nombre: v.nombre.trim(), periodicidad: v.periodicidad, tipo_id: v.periodicidad === 'unica' ? v.tipo_id || null : null,
        desde: v.desde, nota: v.nota.trim() || null, orden: Number(v.orden) || 0, ...(r ? { activo: v.activo === 'true' } : {}),
      };
      const res = r
        ? await ctx.api.from('acr_requisitos').update(datos).eq('id', r.id)
        : await ctx.api.from('acr_requisitos').insert({ ...datos, empresa_id: ctx.empresa.id, tercero_id: c.id });
      if (res.error) throw new Error(res.error.code === '23505' ? 'Este mandante ya tiene un requisito con ese nombre.' : res.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });
}

async function sugeridos(ctx, c, tipos, b) {
  b.disabled = true;
  const porNombre = new Map(tipos.map((t) => [t.nombre, t.id]));
  const { error } = await ctx.api.from('acr_requisitos').insert(REQUISITOS.map(([nombre, periodicidad, doc, nota], i) => ({
    empresa_id: ctx.empresa.id, tercero_id: c.id, nombre, periodicidad, tipo_id: doc ? porNombre.get(doc) ?? null : null, desde: mesActual(), nota, orden: i + 1,
  })));
  if (error) { avisar(error.message, 'error'); b.disabled = false; return; }
  avisar('Requisitos sugeridos cargados. Quita los que este mandante no pida.');
  ctx.refrescar();
}
