// Licencias médicas (núcleo 017, 2026-11-02): se registran desde Prevención → Salidas médicas con sus archivos
// (licencia, certificados, recetas) y se ven solas en la ficha del trabajador (RRHH → Licencias). Asistencia no
// genera esos días a los fijos y el cierre de remuneraciones se los descuenta: la licencia la paga la ISAPRE o FONASA
// (común) o la mutual (laboral), no la empresa.
// Archivos en `adjuntos` (tabla 'licencias'): van a la carpeta de RRHH si quien sube puede crear en RRHH (así RRHH los
// abre), si no a la de SST.
import { el } from './ui/dom.js?v=3af27b3';
import { icono } from './ui/iconos.js?v=3af27b3';
import { boton } from './ui/tabla.js?v=3af27b3';
import { abrirFormulario } from './ui/modal.js?v=3af27b3';
import { avisar } from './ui/aviso.js?v=3af27b3';
import { fechaLarga, hoyISO } from './ui/formato.js?v=3af27b3';
import { subirArchivo, urlFirmada } from './adjuntos.js?v=3af27b3';

export const TIPOS_LICENCIA = [
  ['comun', 'Enfermedad común', 'Paga la ISAPRE o FONASA (si es de 10 días o menos, los 3 primeros no se pagan)'],
  ['laboral', 'Accidente o enfermedad laboral', 'Paga la mutual desde el primer día'],
  ['maternal', 'Pre y postnatal', 'Paga la ISAPRE o FONASA'],
  ['otra', 'Otra', ''],
];
const nombreTipo = Object.fromEntries(TIPOS_LICENCIA.map(([k, n]) => [k, n]));
const quienPaga = Object.fromEntries(TIPOS_LICENCIA.map(([k, , p]) => [k, p]));
const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export const diasLicencia = (l) => Math.round((new Date(`${l.hasta}T12:00`) - new Date(`${l.desde}T12:00`)) / 864e5) + 1;
export const puedeLicencias = (ctx, accion) => ctx.puede('sst', accion) || ctx.puede('rrhh', accion);

// Licencias (con sus archivos) de una persona o de unas salidas médicas
export async function cargarLicencias(ctx, { personaId = null, salidaIds = null } = {}) {
  let q = ctx.api.from('licencias').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('desde', { ascending: false });
  if (personaId) q = q.eq('persona_id', personaId);
  if (salidaIds) { if (!salidaIds.length) return []; q = q.in('salida_id', salidaIds); }
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) return [];
  const { data: adj } = await ctx.api.from('adjuntos').select('id, nombre, ruta, registro_id, created_at').eq('empresa_id', ctx.empresa.id)
    .eq('tabla', 'licencias').in('registro_id', data.map((l) => l.id)).is('deleted_at', null).order('created_at');
  return data.map((l) => ({ ...l, archivos: (adj ?? []).filter((a) => a.registro_id === l.id) }));
}

const subir = (ctx, licenciaId, archivo) => subirArchivo(ctx.api, {
  empresaId: ctx.empresa.id, modulo: ctx.puede('rrhh', 'crear') ? 'rrhh' : 'sst', archivo, tabla: 'licencias', registroId: licenciaId, tipos: ARCHIVOS });

// Registrar o cambiar una licencia. desde: día por omisión (la fecha de la salida médica).
export function formularioLicencia(ctx, { personaId, salidaId = null, licencia = null, desde = hoyISO(), alGuardar }) {
  abrirFormulario({
    titulo: licencia ? 'Licencia médica' : 'Registrar licencia médica',
    mensaje: 'Los días de licencia no se pagan como trabajados: Asistencia no los marca a los fijos y el cierre de remuneraciones se los descuenta.',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_LICENCIA.map(([k, n]) => [k, n]), valor: licencia?.tipo ?? 'comun' },
      { id: 'desde', etiqueta: 'Desde', tipo: 'date', requerido: true, valor: licencia?.desde ?? desde },
      { id: 'hasta', etiqueta: 'Hasta (incluido)', tipo: 'date', requerido: true, valor: licencia?.hasta ?? desde },
      { id: 'folio', etiqueta: 'Folio de la licencia (opcional)', valor: licencia?.folio ?? '' },
      { id: 'nota', etiqueta: 'Nota (opcional)', valor: licencia?.nota ?? '' },
      licencia ? null : { id: 'archivo', etiqueta: 'Licencia escaneada o foto (opcional; después puedes agregar más archivos)', tipo: 'file', accept: ARCHIVOS.join(',') },
    ].filter(Boolean),
    textoGuardar: licencia ? 'Guardar' : 'Registrar licencia',
    alGuardar: async (v) => {
      if (v.hasta < v.desde) throw new Error('"Hasta" no puede ser antes de "Desde".');
      const datos = { tipo: v.tipo, desde: v.desde, hasta: v.hasta, folio: v.folio.trim() || null, nota: v.nota.trim() || null };
      const r = licencia
        ? await ctx.api.from('licencias').update(datos).eq('id', licencia.id).select('id').single()
        : await ctx.api.from('licencias').insert({ ...datos, empresa_id: ctx.empresa.id, persona_id: personaId, salida_id: salidaId }).select('id').single();
      if (r.error) throw new Error(r.error.message);
      let nota = '';
      if (v.archivo?.size) { try { await subir(ctx, r.data.id, v.archivo); } catch (e) { nota = ` El archivo no se subió: ${e.message}`; } }
      avisar(`${licencia ? 'Licencia guardada.' : `Licencia registrada: ${diasLicencia(datos)} día${diasLicencia(datos) === 1 ? '' : 's'}.`}${nota}`, nota ? 'error' : undefined);
      alGuardar?.();
    },
  });
}

