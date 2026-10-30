// Indicadores del Inicio (como el Inicio de InnovaGestión, 2026-10-26): Mis tareas (con "Nueva tarea"), Indicadores del
// día (UF, UTM y dólar), cifras, Faenas de hoy, Alertas como tablero (vencidos / esta semana / este mes, con tarjetas
// Personas, Vehículos, Empresa y Operación) y la lista de próximos vencimientos.
// Cada bloque aparece solo si la empresa tiene el módulo y el rol lo puede ver; si una consulta falla, se omite.
import { el } from '../ui/dom.js?v=9d0da9e';
import { icono } from '../ui/iconos.js?v=9d0da9e';
import { hoyISO, fechaCorta, fechaLarga } from '../ui/formato.js?v=9d0da9e';

const dias = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 864e5);
const textoDias = (n) => (n < 0 ? `Venció hace ${-n}d` : n === 0 ? 'Vence hoy' : `En ${n}d`);
const intentar = (p) => Promise.resolve(p).catch(() => null);   // las consultas de Supabase no traen .catch

export async function cargarIndicadores(ctx) {
  const puede = (m) => ctx.puede(m, 'ver');
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const [rrhh, ope, flota, acr, salidas, tareas] = await Promise.all([
    puede('rrhh') ? intentar(import('../../modulos/rrhh/datos.js?v=9d0da9e').then(async (m) => ({ m, d: await m.cargarRrhh(ctx) }))) : null,
    puede('ope') ? intentar(import('../../modulos/ope/datos.js?v=9d0da9e').then(async (m) => {
      const [base, semana] = await Promise.all([m.cargarBase(ctx), m.cargarSemana(ctx, hoy, hoy)]);
      return { m, base, semana };
    })) : null,
    puede('flota') ? intentar(import('../../modulos/flota/datos.js?v=9d0da9e').then(async (m) => ({ m, vehiculos: await m.cargarFlota(ctx) }))) : null,
    puede('acreditacion') ? intentar(import('../../modulos/acreditacion/datos.js?v=9d0da9e').then(async (m) => ({ m, d: await m.cargarDocumentos(ctx) }))) : null,
    puede('sst') ? intentar(ctx.api.from('sst_salidas').select('id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', `${mes}-01`)) : null,
    puede('tareas') ? intentar(ctx.api.from('tar_tareas').select('id, titulo, fecha, prioridad, responsable_id').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).neq('estado', 'hecha').order('fecha', { nullsFirst: false }).limit(200)) : null,
  ]);
  return { rrhh, ope, flota, acr, salidas, tareas, hoy };
}

