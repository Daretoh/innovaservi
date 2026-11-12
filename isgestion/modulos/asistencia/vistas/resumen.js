// Resumen del mes de horas por trabajador (Enzo, 2026-11-02): días trabajados, horas, horas normales y horas extra
// con las mismas reglas que Remuneraciones (modulos/remu/calculo.js): para un fijo, extra es lo que queda fuera de su
// turno en día hábil (el viernes desde su salida_viernes) y todo el sábado, domingo o feriado; con Artículo 22 no hay
// extras. Un spot cobra todas sus horas: no tiene "extras". Al tocar una fila se ve el detalle por día.
// Las condiciones (turno, modo, valor hora) son de Remuneraciones: sin permiso de verlas solo se muestran las horas.
import { el } from '../../../core/ui/dom.js?v=9dfb925';
import { icono } from '../../../core/ui/iconos.js?v=9dfb925';
import { boton } from '../../../core/ui/tabla.js?v=9dfb925';
import { avisar } from '../../../core/ui/aviso.js?v=9dfb925';
import { hoyISO, rangoMes, nombreMes, fechaCorta, nombreDia, horas, hhmm, dinero } from '../../../core/ui/formato.js?v=9dfb925';

const estado = { mes: hoyISO().slice(0, 7), abierto: null };
const nombre = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
const hm = (min) => (min ? horas(min) : '—');

