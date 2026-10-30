// Estado documental: matriz persona × tipo de documento, con resumen y filtros.
import { el } from '../../../core/ui/dom.js?v=605af68';
import { icono } from '../../../core/ui/iconos.js?v=605af68';
import { asignadosConPendientes, DIAS_PROXIMAS } from '../proximas.js?v=605af68';
import { cargarRrhh, cumplimiento, estadoDoc, iconoEstado, nombreCompleto, nivel } from '../datos.js?v=605af68';

const filtro = { categoria: '', problemas: false };

export default async function vista(ctx) {
  const datos = await cargarRrhh(ctx);
  const proximas = await asignadosConPendientes(ctx, datos).catch(() => null);
  const activos = datos.vinculos.filter((v) => v.estado === 'activo');
  // Cédulas entregadas sin vencimiento (se pueden leer en lote)
  const sinFecha = activos.filter((v) => { const d = datos.doc(v.persona_id, 'cedula'); return d?.estado === 'entregado' && !d.vence && (d.archivo || d.archivo2); }).length;
  const tipos = datos.tiposActivos.filter((t) => !filtro.categoria || t.categoria === filtro.categoria);

  // Totales por tipo (para ver qué documento falta más) y por estado.
  const total = { ok: 0, prox: 0, venc: 0, pend: 0, na: 0 };
  const porTipo = new Map(tipos.map((t) => [t.slug, { ok: 0, n: 0 }]));
  const filas = activos.map((v) => {
    const celdas = tipos.map((t) => {
      const e = estadoDoc(t, datos.doc(v.persona_id, t.slug));
      if (t.cuenta) {
        total[e.k] += 1;
        const pt = porTipo.get(t.slug);
        if (e.k !== 'na') { pt.n += 1; if (e.k === 'ok' || e.k === 'prox') pt.ok += 1; }
      }
      return e;
    });
    return { v, celdas, c: cumplimiento(datos, v.persona_id) };
  }).filter((f) => !filtro.problemas || f.celdas.some((e) => e.k === 'venc' || e.k === 'prox' || e.k === 'pend'));

  const selector = el('select', { class: 'campo campo-filtro', 'aria-label': 'Categoría' },
    [['', 'Documentos y capacitaciones'], ['documento', 'Solo documentos'], ['capacitacion', 'Solo capacitaciones']]
      .map(([v, t]) => el('option', { value: v, selected: filtro.categoria === v }, t)));
  selector.addEventListener('change', () => { filtro.categoria = selector.value; ctx.refrescar(); });
  const soloProblemas = el('label', { class: 'casilla' },
    el('input', { type: 'checkbox', class: 'interruptor', checked: filtro.problemas, onchange: (ev) => { filtro.problemas = ev.target.checked; ctx.refrescar(); } }),
    'Solo con pendientes o vencidos');

  const tabla = el('table', { class: 'tabla matriz-docs' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Persona'),
      el('th', { class: 'centro' }, '%'),
      tipos.map((t) => {
        const pt = porTipo.get(t.slug);
        const pct = pt.n ? Math.round((pt.ok / pt.n) * 100) : 100;
        return el('th', { class: 'centro', title: `${t.nombre} · ${pct}% al día` },
          el('span', { class: 'th-vertical' }, t.corto || t.nombre));
      }))),
    el('tbody', {}, filas.length
      ? filas.map(({ v, celdas, c }) => el('tr', {},
          el('td', {}, el('a', { href: ctx.ruta('rrhh.ficha', { p: v.persona_id }) }, nombreCompleto(v.personas))),
          el('td', { class: `centro pct-${nivel(c.pct)}` }, el('strong', {}, `${c.pct}%`)),
          celdas.map((e) => el('td', { class: 'centro' }, iconoEstado(e)))))
      : el('tr', {}, el('td', { colspan: tipos.length + 2, class: 'tabla-vacia' }, 'No hay personas con ese filtro.'))));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Estado documental'),
      el('div', { class: 'listado-acciones' }, selector, soloProblemas)),
    el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-venc' }, icono('alerta', { tam: 14 }), `${total.venc} vencidos`),
      el('span', { class: 'chip chip-prox' }, icono('reloj', { tam: 14 }), `${total.prox} por vencer`),
      el('span', { class: 'chip chip-pend' }, icono('circulo', { tam: 14 }), `${total.pend} pendientes`),
      el('span', { class: 'chip chip-ok' }, icono('check', { tam: 14 }), `${total.ok} al día`),
      el('span', { class: 'texto-suave' }, `${activos.length} personas activas`)),
    sinFecha && ctx.puede('rrhh', 'editar') ? el('a', { class: 'aviso-bandeja', href: ctx.ruta('rrhh.lectura') }, icono('ojo', { tam: 16 }),
      `${sinFecha} cédula${sinFecha === 1 ? '' : 's'} sin fecha de vencimiento: leerlas en lote`, icono('derecha', { tam: 16 })) : null,
    proximas?.length ? el('a', { class: 'aviso-bandeja', href: ctx.ruta('rrhh.proximas') }, icono('calendario', { tam: 16 }),
      `${proximas.length} ${proximas.length === 1 ? 'persona asignada' : 'personas asignadas'} a faenas de los próximos ${DIAS_PROXIMAS} días con documentos vencidos o pendientes`, icono('derecha', { tam: 16 })) : null,
    tipos.length
      ? el('div', { class: 'tabla-contenedor' }, tabla)
      : el('p', { class: 'texto-suave' }, 'No hay tipos de documento configurados.'),
    el('p', { class: 'texto-suave texto-chico' }, 'Pasa el cursor sobre una columna para ver el nombre completo y su % al día. Haz clic en un nombre para abrir su ficha.'),
  );
}
