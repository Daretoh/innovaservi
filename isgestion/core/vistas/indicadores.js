// Indicadores del Inicio (como el Inicio de InnovaGestión): tareas pendientes, tarjetas con cifras y paneles de
// documentación, faenas de los próximos 7 días, próximos vencimientos y clientes con faenas en 30 días.
// Cada bloque aparece solo si la empresa tiene el módulo y el rol lo puede ver; si una consulta falla, se omite.
import { el } from '../ui/dom.js';
import { icono } from '../ui/iconos.js';
import { hoyISO, sumarDias, nombreDia, fechaCorta, fechaLarga } from '../ui/formato.js';

const dias = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${hoyISO()}T12:00`)) / 864e5);
const textoDias = (n) => (n < 0 ? `Venció hace ${-n}d` : n === 0 ? 'Vence hoy' : `En ${n}d`);
const intentar = (p) => Promise.resolve(p).catch(() => null);   // las consultas de Supabase no traen .catch

export async function cargarIndicadores(ctx) {
  const puede = (m) => ctx.puede(m, 'ver');
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const [rrhh, ope, flota, acr, salidas, tareas] = await Promise.all([
    puede('rrhh') ? intentar(import('../../modulos/rrhh/datos.js').then(async (m) => ({ m, d: await m.cargarRrhh(ctx) }))) : null,
    puede('ope') ? intentar(import('../../modulos/ope/datos.js').then(async (m) => {
      const [base, semana, ultimos] = await Promise.all([m.cargarBase(ctx), m.cargarSemana(ctx, hoy, sumarDias(hoy, 6)),
        ctx.api.from('ope_faenas').select('id, tercero_id, fecha_inicio, fecha_fin').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
          .neq('estado', 'cancelada').lte('fecha_inicio', hoy).gte('fecha_fin', sumarDias(hoy, -30))]);
      return { m, base, semana, ultimos: ultimos.data ?? [] };
    })) : null,
    puede('flota') ? intentar(import('../../modulos/flota/datos.js').then(async (m) => ({ m, vehiculos: await m.cargarFlota(ctx) }))) : null,
    puede('acreditacion') ? intentar(import('../../modulos/acreditacion/datos.js').then(async (m) => ({ m, d: await m.cargarDocumentos(ctx) }))) : null,
    puede('sst') ? intentar(ctx.api.from('sst_salidas').select('id', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', `${mes}-01`)) : null,
    puede('tareas') ? intentar(ctx.api.from('tar_tareas').select('id, titulo, fecha').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'pendiente').order('fecha', { nullsFirst: false }).limit(50)) : null,
  ]);
  return { rrhh, ope, flota, acr, salidas, tareas, hoy };
}

export function panelIndicadores(ctx, x) {
  const bloques = [];
  const kpis = [];
  const vencimientos = [];   // { titulo, sub, fecha, n, ruta }

  // ---- Tareas pendientes
  const pend = x.tareas?.data ?? [];
  if (x.tareas && pend.length) {
    bloques.push(el('div', { class: 'ficha doc-grupo ind-ancho' },
      el('div', { class: 'ind-cab' }, el('h2', {}, 'Tareas pendientes'), el('a', { href: '#/tareas.lista' }, 'Ver tareas')),
      el('strong', { class: 'ind-tarea' }, pend[0].titulo),
      el('p', { class: 'texto-suave texto-chico' }, `${pend.length} ${pend.length === 1 ? 'pendiente' : 'pendientes'} en total (equipo).`)));
  }

  // ---- RRHH: trabajadores, documentación y vencimientos de documentos
  let panelDocs = null;
  if (x.rrhh) {
    const { m, d } = x.rrhh;
    const activos = d.vinculos.filter((v) => v.estado === 'activo');
    const filas = activos.map((v) => ({ v, c: m.cumplimiento(d, v.persona_id) }));
    const tot = filas.reduce((s, f) => ({ ok: s.ok + f.c.ok - f.c.prox, prox: s.prox + f.c.prox, venc: s.venc + f.c.venc, pend: s.pend + f.c.pend, n: s.n + f.c.n }), { ok: 0, prox: 0, venc: 0, pend: 0, n: 0 });
    const prom = filas.length ? Math.round(filas.reduce((s, f) => s + f.c.pct, 0) / filas.length) : 0;
    const alDia = filas.filter((f) => f.c.pct === 100).length;
    kpis.push(['users', 'Trabajadores activos', String(activos.length), `${d.vinculos.length - activos.length} inactivos`, '#/rrhh.trabajadores']);
    kpis.push(['documento', 'Documentación al día', `${prom}%`, `${alDia} de ${activos.length} al 100%`, '#/rrhh.documentos', prom < 50 ? 'mal' : prom < 80 ? 'medio' : '']);
    for (const f of filas) for (const t of d.tiposActivos) {
      const doc = d.doc(f.v.persona_id, t.slug);
      const e = m.estadoDoc(t, doc);
      if ((e.k === 'venc' || e.k === 'prox' || (e.k === 'ok' && t.vence)) && doc?.vence) {
        vencimientos.push({ titulo: t.nombre, sub: `${m.nombreCompleto(f.v.personas)} · ${fechaLarga(doc.vence)}`, n: dias(doc.vence), ruta: `#/rrhh.ficha?p=${f.v.persona_id}` });
      }
    }
    const pct = (k) => (tot.n ? Math.round((tot[k] / tot.n) * 100) : 0);
    const peores = [...filas].sort((a, b) => a.c.pct - b.c.pct).slice(0, 6);
    panelDocs = el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'ind-cab' }, el('h2', {}, 'Documentación de trabajadores'), el('a', { href: '#/rrhh.documentos' }, 'Ver detalle')),
      el('p', { class: 'texto-suave texto-chico' }, `${tot.n} documentos y cursos requeridos a ${activos.length} trabajadores activos.`),
      el('div', { class: 'ind-apilada' }, ['ok', 'prox', 'venc', 'pend'].map((k) => el('i', { class: `ind-c-${k}`, style: `width:${pct(k)}%`, title: `${pct(k)}%` }))),
      el('div', { class: 'ind-leyenda' }, [['ok', 'Al día'], ['prox', 'Por vencer'], ['venc', 'Vencido'], ['pend', 'Pendiente']].map(([k, n]) =>
        el('span', {}, el('i', { class: `ind-c-${k}` }), n, el('strong', {}, String(tot[k])), el('span', { class: 'texto-suave' }, `${pct(k)}%`)))),
      peores.length ? el('h3', { class: 'ind-sub' }, 'Con más pendientes') : null,
      peores.map((f) => el('a', { class: 'ind-barra-fila', href: `#/rrhh.ficha?p=${f.v.persona_id}` },
        el('span', { class: 'ind-nombre' }, m.nombreCompleto(f.v.personas)),
        el('span', { class: 'ind-barra' }, el('i', { style: `width:${f.c.pct}%` })),
        el('strong', {}, `${f.c.pct}%`))));
  }

  // ---- Faenas: hoy, próximos 7 días y clientes con faenas en 30 días
  let panelFaenas = null;
  let panelClientes = null;
  if (x.ope) {
    const { m, base, semana, ultimos } = x.ope;
    const diasSemana = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(x.hoy, i));
    const porDia = diasSemana.map((f) => m.faenasDelDia(semana.faenas, f));
    const hoyF = porDia[0];
    const personasHoy = hoyF.reduce((s, f) => s + (semana.planDe(f, x.hoy)?.ope_plan_personas?.length ?? 0), 0);
    const max = Math.max(1, ...porDia.map((d) => d.length));
    kpis.push(['calendario', 'Faenas hoy', String(hoyF.length), `${personasHoy} ${personasHoy === 1 ? 'persona asignada' : 'personas asignadas'}`, '#/ope.planificacion']);
    // Clientes: días de faena en los últimos 30 días
    const desde = sumarDias(x.hoy, -30);
    const diasDe = new Map();
    for (const f of ultimos) {
      const ini = f.fecha_inicio > desde ? f.fecha_inicio : desde; const fin = f.fecha_fin < x.hoy ? f.fecha_fin : x.hoy;
      const n = Math.max(0, dias(fin) - dias(ini) + 1);
      diasDe.set(f.tercero_id, (diasDe.get(f.tercero_id) ?? 0) + n);
    }
    const ranking = [...diasDe].map(([id, n]) => ({ c: base.clientes.find((c) => c.id === id), n })).filter((r) => r.c && r.n).sort((a, b) => b.n - a.n);
    kpis.push(['building', 'Clientes activos', String(base.clientes.length), `${ranking.length} con faenas este mes`, '#/ope.clientes']);
    panelFaenas = el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'ind-cab' }, el('h2', {}, 'Faenas · próximos 7 días'), el('a', { href: '#/ope.planificacion' }, 'Planificación')),
      el('div', { class: 'ind-columnas' }, diasSemana.map((f, i) => el('div', { class: `ind-col ${i === 0 ? 'hoy' : ''}` },
        el('span', { class: 'texto-chico' }, String(porDia[i].length)),
        el('i', { style: `height:${Math.max(4, Math.round((porDia[i].length / max) * 100))}%` }),
        el('span', { class: 'texto-chico texto-suave' }, i === 0 ? 'Hoy' : `${nombreDia(f).slice(0, 3)} ${Number(f.slice(8))}`)))),
      el('h3', { class: 'ind-sub' }, 'Hoy en terreno'),
      hoyF.length ? hoyF.slice(0, 6).map((f) => {
        const et = m.etiquetaFaena(f, base);
        const n = semana.planDe(f, x.hoy)?.ope_plan_personas?.length ?? 0;
        return el('a', { class: 'ind-faena', href: '#/ope.planificacion' },
          el('i', { style: `background:${et.color}` }),
          el('span', { class: 'ind-nombre' }, el('strong', {}, f.titulo), el('span', { class: 'texto-suave texto-chico' }, et.texto)),
          el('span', { class: 'chip chip-pend' }, `${n} ${n === 1 ? 'persona' : 'personas'}`));
      }) : el('p', { class: 'texto-suave texto-chico' }, 'Sin faenas hoy.'));
    if (ranking.length) {
      const maxC = ranking[0].n;
      panelClientes = el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'ind-cab' }, el('h2', {}, 'Clientes · faenas últimos 30 días'), el('a', { href: '#/ope.clientes' }, 'Clientes')),
        ranking.slice(0, 8).map((r) => el('div', { class: 'ind-barra-fila' },
          el('span', { class: 'ind-nombre' }, el('i', { class: 'ind-punto', style: `background:${r.c.color}` }), r.c.nombre),
          el('span', { class: 'ind-barra' }, el('i', { style: `width:${Math.round((r.n / maxC) * 100)}%` })),
          el('strong', {}, String(r.n)))));
    }
  }

  // ---- Vencimientos de flota y documentos de empresa
  if (x.flota) {
    for (const v of x.flota.vehiculos) for (const e of x.flota.m.vencimientos(v.registros)) {
      if (e.vence) vencimientos.push({ titulo: x.flota.m.nombreCat[e.cat], sub: `${x.flota.m.etiquetaVehiculo(v)} · ${fechaLarga(e.vence)}`, n: e.n, ruta: `#/flota.vehiculo?id=${v.id}` });
    }
  }
  if (x.acr) {
    for (const t of x.acr.d.tipos) for (const d of t.estado.vigentes ?? []) {
      if (t.vence && d.vence) vencimientos.push({ titulo: t.nombre, sub: `Empresa · ${fechaLarga(d.vence)}`, n: dias(d.vence), ruta: `#/acreditacion.tipo?id=${t.id}` });
    }
  }
  const proximos = vencimientos.filter((v) => v.n <= 30);
  if (vencimientos.length) {
    kpis.push(['alerta', 'Por vencer o vencidos', String(proximos.length), `${vencimientos.filter((v) => v.n < 0).length} vencidos`, '#/', proximos.some((v) => v.n < 0) ? 'mal' : '']);
  }
  if (x.salidas && !x.salidas.error) kpis.push(['mas', 'Salidas médicas', String(x.salidas.count ?? 0), 'Este mes', '#/sst.salidas']);

  const panelVenc = vencimientos.length ? el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'ind-cab' }, el('h2', {}, 'Próximos vencimientos')),
    [...vencimientos].sort((a, b) => a.n - b.n).slice(0, 8).map((v) => el('a', { class: 'ind-venc', href: v.ruta },
      el('span', { class: 'ind-nombre' }, el('strong', {}, v.titulo), el('span', { class: 'texto-suave texto-chico' }, v.sub)),
      el('span', { class: `chip ${v.n < 0 ? 'chip-venc' : v.n <= 30 ? 'chip-prox' : 'chip-ok'}` }, textoDias(v.n))))) : null;

  if (!kpis.length && !bloques.length) return null;
  return el('div', { class: 'indicadores' },
    bloques,
    kpis.length ? el('div', { class: 'ind-kpis' }, kpis.map(([ic, t, v, sub, ruta, nivel]) => el('a', { class: `ind-kpi ${nivel ? `ind-${nivel}` : ''}`, href: ruta },
      el('span', { class: 'ind-kpi-icono' }, icono(ic, { tam: 20 })),
      el('span', {}, el('span', { class: 'ind-kpi-titulo' }, t), el('strong', {}, v), el('span', { class: 'texto-suave texto-chico' }, sub))))) : null,
    [panelDocs, panelFaenas, panelVenc, panelClientes].some(Boolean) ? el('div', { class: 'ind-paneles' }, panelDocs, panelFaenas, panelVenc, panelClientes) : null);
}

export { fechaCorta };
