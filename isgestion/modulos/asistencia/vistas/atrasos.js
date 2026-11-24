// Atrasos y ausencias (Enzo, 2026-11-13; Asistencia 009): por trabajador con turno, en el mes, atrasos, salidas
// anticipadas, ausencias, días sin marca (solo "según horario") y entradas sin salida, comparando el Registro de horas con
// su turno de Remuneraciones → Condiciones. La base lo calcula (asis_puntualidad, permiso asistencia ver) y no entrega
// montos. Tocar una fila muestra el detalle por día. Las horas extra están en Resumen del mes.
import { el } from '../../../core/ui/dom.js?v=9dd99fc';
import { icono } from '../../../core/ui/iconos.js?v=9dd99fc';
import { boton } from '../../../core/ui/tabla.js?v=9dd99fc';
import { avisar } from '../../../core/ui/aviso.js?v=9dd99fc';
import { hoyISO, rangoMes, nombreMes, moverMes, fechaCorta, nombreDia, horas, hhmm } from '../../../core/ui/formato.js?v=9dd99fc';

const estado = { mes: hoyISO().slice(0, 7), abierto: null };
const ESTADOS = {
  ok: ['A la hora', 'chip-ok'], atraso: ['Atraso', 'chip-venc'], anticipada: ['Salió antes', 'chip-prox'], ausente: ['Ausente', 'chip-venc'],
  sin_marca: ['Sin marca', 'chip-pend'], sin_salida: ['Sin salida', 'chip-prox'], licencia: ['Licencia', 'chip-na'],
};
const min = (m) => (m ? horas(m) : '—');

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  const r = await ctx.api.rpc('asis_puntualidad', { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta < hoyISO() ? hasta : hoyISO() });
  if (r.error) throw new Error(r.error.message);
  const dias = desde > hoyISO() ? [] : (r.data ?? []);

  // Por trabajador
  const porPersona = new Map();
  for (const d of dias) {
    if (!porPersona.has(d.persona_id)) porPersona.set(d.persona_id, { id: d.persona_id, nombre: d.nombre, modo: d.modo, turno: `${hhmm(d.turno_ini)}–${hhmm(d.turno_fin)}`, dias: [] });
    porPersona.get(d.persona_id).dias.push(d);
  }
  const filas = [...porPersona.values()].map((p) => {
    const cuenta = (e) => p.dias.filter((d) => d.estado === e).length;
    return { ...p,
      atrasos: p.dias.filter((d) => d.atraso_min > 0).length, minAtraso: p.dias.reduce((s, d) => s + d.atraso_min, 0),
      anticipadas: p.dias.filter((d) => d.anticipada_min > 0).length, minAnticipada: p.dias.reduce((s, d) => s + d.anticipada_min, 0),
      ausentes: cuenta('ausente'), justificadas: p.dias.filter((d) => d.estado === 'ausente' && d.nota).length,
      sinMarca: cuenta('sin_marca'), sinSalida: cuenta('sin_salida'), licencia: cuenta('licencia') };
  }).sort((a, b) => (b.atrasos + b.ausentes) - (a.atrasos + a.ausentes) || a.nombre.localeCompare(b.nombre));

  // ---- Cabecera
  const mesCampo = el('input', { type: 'month', class: 'campo', value: estado.mes, 'aria-label': 'Mes' });
  mesCampo.addEventListener('change', () => { if (mesCampo.value) { estado.mes = mesCampo.value; estado.abierto = null; ctx.refrescar(); } });
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); estado.abierto = null; ctx.refrescar(); };
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'Buscar trabajador…', 'aria-label': 'Buscar trabajador' });

  const cuerpo = el('tbody');
  const COLS = 7;
  const pintar = () => {
    const q = buscador.value.trim().toLowerCase();
    const vis = filas.filter((x) => !q || x.nombre.toLowerCase().includes(q));
    cuerpo.replaceChildren(...(vis.length ? vis.flatMap((x) => {
      const abierto = estado.abierto === x.id;
      const fila = el('tr', { class: `fila-enlace${x.modo === 'fijo' ? ' fila-fijo' : ''}`, title: abierto ? 'Ocultar el detalle' : 'Ver el detalle por día', onclick: () => { estado.abierto = abierto ? null : x.id; pintar(); } },
        el('td', {}, icono(abierto ? 'abajo' : 'derecha', { tam: 14 }), ' ', el('strong', {}, x.nombre),
          el('span', { class: 'texto-chico texto-suave' }, el('br'), `Fijo · turno ${x.turno}`)),
        el('td', { class: 'num' }, x.atrasos ? el('span', { class: 'chip chip-venc' }, `${x.atrasos} · ${min(x.minAtraso)}`) : '—'),
        el('td', { class: 'num' }, x.anticipadas ? el('span', { class: 'chip chip-prox' }, `${x.anticipadas} · ${min(x.minAnticipada)}`) : '—'),
        el('td', { class: 'num' }, x.ausentes ? el('span', { class: 'chip chip-venc' }, String(x.ausentes), x.justificadas ? ` (${x.justificadas} con motivo)` : '') : '—'),
        el('td', { class: 'num' }, x.sinMarca ? el('span', { class: 'chip chip-pend', title: 'Días que quedaron "según horario": no marcó en la tablet ni se registró su hora real' }, String(x.sinMarca)) : '—'),
        el('td', { class: 'num' }, x.sinSalida ? el('span', { class: 'chip chip-prox' }, String(x.sinSalida)) : '—'),
        el('td', { class: 'num' }, x.licencia ? String(x.licencia) : '—'));
      if (!abierto) return [fila];
      const det = el('tr', { class: 'asis-res-detalle' }, el('td', { colspan: COLS },
        el('table', { class: 'tabla tabla-compacta' },
          el('thead', {}, el('tr', {}, ['Día', 'Turno', 'Entrada', 'Salida', 'Atraso', 'Salió antes', 'Estado'].map((t) => el('th', {}, t)))),
          el('tbody', {}, x.dias.map((d) => el('tr', {},
            el('td', {}, `${nombreDia(d.fecha)} ${fechaCorta(d.fecha)}`),
            el('td', {}, `${hhmm(d.turno_ini)}–${hhmm(d.turno_fin)}`),
            el('td', {}, d.estado === 'sin_marca' ? el('span', { class: 'texto-suave' }, 'según horario') : hhmm(d.entrada) || '—'),
            el('td', {}, d.estado === 'sin_marca' ? '' : hhmm(d.salida) || '—'),
            el('td', { class: 'num' }, d.atraso_min ? el('strong', {}, min(d.atraso_min)) : '—'),
            el('td', { class: 'num' }, d.anticipada_min ? min(d.anticipada_min) : '—'),
            el('td', {}, el('span', { class: `chip ${ESTADOS[d.estado]?.[1] ?? ''}` }, ESTADOS[d.estado]?.[0] ?? d.estado),
              d.nota ? el('span', { class: 'texto-chico texto-suave' }, ` ${d.nota}`) : null)))))));
      return [fila, det];
    }) : [el('tr', {}, el('td', { colspan: COLS, class: 'tabla-vacia' }, icono('reloj', { tam: 28 }),
      'Ningún fijo con turno en el mes. El turno de cada fijo se pone en Remuneraciones → Condiciones.'))]));
  };
  buscador.addEventListener('input', pintar);
  pintar();

  const exportar = async () => {
    const { exportarExcel } = await import('../../../core/excel.js?v=9dd99fc');
    await exportarExcel(ctx, {
      titulo: 'Atrasos y ausencias', subtitulo: nombreMes(estado.mes), nombre: `atrasos-${estado.mes}`,
      columnas: ['Trabajador', 'Fecha', 'Turno', 'Entrada', 'Salida', { t: 'Atraso', tipo: 'horas' }, { t: 'Salió antes', tipo: 'horas' }, 'Estado', 'Nota'],
      filas: filas.flatMap((x) => x.dias.map((d) => [x.nombre, d.fecha, `${hhmm(d.turno_ini)}–${hhmm(d.turno_fin)}`, d.estado === 'sin_marca' ? 'según horario' : hhmm(d.entrada), d.estado === 'sin_marca' ? '' : hhmm(d.salida),
        d.atraso_min || null, d.anticipada_min || null, ESTADOS[d.estado]?.[0] ?? d.estado, d.nota ?? ''])),
      nota: 'Atraso y salida anticipada sobre la tolerancia de la empresa (Administración → Módulos → Asistencia). Días hábiles sin feriados ni licencias.',
    });
  };

  const tot = (k) => filas.reduce((s, x) => s + x[k], 0);
  return el('section', { class: 'listado' },
    el('div', { class: 'listado-cabecera' },
      el('h1', {}, 'Atrasos y ausencias'),
      el('div', { class: 'listado-acciones' },
        el('span', { class: 'asis-res-mes' },
          el('button', { type: 'button', class: 'boton-icono', title: 'Mes anterior', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver', { tam: 16 })),
          mesCampo,
          el('button', { type: 'button', class: 'boton-icono', title: 'Mes siguiente', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha', { tam: 16 }))),
        buscador,
        ctx.puede('asistencia', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: () => exportar().catch((e) => avisar(e.message, 'error')) }) : null)),
    el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip' }, `${filas.length} con turno`),
      el('span', { class: 'chip chip-venc' }, `Atrasos ${tot('atrasos')} · ${horas(tot('minAtraso'))}`),
      el('span', { class: 'chip chip-prox' }, `Salidas antes ${tot('anticipadas')}`),
      el('span', { class: 'chip chip-venc' }, `Ausencias ${tot('ausentes')}`),
      el('span', { class: 'chip chip-pend' }, `Sin marca ${tot('sinMarca')}`),
      el('a', { href: ctx.ruta('asistencia.resumen'), class: 'texto-chico' }, 'Horas extra en Resumen del mes')),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Trabajador', 'Atrasos', 'Salió antes', 'Ausencias', 'Sin marca', 'Sin salida', 'Licencia'].map((t, i) => el('th', { class: i ? 'num' : null }, t)))),
      cuerpo)),
    el('p', { class: 'texto-suave texto-chico' },
      'Se compara la primera entrada y la última salida de cada día hábil del Registro de horas con el turno de Remuneraciones → Condiciones (el viernes, con su hora de salida). ',
      'Cuenta solo lo que pasa la tolerancia (Administración → Módulos → Asistencia). "Sin marca": el día quedó según horario porque no marcó. ',
      'Una ausencia marcada con motivo muestra el motivo. Solo fijos con turno: los trabajadores por hora no tienen horario.'));
}
