// Partes del Seguimiento del OS de IS Performance para el tablero del taller:
// - avance de cada vehículo (agendado 5 %, en espera 20 %, en proceso 40–90 % según las tareas, terminado 90 %, entregado 100 %)
// - resumen del taller: en proceso, avance promedio, terminados y entregados hoy, prioridades, y la lista de activos con
//   cronómetro desde la recepción y barra de avance, que se arrastra para priorizar (tal_ordenes.orden_manual)
// - flujo de los "por cotizar": P.C → COTIZADO → PAGADO
// - detalle a pantalla completa (tablet): cronómetro grande, avance, tareas para marcar, tiempos por etapa y avanzar/volver.
import { el } from '../../core/ui/dom.js?v=66a811d';
import { icono } from '../../core/ui/iconos.js?v=66a811d';
import { avisar } from '../../core/ui/aviso.js?v=66a811d';
import { ESTADOS, PRIORIDADES, nombreEstado, verPatente, nombreVehiculo, nombreTercero, textoMinutos } from './datos.js?v=66a811d';
import { mover } from './acciones.js?v=66a811d';

const ORDEN_PRIO = { urgente: 0, prioridad: 1, normal: 2, programado: 3 };
const hoyLocal = () => new Date().toLocaleDateString('sv');
const diaDe = (ts) => (ts ? new Date(ts).toLocaleDateString('sv') : '');

export function avance(o) {
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  if (i >= 4) return 100;
  if (i === 3) return 90;
  if (i === 2) { const n = o.tareas?.length ?? 0; return n ? Math.round(40 + (50 * o.tareas.filter((t) => t.ok).length) / n) : 60; }
  return i === 1 ? 20 : 5;
}
const colorAvance = (p) => (p >= 75 ? 'var(--ok)' : p >= 40 ? 'var(--prox)' : 'var(--venc)');
export const ordenarActivos = (l) => [...l].sort((a, b) => {
  if (a.orden_manual && b.orden_manual) return a.orden_manual - b.orden_manual;
  if (a.orden_manual || b.orden_manual) return a.orden_manual ? -1 : 1;
  return ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad] || avance(a) - avance(b);
});