export function panelIndicadores(ctx, x) {
  const bloques = [];
  const kpis = [];
  const vencimientos = [];   // { titulo, sub, fecha, n, ruta }

  // ---- Mis tareas (se ve siempre para quien puede crear tareas)
  const pend = x.tareas?.data ?? [];
  const mias = pend.filter((t) => t.responsable_id === ctx.usuario?.id);
  const PRIO = { alta: 0, media: 1, baja: 2 };
  if (x.tareas && (mias.length || ctx.puede('tareas', 'crear'))) {
    const orden = [...mias].sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || PRIO[a.prioridad] - PRIO[b.prioridad]);
    bloques.push(el('div', { class: 'ficha doc-grupo ind-ancho' },
      el('div', { class: 'ind-cab' }, el('h2', {}, mias.length ? `Mis tareas (${mias.length})` : 'Mis tareas'),
        el('div', { class: 'ind-cab-acciones' }, el('a', { href: '#/tareas.lista' }, 'Ver todas'),
          ctx.puede('tareas', 'crear') ? el('a', { class: 'boton boton-primario boton-chico', href: '#/tareas.lista?nueva=1' }, icono('mas', { tam: 14 }), 'Nueva tarea') : null)),
      orden.length ? orden.slice(0, 5).map((t) => {
        const n = t.fecha ? dias(t.fecha) : null;
        return el('a', { class: 'ind-venc', href: `#/tareas.lista?id=${t.id}` },
          el('span', { class: 'ind-nombre' }, el('strong', {}, t.titulo), t.prioridad === 'alta' ? el('span', { class: 'texto-chico texto-error' }, 'Prioridad alta') : null),
          n == null ? el('span', { class: 'chip chip-na' }, 'Sin fecha') : el('span', { class: `chip ${n < 0 ? 'chip-venc' : n <= 1 ? 'chip-prox' : 'chip-ok'}` }, n < 0 ? `Venció hace ${-n}d` : n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : fechaCorta(t.fecha)));
      }) : el('p', { class: 'texto-suave texto-chico' }, 'No tienes tareas pendientes.')));
  }
  // Tareas del equipo con fecha → Operación en el tablero de alertas
  for (const t of pend) if (t.fecha && dias(t.fecha) <= 30) vencimientos.push({ area: 'Operación', titulo: t.titulo, sub: `Tarea · ${fechaLarga(t.fecha)}`, n: dias(t.fecha), ruta: `#/tareas.lista?id=${t.id}` });

  // ---- RRHH: trabajadores, documentación y vencimientos de documentos
  if (x.rrhh) {
    const { m, d } = x.rrhh;
    const activos = d.vinculos.filter((v) => v.estado === 'activo');
    const filas = activos.map((v) => ({ v, c: m.cumplimiento(d, v.persona_id) }));
    const prom = filas.length ? Math.round(filas.reduce((s, f) => s + f.c.pct, 0) / filas.length) : 0;
    const alDia = filas.filter((f) => f.c.pct === 100).length;
    kpis.push(['users', 'Trabajadores activos', String(activos.length), `${d.vinculos.length - activos.length} inactivos`, '#/rrhh.trabajadores']);
    kpis.push(['documento', 'Documentación al día', `${prom}%`, `${alDia} de ${activos.length} al 100%`, '#/rrhh.documentos', prom < 50 ? 'mal' : prom < 80 ? 'medio' : '']);
    for (const f of filas) for (const t of d.tiposActivos) {
      const doc = d.doc(f.v.persona_id, t.slug);
      const e = m.estadoDoc(t, doc);
      if ((e.k === 'venc' || e.k === 'prox' || (e.k === 'ok' && t.vence)) && doc?.vence) {
        vencimientos.push({ area: 'Personas', titulo: t.nombre, sub: `${m.nombreCompleto(f.v.personas)} · ${fechaLarga(doc.vence)}`, n: dias(doc.vence), ruta: `#/rrhh.ficha?p=${f.v.persona_id}` });
      }
    }
  }

  // Contratos a plazo fijo por vencer (30 días antes o vencidos)
  if (x.rrhh) for (const v of x.rrhh.d.vinculos.filter((y) => y.estado === 'activo' && y.contrato_vence && !y.contrato_indefinido)) {
    vencimientos.push({ area: 'Personas', titulo: 'Vence contrato', sub: `${x.rrhh.m.nombreCompleto(v.personas)} · ${fechaLarga(v.contrato_vence)}`, n: dias(v.contrato_vence), ruta: `#/rrhh.ficha?p=${v.persona_id}` });
  }

  // ---- Faenas de hoy
  let panelFaenas = null;
  if (x.ope) {
    const { m, base, semana } = x.ope;
    const hoyF = m.faenasDelDia(semana.faenas, x.hoy);
    const personasHoy = hoyF.reduce((s, f) => s + (semana.planDe(f, x.hoy)?.ope_plan_personas?.length ?? 0), 0);
    kpis.push(['calendario', 'Faenas hoy', String(hoyF.length), `${personasHoy} ${personasHoy === 1 ? 'persona asignada' : 'personas asignadas'}`, '#/ope.planificacion']);
    panelFaenas = el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'ind-cab' }, el('h2', {}, `Faenas de hoy (${hoyF.length})`), el('a', { href: '#/ope.planificacion' }, 'Planificación')),
      hoyF.length ? hoyF.slice(0, 6).map((f) => {
        const et = m.etiquetaFaena(f, base);
        const n = semana.planDe(f, x.hoy)?.ope_plan_personas?.length ?? 0;
        return el('a', { class: 'ind-faena', href: '#/ope.planificacion' },
          el('i', { style: `background:${et.color}` }),
          el('span', { class: 'ind-nombre' }, el('strong', {}, f.titulo), el('span', { class: 'texto-suave texto-chico' }, et.texto)),
          el('span', { class: 'chip chip-pend' }, `${n} ${n === 1 ? 'persona' : 'personas'}`));
      }) : el('p', { class: 'texto-suave texto-chico' }, 'Sin faenas hoy.'));
  }

  // ---- Vencimientos de flota y documentos de empresa
  if (x.flota) {
    for (const v of x.flota.vehiculos) for (const e of x.flota.m.vencimientos(v.registros)) {
      if (e.vence) vencimientos.push({ area: 'Vehículos', titulo: x.flota.m.nombreCat[e.cat], sub: `${x.flota.m.etiquetaVehiculo(v)} · ${fechaLarga(e.vence)}`, n: e.n, ruta: `#/flota.vehiculo?id=${v.id}` });
    }
  }
  if (x.acr) {
    for (const t of x.acr.d.tipos) for (const d of t.estado.vigentes ?? []) {
      if (t.vence && d.vence) vencimientos.push({ area: 'Empresa', titulo: t.nombre, sub: `Empresa · ${fechaLarga(d.vence)}`, n: dias(d.vence), ruta: `#/acreditacion.tipo?id=${t.id}` });
    }
  }
  if (x.salidas && !x.salidas.error) kpis.push(['mas', 'Salidas médicas', String(x.salidas.count ?? 0), 'Este mes', '#/sst.salidas']);

  const docsVenc = vencimientos.filter((v) => v.area !== 'Operación');   // las tareas ya están en Mis tareas y en Alertas
  const panelVenc = docsVenc.length ? el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'ind-cab' }, el('h2', {}, 'Próximos vencimientos')),
    [...docsVenc].sort((a, b) => a.n - b.n).slice(0, 8).map((v) => el('a', { class: 'ind-venc', href: v.ruta },
      el('span', { class: 'ind-nombre' }, el('strong', {}, v.titulo), el('span', { class: 'texto-suave texto-chico' }, v.sub)),
      el('span', { class: `chip ${v.n < 0 ? 'chip-venc' : v.n <= 30 ? 'chip-prox' : 'chip-ok'}` }, textoDias(v.n))))) : null;

  // ---- Alertas como tablero: contadores y tarjetas por área, lo más urgente primero
  const urgentes = vencimientos.filter((v) => v.n <= 30).sort((a, b) => a.n - b.n);
  const tablero = urgentes.length ? el('div', { class: 'ficha doc-grupo ind-ancho alertas-tablero' },
    el('div', { class: 'ind-cab' }, el('h2', {}, 'Alertas')),
    el('div', { class: 'alertas-contadores' },
      [['venc', 'Vencidos', (v) => v.n < 0], ['prox', 'Esta semana', (v) => v.n >= 0 && v.n <= 7], ['pend', 'Este mes', (v) => v.n > 7]].map(([k, t, f]) =>
        el('div', { class: `alertas-contador ac-${k}` }, el('strong', {}, String(urgentes.filter(f).length)), el('span', { class: 'texto-chico' }, t)))),
    el('div', { class: 'alertas-tarjetas' }, ['Personas', 'Vehículos', 'Empresa', 'Operación'].map((area) => {
      const l = urgentes.filter((v) => v.area === area);
      if (!l.length) return null;
      const lista = el('div', {}, l.slice(0, 4).map((v) => el('a', { class: 'ind-venc', href: v.ruta },
        el('span', { class: 'ind-nombre' }, el('strong', {}, v.titulo), el('span', { class: 'texto-suave texto-chico' }, v.sub)),
        el('span', { class: `chip ${v.n < 0 ? 'chip-venc' : v.n <= 7 ? 'chip-prox' : 'chip-pend'}` }, textoDias(v.n)))));
      const todas = l.length > 4 ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: (ev) => {
        lista.replaceChildren(...l.map((v) => el('a', { class: 'ind-venc', href: v.ruta },
          el('span', { class: 'ind-nombre' }, el('strong', {}, v.titulo), el('span', { class: 'texto-suave texto-chico' }, v.sub)),
          el('span', { class: `chip ${v.n < 0 ? 'chip-venc' : v.n <= 7 ? 'chip-prox' : 'chip-pend'}` }, textoDias(v.n)))));
        ev.currentTarget.remove();
      } }, `Ver todas (${l.length})`) : null;
      return el('div', { class: `alertas-area ${l.some((v) => v.n < 0) ? 'aa-venc' : l.some((v) => v.n <= 7) ? 'aa-prox' : ''}` },
        el('h3', {}, area, el('span', { class: 'texto-suave texto-chico' }, ` · ${l.length}`)), lista, todas);
    }))) : null;

  // ---- Indicadores del día (UF, UTM, dólar)
  const valor = el('div', { class: 'eco-valores' }, el('span', { class: 'texto-suave texto-chico' }, 'Cargando…'));
  import('../economia.js?v=9d0da9e').then(({ indicadoresDelDia }) => indicadoresDelDia()).then((v) => {
    if (!v) { valor.replaceChildren(el('span', { class: 'texto-suave texto-chico' }, 'No se pudieron obtener los indicadores')); return; }
    const pesos = (n, dec = 0) => (n == null ? '—' : `$${Number(n).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`);
    valor.replaceChildren(...[['UF', pesos(v.uf, 2)], ['UTM', pesos(v.utm)], ['Dólar', pesos(v.dolar, 2)]].map(([t, n]) => el('div', {}, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, n))));
  }).catch(() => valor.replaceChildren(el('span', { class: 'texto-suave texto-chico' }, 'Sin datos')));
  const eco = el('div', { class: 'ficha doc-grupo' }, el('div', { class: 'ind-cab' }, el('h2', {}, 'Indicadores del día'), el('span', { class: 'texto-suave texto-chico' }, 'mindicador.cl · findic.cl')), valor);
  bloques.push(eco);
  if (tablero) bloques.push(tablero);

  if (!kpis.length && !bloques.length) return null;
  return el('div', { class: 'indicadores' },
    bloques,
    kpis.length ? el('div', { class: 'ind-kpis' }, kpis.map(([ic, t, v, sub, ruta, nivel]) => el('a', { class: `ind-kpi ${nivel ? `ind-${nivel}` : ''}`, href: ruta },
      el('span', { class: 'ind-kpi-icono' }, icono(ic, { tam: 20 })),
      el('span', {}, el('span', { class: 'ind-kpi-titulo' }, t), el('strong', {}, v), el('span', { class: 'texto-suave texto-chico' }, sub))))) : null,
    [panelFaenas, panelVenc].some(Boolean) ? el('div', { class: 'ind-paneles' }, panelFaenas, panelVenc) : null);
}

export { fechaCorta };
