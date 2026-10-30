// Calendario de trabajos: igual que el de InnovaGestión (innovaservi.cl/planificacion), en diseño y lógica.
// Mes / Semana / Próximos, búsqueda, días agrupados por cliente y sitio (con su color), número de semana, trabajos de
// varios días (⟶), ventana del día, detalle, formulario de trabajo (cliente, sitio sugerido, descripción, tareas,
// fechas, horario con atajos, personas necesarias por rol, repetir) y borrar uno o toda la serie.
// Los datos son las faenas (ope_faenas): lo que se pone aquí aparece en Planificación al armar la faena.
import { el } from '../../../core/ui/dom.js?v=9d0da9e';
import { avisar } from '../../../core/ui/aviso.js?v=9d0da9e';
import { abrirFormulario } from '../../../core/ui/modal.js?v=9d0da9e';
import { hhmm } from '../../../core/ui/formato.js?v=9d0da9e';
import { cargarBase } from '../datos.js?v=9d0da9e';

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ROLES = [['op', 'Operarios', '#7cb342'], ['sup', 'Supervisor', '#2563eb'], ['prev', 'Prevencionista', '#f59e0b']];
const estado = { ref: new Date(), vista: 'mes', buscar: '' };   // se conserva al volver a la pantalla

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => iso(new Date());
const fecha = (f) => new Date(`${f}T00:00:00`);
function numSemanaISO(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())); const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3); const jueves = d.getTime(); d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
  return 1 + Math.round((jueves - d.getTime()) / 604800000);
}
const dotTotal = (d) => (d ? (+d.op || 0) + (+d.sup || 0) + (+d.prev || 0) : 0);
function dotTexto(d) {
  const p = [];
  if (d.op) p.push(`${d.op} operario${d.op === 1 ? '' : 's'}`);
  if (d.sup) p.push(`${d.sup} supervisor${d.sup === 1 ? '' : 'es'}`);
  if (d.prev) p.push(`${d.prev} prevencionista${d.prev === 1 ? '' : 's'}`);
  return p.join(' · ');
}
// Horario: texto "08:00 - 16:00", "9:00" o "Todo el día" ↔ hora_inicio / hora_fin
function leerHora(t) {
  const m = String(t ?? '').match(/(\d{1,2})[:.](\d{2})/g) ?? [];
  const n = (x) => { const [h, mi] = x.split(/[:.]/).map(Number); return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null; };
  return { ini: m[0] ? n(m[0]) : null, fin: m[1] ? n(m[1]) : null };
}
const textoHora = (f) => (f.hora_inicio ? `${hhmm(f.hora_inicio)}${f.hora_fin ? ` - ${hhmm(f.hora_fin)}` : ''}` : '');
const SVG = {
  cal: '<svg class="igcal-ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  pin: '<svg class="igcal-ico" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  pers: '<svg class="igcal-ico" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

function cargarEstilos() {
  if (document.getElementById('igcal-css')) return;
  const l = document.createElement('link');
  l.id = 'igcal-css'; l.rel = 'stylesheet'; l.href = new URL('../calendario.css?v=9d0da9e', import.meta.url).href;
  document.head.append(l);
}

// Todas las faenas de la empresa (de a 1000, como InnovaGestión)
async function cargarFaenas(ctx) {
  const todas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await ctx.api.from('ope_faenas')
      .select('id, titulo, tercero_id, sitio_id, fecha_inicio, fecha_fin, dias, hora_inicio, hora_fin, descripcion, tareas, tareas_check, dotacion, serie_id')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).neq('estado', 'cancelada')
      .order('fecha_inicio').range(desde, desde + 999);
    if (error) throw error;
    todas.push(...data);
    if (data.length < 1000) return todas;
  }
}