export default async function vista(ctx) {
  const conRemu = ctx.puede('remu', 'ver');
  const verMonto = conRemu;
  const { desde, hasta } = rangoMes(estado.mes);
  const d = await import('../../remu/datos.js?v=9dfb925');
  const base = await d.cargarBase(ctx);
  const R = await d.calcularRango(ctx, base, { desde, hasta, itemsMes: estado.mes });
  const filas = R.filas.filter((f) => f.totMin > 0).map((f) => {
    const fijo = conRemu && f.modo === 'fijo';
    const extraHabil = fijo ? f.detalle.filter((x) => !x.especial).reduce((s, x) => s + x.pagoMin, 0) : 0;
    const extraEspecial = fijo ? f.detalle.filter((x) => x.especial).reduce((s, x) => s + x.pagoMin, 0) : 0;
    return { f, fijo, extraHabil, extraEspecial, extra: extraHabil + extraEspecial, normales: fijo ? f.totMin - extraHabil - extraEspecial : null,
      montoExtra: fijo ? Math.round(((extraHabil + extraEspecial) / 60) * f.vh) : null };
  }).sort((a, b) => nombre(a.f.persona).localeCompare(nombre(b.f.persona)));

  // ---- Cabecera: mes y exportar
  const mesCampo = el('input', { type: 'month', class: 'campo', value: estado.mes, 'aria-label': 'Mes' });
  mesCampo.addEventListener('change', () => { if (mesCampo.value) { estado.mes = mesCampo.value; estado.abierto = null; ctx.refrescar(); } });
  const mover = (n) => { const [a, m] = estado.mes.split('-').map(Number); const x = new Date(a, m - 1 + n, 1); estado.mes = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; estado.abierto = null; ctx.refrescar(); };
  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'Buscar trabajador…', 'aria-label': 'Buscar trabajador' });

  // ---- Tabla con detalle por día al tocar la fila
  const cuerpo = el('tbody');
  const pintar = () => {
    const q = buscador.value.trim().toLowerCase();
    const vis = filas.filter((x) => !q || nombre(x.f.persona).toLowerCase().includes(q));
    cuerpo.replaceChildren(...(vis.length ? vis.flatMap((x) => {
      const id = x.f.vinculo.persona_id; const abierto = estado.abierto === id;
      const fila = el('tr', { class: `fila-enlace${x.fijo ? ' fila-fijo' : ''}`, title: abierto ? 'Ocultar el detalle' : 'Ver el detalle por día', onclick: () => { estado.abierto = abierto ? null : id; pintar(); } },
        el('td', {}, icono(abierto ? 'abajo' : 'derecha', { tam: 14 }), ' ', el('strong', {}, nombre(x.f.persona)),
          el('span', { class: 'texto-chico texto-suave' }, el('br'), x.fijo ? `Fijo${x.f.ventana ? ` · turno ${x.f.ventana}` : ''}${x.f.condicion?.salida_viernes ? ` · viernes hasta ${hhmm(x.f.condicion.salida_viernes)}` : ''}${x.f.condicion?.art22 ? ' · Art. 22' : ''}` : conRemu ? 'Por hora (todas sus horas se pagan)' : '')),
        el('td', { class: 'num' }, String(x.f.dias)),
        el('td', { class: 'num' }, hm(x.f.totMin)),
        el('td', { class: 'num' }, x.fijo ? hm(x.normales) : '—'),
        el('td', { class: 'num' }, x.fijo ? hm(x.extraHabil) : '—'),
        el('td', { class: 'num' }, x.fijo ? hm(x.extraEspecial) : '—'),
        el('td', { class: 'num' }, x.fijo ? el('strong', {}, hm(x.extra)) : '—'),
        verMonto ? el('td', { class: 'num' }, x.fijo ? dinero(x.montoExtra) : '—') : null);
      if (!abierto) return [fila];
      const det = el('tr', { class: 'asis-res-detalle' }, el('td', { colspan: verMonto ? 8 : 7 },
        el('table', { class: 'tabla tabla-compacta' },
          el('thead', {}, el('tr', {}, ['Día', 'Registros', 'Horas', ...(x.fijo ? ['Extra'] : [])].map((t) => el('th', {}, t)))),
          el('tbody', {}, x.f.detalle.filter((dd) => dd.min > 0).map((dd) => el('tr', { class: dd.especial ? 'asis-res-especial' : null },
            el('td', {}, `${nombreDia(dd.fecha)} ${fechaCorta(dd.fecha)}`, dd.feriado ? el('span', { class: 'texto-chico texto-suave' }, ` · ${R.feriados.get(dd.fecha) ?? 'feriado'}`) : null),
            el('td', {}, dd.registros.map((r) => `${hhmm(r.entrada)}–${hhmm(r.salida)}`).join(' · ')),
            el('td', { class: 'num' }, hm(dd.min)),
            x.fijo ? el('td', { class: 'num' }, dd.pagoMin ? el('strong', {}, hm(dd.pagoMin)) : '—') : null))))));
      return [fila, det];
    }) : [el('tr', {}, el('td', { colspan: verMonto ? 8 : 7, class: 'tabla-vacia' }, icono('reloj', { tam: 28 }), 'Sin horas en el mes.'))]));
  };
  buscador.addEventListener('input', pintar);
  pintar();

  const totalExtra = filas.reduce((s, x) => s + x.extra, 0);
  const exportar = async () => {
    const { exportarExcel } = await import('../../../core/excel.js?v=9dfb925');
    await exportarExcel(ctx, {
      titulo: 'Resumen de horas del mes', subtitulo: nombreMes(estado.mes), nombre: `horas-${estado.mes}`,
      columnas: ['Trabajador', 'Tipo', { t: 'Días', tipo: 'numero' }, { t: 'Horas', tipo: 'horas' }, { t: 'Normales', tipo: 'horas' }, { t: 'Extra hábil', tipo: 'horas' }, { t: 'Extra fin de semana y feriado', tipo: 'horas' }, { t: 'Total extra', tipo: 'horas' }, ...(verMonto ? [{ t: 'Monto extra', tipo: 'dinero' }] : [])],
      filas: filas.map((x) => [nombre(x.f.persona), x.fijo ? 'Fijo' : 'Por hora', x.f.dias, x.f.totMin, x.normales, x.fijo ? x.extraHabil : null, x.fijo ? x.extraEspecial : null, x.fijo ? x.extra : null, ...(verMonto ? [x.montoExtra] : [])]),
      nota: 'Extra: fuera del turno en día hábil y todo el sábado, domingo o feriado (fijos). Los trabajadores por hora cobran todas sus horas.',
    });
  };

  return el('section', { class: 'listado' },
    el('div', { class: 'listado-cabecera' },
      el('h1', {}, 'Resumen del mes'),
      el('div', { class: 'listado-acciones' },
        el('span', { class: 'asis-res-mes' },
          el('button', { type: 'button', class: 'boton-icono', title: 'Mes anterior', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver', { tam: 16 })),
          mesCampo,
          el('button', { type: 'button', class: 'boton-icono', title: 'Mes siguiente', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha', { tam: 16 }))),
        buscador,
        ctx.puede('asistencia', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: () => exportar().catch((e) => avisar(e.message, 'error')) }) : null)),
    el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip' }, `${filas.length} trabajadores con horas`),
      el('span', { class: 'chip' }, `Horas ${horas(filas.reduce((s, x) => s + x.f.totMin, 0))}`),
      conRemu ? el('span', { class: 'chip chip-prox' }, `Horas extra ${horas(totalExtra)}`) : null,
      verMonto ? el('span', { class: 'texto-suave' }, `Monto extra ${dinero(filas.reduce((s, x) => s + (x.montoExtra ?? 0), 0))}`) : null),
    conRemu ? null : el('p', { class: 'texto-suave texto-chico' }, 'Las horas extra se calculan con el turno de cada trabajador (Remuneraciones → Condiciones); tu rol no lo ve, por eso solo salen las horas.'),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Trabajador', 'Días', 'Horas', 'Normales', 'Extra hábil', 'Extra fin de semana y feriado', 'Total extra', ...(verMonto ? ['Monto extra'] : [])].map((t, i) => el('th', { class: i ? 'num' : null }, t)))),
      cuerpo)),
    el('p', { class: 'texto-suave texto-chico' }, 'Extra: lo que queda fuera del turno en día hábil (el viernes desde su hora de salida) y todo el sábado, domingo o feriado. Mismas reglas que Remuneraciones.'));
}