const agregarArchivo = (ctx, l, alGuardar) => abrirFormulario({
  titulo: 'Agregar archivo a la licencia',
  mensaje: 'Licencia, certificados, recetas, boletas o cualquier documento asociado.',
  campos: [{ id: 'archivo', etiqueta: 'Archivo (PDF o imagen)', tipo: 'file', accept: ARCHIVOS.join(','), requerido: true }],
  textoGuardar: 'Subir',
  alGuardar: async (v) => {
    if (!v.archivo?.size) throw new Error('Elige el archivo.');
    await subir(ctx, l.id, v.archivo);
    avisar('Archivo agregado.'); alGuardar?.();
  },
});

const eliminar = (ctx, l, alGuardar) => abrirFormulario({
  titulo: 'Eliminar la licencia',
  mensaje: 'Los días vuelven a contar en Asistencia y en el cierre de remuneraciones. Los archivos quedan guardados.',
  campos: [], textoGuardar: 'Eliminar',
  alGuardar: async () => {
    const { error } = await ctx.api.from('licencias').update({ deleted_at: new Date().toISOString() }).eq('id', l.id);
    if (error) throw new Error(error.message);
    avisar('Licencia eliminada.'); alGuardar?.();
  },
});

const ver = async (ctx, ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } };

// Una licencia con sus archivos y acciones
export function filaLicencia(ctx, l, alCambiar) {
  const editar = puedeLicencias(ctx, 'editar');
  const n = diasLicencia(l);
  return el('div', { class: 'lic-fila' },
    el('div', { class: 'lic-cab' },
      el('span', { class: `chip ${l.tipo === 'laboral' ? 'chip-venc' : 'chip-prox'}` }, nombreTipo[l.tipo]),
      el('strong', {}, `${n} día${n === 1 ? '' : 's'}`),
      el('span', {}, `${fechaLarga(l.desde)} al ${fechaLarga(l.hasta)}`),
      l.folio ? el('span', { class: 'texto-suave' }, `Folio ${l.folio}`) : null,
      editar ? el('span', { class: 'lic-acc' },
        boton('Archivo', { icono: 'mas', onclick: () => agregarArchivo(ctx, l, alCambiar) }),
        boton('Editar', { icono: 'editar', onclick: () => formularioLicencia(ctx, { licencia: l, alGuardar: alCambiar }) }),
        el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar licencia', 'aria-label': 'Eliminar licencia', onclick: () => eliminar(ctx, l, alCambiar) }, icono('basura', { tam: 16 }))) : null),
    quienPaga[l.tipo] || l.nota ? el('div', { class: 'texto-suave texto-chico' }, [quienPaga[l.tipo], l.nota].filter(Boolean).join(' · ')) : null,
    el('div', { class: 'lic-archivos' }, l.archivos.length
      ? l.archivos.map((a) => el('button', { type: 'button', class: 'lic-archivo', title: a.nombre, onclick: () => ver(ctx, a.ruta) }, icono('documento', { tam: 14 }), el('span', {}, a.nombre)))
      : el('span', { class: 'texto-suave texto-chico' }, 'Sin archivos.')));
}

// Ventana con las licencias de una salida médica (y el botón para registrar otra, p. ej. una prórroga)
export async function ventanaLicencias(ctx, { salida, nombre, alCambiar }) {
  const fondo = el('div', { class: 'seg-modal' });
  const caja = el('div', { class: 'seg-caja lic-caja' });
  fondo.append(caja);
  let cambio = false;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); if (cambio) alCambiar?.(); };
  const tecla = (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) cerrar(); };
  fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);
  const pintar = async () => {
    const lista = await cargarLicencias(ctx, { salidaIds: [salida.id] });
    const otra = () => { cambio = true; pintar(); };
    caja.replaceChildren(
      el('div', { class: 'seg-cab' },
        el('div', {}, el('h2', {}, 'Licencias médicas'), el('p', { class: 'texto-suave' }, `${nombre} · salida del ${fechaLarga(salida.fecha)}`)),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
      lista.length ? el('div', { class: 'lic-lista' }, lista.map((l) => filaLicencia(ctx, l, otra))) : el('p', { class: 'texto-suave' }, 'Sin licencia registrada para esta salida.'),
      puedeLicencias(ctx, 'crear') ? el('div', {}, boton(lista.length ? 'Registrar otra (prórroga)' : 'Registrar licencia', { icono: 'mas', tipo: 'primario',
        onclick: () => formularioLicencia(ctx, { personaId: salida.persona_id, salidaId: salida.id, desde: lista[0] ? siguiente(lista[0].hasta) : salida.fecha, alGuardar: otra }) })) : null,
      el('p', { class: 'texto-suave texto-chico' }, 'La licencia y sus archivos quedan también en la ficha del trabajador (RRHH → Licencias).'));
  };
  await pintar();
}
const siguiente = (iso) => { const d = new Date(`${iso}T12:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