export default async function vista(ctx) {
  cargarEstilos();
  const [base, faenas] = await Promise.all([cargarBase(ctx), cargarFaenas(ctx)]);
  const puedeCrear = ctx.puede('ope', 'crear');
  const puedeEditar = ctx.puede('ope', 'editar');
  const puedeEliminar = ctx.puede('ope', 'eliminar');
  const cliente = new Map(base.clientes.map((c) => [c.id, c]));
  const sitio = new Map(base.sitios.map((s) => [s.id, s]));
  let EVENTS = [];
  const mapear = (lista) => {
    EVENTS = lista.map((f) => {
      const c = cliente.get(f.tercero_id);
      return {
        id: f.id, fecha: f.fecha_inicio, fin: f.fecha_fin > f.fecha_inicio ? f.fecha_fin : '', serie: f.serie_id, hora: textoHora(f),
        titulo: f.titulo, ubic: c?.nombre ?? '', terceroId: f.tercero_id, sitio: sitio.get(f.sitio_id)?.nombre ?? '', sitioId: f.sitio_id,
        color: c?.color ?? '#8b93a7', desc: f.descripcion ?? '', dot: { op: +f.dotacion?.op || 0, sup: +f.dotacion?.sup || 0, prev: +f.dotacion?.prev || 0 },
        tareas: f.tareas ?? [], tchk: f.tareas_check ?? [], dias: f.dias?.length ? f.dias : null, raw: f,
      };
    });
  };
  mapear(faenas);
  const evFin = (e) => (e.fin && e.fin >= e.fecha ? e.fin : e.fecha);
  const enDia = (e, f) => e.fecha <= f && f <= evFin(e) && (!e.dias || e.dias.includes(f));   // días a elección
  const evsDe = (f) => EVENTS.filter((e) => enDia(e, f));
  const recargar = async () => { mapear(await cargarFaenas(ctx)); render(); };

  // ---------- Estructura
  const titulo = el('h1', { class: 'igcal-titulo' }, '—');
  const leyenda = el('div', { class: 'igcal-leyenda' });
  const dow = el('div', { class: 'igcal-dow' }, el('div', { class: 'wkh', title: 'N° de semana' }, 'Sem'), ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => el('div', {}, d)));
  const grid = el('div', { class: 'igcal-grid' });
  const cal = el('div', { class: 'igcal-cal' }, dow, grid);
  const buscador = el('input', { type: 'search', class: 'igcal-buscar', placeholder: 'Buscar trabajo o cliente…', value: estado.buscar });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value.trim().toLowerCase(); render(); });
  const seg = el('div', { class: 'igcal-seg' }, [['mes', 'Mes'], ['semana', 'Semana'], ['proximos', 'Próximos']].map(([v, t]) =>
    el('button', { type: 'button', 'data-v': v, class: estado.vista === v ? 'on' : '', onclick: () => { estado.vista = v; marcarSeg(); render(); } }, t)));
  const marcarSeg = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === estado.vista));
  const mover = (n) => { const r = estado.ref; if (estado.vista === 'mes') r.setMonth(r.getMonth() + n); else r.setDate(r.getDate() + 7 * n); render(); };

  const raiz = el('section', { class: 'igcal' },
    el('div', { class: 'igcal-bar' },
      el('div', { class: 'igcal-nav' },
        el('button', { type: 'button', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'), titulo,
        el('button', { type: 'button', 'aria-label': 'Siguiente', onclick: () => mover(1) }, '›')),
      el('div', { class: 'igcal-acc' }, buscador,
        el('button', { type: 'button', class: 'igcal-hoy', onclick: () => { estado.ref = new Date(); if (estado.vista === 'proximos') { estado.vista = 'mes'; marcarSeg(); } render(); } }, 'Hoy'),
        seg,
        puedeCrear ? el('button', { type: 'button', class: 'igcal-add', onclick: () => abrirForm(null) }, '＋ Nuevo trabajo') : null)),
    leyenda, cal);

  function pintarLeyenda(evs) {
    const vistos = new Map();
    evs.forEach((e) => { if (e.ubic && !vistos.has(e.ubic.toUpperCase())) vistos.set(e.ubic.toUpperCase(), e); });
    leyenda.innerHTML = [...vistos.values()].sort((a, b) => a.ubic.localeCompare(b.ubic))
      .map((e) => `<span><i style="background:${esc(e.color)}"></i>${esc(e.ubic)}</span>`).join('');
  }
  // Grupos de un día: los del mismo cliente y sitio van juntos
  function agrupar(evs) {
    const grupos = new Map();
    evs.forEach((e) => { const k = e.ubic ? `${e.ubic.toUpperCase()}${e.sitio.toUpperCase()}` : `#${e.id}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); });
    return [...grupos.values()];
  }
  const md = (e, f = e.fecha) => { const sig = iso(new Date(fecha(f).getTime() + 864e5)); return e.fin && e.fin > e.fecha && enDia(e, sig) ? '<span class="igcal-md" title="Sigue al día siguiente">⟶</span>' : ''; };

  // ---------- Mes y semana
  function render() {
    if (estado.buscar) { renderBusqueda(); return; }
    grid.classList.remove('agenda');
    cal.classList.toggle('week', estado.vista === 'semana');
    dow.style.display = estado.vista === 'proximos' ? 'none' : '';
    if (estado.vista === 'proximos') { renderProximos(); return; }
    if (estado.vista === 'semana' && matchMedia('(max-width:760px)').matches) { renderSemanaLista(); return; }
    const r = estado.ref; const y = r.getFullYear(); const m = r.getMonth();
    const celdas = [];
    if (estado.vista === 'mes') {
      const ini = (new Date(y, m, 1).getDay() + 6) % 7; const dim = new Date(y, m + 1, 0).getDate(); const prevDim = new Date(y, m, 0).getDate();
      for (let i = 0; i < ini; i++) celdas.push({ d: new Date(y, m - 1, prevDim - ini + 1 + i), out: true });
      for (let d = 1; d <= dim; d++) celdas.push({ d: new Date(y, m, d), out: false });
      while (celdas.length % 7) celdas.push({ d: new Date(y, m + 1, celdas.length - (ini + dim) + 1), out: true });
      titulo.textContent = `${MES[m]} ${y}`;
    } else {
      const b = new Date(r); b.setDate(b.getDate() - (b.getDay() + 6) % 7);
      for (let w = 0; w < 7; w++) { const c = new Date(b); c.setDate(b.getDate() + w); celdas.push({ d: c, out: c.getMonth() !== m }); }
      titulo.textContent = `Semana ${numSemanaISO(celdas[0].d)} · ${celdas[0].d.getDate()} ${MES[celdas[0].d.getMonth()].slice(0, 3)} – ${celdas[6].d.getDate()} ${MES[celdas[6].d.getMonth()].slice(0, 3)}`;
    }
    const desde = iso(celdas[0].d); const hasta = iso(celdas[celdas.length - 1].d);
    pintarLeyenda(EVENTS.filter((e) => e.fecha >= desde && e.fecha <= hasta));
    const t = hoy(); const max = estado.vista === 'semana' ? 60 : 6;
    const html = celdas.map((c) => {
      const f = iso(c.d); const grupos = agrupar(evsDe(f));
      let ev = grupos.slice(0, max).map((g) => {
        const e0 = g[0]; const col = esc(e0.color);
        const sit = e0.sitio ? ` <span class="igcal-sit">· ${esc(e0.sitio)}</span>` : '';
        const head = e0.ubic ? `${esc(e0.ubic)}${sit}${g.length > 1 ? ` <span class="igcal-sit">· ${g.length}</span>` : ''}` : `${esc(e0.titulo)}${md(e0, f)}`;
        const items = e0.ubic ? g.map((e) => `<span class="igcal-gitem" data-id="${e.id}" title="${esc(e.titulo)}">${esc(e.titulo)}${md(e, f)}</span>`).join('') : '';
        const datos = e0.ubic ? `data-ubic="${esc(e0.ubic)}" data-sitio="${esc(e0.sitio)}" data-f="${f}"` : `data-id="${e0.id}"`;
        return `<div class="igcal-grupo" style="border-left-color:${col}"><span class="igcal-ghead${e0.ubic ? '' : ' plain'}" style="color:${col}" ${datos}>${head}</span>${items}</div>`;
      }).join('');
      if (grupos.length > max) ev += `<div class="igcal-mas" data-f="${f}">+${grupos.length - max} más</div>`;
      const puntos = grupos.length ? `<div class="igcal-puntos">${grupos.slice(0, 6).map((g) => `<i style="background:${esc(g[0].color)}"></i>`).join('')}${grupos.length > 6 ? `<span class="more">+${grupos.length - 6}</span>` : ''}</div>` : '';
      return `<div class="igcal-cell${c.out ? ' out' : ''}${f === t ? ' today' : ''}" data-f="${f}"><span class="igcal-dnum" data-f="${f}">${c.d.getDate()}</span>${ev}${puntos}</div>`;
    });
    const filas = [];
    for (let i = 0; i < html.length; i += 7) filas.push(`<div class="igcal-wk" title="Semana ISO">${numSemanaISO(celdas[i].d)}</div>${html.slice(i, i + 7).join('')}`);
    grid.innerHTML = filas.join('');
    grid.querySelectorAll('.igcal-gitem').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); abrir(b.dataset.id); }));
    grid.querySelectorAll('.igcal-ghead').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); if (b.dataset.id) abrir(b.dataset.id); else abrirDiaUbic(b.dataset.f, b.dataset.ubic, b.dataset.sitio); }));
    grid.querySelectorAll('.igcal-mas').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); abrirDia(b.dataset.f); }));
    grid.querySelectorAll('.igcal-cell').forEach((c) => c.addEventListener('click', (ev) => {
      if (ev.target.closest('.igcal-grupo') || ev.target.closest('.igcal-mas')) return;
      const f = c.dataset.f; if (evsDe(f).length) abrirDia(f); else nuevoEn(f);
    }));
  }

  // ---------- Agenda: Próximos, semana en teléfono y búsqueda
  function renderAgenda(lista, desc) {
    grid.classList.add('agenda'); dow.style.display = 'none'; cal.classList.remove('week');
    pintarLeyenda(lista);
    if (!lista.length) { grid.innerHTML = '<div class="igcal-vacio">Sin trabajos.</div>'; return; }
    const porDia = new Map(); lista.forEach((e) => { if (!porDia.has(e.fecha)) porDia.set(e.fecha, []); porDia.get(e.fecha).push(e); });
    const claves = [...porDia.keys()].sort(); if (desc) claves.reverse();
    const t = hoy();
    grid.innerHTML = claves.map((f) => {
      const d = fecha(f); const esHoy = f === t;
      const tarjetas = agrupar(porDia.get(f)).map((g) => {
        const e0 = g[0]; const col = esc(e0.color);
        const sit = e0.sitio ? ` <span class="igcal-sit">· ${esc(e0.sitio)}</span>` : '';
        const head = e0.ubic ? `${esc(e0.ubic)}${sit}${g.length > 1 ? ` <span class="igcal-cnt">${g.length}</span>` : ''}` : esc(e0.titulo);
        const items = g.map((e) => `<div class="igcal-aitem" data-id="${e.id}"><div class="igcal-att">${esc(e.titulo)}${e.fin && e.fin > e.fecha ? ' <span class="igcal-md">⟶</span>' : ''}${e.hora ? ` <span class="igcal-hora">${esc(e.hora)}</span>` : ''}</div>${e.desc ? `<div class="igcal-adesc">${esc(e.desc)}</div>` : ''}</div>`).join('');
        return `<div class="igcal-ucard" style="border-left-color:${col};background:linear-gradient(100deg, color-mix(in srgb, ${col} 15%, var(--superficie)), var(--superficie) 60%)"><div class="igcal-uhead" style="color:${col}"><span class="igcal-udot" style="background:${col}"></span>${head}</div>${items}</div>`;
      }).join('');
      return `<div class="igcal-agd${esHoy ? ' hoy' : ''}"><div class="igcal-agh">${esHoy ? '<span class="igcal-badge">HOY</span> ' : ''}<b>${DIAS[d.getDay()]} ${d.getDate()}</b> de ${MES[d.getMonth()]} ${d.getFullYear()}</div>${tarjetas}</div>`;
    }).join('');
    grid.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => abrir(r.dataset.id)));
  }
  // Un trabajo de varios días aparece en cada uno de sus días
  const porDias = (desde, hasta) => {
    const out = [];
    EVENTS.forEach((e) => {
      const a = e.fecha < desde ? desde : e.fecha; const b = evFin(e) > hasta ? hasta : evFin(e);
      for (let d = fecha(a), g = 0; iso(d) <= b && g < 400; d.setDate(d.getDate() + 1), g++) if (enDia(e, iso(d))) out.push({ ...e, fecha: iso(d) });
    });
    return out.sort((x, y) => x.fecha.localeCompare(y.fecha));
  };
  function renderSemanaLista() {
    const b = new Date(estado.ref); b.setDate(b.getDate() - (b.getDay() + 6) % 7); const b7 = new Date(b); b7.setDate(b.getDate() + 6);
    titulo.textContent = `Semana ${numSemanaISO(b)} · ${b.getDate()} ${MES[b.getMonth()].slice(0, 3)} – ${b7.getDate()} ${MES[b7.getMonth()].slice(0, 3)}`;
    renderAgenda(porDias(iso(b), iso(b7)), false);
  }
  function renderProximos() { titulo.textContent = 'Próximos trabajos'; renderAgenda(porDias(hoy(), '9999-12-31'), false); }
  function renderBusqueda() {
    const res = EVENTS.filter((e) => `${e.titulo} ${e.ubic} ${e.sitio} ${e.desc}`.toLowerCase().includes(estado.buscar)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    titulo.textContent = `Búsqueda · ${res.length} resultado${res.length === 1 ? '' : 's'}`;
    renderAgenda(res, true);
  }

  // ---------- Ventanas
  function ventana({ cabeza, titulo: t, cuerpo, ancho = '' }) {
    const box = el('div', { class: `igcal-box ${ancho}` });
    const fondo = el('div', { class: 'igcal-modal igcal' }, box);
    const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (ev) => { if (ev.key === 'Escape') cerrar(); };
    box.innerHTML = `<div class="igcal-mhead" style="background:${cabeza}"><h3>${esc(t)}</h3><button type="button" aria-label="Cerrar">×</button></div><div class="igcal-mbody">${cuerpo}</div>`;
    box.querySelector('.igcal-mhead button').addEventListener('click', cerrar);
    fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });
    document.addEventListener('keydown', tecla);
    document.body.append(fondo);
    return { box, cerrar };
  }
  function rangoTexto(e) {
    const d = fecha(e.fecha);
    if (e.dias) return `${e.dias.length} días: ${e.dias.map((x) => { const y = fecha(x); return `${y.getDate()} ${MES[y.getMonth()].slice(0, 3)}`; }).join(', ')}`;
    if (e.fin && e.fin > e.fecha) {
      const d2 = fecha(e.fin); const n = Math.round((d2 - d) / 86400000) + 1;
      return `Del ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} al ${d2.getDate()} ${MES[d2.getMonth()].slice(0, 3)} ${d2.getFullYear()} · ${n} días`;
    }
    return `${d.getDate()} de ${MES[d.getMonth()]} ${d.getFullYear()}`;
  }
  function abrir(id) {
    const e = EVENTS.find((x) => String(x.id) === String(id)); if (!e) return;
    const v = ventana({
      cabeza: `linear-gradient(135deg,${esc(e.color)},#0c0f2e)`, titulo: e.titulo,
      cuerpo: `<div class="igcal-row">${SVG.cal}<b>${rangoTexto(e)}</b>${e.hora ? ` · ${esc(e.hora)}` : ''}</div>`
        + (e.ubic ? `<div class="igcal-row">${SVG.pin}Cliente:<span class="igcal-chip" style="background:${esc(e.color)}">${esc(e.ubic)}</span>${e.sitio ? ` <span style="font-weight:600">· ${esc(e.sitio)}</span>` : ''}</div>` : '')
        + (dotTotal(e.dot) ? `<div class="igcal-row">${SVG.pers}<span><b>${dotTotal(e.dot)}</b> necesarias · ${esc(dotTexto(e.dot))}</span></div>` : '')
        + '<div class="igcal-lbl">Tareas</div><div class="igcal-tchk"></div>'
        + '<div class="igcal-lbl">Observaciones</div><div class="igcal-obs"></div>'
        + `<div class="igcal-btns"><a class="igcal-hoy" style="text-decoration:none" href="${ctx.ruta('ope.plan', { f: e.id, d: e.fecha })}">Planificar</a>${puedeEliminar ? '<button type="button" class="igcal-del" data-a="del">Eliminar</button>' : ''}${puedeEditar && puedeEliminar ? '<button type="button" class="igcal-hoy" data-a="unir" title="Juntar con otra faena duplicada">Unir con otra</button>' : ''}${puedeEditar ? '<button type="button" class="igcal-add" data-a="edit">✎ Editar</button>' : ''}</div>`,
    });
    v.box.querySelector('[data-a="edit"]')?.addEventListener('click', () => { v.cerrar(); abrirForm(e); });
    v.box.querySelector('[data-a="unir"]')?.addEventListener('click', () => { v.cerrar(); unir(e); });
    detalleExtra(v.box, e);
    v.box.querySelector('[data-a="del"]')?.addEventListener('click', () => { v.cerrar(); abrirBorrado(e); });
    v.box.querySelector('a.igcal-hoy')?.addEventListener('click', () => v.cerrar());
  }
  // Tareas con casilla (quién y cuándo) y observaciones con autor y fecha: basta con ver Faenas
  async function detalleExtra(box, e) {
    const cajaT = box.querySelector('.igcal-tchk'); const cajaO = box.querySelector('.igcal-obs');
    const [{ data: obs }, us] = await Promise.all([
      ctx.api.from('ope_faena_obs').select('*').eq('faena_id', e.id).order('created_at'),
      ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }),
    ]);
    const quien = new Map((us.data ?? []).map((u) => [u.user_id, u.nombre]));
    // Lista de tareas: las del trabajo + las agregadas al marcar
    let lista = [...e.tareas.map((t) => ({ t, ok: false })), ...e.tchk.filter((x) => !e.tareas.some((t) => t.trim().toLowerCase() === String(x.t).trim().toLowerCase()))];
    lista = lista.map((x) => ({ ...x, ...(e.tchk.find((y) => String(y.t).trim().toLowerCase() === String(x.t).trim().toLowerCase()) ?? {}) }));
    const guardarT = async () => {
      const { error } = await ctx.api.rpc('ope_tareas_set', { p_faena: e.id, p_tareas: lista });
      if (error) { avisar(error.message, 'error'); return false; }
      e.tchk = lista; e.raw.tareas_check = lista; return true;
    };
    const pintarT = () => {
      cajaT.replaceChildren(...lista.map((x, i) => {
        const cb = el('input', { type: 'checkbox', checked: !!x.ok });
        cb.addEventListener('change', async () => {
          lista[i] = { ...x, ok: cb.checked, por: cb.checked ? ctx.usuario?.id ?? null : null, at: cb.checked ? new Date().toISOString() : null };
          if (!(await guardarT())) cb.checked = !cb.checked; else pintarT();
        });
        return el('label', { class: 'igcal-tline' }, cb, el('span', {}, x.t), x.ok && x.at ? el('small', {}, `${quien.get(x.por) ?? ''} · ${new Date(x.at).toLocaleDateString('es-CL')}`) : null);
      }), (() => {
        const i = el('input', { type: 'text', placeholder: 'Agregar tarea y Enter…' });
        i.addEventListener('keydown', async (ev) => { if (ev.key !== 'Enter' || !i.value.trim()) return; lista.push({ t: i.value.trim(), ok: false }); if (await guardarT()) pintarT(); });
        return el('div', { class: 'igcal-tadd' }, i);
      })());
    };
    pintarT();
    const pintarO = (l) => {
      const t = el('textarea', { rows: 2, placeholder: 'Agregar observación (queda con tu nombre y la fecha)…' });
      const b = el('button', { type: 'button', class: 'igcal-mini' }, 'Agregar');
      b.addEventListener('click', async () => {
        if (!t.value.trim()) return;
        const { data, error } = await ctx.api.from('ope_faena_obs').insert({ empresa_id: ctx.empresa.id, faena_id: e.id, texto: t.value.trim() }).select('*').single();
        if (error) { avisar(error.message, 'error'); return; }
        pintarO([...l, data]);
      });
      cajaO.replaceChildren(...(l.length ? l.map((o) => el('div', { class: 'igcal-obsi' }, el('small', {}, `${quien.get(o.autor) ?? 'Sin autor'} · ${new Date(o.created_at).toLocaleDateString('es-CL')}`), el('span', {}, o.texto)))
        : [el('small', { class: 'igcal-hint' }, 'Sin observaciones.')]), el('div', { class: 'igcal-oadd' }, t, b));
    };
    pintarO(obs ?? []);
  }
  // Unir con otra faena del mismo cliente (la elegida se junta dentro de esta)
  function unir(e) {
    const candidatas = EVENTS.filter((x) => x.id !== e.id && x.terceroId === e.terceroId).sort((a, b) => Math.abs(fecha(a.fecha) - fecha(e.fecha)) - Math.abs(fecha(b.fecha) - fecha(e.fecha))).slice(0, 40);
    if (!candidatas.length) { avisar('No hay otra faena de este cliente para unir.', 'error'); return; }
    abrirFormulario({
      titulo: `Unir con "${e.titulo}"`,
      mensaje: 'La faena elegida se junta dentro de esta: se suman sus días y pasan su planificación, partes y fotos, marcajes, gastos y observaciones. La elegida queda eliminada.',
      campos: [{ id: 'otra', etiqueta: 'Faena a unir', opciones: candidatas.map((x) => [x.id, `${rangoTexto(x)} · ${x.titulo}${x.sitio ? ` · ${x.sitio}` : ''}`]) }],
      textoGuardar: 'Unir',
      alGuardar: async (v) => {
        const { data, error } = await ctx.api.rpc('ope_unir', { p_dest: e.id, p_orig: v.otra });
        if (error) throw new Error(error.message);
        avisar(`Unidas: ${data.dias} días${data.plan_descartados ? ` (${data.plan_descartados} día(s) de planificación repetidos quedaron en la eliminada)` : ''}.`);
        recargar();
      },
    });
  }
  function abrirDia(f) {
    const evs = evsDe(f); if (!evs.length) { nuevoEn(f); return; }
    const d = fecha(f);
    const v = ventana({
      cabeza: 'linear-gradient(135deg,#1a1f6e,#0c0f2e)', titulo: `Todo el ${d.getDate()} de ${MES[d.getMonth()]}`,
      cuerpo: evs.map((e) => `<div class="igcal-row click" data-id="${e.id}"><span class="igcal-chip" style="background:${esc(e.color)}">&nbsp;</span> ${esc(e.titulo)}${e.ubic ? ` · ${esc(e.ubic)}` : ''}${e.sitio ? ` · ${esc(e.sitio)}` : ''}</div>`).join('')
        + (puedeCrear ? '<div class="igcal-btns"><button type="button" class="igcal-add" data-a="add">＋ Agregar aquí</button></div>' : ''),
    });
    v.box.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => { v.cerrar(); abrir(r.dataset.id); }));
    v.box.querySelector('[data-a="add"]')?.addEventListener('click', () => { v.cerrar(); nuevoEn(f); });
  }
  function abrirDiaUbic(f, ubic, sit) {
    const U = ubic.toUpperCase(); const S = (sit ?? '').toUpperCase();
    const evs = evsDe(f).filter((e) => e.ubic.toUpperCase() === U && e.sitio.toUpperCase() === S); if (!evs.length) return;
    const d = fecha(f); const lbl = `${ubic}${sit ? ` · ${sit}` : ''}`;
    const v = ventana({
      cabeza: `linear-gradient(135deg,${esc(evs[0].color)},#0c0f2e)`, titulo: `${lbl} · ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}`,
      cuerpo: evs.map((e) => `<div class="igcal-row click" data-id="${e.id}"><span class="igcal-chip" style="background:${esc(e.color)}">&nbsp;</span> ${esc(e.titulo)}${e.hora ? ` · ${esc(e.hora)}` : ''}</div>`).join('')
        + (puedeCrear ? `<div class="igcal-btns"><button type="button" class="igcal-add" data-a="add">＋ Agregar a ${esc(lbl)}</button></div>` : ''),
    });
    v.box.querySelectorAll('[data-id]').forEach((r) => r.addEventListener('click', () => { v.cerrar(); abrir(r.dataset.id); }));
    v.box.querySelector('[data-a="add"]')?.addEventListener('click', () => { v.cerrar(); nuevoEn(f, evs[0].terceroId, sit); });
  }
  function nuevoEn(f, terceroId, sit) { if (puedeCrear) abrirForm(null, { fecha: f, terceroId, sitio: sit }); }

  // Borrar: solo este o toda la serie (las faenas se marcan como eliminadas, no se borran de la base)
  function abrirBorrado(e) {
    const serie = !!e.serie && EVENTS.filter((x) => x.serie === e.serie).length > 1;
    const v = ventana({
      cabeza: 'linear-gradient(135deg,#dc2626,#7f1d1d)', titulo: 'Eliminar trabajo', ancho: '',
      cuerpo: `<p style="font-size:.92rem;line-height:1.6;margin:0 0 16px">${serie ? 'Este trabajo es parte de una <b>serie repetida</b>. ¿Qué quieres eliminar?' : '¿Seguro que quieres eliminar este trabajo?'}</p>`
        + `<div style="display:flex;flex-direction:column;gap:9px"><button type="button" class="igcal-del" data-a="uno" style="width:100%">${serie ? 'Eliminar solo este' : 'Eliminar'}</button>`
        + (serie ? '<button type="button" class="igcal-del" data-a="serie" style="width:100%;background:#dc2626;color:#fff;border-color:#dc2626">Eliminar toda la serie</button>' : '')
        + '<button type="button" class="igcal-hoy" data-a="no" style="width:100%">Cancelar</button></div>',
    });
    const borrar = async (q) => {
      const { data, error } = await q.update({ deleted_at: new Date().toISOString() }).select('id');
      if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para eliminar.', 'error'); return; }
      avisar(data.length > 1 ? `Se eliminaron ${data.length} trabajos.` : 'Trabajo eliminado.');
      v.cerrar(); document.querySelector('.igcal-modal.form')?.remove(); recargar();
    };
    v.box.querySelector('[data-a="uno"]').addEventListener('click', () => borrar(ctx.api.from('ope_faenas').eq('id', e.id)));
    v.box.querySelector('[data-a="serie"]')?.addEventListener('click', () => borrar(ctx.api.from('ope_faenas').eq('serie_id', e.serie).eq('empresa_id', ctx.empresa.id)));
    v.box.querySelector('[data-a="no"]').addEventListener('click', v.cerrar);
  }

  // ---------- Formulario nuevo / editar trabajo
  function abrirForm(e, pre = {}) {
    let tareas = e ? [...e.tareas] : [];
    const box = el('div', { class: 'igcal-box igcal-ffbox' });
    const fondo = el('div', { class: 'igcal-modal igcal form' }, box);
    const opcionesCli = base.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    const rolHtml = ROLES.map(([k, n, col]) => `<div class="igcal-rol"><span class="igcal-rl"><i style="background:${col}"></i>${n}</span><div class="igcal-step"><button type="button" data-d="-1" aria-label="Menos">−</button><input type="number" data-rol="${k}" min="0" max="99" placeholder="0"><button type="button" data-d="1" aria-label="Más">+</button></div></div>`).join('');
    box.innerHTML = `
      <div class="igcal-mhead igcal-ffhead"><div><h3>${e ? 'Editar trabajo' : 'Nuevo trabajo'}</h3><p class="igcal-ffsub">Lo que pongas en <b>Personas</b> y <b>Tareas</b> aparece en Planificación al armar la faena.</p></div><button type="button" data-a="x" aria-label="Cerrar">×</button></div>
      <div class="igcal-ffbody">
        <div class="igcal-ffcol">
          <section class="igcal-ffsec igcal-o1"><h4><svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Trabajo</h4>
            <div class="igcal-fgrid">
              <label class="full"><span>Título <i class="igcal-req">*</i></span><input type="text" name="titulo" class="igcal-big" placeholder="Ej: Limpieza estanque"></label>
              <label><span>Empresa / Cliente <i class="igcal-req">*</i></span><select name="cliente"><option value="">— elige cliente —</option>${opcionesCli}</select></label>
              <label><span>Ubicación / Sitio <i class="igcal-req">*</i></span><input type="text" name="sitio" list="igcal-sitios" placeholder="Ej: Chinquihue"></label>
              <datalist id="igcal-sitios"></datalist>
              <span class="full igcal-hint" style="margin-top:-6px">Solo clientes registrados. ¿Falta uno? Agrégalo en Clientes y proveedores. El sitio sugiere los ya usados por ese cliente.</span>
              <label class="full">${e ? 'Nueva observación' : 'Observación'} <span class="igcal-opt">(queda con tu nombre y la fecha; las anteriores se ven en el detalle)</span><textarea name="desc" rows="3" placeholder="Detalle, materiales, accesos, contacto en sitio…"></textarea></label>
            </div></section>
          <section class="igcal-ffsec igcal-o4"><h4><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>Tareas <span class="igcal-fcnt" data-a="tcnt"></span></h4>
            <ol class="igcal-tareas"></ol>
            <div class="igcal-tadd"><input type="text" name="tarea" placeholder="Escribe una tarea y presiona Enter…" autocomplete="off"><button type="button" class="igcal-mini" data-a="tadd">Agregar</button></div></section>
        </div>
        <div class="igcal-ffcol igcal-ffside">
          <section class="igcal-ffsec igcal-o2"><h4><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Cuándo</h4>
            <div class="igcal-fgrid">
              <div class="full igcal-modo"><button type="button" data-modo="seguidos">Días seguidos</button><button type="button" data-modo="eleccion">Días a elección</button></div>
              <label data-seg><span>Inicio <i class="igcal-req">*</i></span><input type="date" name="fecha"></label>
              <label data-seg><span>Fin <span class="igcal-opt">(si dura varios días)</span></span><input type="date" name="fin"></label>
              <div class="full igcal-mini-cal" hidden></div>
              <div class="full igcal-dur"></div>
              <label class="full">Horario<input type="text" name="hora" placeholder="09:00 - 13:00 o Todo el día"></label>
              <div class="full igcal-chips"></div>
            </div></section>
          <section class="igcal-ffsec igcal-o3"><h4><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>Personas necesarias <span class="igcal-fcnt" data-a="ptot"></span></h4>
            <div class="igcal-roles">${rolHtml}</div>
            <span class="igcal-hint">Cupo que verás en Planificación, con el color de cada rol (se puede ajustar por día allá).</span></section>
          <section class="igcal-ffsec igcal-o5"><h4><svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Repetir</h4>
            <div class="igcal-rep">
              <select name="repetir"><option value="no">No repetir</option><option value="dia">Cada día</option><option value="semana">Cada semana</option><option value="quincena">Cada 2 semanas</option><option value="mes">Cada mes</option></select>
              <label class="igcal-inl" data-a="cadaw" style="display:none">cada<input type="number" name="cada" min="1" max="60" value="1"></label>
              <label class="igcal-inl" data-a="vecesw" style="display:none">veces<input type="number" name="veces" min="2" max="52" value="4"></label>
            </div>
            <span class="igcal-hint" data-a="rephint" style="display:none"></span></section>
        </div>
      </div>
      <div class="igcal-fffoot">${e && puedeEliminar ? '<button type="button" class="igcal-del" data-a="del">Eliminar</button>' : ''}<span class="igcal-kbd">Ctrl + Enter para guardar</span><button type="button" class="igcal-hoy" data-a="cancel">Cancelar</button><button type="button" class="igcal-add" data-a="save">Guardar</button></div>`;
    const $ = (s) => box.querySelector(s);
    const campo = (n) => box.querySelector(`[name="${n}"]`);
    const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (ev) => { if (ev.key === 'Escape') cerrar(); else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); guardar(); } };
    document.addEventListener('keydown', tecla);
    $('[data-a="x"]').addEventListener('click', cerrar);
    $('[data-a="cancel"]').addEventListener('click', cerrar);
    $('[data-a="del"]')?.addEventListener('click', () => abrirBorrado(e));

    // Valores iniciales
    campo('titulo').value = e?.titulo ?? '';
    campo('cliente').value = e?.terceroId ?? pre.terceroId ?? '';
    campo('sitio').value = e?.sitio ?? pre.sitio ?? '';
    campo('fecha').value = e?.fecha ?? pre.fecha ?? hoy();
    campo('fin').value = e?.fin ?? '';
    campo('hora').value = e?.hora ?? '';
    box.querySelectorAll('[data-rol]').forEach((i) => { i.value = e?.dot?.[i.dataset.rol] || ''; });

    // Sitios sugeridos: los del cliente y los ya usados en sus trabajos
    const pintarSitios = () => {
      const cli = campo('cliente').value; const set = new Set();
      base.sitios.filter((s) => s.tercero_id === cli && s.activo !== false).forEach((s) => set.add(s.nombre));
      EVENTS.filter((x) => x.terceroId === cli && x.sitio).forEach((x) => set.add(x.sitio));
      $('#igcal-sitios').innerHTML = [...set].sort().map((s) => `<option value="${esc(s)}"></option>`).join('');
    };
    campo('cliente').addEventListener('change', pintarSitios); pintarSitios();

    // Tareas
    const pintarTareas = () => {
      const ol = $('.igcal-tareas');
      ol.innerHTML = tareas.map((t, i) => `<li><input value="${esc(t)}" data-i="${i}" aria-label="Tarea ${i + 1}"><button type="button" data-i="${i}" title="Quitar tarea" aria-label="Quitar">×</button></li>`).join('');
      $('[data-a="tcnt"]').textContent = tareas.length || '';
      ol.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', () => { tareas[+inp.dataset.i] = inp.value; });
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.ctrlKey) { ev.preventDefault(); campo('tarea').focus(); } });
      });
      ol.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tareas.splice(+b.dataset.i, 1); pintarTareas(); }));
    };
    const agregarTarea = () => { const v = campo('tarea').value.trim(); if (!v) return; tareas.push(v); campo('tarea').value = ''; pintarTareas(); campo('tarea').focus(); };
    $('[data-a="tadd"]').addEventListener('click', agregarTarea);
    campo('tarea').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.ctrlKey) { ev.preventDefault(); agregarTarea(); } });
    campo('tarea').addEventListener('paste', (ev) => {   // pegar una lista crea una tarea por línea
      const t = ev.clipboardData?.getData('text') ?? ''; if (!t.includes('\n')) return; ev.preventDefault();
      t.split(/\r?\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).forEach((x) => tareas.push(x)); pintarTareas();
    });
    pintarTareas();

    // Personas necesarias
    const dotForm = () => Object.fromEntries([...box.querySelectorAll('[data-rol]')].map((i) => [i.dataset.rol, Math.max(0, parseInt(i.value, 10) || 0)]));
    const totPers = () => { const t = dotTotal(dotForm()); $('[data-a="ptot"]').textContent = t ? `${t} en total` : ''; };
    box.querySelectorAll('.igcal-step button').forEach((b) => b.addEventListener('click', () => {
      const inp = b.parentNode.querySelector('input'); const n = (parseInt(inp.value, 10) || 0) + Number(b.dataset.d);
      inp.value = n <= 0 ? '' : Math.min(n, 99); totPers();
    }));
    box.querySelectorAll('[data-rol]').forEach((i) => i.addEventListener('input', totPers)); totPers();

    // Horario: "Todo el día" y los 4 horarios más usados
    const pintarChips = () => {
      const cnt = new Map(); EVENTS.forEach((x) => { if (x.hora) cnt.set(x.hora, (cnt.get(x.hora) ?? 0) + 1); });
      const top = ['Todo el día', ...[...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a)).slice(0, 4)];
      const cur = campo('hora').value.trim();
      $('.igcal-chips').innerHTML = top.map((h) => `<button type="button" class="${h === cur ? 'on' : ''}" data-h="${esc(h)}">${esc(h)}</button>`).join('');
      $('.igcal-chips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { campo('hora').value = b.dataset.h; pintarChips(); }));
    };
    campo('hora').addEventListener('input', () => { const v = campo('hora').value.trim(); $('.igcal-chips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.h === v)); });
    pintarChips();

    // Duración
    const actualizarDur = () => {
      const fi = campo('fecha').value; const ff = campo('fin').value; const d = $('.igcal-dur');
      if (!fi) { d.textContent = ''; return; }
      const a = fecha(fi);
      if (ff && ff < fi) { d.textContent = 'La fecha de fin es anterior al inicio; se guardará como trabajo de un día.'; return; }
      if (ff && ff > fi) { const b = fecha(ff); d.textContent = `${Math.round((b - a) / 86400000) + 1} días · del ${a.getDate()} ${MES[a.getMonth()].slice(0, 3)} al ${b.getDate()} ${MES[b.getMonth()].slice(0, 3)}`; return; }
      d.textContent = `1 día · ${DIAS[a.getDay()]} ${a.getDate()} de ${MES[a.getMonth()]}`;
    };
    campo('fin').addEventListener('change', actualizarDur); actualizarDur();

    // Días a elección: mini calendario con casillas (la faena sigue siendo una sola)
    let modo = e?.dias ? 'eleccion' : 'seguidos';
    const elegidos = new Set(e?.dias ?? []);
    let mesMini = (e?.fecha ?? pre.fecha ?? hoy()).slice(0, 7);
    const pintarMini = () => {
      const [y, m] = mesMini.split('-').map(Number);
      const ini = (new Date(y, m - 1, 1).getDay() + 6) % 7; const dim = new Date(y, m, 0).getDate();
      const celdas = [...Array(ini).fill(''), ...Array.from({ length: dim }, (_, i) => `${mesMini}-${String(i + 1).padStart(2, '0')}`)];
      const caja = $('.igcal-mini-cal');
      caja.innerHTML = `<div class="igcal-mini-nav"><button type="button" data-m="-1" aria-label="Mes anterior">‹</button><b>${MES[m - 1]} ${y}</b><button type="button" data-m="1" aria-label="Mes siguiente">›</button></div>`
        + `<div class="igcal-mini-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="dow">${d}</span>`).join('')}${celdas.map((d) => (d ? `<label class="${elegidos.has(d) ? 'on' : ''}"><input type="checkbox" data-d="${d}" ${elegidos.has(d) ? 'checked' : ''}>${Number(d.slice(8))}</label>` : '<span></span>')).join('')}</div>`
        + `<span class="igcal-hint">${elegidos.size ? `${elegidos.size} día${elegidos.size === 1 ? '' : 's'} elegido${elegidos.size === 1 ? '' : 's'}: ${[...elegidos].sort().map((d) => { const x = fecha(d); return `${x.getDate()} ${MES[x.getMonth()].slice(0, 3)}`; }).join(', ')}` : 'Marca los días en que se trabaja.'}</span>`;
      caja.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { const [yy, mm] = mesMini.split('-').map(Number); const d = new Date(yy, mm - 1 + Number(b.dataset.m), 1); mesMini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; pintarMini(); }));
      caja.querySelectorAll('[data-d]').forEach((c) => c.addEventListener('change', () => { if (c.checked) elegidos.add(c.dataset.d); else elegidos.delete(c.dataset.d); pintarMini(); }));
    };
    const pintarModo = () => {
      box.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === modo));
      box.querySelectorAll('[data-seg]').forEach((x) => { x.hidden = modo === 'eleccion'; });
      $('.igcal-dur').hidden = modo === 'eleccion';
      $('.igcal-mini-cal').hidden = modo !== 'eleccion';
      if (modo === 'eleccion') { if (!elegidos.size && campo('fecha').value) elegidos.add(campo('fecha').value); pintarMini(); }
    };
    box.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; pintarModo(); }));
    pintarModo();

    // Repetir
    const fechasSerie = (baseIso, rep, cada, veces) => {
      const b = fecha(baseIso); const out = []; cada = Math.max(1, cada || 1);
      for (let i = 0; i < veces; i++) {
        const d = new Date(b);
        if (rep === 'dia') d.setDate(d.getDate() + cada * i); else if (rep === 'semana') d.setDate(d.getDate() + 7 * cada * i);
        else if (rep === 'quincena') d.setDate(d.getDate() + 14 * i); else if (rep === 'mes') d.setMonth(d.getMonth() + cada * i);
        out.push(d);
      }
      return out;
    };
    const usaCada = (r) => r === 'dia' || r === 'semana' || r === 'mes';
    const unidad = (r) => ({ dia: 'días', semana: 'semanas', mes: 'meses' }[r] ?? '');
    const hintRep = () => {
      const rep = campo('repetir').value; const h = $('[data-a="rephint"]');
      if (rep === 'no') { h.style.display = 'none'; return; }
      const cada = Math.max(1, parseInt(campo('cada').value, 10) || 1); const veces = Math.min(Math.max(2, parseInt(campo('veces').value, 10) || 2), 52);
      const fs = fechasSerie(campo('fecha').value || hoy(), rep, cada, veces);
      h.textContent = `${usaCada(rep) ? `Cada ${cada} ${unidad(rep)} · ` : ''}${veces} fechas: ${fs.slice(0, 6).map((d) => `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()}`).join(', ')}${fs.length > 6 ? ' …' : ''}`;
      h.style.display = '';
    };
    campo('repetir').addEventListener('change', () => {
      const rep = campo('repetir').value;
      $('[data-a="vecesw"]').style.display = rep === 'no' ? 'none' : ''; $('[data-a="cadaw"]').style.display = usaCada(rep) ? '' : 'none'; hintRep();
    });
    campo('cada').addEventListener('input', hintRep); campo('veces').addEventListener('input', hintRep);
    campo('fecha').addEventListener('change', () => { hintRep(); actualizarDur(); });

    // Guardar
    const btnGuardar = $('[data-a="save"]');
    async function guardar() {
      const dias = modo === 'eleccion' ? [...elegidos].sort() : null;
      const fi = dias ? dias[0] : campo('fecha').value; const ff = dias ? dias[dias.length - 1] : campo('fin').value;
      if (dias && !dias.length) { avisar('Marca al menos un día.', 'error'); return; }
      if (dias && campo('repetir').value !== 'no') { avisar('Con días a elección no se puede repetir: elige los días en el calendario.', 'error'); return; }
      const tituloT = campo('titulo').value.trim(); const cli = campo('cliente').value; const sitioT = campo('sitio').value.trim();
      if (!fi || !tituloT) { avisar('Fecha y título son obligatorios.', 'error'); return; }
      if (!cli) { avisar('Elige la empresa / cliente (de la lista).', 'error'); return; }
      if (!sitioT) { avisar('Indica la ubicación / sitio.', 'error'); campo('sitio').focus(); return; }
      btnGuardar.disabled = true;
      try {
        // El sitio se busca entre los del cliente; si es nuevo, se crea
        let s = base.sitios.find((x) => x.tercero_id === cli && x.nombre.trim().toUpperCase() === sitioT.toUpperCase());
        if (!s) {
          const { data, error } = await ctx.api.from('ope_sitios').insert({ empresa_id: ctx.empresa.id, tercero_id: cli, nombre: sitioT }).select('*').single();
          if (error) throw new Error(`No se pudo crear el sitio: ${error.message}`);
          s = data; base.sitios.push(s); sitio.set(s.id, s);
        }
        const h = /todo el d[ií]a/i.test(campo('hora').value) ? { ini: null, fin: null } : leerHora(campo('hora').value);
        const pendiente = campo('tarea').value.trim();   // una tarea escrita sin Enter también se guarda
        const fila = {
          titulo: tituloT, tercero_id: cli, sitio_id: s.id, fecha_inicio: fi, fecha_fin: ff && ff >= fi ? ff : fi,
          hora_inicio: h.ini, hora_fin: h.ini ? h.fin : null, dias: dias && dias.length > 1 ? dias : null,
          tareas: [...tareas, ...(pendiente ? [pendiente] : [])].map((t) => String(t ?? '').trim()).filter(Boolean),
          dotacion: dotForm(),
        };
        const rep = campo('repetir').value;
        const veces = Math.min(parseInt(campo('veces').value, 10) || 0, 52);
        if (rep !== 'no' && veces > 1) {
          const serie = crypto.randomUUID(); const dur = Math.round((fecha(fila.fecha_fin) - fecha(fi)) / 86400000);
          const filas = fechasSerie(fi, rep, Math.max(1, parseInt(campo('cada').value, 10) || 1), veces).map((d) => {
            const fe = new Date(d); fe.setDate(fe.getDate() + dur);
            return { ...fila, fecha_inicio: iso(d), fecha_fin: iso(fe), serie_id: serie, empresa_id: ctx.empresa.id };
          });
          if (e) {   // al editar con repetición, este pasa a ser el primero de la nueva serie
            const [primera, ...resto] = filas; delete primera.empresa_id;
            const { error } = await ctx.api.from('ope_faenas').update(primera).eq('id', e.id);
            if (error) throw new Error(error.message);
            if (resto.length) { const { error: e2 } = await ctx.api.from('ope_faenas').insert(resto); if (e2) throw new Error(`Se guardó el trabajo, pero no las repeticiones: ${e2.message}`); }
          } else {
            const { error } = await ctx.api.from('ope_faenas').insert(filas);
            if (error) throw new Error(error.message);
          }
          avisar(`Se guardaron ${filas.length} trabajos.`);
        } else {
          const { data, error } = e
            ? await ctx.api.from('ope_faenas').update(fila).eq('id', e.id).select('id')
            : await ctx.api.from('ope_faenas').insert({ ...fila, empresa_id: ctx.empresa.id }).select('id');
          if (error) throw new Error(error.message);
          if (!data?.length) throw new Error('No tienes permiso para guardar.');
          const obs = campo('desc').value.trim();
          if (obs) {
            const { error: e3 } = await ctx.api.from('ope_faena_obs').insert({ empresa_id: ctx.empresa.id, faena_id: data[0].id, texto: obs });
            if (e3) avisar(`El trabajo quedó guardado, pero no la observación: ${e3.message}`, 'error');
          }
          avisar(e ? 'Trabajo actualizado.' : 'Trabajo creado.');
        }
        cerrar(); recargar();
      } catch (err) { avisar(err.message, 'error'); btnGuardar.disabled = false; }
    }
    btnGuardar.addEventListener('click', guardar);
    document.body.append(fondo);
    setTimeout(() => campo('titulo').focus(), 30);
  }

  render();
  return raiz;
}
