// Condiciones de pago de cada trabajador en la empresa: modo, cargo/trato, jornada o turno, sueldo y vuelta.
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { listado } from '../../../core/ui/tabla.js?v=cb36eb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { dinero, hhmm, fechaLarga } from '../../../core/ui/formato.js?v=cb36eb2';
import { cargarBase, nombreCompleto } from '../datos.js?v=cb36eb2';

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const activos = base.vinculos.filter((v) => v.estado === 'activo')
    .sort((a, b) => nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));
  const editable = ctx.puede('remu', 'editar') && ctx.puede('remu', 'crear');
  const ht = Number(base.config.horas_trato ?? 8);

  const modoDe = (v) => v.condicion?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora');
  const columnas = [
    { titulo: 'Trabajador', valor: (v) => el('span', {}, nombreCompleto(v.personas), !v.condicion ? el('span', { class: 'etiqueta etiqueta-apagada', title: 'Usa los valores generales' }, 'Sin configurar') : null) },
    { titulo: 'Modo', valor: (v) => (modoDe(v) === 'fijo' ? `Fijo${v.condicion?.fijo_desde ? ` desde ${fechaLarga(v.condicion.fijo_desde)}` : ''}` : 'Por hora') },
    { titulo: 'Cargo / trato', valor: (v) => { const c = v.condicion?.cargo_id ? base.cargos.get(v.condicion.cargo_id) : null; return c ? `${c.nombre} · ${dinero(c.trato)}` : '—'; } },
    { titulo: 'Valor hora', valor: (v) => { const c = v.condicion?.cargo_id ? base.cargos.get(v.condicion.cargo_id) : null; const vh = c?.trato ? Math.round(c.trato / ht) : (v.condicion?.valor_hora || base.config.valor_hora); return vh ? dinero(vh) : el('span', { class: 'pct-mal' }, 'Sin valor'); } },
    { titulo: 'Jornada', valor: (v) => { const c = v.condicion; if (modoDe(v) !== 'fijo') return '—'; return c?.jornada_ini ? `Turno ${hhmm(c.jornada_ini)}–${hhmm(c.jornada_fin)}` : c?.jornada_horas ? `${Number(c.jornada_horas)} h/día` : el('span', { class: 'texto-suave' }, 'Sin jornada'); } },
    { titulo: 'Sueldo base', valor: (v) => (v.condicion?.sueldo_base ? `${dinero(v.condicion.sueldo_base)}${v.condicion.sueldo_desde ? ` desde ${fechaLarga(v.condicion.sueldo_desde)}` : ''}` : '—') },
    { titulo: 'Vuelta', valor: (v) => (v.condicion?.valor_vuelta != null ? dinero(v.condicion.valor_vuelta) : el('span', { class: 'texto-suave' }, 'General')) },
  ];
  if (editable) {
    columnas.push({ titulo: '', valor: (v) => el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar condiciones de ${nombreCompleto(v.personas)}`, onclick: () => editar(ctx, v, base) }, icono('editar', { tam: 16 })) });
  }
  const lista = listado({ titulo: 'Condiciones de pago', filas: activos, columnas, vacio: 'No hay trabajadores activos.' });
  lista.append(el('p', { class: 'texto-suave texto-chico' },
    'Por hora: se pagan todas las horas. Fijo: solo lo que queda fuera del turno o sobre la jornada; fines de semana y feriados completos. Un fijo sin jornada ni turno cobra todas sus horas como trato.'));
  return lista;
}

function editar(ctx, v, base) {
  const c = v.condicion ?? {};
  abrirFormulario({
    titulo: `Condiciones de ${nombreCompleto(v.personas)}`,
    mensaje: 'Para un fijo, usa turno (hora de inicio y fin) o jornada en horas por día, no ambos.',
    campos: [
      { id: 'modo', etiqueta: 'Modo de pago', opciones: [['hora', 'Por hora (spot): se pagan todas las horas'], ['fijo', 'Fijo: solo extras, findes y feriados']], valor: c.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora') },
      { id: 'cargo_id', etiqueta: 'Cargo (define el trato)', opciones: [['', 'Sin cargo'], ...base.listaCargos.filter((x) => x.activo || x.id === c.cargo_id).map((x) => [x.id, `${x.nombre}${x.trato ? ` · ${dinero(x.trato)}` : ''}`])], valor: c.cargo_id ?? '' },
      { id: 'valor_hora', etiqueta: 'Valor hora propio (si el cargo no tiene trato)', tipo: 'number', valor: c.valor_hora != null ? String(c.valor_hora) : '' },
      { id: 'jornada_ini', etiqueta: 'Turno: inicio', tipo: 'time', valor: c.jornada_ini ? hhmm(c.jornada_ini) : '' },
      { id: 'jornada_fin', etiqueta: 'Turno: fin', tipo: 'time', valor: c.jornada_fin ? hhmm(c.jornada_fin) : '' },
      { id: 'jornada_horas', etiqueta: 'O jornada en horas por día', tipo: 'number', valor: c.jornada_horas != null ? String(c.jornada_horas) : '' },
      { id: 'fijo_desde', etiqueta: 'Fijo desde (antes se paga por hora; vacío = siempre)', tipo: 'date', valor: c.fijo_desde ?? '' },
      { id: 'sueldo_base', etiqueta: 'Sueldo base mensual', tipo: 'number', valor: c.sueldo_base != null ? String(c.sueldo_base) : '' },
      { id: 'sueldo_desde', etiqueta: 'Sueldo rige desde', tipo: 'date', valor: c.sueldo_desde ?? '' },
      { id: 'valor_vuelta', etiqueta: 'Valor por vuelta propio (vacío = el general)', tipo: 'number', valor: c.valor_vuelta != null ? String(c.valor_vuelta) : '' },
    ],
    alGuardar: async (f) => {
      const num = (x) => (x === '' || x == null ? null : Number(x));
      if (!!f.jornada_ini !== !!f.jornada_fin) throw new Error('Indica inicio y fin del turno, o deja ambos vacíos.');
      if (f.jornada_ini && f.jornada_fin <= f.jornada_ini) throw new Error('El fin del turno debe ser después del inicio.');
      if (f.jornada_ini && f.jornada_horas) throw new Error('Usa turno o jornada en horas, no ambos.');
      const datos = {
        modo: f.modo, cargo_id: f.cargo_id || null, valor_hora: num(f.valor_hora),
        jornada_ini: f.jornada_ini || null, jornada_fin: f.jornada_fin || null, jornada_horas: num(f.jornada_horas),
        sueldo_base: num(f.sueldo_base), sueldo_desde: f.sueldo_desde || null, valor_vuelta: num(f.valor_vuelta), fijo_desde: f.fijo_desde || null,
      };
      const r = v.condicion
        ? await ctx.api.from('remu_condiciones').update(datos).eq('vinculo_id', v.id).select('vinculo_id')
        : await ctx.api.from('remu_condiciones').insert({ ...datos, vinculo_id: v.id, empresa_id: ctx.empresa.id }).select('vinculo_id');
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso.');
      avisar('Condiciones guardadas.');
      ctx.refrescar();
    },
  });
}