// Cronómetro "h:mm:ss" desde un instante (se actualiza solo mientras el nodo está en la página)
export function cronometro(desde, clase = 'tal-cron') {
  const n = el('span', { class: clase, title: 'Desde la recepción' });
  const pintar = () => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(desde)) / 1000));
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
    n.textContent = `${d ? `${d} d ` : ''}${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  pintar();
  const t = setInterval(() => { if (!n.isConnected) { clearInterval(t); return; } pintar(); }, 1000);
  return n;
}

// "Por cotizar" (servicio a convenir) → COTIZADO (tiene cotización) → PAGADO (cobrado)
export function marcaCotizar(o, cotizadas) {
  const porCotizar = o.tal_orden_servicios.some((s) => s.tal_servicios?.variable || /cotiz/i.test(s.nombre));
  if (!porCotizar && !cotizadas.has(o.id)) return null;
  if (o.cobrado) return el('span', { class: 'tcal-pc ec-pago', title: 'Cobrado' }, 'PAGADO');
  if (cotizadas.has(o.id)) return el('span', { class: 'tcal-pc ec-cot', title: 'Tiene cotización' }, 'COTIZADO');
  return el('span', { class: 'tcal-pc', title: 'Por cotizar' }, 'P.C');
}

// Resumen del taller con la lista de activos que se arrastra para priorizar
export function resumenTaller(ctx, data, { alAbrir }) {
  const activos = ordenarActivos(data.filter((o) => ['agendado', 'espera', 'proceso'].includes(o.estado)));
  if (!activos.length) return null;
  const hoy = hoyLocal();
  const prom = Math.round(activos.reduce((s, o) => s + avance(o), 0) / activos.length);
  const kpi = (t, v, s) => el('div', { class: 'ficha fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', { class: 'total-grande' }, v), el('span', { class: 'texto-suave texto-chico' }, s));
  const lista = el('div', { class: 'seg-lista' });
  const puede = ctx.puede('taller', 'editar');
  activos.forEach((o) => {
    const p = avance(o); const v = o.tal_vehiculos;
    const fila = el('div', { class: 'seg-fila', 'data-id': o.id },
      puede ? el('span', { class: 'seg-asa', title: 'Arrastra para priorizar' }, icono('arrastrar', { tam: 14 })) : null,
      el('span', { class: 'seg-punto', style: `background:${colorAvance(p)}` }),
      el('button', { type: 'button', class: 'seg-nombre', onclick: () => alAbrir(o) }, el('strong', {}, nombreVehiculo(v)), v?.patente ? el('i', {}, ` ${verPatente(v.patente)}`) : null),
      o.ingreso_at ? cronometro(o.ingreso_at, 'seg-cron') : el('span', { class: 'seg-cron sin' }, 'sin recepción'),
      el('span', { class: 'seg-barra' }, el('i', { style: `width:${p}%;background:${colorAvance(p)}` })),
      el('span', { class: 'seg-pct' }, `${p}%`));
    lista.append(fila);
  });
  // Arrastre con el puntero (mouse y táctil): se toma del asa y se suelta donde quede
  if (puede) {
    let arrastrada = null; let movio = false;
    const guardar = async () => {
      const cambios = [...lista.querySelectorAll('.seg-fila')].map((r, i) => ({ id: r.dataset.id, n: i + 1, o: activos.find((x) => x.id === r.dataset.id) }))
        .filter((x) => x.o && x.o.orden_manual !== x.n && !x.o.cobrado);
      if (!cambios.length) return;
      const res = await Promise.all(cambios.map((x) => ctx.api.from('tal_ordenes').update({ orden_manual: x.n }).eq('id', x.id)));
      const err = res.find((r) => r.error);
      if (err) { avisar(err.error.message, 'error'); return; }
      cambios.forEach((x) => { x.o.orden_manual = x.n; });
      avisar('Prioridad actualizada.'); ctx.refrescar();
    };
    lista.addEventListener('pointerdown', (ev) => {
      const asa = ev.target.closest('.seg-asa'); if (!asa) return;
      ev.preventDefault(); movio = false; arrastrada = asa.closest('.seg-fila'); arrastrada.classList.add('arrastrando');
      lista.setPointerCapture(ev.pointerId);
    });
    lista.addEventListener('pointermove', (ev) => {
      if (!arrastrada) return;
      const otras = [...lista.querySelectorAll('.seg-fila:not(.arrastrando)')];
      const despues = otras.find((r) => { const c = r.getBoundingClientRect(); return ev.clientY < c.top + c.height / 2; });
      if (despues) { if (despues !== arrastrada.nextSibling) { lista.insertBefore(arrastrada, despues); movio = true; } } else if (lista.lastChild !== arrastrada) { lista.append(arrastrada); movio = true; }
    });
    const soltar = () => { if (!arrastrada) return; arrastrada.classList.remove('arrastrando'); arrastrada = null; if (movio) guardar(); };
    lista.addEventListener('pointerup', soltar);
    lista.addEventListener('pointercancel', soltar);
  }
  // En el teléfono parte cerrado: lo primero que se ve es el tablero (pedido de Enzo)
  return el('details', { class: 'ficha doc-grupo seg-resumen', open: !matchMedia('(max-width: 700px)').matches },
    el('summary', {}, el('strong', {}, 'Resumen del taller'), el('span', { class: 'texto-suave texto-chico' }, ` ${activos.length} activos · ${prom}% de avance${puede ? ' · arrastra para priorizar' : ''}`)),
    el('div', { class: 'fin-tarjetas' },
      kpi('En proceso', String(data.filter((o) => o.estado === 'proceso').length), 'activos ahora'),
      kpi('Avance promedio', `${prom}%`, 'de los activos'),
      kpi('Terminados hoy', String(data.filter((o) => o.estado === 'terminado' && diaDe(o.termino_at) === hoy).length), 'listos'),
      kpi('Entregados hoy', String(data.filter((o) => o.estado === 'entregado' && diaDe(o.entregado_at) === hoy).length), 'salieron')),
    el('div', { class: 'resumen-chips' }, PRIORIDADES.map(([k, n]) => el('span', { class: `chip seg-prio-${k}` }, `${n} `, el('strong', {}, String(activos.filter((o) => o.prioridad === k).length))))),
    lista);
}

// Detalle a pantalla completa (tablet): cronómetro, avance, tareas, tiempos por etapa y avanzar/volver
export function detalleVehiculo(ctx, o, { alCambiar }) {
  const v = o.tal_vehiculos; const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const puede = ctx.puede('taller', 'editar');
  let sucio = false;
  const fondo = el('div', { class: 'seg-modal' });
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); if (sucio) alCambiar(); };
  const tecla = (ev) => { if (ev.key === 'Escape') cerrar(); };
  const minutos = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null);
  const etapas = [['En espera → en proceso', minutos(o.ingreso_at, o.inicio_at)], ['En proceso → terminado', minutos(o.inicio_at, o.termino_at)], ['Terminado → entregado', minutos(o.termino_at, o.entregado_at)]].filter(([, m]) => m != null);
  const cuenta = el('span');
  const pintarCuenta = () => { cuenta.textContent = `${o.tareas.filter((t) => t.ok).length}/${o.tareas.length}`; };
  pintarCuenta();
  const barra = el('i', { style: `width:${avance(o)}%` }); const pct = el('strong', {}, `${avance(o)}%`);
  const tareas = o.tareas.length ? o.tareas.map((t, k) => {
    const cb = el('input', { type: 'checkbox', checked: t.ok, disabled: !puede || o.cobrado });
    cb.addEventListener('change', async () => {
      const nuevas = o.tareas.map((x, j) => (j === k ? { ...x, ok: cb.checked } : x));
      const { error } = await ctx.api.from('tal_ordenes').update({ tareas: nuevas }).eq('id', o.id);
      if (error) { cb.checked = !cb.checked; avisar(error.message, 'error'); return; }
      o.tareas = nuevas; sucio = true; pintarCuenta(); barra.style.width = `${avance(o)}%`; pct.textContent = `${avance(o)}%`;
    });
    return el('label', { class: 'seg-tarea' }, cb, el('span', {}, t.t));
  }) : [el('p', { class: 'texto-suave' }, 'Sin tareas.')];
  const avanzar = async (dir) => { if (await mover(ctx, o, dir)) { sucio = true; cerrar(); } };
  fondo.append(el('div', { class: 'seg-caja' },
    el('div', { class: 'seg-cab' },
      el('div', {}, el('h2', {}, nombreVehiculo(v)),
        el('p', { class: 'texto-suave' }, [verPatente(v?.patente) || 'sin patente', o.cobrado ? 'Cobrada' : nombreEstado[o.estado], o.terceros ? nombreTercero(o.terceros) : null, `N° ${o.numero}`].filter(Boolean).join(' · '))),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    o.ingreso_at ? el('div', { class: 'seg-reloj' }, el('span', { class: 'texto-suave texto-chico' }, 'Lleva en el taller'), cronometro(o.ingreso_at, 'seg-reloj-grande'), el('span', { class: 'texto-suave texto-chico' }, 'desde la recepción'))
      : el('div', { class: 'seg-reloj texto-suave' }, 'Aún no se recepciona'),
    el('div', { class: 'seg-avance' }, el('span', { class: 'seg-barra' }, barra), pct, el('span', { class: 'texto-suave' }, ` · ${PRIORIDADES.find((p) => p[0] === o.prioridad)?.[1] ?? ''}`)),
    el('h3', {}, 'Tareas (', cuenta, ')'), el('div', { class: 'seg-tareas' }, tareas),
    el('h3', {}, 'Tiempos por etapa'),
    etapas.length ? el('div', { class: 'resumen-chips' }, etapas.map(([n, m]) => el('span', { class: 'chip chip-na' }, icono('reloj', { tam: 12 }), ` ${n}: ${textoMinutos(m)}`))) : el('p', { class: 'texto-suave' }, 'Aún sin tiempos.'),
    el('div', { class: 'seg-acciones' },
      puede && i > 0 ? el('button', { type: 'button', class: 'boton boton-secundario', onclick: () => avanzar(-1) }, icono('volver', { tam: 16 }), 'Volver') : el('span'),
      el('a', { class: 'boton boton-secundario', href: ctx.ruta('taller.orden', { id: o.id }), onclick: () => fondo.remove() }, icono('editar', { tam: 16 }), 'Abrir la orden'),
      puede && ESTADOS[i]?.[2] ? el('button', { type: 'button', class: 'boton boton-primario', onclick: () => avanzar(1) }, ESTADOS[i][2], icono('derecha', { tam: 16 })) : null)));
  fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fondo);
}
