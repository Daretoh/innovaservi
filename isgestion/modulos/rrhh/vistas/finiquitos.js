// Finiquitos (como InnovaGestión): trabajador, fecha, monto, motivo, nota y documento firmado; al registrarlo se puede
// dejar al trabajador inactivo. Permiso de RRHH.
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { listado, boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { abrirFormulario } from '../../../core/ui/modal.js?v=b8da9fc';
import { avisar } from '../../../core/ui/aviso.js?v=b8da9fc';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=b8da9fc';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=b8da9fc';
import { nombreCompleto } from '../datos.js?v=b8da9fc';

const MOTIVOS = ['Término de contrato a plazo fijo', 'Renuncia voluntaria', 'Mutuo acuerdo', 'Necesidades de la empresa', 'Conclusión del trabajo o servicio', 'Otro'];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [fin, vin] = await Promise.all([
    ctx.api.from('rrhh_finiquitos').select('*, personas(nombres, apellido_paterno, apellido_materno, rut)').eq('empresa_id', e).is('deleted_at', null).order('fecha', { ascending: false }),
    ctx.api.from('persona_empresa').select('persona_id, estado, cargo, personas(nombres, apellido_paterno, apellido_materno, rut)').eq('empresa_id', e).is('deleted_at', null),
  ]);
  if (fin.error) throw fin.error;
  const trabajadores = (vin.data ?? []).sort((a, b) => (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1) || nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));

  const formulario = (f = null) => abrirFormulario({
    titulo: f ? `Finiquito · ${nombreCompleto(f.personas)}` : 'Registrar finiquito',
    campos: [
      ...(f ? [] : [{ id: 'persona', etiqueta: 'Trabajador', requerido: true, opciones: [['', 'Elige al trabajador'], ...trabajadores.map((v) => [v.persona_id, `${nombreCompleto(v.personas)}${v.estado === 'activo' ? '' : ' (inactivo)'}`])] }]),
      { id: 'fecha', etiqueta: 'Fecha de término', tipo: 'date', requerido: true, valor: f?.fecha ?? hoyISO() },
      { id: 'monto', etiqueta: 'Monto del finiquito', tipo: 'number', valor: f?.monto ?? '' },
      { id: 'motivo', etiqueta: 'Motivo', requerido: true, opciones: MOTIVOS.map((m) => [m, m]), valor: f?.motivo ?? MOTIVOS[0] },
      { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', valor: f?.nota ?? '' },
      { id: 'archivo', etiqueta: f?.archivo ? 'Reemplazar documento firmado' : 'Documento firmado (PDF o fotos)', tipo: 'file', accept: 'application/pdf,image/*' },
      ...(f ? [] : [{ id: 'inactivo', etiqueta: 'Trabajador', opciones: [['si', 'Dejarlo inactivo (con esta fecha de término)'], ['no', 'Mantenerlo activo']], valor: 'si' }]),
    ],
    textoGuardar: f ? 'Guardar' : 'Registrar finiquito',
    alGuardar: async (x) => {
      let ruta = null;
      if (x.archivo?.size) ruta = (await subirArchivo(ctx.api, { empresaId: e, modulo: 'rrhh', archivo: x.archivo, tabla: 'rrhh_finiquitos', registroId: f?.id ?? null })).ruta;
      const datos = { fecha: x.fecha, monto: x.monto === '' ? null : Math.round(Number(x.monto)), motivo: x.motivo, nota: x.nota.trim() || null, ...(ruta ? { archivo: ruta } : {}) };
      const r = f ? await ctx.api.from('rrhh_finiquitos').update(datos).eq('id', f.id)
        : await ctx.api.from('rrhh_finiquitos').insert({ ...datos, empresa_id: e, persona_id: x.persona });
      if (r.error) { if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(r.error.message); }
      if (ruta && f?.archivo) eliminarArchivo(ctx.api, f.archivo).catch(() => {});
      if (!f && x.inactivo === 'si') {
        const { error } = await ctx.api.from('persona_empresa').update({ estado: 'inactivo', fecha_termino: x.fecha }).eq('empresa_id', e).eq('persona_id', x.persona);
        if (error) avisar(`El finiquito quedó, pero no se pudo dejar inactivo: ${error.message}`, 'error');
      }
      avisar(f ? 'Finiquito guardado.' : 'Finiquito registrado.'); ctx.refrescar();
    },
  });
  const ver = async (r) => { try { window.open(await urlFirmada(ctx.api, r, 300), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); } };
  const eliminar = (f) => abrirFormulario({ titulo: 'Eliminar finiquito', mensaje: `${nombreCompleto(f.personas)} · ${fechaLarga(f.fecha)}. Queda en la auditoría.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { const { error } = await ctx.api.from('rrhh_finiquitos').update({ deleted_at: new Date().toISOString() }).eq('id', f.id); if (error) throw new Error(error.message); ctx.refrescar(); } });

  return listado({
    titulo: 'Finiquitos',
    filas: fin.data,
    acciones: ctx.puede('rrhh', 'crear') ? [boton('Registrar finiquito', { icono: 'mas', tipo: 'primario', onclick: () => formulario() })] : [],
    vacio: 'Sin finiquitos registrados.',
    columnas: [
      { titulo: 'Fecha', valor: (f) => fechaLarga(f.fecha) },
      { titulo: 'Trabajador', valor: (f) => el('div', {}, el('a', { href: ctx.ruta('rrhh.ficha', { p: f.persona_id }) }, el('strong', {}, nombreCompleto(f.personas))), el('div', { class: 'texto-suave texto-chico' }, f.personas?.rut ?? '')) },
      { titulo: 'Motivo', valor: (f) => el('div', {}, f.motivo, f.nota ? el('div', { class: 'texto-suave texto-chico' }, f.nota) : null) },
      { titulo: 'Monto', valor: (f) => (f.monto == null ? '—' : dinero(f.monto)) },
      { titulo: 'Documento', valor: (f) => (f.archivo ? boton('Ver', { icono: 'ojo', onclick: () => ver(f.archivo) }) : el('span', { class: 'chip chip-prox' }, 'Falta firmado')) },
      { titulo: '', valor: (f) => el('div', { class: 'acciones-fila' },
        ctx.puede('rrhh', 'editar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': 'Editar finiquito', onclick: () => formulario(f) }, icono('editar', { tam: 16 })) : null,
        ctx.puede('rrhh', 'editar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar finiquito', onclick: () => eliminar(f) }, icono('basura', { tam: 16 })) : null) },
    ],
  });
}
