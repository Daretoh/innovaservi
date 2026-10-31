// Costos de mano de obra (como "Costos · Mano de obra" de InnovaGestión): cuánto cuesta el personal por faena,
// cliente, cargo y trabajador en un mes, trimestre o año, comparado con el período anterior (en curso: con el mismo
// tramo). Indicadores, evolución por día/semana/mes con su composición, por cliente (toca para filtrar) y por
// cargo, tabla de faenas o trabajadores ordenable con detalle, y Excel (CSV) con cada movimiento.
// El reparto está en ../manoobra.js; el total de cada mes cuadra con Remuneraciones.
import { el } from '../../../core/ui/dom.js?v=fb81a8b';
import { icono } from '../../../core/ui/iconos.js?v=fb81a8b';
import { boton } from '../../../core/ui/tabla.js?v=fb81a8b';
import { avisar } from '../../../core/ui/aviso.js?v=fb81a8b';
import { dinero, horas, hoyISO, rangoMes, sumarDias, lunesDe, numSemana, nombreDia, fechaCorta, fechaLarga, moverMes, nombreMes } from '../../../core/ui/formato.js?v=fb81a8b';
import { cargarBase, nombreCompleto } from '../datos.js?v=fb81a8b';
import { COMPONENTES, SIN_FAENA, periodo, libroPeriodo, sumar, agrupar } from '../manoobra.js?v=fb81a8b';

const estado = { per: 'mes', ref: hoyISO().slice(0, 7), cliente: '', tabla: 'faenas', q: '', orden: { faenas: ['m', -1], personas: ['m', -1] }, abierto: null };
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('es-CL')}%` : '—');
const corto = (n) => { const a = Math.abs(n); return a >= 1e6 ? `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',')}M` : a >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`; };
const tituloFaena = (fa) => { const p = fa.split(' · '); return p.length > 2 ? p.slice(2).join(' · ') : p.length > 1 ? p.slice(1).join(' · ') : fa; };
const sitioFaena = (fa) => { const p = fa.split(' · '); return p.length > 2 ? p[1] : ''; };

export default async function vista(ctx) {
  const P = periodo(estado.per, estado.ref);
  const hoy = hoyISO();
  const base = await cargarBase(ctx);
  const L = await libroPeriodo(ctx, base, P);

  // Personas: nombre, cargo y si es fijo
  const personas = new Map(base.vinculos.map((v) => {
    const c = v.condicion;
    const cargo = (c?.cargo_id ? base.cargos.get(c.cargo_id)?.nombre : null) ?? v.cargo ?? '';
    return [v.persona_id, { nombre: nombreCompleto(v.personas), cargo, fijo: (c?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora')) === 'fijo' }];
  }));
  const persona = (pid) => personas.get(pid) ?? { nombre: '—', cargo: '', fijo: false };

  // Período actual y anterior (en curso: el mismo tramo del anterior)
  const pasa = (r) => !estado.cliente || r.cliente === estado.cliente;
  const cur = L.filter((r) => r.fecha >= P.ini && r.fecha <= P.fin && pasa(r));
  const enCurso = hoy >= P.ini && hoy <= P.fin;
  const dias = Math.round((new Date(`${hoy}T12:00`) - new Date(`${P.ini}T12:00`)) / 864e5);
  const corte = enCurso ? [sumarDias(P.pini, dias), P.pfin].sort()[0] : P.pfin;
  const prev = L.filter((r) => r.fecha >= P.pini && r.fecha <= corte && pasa(r));
  const S = sumar(cur);
  const A = sumar(prev);

  // ---- Barra de período
  const cambiar = (cambio) => { Object.assign(estado, cambio, { abierto: null }); ctx.refrescar(); };
  const paso = estado.per === 'anio' ? 12 : estado.per === 'tri' ? 3 : 1;
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Período' },
    [['mes', 'Mes'], ['tri', 'Trimestre'], ['anio', 'Año']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(estado.per === v), onclick: () => cambiar({ per: v }) }, t)));
  const clientesPeriodo = agrupar(L.filter((r) => r.fecha >= P.ini && r.fecha <= P.fin && r.cliente), (r) => r.cliente).sort((a, b) => b.m - a.m);
  const filtroCliente = el('select', { class: 'campo campo-filtro', 'aria-label': 'Cliente', onchange: (ev) => cambiar({ cliente: ev.currentTarget.value }) },
    el('option', { value: '' }, 'Todos los clientes'),
    clientesPeriodo.map((g) => el('option', { value: g.k, selected: g.k === estado.cliente }, g.k)),
    estado.cliente && !clientesPeriodo.some((g) => g.k === estado.cliente) ? el('option', { value: estado.cliente, selected: true }, estado.cliente) : null);
  const barra = el('div', { class: 'listado-acciones cmo-barra' },
    segmento,
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Período anterior', onclick: () => cambiar({ ref: moverMes(estado.ref, -paso) }) }, icono('volver')),
      el('strong', {}, P.etiqueta),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Período siguiente', disabled: P.fin >= hoy, onclick: () => cambiar({ ref: moverMes(estado.ref, paso) }) }, icono('derecha'))),
    hoy.slice(0, 7) !== estado.ref ? boton('Actual', { onclick: () => cambiar({ ref: hoy.slice(0, 7) }) }) : null,
    filtroCliente);

  const acciones = ctx.puede('remu', 'exportar') && cur.length ? [boton('Excel', { icono: 'descargar', onclick: () => exportar(ctx, cur, P, persona).catch((e) => avisar(e.message, 'error')) })] : [];
  const cabecera = el('header', { class: 'listado-cabecera' },
    el('div', {}, el('h1', {}, 'Costos de mano de obra'),
      el('p', { class: 'texto-suave' }, `${P.etiqueta}${estado.cliente ? ` · ${estado.cliente}` : ''}`)),
    el('div', { class: 'listado-acciones' }, acciones));

  if (!cur.length) {
    return el('section', { class: 'listado' }, cabecera, barra,
      el('div', { class: 'ficha cmo-vacio' }, icono('grafico', { tam: 28 }),
        el('p', {}, `Sin costos de mano de obra en ${P.etiqueta}${estado.cliente ? ` para ${estado.cliente}` : ''}.`),
        el('p', { class: 'texto-suave texto-chico' }, 'Los costos salen del Registro de horas y de Remuneraciones.')));
  }

  // ---- Indicadores
  let delta = enCurso ? 'período en curso' : 'sin datos del período anterior';
  if (A.m > 0) {
    const dp = ((S.m - A.m) / A.m) * 100;
    const clase = Math.abs(dp) < 0.5 ? 'igual' : dp > 0 ? 'sube' : 'baja';
    delta = [el('span', { class: `cmo-delta cmo-${clase}` }, icono(clase === 'sube' ? 'arriba' : clase === 'baja' ? 'abajo' : 'menos', { tam: 12 }), `${dp > 0 ? '+' : ''}${dp.toFixed(1).replace('.', ',')}%`),
      ` vs ${enCurso ? 'mismo tramo de ' : ''}${P.etiquetaPrev}`];
  }
  const fijos = [...S.pids].filter((pid) => persona(pid).fijo).length;
  const kpi = (t, v, s, principal = false) => el('div', { class: `cmo-kpi${principal ? ' principal' : ''}` }, el('span', { class: 'cmo-kpi-t' }, t), el('strong', {}, v), el('span', { class: 'cmo-kpi-s' }, s));
  const kpis = el('div', { class: 'cmo-kpis' },
    kpi('Costo mano de obra', dinero(S.m), delta, true),
    kpi('Horas trabajadas', horas(Math.round(S.min)), `${S.nDias} día${S.nDias === 1 ? '' : 's'} con trabajo`),
    kpi('Costo por hora', S.min ? dinero(S.ph) : '—', A.ph && S.ph ? `antes ${dinero(A.ph)}` : 'costo total ÷ horas'),
    kpi('Personas', String(S.nPer), `${S.nPer - fijos} spot · ${fijos} fijo${fijos === 1 ? '' : 's'}`),
    kpi('Faenas', String(S.nFae), `${S.nCli} cliente${S.nCli === 1 ? '' : 's'}${S.nFae ? ` · prom. ${corto(S.m / S.nFae)}` : ''}`));

  // ---- Evolución y composición
  const leyenda = el('div', { class: 'cmo-leyenda' }, COMPONENTES.filter(([k]) => S.c[k]).map(([k, t]) => el('span', {}, el('i', { class: `cmo-c-${k}` }), t)));
  const evolucion = el('div', { class: 'ficha' },
    el('div', { class: 'cmo-cab' }, el('div', {}, el('h2', {}, 'Evolución del costo'),
      el('p', { class: 'texto-suave texto-chico' }, estado.per === 'mes' ? 'por día' : estado.per === 'tri' ? 'por semana' : 'por mes')), leyenda),
    grafico(cur, P));
  const composicion = el('div', { class: 'ficha' },
    el('h2', {}, 'Composición'), el('p', { class: 'texto-suave texto-chico' }, 'en qué se va el costo'),
    el('div', { class: 'cmo-pila' }, COMPONENTES.filter(([k]) => S.c[k] > 0).map(([k, t]) => el('i', { class: `cmo-c-${k}`, style: `flex:${S.c[k]}`, title: t }))),
    el('div', { class: 'cmo-comp' },
      COMPONENTES.filter(([k]) => S.c[k]).map(([k, t, sub]) => el('div', {}, el('i', { class: `cmo-c-${k}` }), el('span', {}, t, el('small', {}, sub)), el('strong', {}, dinero(S.c[k])), el('em', {}, pct(S.c[k], S.bruto)))),
      S.c.de ? el('div', { class: 'cmo-neg' }, el('i'), el('span', {}, 'Descuentos', el('small', {}, 'anticipos y otros')), el('strong', {}, `−${dinero(-S.c.de)}`), el('em')) : null,
      el('div', { class: 'cmo-tot' }, el('i'), el('span', {}, 'Total'), el('strong', {}, dinero(S.m)), el('em'))));

  // ---- Por cliente y por cargo
  const barras = (grupos, { nombre, sub, valorSub, alTocar = null, activo = null }) => {
    const max = Math.max(1, ...grupos.map((g) => g.m));
    return el('div', { class: 'cmo-barras' }, grupos.slice(0, 10).map((g) => el(alTocar && g.k ? 'button' : 'div', {
      type: alTocar && g.k ? 'button' : null, class: `cmo-barra${activo && g.k === activo ? ' activa' : ''}`, onclick: alTocar && g.k ? () => alTocar(g.k) : null,
    },
      el('span', { class: 'cmo-barra-n' }, nombre(g), el('small', {}, sub(g))),
      el('span', { class: 'cmo-pista' }, el('i', { style: `width:${Math.max(1, (g.m / max) * 100)}%` })),
      el('span', { class: 'cmo-barra-v' }, dinero(g.m), el('small', {}, valorSub(g))))),
    grupos.length > 10 ? el('p', { class: 'texto-suave texto-chico' }, `y ${grupos.length - 10} más`) : null);
  };
  const porCliente = agrupar(cur, (r) => r.cliente).sort((a, b) => b.m - a.m);
  const porCargo = agrupar(cur, (r) => persona(r.pid).cargo || 'Sin cargo').sort((a, b) => b.m - a.m);
  const rejilla = el('div', { class: 'cmo-rejilla' },
    el('div', { class: 'ficha' }, el('h2', {}, 'Por cliente'),
      el('p', { class: 'texto-suave texto-chico' }, estado.cliente ? 'toca de nuevo para ver todos' : 'toca un cliente para filtrar todo el panel'),
      barras(porCliente, { nombre: (g) => g.k || SIN_FAENA, sub: (g) => `${g.nFae ? `${g.nFae} faena${g.nFae === 1 ? '' : 's'} · ` : ''}${horas(Math.round(g.min))}`,
        valorSub: (g) => pct(g.m, S.m), alTocar: (k) => cambiar({ cliente: estado.cliente === k ? '' : k }), activo: estado.cliente })),
    el('div', { class: 'ficha' }, el('h2', {}, 'Por cargo'), el('p', { class: 'texto-suave texto-chico' }, 'costo y valor hora promedio'),
      barras(porCargo, { nombre: (g) => g.k, sub: (g) => { const n = new Set(g.rows.map((r) => r.pid)).size; return `${n} persona${n === 1 ? '' : 's'}${g.min ? ` · ${dinero(g.ph)}/h` : ''}`; }, valorSub: (g) => horas(Math.round(g.min)) })));

  // ---- Tabla de faenas o trabajadores, con detalle
  const contTabla = el('div');
  const detalle = el('div');
  const pintarTabla = () => {
    const modo = estado.tabla;
    let filas = modo === 'faenas'
      ? agrupar(cur, (r) => r.faena).map((g) => ({ ...g, nombre: g.k ? tituloFaena(g.k) : SIN_FAENA, sub: g.k ? [g.rows[0].cliente, sitioFaena(g.k)].filter(Boolean).join(' · ') : 'sueldos, extras y descuentos de días sin faena', n: g.nPer }))
      : agrupar(cur, (r) => r.pid).map((g) => { const p = persona(g.k); return { ...g, nombre: p.nombre, sub: `${p.fijo ? 'Fijo' : 'Spot'}${p.cargo ? ` · ${p.cargo}` : ''}`, n: g.nFae }; });
    const q = estado.q.trim().toLowerCase();
    if (q) filas = filas.filter((g) => `${g.nombre} ${g.sub}`.toLowerCase().includes(q));
    const [k, dir] = estado.orden[modo];
    const val = (g) => (k === 'nombre' ? g.nombre.toLowerCase() : k === 'dias' ? g.nDias : k === 'n' ? g.n : k === 'min' ? g.min : k === 'ph' ? g.ph : g.m);
    filas.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir || b.m - a.m);
    const cols = [['nombre', modo === 'faenas' ? 'Faena' : 'Trabajador'], ['dias', 'Días'], ['n', modo === 'faenas' ? 'Personas' : 'Faenas'], ['min', 'Horas'], ['m', 'Costo'], ['ph', '$/hora'], ['m', '% del total']];
    const T = sumar(filas.flatMap((g) => g.rows));
    contTabla.replaceChildren(filas.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla cmo-tabla' },
      el('thead', {}, el('tr', {}, cols.map(([c, t], i) => el('th', { class: i ? 'num' : '', 'aria-sort': k === c && i < 6 ? (dir < 0 ? 'descending' : 'ascending') : null },
        el('button', { type: 'button', class: 'cmo-orden', onclick: () => { estado.orden[modo] = k === c ? [c, -dir] : [c, c === 'nombre' ? 1 : -1]; pintarTabla(); } }, t, k === c && i < 6 ? (dir < 0 ? ' ↓' : ' ↑') : ''))))),
      el('tbody', {}, filas.map((g) => el('tr', { class: `cmo-fila${estado.abierto?.k === g.k && estado.abierto?.modo === modo ? ' activa' : ''}`, tabindex: '0',
        onclick: () => abrir(modo, g), onkeydown: (ev) => { if (ev.key === 'Enter') abrir(modo, g); } },
        el('td', {}, el('strong', {}, g.nombre), el('small', { class: 'texto-suave' }, g.sub)),
        el('td', { class: 'num' }, String(g.nDias)), el('td', { class: 'num' }, String(g.n)), el('td', { class: 'num' }, horas(Math.round(g.min))),
        el('td', { class: 'num' }, el('strong', {}, dinero(g.m))), el('td', { class: 'num' }, g.min ? dinero(g.ph) : '—'),
        el('td', { class: 'num' }, el('span', { class: 'cmo-cuota' }, el('i', { style: `width:${Math.max(2, (g.m / Math.max(1, filas[0] ? Math.max(...filas.map((x) => x.m)) : 1)) * 60)}px` }), pct(g.m, S.m)))))),
      el('tfoot', {}, el('tr', {},
        el('td', {}, `Total · ${modo === 'faenas' ? `${filas.filter((g) => g.k).length} faenas` : `${filas.length} personas`}`),
        el('td', { class: 'num' }, String(T.nDias)), el('td', { class: 'num' }, String(modo === 'faenas' ? T.nPer : T.nFae)), el('td', { class: 'num' }, horas(Math.round(T.min))),
        el('td', { class: 'num' }, dinero(T.m)), el('td', { class: 'num' }, T.min ? dinero(T.ph) : '—'), el('td', { class: 'num' }, pct(T.m, S.m))))))
      : el('p', { class: 'texto-suave' }, 'Sin resultados.'));
  };
  const abrir = (modo, g) => {
    estado.abierto = estado.abierto?.k === g.k && estado.abierto?.modo === modo ? null : { modo, k: g.k };
    pintarTabla();
    detalle.replaceChildren(estado.abierto ? panelDetalle(modo, g, P, S, persona) : '');
    if (estado.abierto) detalle.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const pestanas = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver por' },
    [['faenas', 'Faenas'], ['personas', 'Trabajadores']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(estado.tabla === v),
      onclick: (ev) => { estado.tabla = v; estado.abierto = null; detalle.replaceChildren(); for (const b of ev.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); pintarTabla(); } }, t)));
  const buscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar…', 'aria-label': 'Buscar', value: estado.q });
  buscar.addEventListener('input', () => { estado.q = buscar.value; pintarTabla(); });
  pintarTabla();

  const nota = el('p', { class: 'texto-suave texto-chico' },
    'Usa el mismo cálculo de Remuneraciones (horas, ajustes por día y por faena, vueltas, extras y descuentos) más el sueldo base de los fijos. ',
    'Las horas se asignan a cada faena según sus horas del día; el sueldo base, las vueltas del chofer, los extras y los descuentos se reparten según las horas de cada persona en el mes. ',
    'No incluye leyes sociales.', enCurso ? ' Período en curso: el sueldo base de los fijos se cuenta devengado a hoy.' : '');

  return el('section', { class: 'listado cmo' },
    cabecera, barra, kpis,
    el('div', { class: 'cmo-rejilla cmo-21' }, evolucion, composicion),
    rejilla,
    el('div', { class: 'ficha' },
      el('div', { class: 'cmo-cab' }, pestanas, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscar)),
      contTabla),
    detalle,
    nota);
}

// Columnas apiladas por día (mes), semana (trimestre) o mes (año); el título de cada columna trae el desglose
function grafico(rows, P, alto = 200) {
  const hoy = hoyISO();
  const tramos = [];
  if (P.per === 'mes') for (let f = P.ini; f <= P.fin; f = sumarDias(f, 1)) { const d = Number(f.slice(8)); tramos.push({ a: f, b: f, x: d === 1 || d % 5 === 0 ? String(d) : '', t: `${nombreDia(f)} ${fechaCorta(f)}` }); }
  else if (P.per === 'tri') for (let f = lunesDe(P.ini); f <= P.fin; f = sumarDias(f, 7)) { const a = f < P.ini ? P.ini : f; const b = [sumarDias(f, 6), P.fin].sort()[0]; tramos.push({ a, b, x: tramos.length % 2 ? '' : `S${numSemana(f)}`, t: `Semana ${numSemana(f)} · ${fechaCorta(a)} – ${fechaCorta(b)}` }); }
  else for (const m of P.meses) { const r = rangoMes(m); tramos.push({ a: r.desde, b: r.hasta, x: MES3[Number(m.slice(5)) - 1], t: nombreMes(m) }); }
  for (const t of tramos) { t.c = { tr: 0, su: 0, vu: 0, ex: 0, de: 0 }; t.min = 0; t.fut = t.a > hoy; t.hoy = hoy >= t.a && hoy <= t.b; }
  for (const r of rows) { const t = tramos.find((x) => r.fecha >= x.a && r.fecha <= x.b); if (t) { t.c[r.c] += r.m; t.min += r.min; } }
  const max = Math.max(1, ...tramos.map((t) => t.c.tr + t.c.su + t.c.vu + t.c.ex));
  const tope = (() => { const e = 10 ** Math.floor(Math.log10(max * 1.05)); const n = (max * 1.05) / e; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * e; })();
  const titulo = (t) => {
    const neto = t.c.tr + t.c.su + t.c.vu + t.c.ex + t.c.de;
    if (t.fut) return `${t.t}: aún no ocurre`;
    if (!neto && !t.c.de) return `${t.t}: sin costos`;
    return [`${t.t}`, ...COMPONENTES.filter(([k]) => t.c[k]).map(([k, n]) => `${n}: ${dinero(t.c[k])}`), t.c.de ? `Descuentos: −${dinero(-t.c.de)}` : null,
      `Total${t.min ? ` (${horas(Math.round(t.min))})` : ''}: ${dinero(neto)}`].filter(Boolean).join('\n');
  };
  return el('div', { class: 'cmo-grafico' },
    el('div', { class: 'cmo-area', style: `height:${alto}px` },
      [0, 1, 2, 3, 4].map((g) => el('div', { class: 'cmo-guia', style: `bottom:${g * 25}%` }, el('span', {}, g ? corto((tope * g) / 4) : '$0'))),
      el('div', { class: 'cmo-cols' }, tramos.map((t) => el('div', { class: `cmo-col${t.hoy ? ' hoy' : ''}${t.fut ? ' fut' : ''}`, title: titulo(t) },
        el('div', { class: 'cmo-pilar' }, COMPONENTES.map(([k]) => (t.c[k] > 0 ? el('i', { class: `cmo-c-${k}`, style: `height:${(t.c[k] / tope) * alto}px` }) : null))))))),
    el('div', { class: 'cmo-ejex' }, tramos.map((t) => el('span', {}, t.x))));
}

// Detalle de una faena (personas) o de un trabajador (faenas) en el período
function panelDetalle(modo, g, P, S, persona) {
  const otro = agrupar(g.rows, modo === 'faenas' ? (r) => r.pid : (r) => r.faena).sort((a, b) => b.m - a.m);
  return el('div', { class: 'ficha cmo-detalle' },
    el('div', { class: 'cmo-cab' }, el('div', {}, el('h2', {}, `${g.nombre} · ${P.etiqueta}`), el('p', { class: 'texto-suave texto-chico' }, g.sub))),
    el('div', { class: 'cmo-kpis' },
      el('div', { class: 'cmo-kpi principal' }, el('span', { class: 'cmo-kpi-t' }, 'Costo'), el('strong', {}, dinero(g.m)), el('span', { class: 'cmo-kpi-s' }, `${pct(g.m, S.m)} del período`)),
      el('div', { class: 'cmo-kpi' }, el('span', { class: 'cmo-kpi-t' }, 'Horas'), el('strong', {}, horas(Math.round(g.min))), el('span', { class: 'cmo-kpi-s' }, `${g.nDias} día${g.nDias === 1 ? '' : 's'}`)),
      el('div', { class: 'cmo-kpi' }, el('span', { class: 'cmo-kpi-t' }, 'Costo por hora'), el('strong', {}, g.min ? dinero(g.ph) : '—'),
        el('span', { class: 'cmo-kpi-s' }, modo === 'faenas' ? `${g.nPer} persona${g.nPer === 1 ? '' : 's'}` : `${g.nFae} faena${g.nFae === 1 ? '' : 's'}`))),
    grafico(g.rows, P, 150),
    el('h2', {}, modo === 'faenas' ? 'Personas en la faena' : 'Faenas trabajadas'),
    el('p', { class: 'texto-suave texto-chico' }, '"Otros" = sueldo base y extras menos descuentos, según sus horas'),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, [modo === 'faenas' ? 'Trabajador' : 'Faena', 'Días', 'Horas', 'Horas $', 'Vueltas', 'Otros', 'Costo'].map((t, i) => el('th', { class: i ? 'num' : '' }, t)))),
      el('tbody', {}, otro.map((o) => {
        const nombre = modo === 'faenas' ? persona(o.k).nombre : o.k ? tituloFaena(o.k) : SIN_FAENA;
        const sub = modo === 'faenas' ? `${persona(o.k).fijo ? 'Fijo' : 'Spot'}${persona(o.k).cargo ? ` · ${persona(o.k).cargo}` : ''}` : o.k ? o.rows[0].cliente : '';
        const otros = o.c.su + o.c.ex + o.c.de;
        return el('tr', {}, el('td', {}, el('strong', {}, nombre), el('small', { class: 'texto-suave' }, sub)),
          el('td', { class: 'num' }, String(o.nDias)), el('td', { class: 'num' }, horas(Math.round(o.min))), el('td', { class: 'num' }, dinero(o.c.tr)),
          el('td', { class: 'num' }, o.c.vu ? dinero(o.c.vu) : '—'), el('td', { class: 'num' }, otros ? dinero(otros) : '—'), el('td', { class: 'num' }, el('strong', {}, dinero(o.m))));
      })))));
}

// Excel: cada movimiento del período (filtro de cliente incluido) y el resumen por componente
async function exportar(ctx, rows, P, persona) {
  const { nuevoExcel } = await import('../../../core/excel.js?v=fb81a8b');
  const nombres = Object.fromEntries([...COMPONENTES.map(([k, t]) => [k, t]), ['de', 'Descuentos']]);
  const S = sumar(rows);
  const x = await nuevoExcel(ctx, { titulo: 'Costos de mano de obra', subtitulo: P.etiqueta });
  x.tabla({ titulo: 'Resumen', columnas: ['Componente', { t: 'Monto', tipo: 'dinero' }],
    filas: [...COMPONENTES.map(([k, t]) => [t, Math.round(S.c[k])]), ['Descuentos', Math.round(S.c.de)]], total: ['Total', Math.round(S.m)] });
  x.tabla({ titulo: 'Detalle', columnas: [{ t: 'Fecha', tipo: 'fecha' }, 'Cliente', 'Faena', 'Trabajador', 'Cargo', 'Modalidad', 'Componente', { t: 'Horas', tipo: 'horas' }, { t: 'Monto', tipo: 'dinero' }],
    filas: [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.faena.localeCompare(b.faena)).map((r) => {
      const p = persona(r.pid);
      return [r.fecha, r.cliente, r.faena || SIN_FAENA, p.nombre, p.cargo, p.fijo ? 'Fijo' : 'Spot', nombres[r.c], Math.round(r.min || 0), Math.round(r.m)];
    }), total: ['Total', '', '', '', '', '', '', Math.round(S.min), Math.round(S.m)] });
  await x.guardar(`costos-mano-de-obra-${P.meses[0]}${P.n > 1 ? `-a-${P.meses[P.n - 1]}` : ''}`);
  avisar('Excel descargado.');
}
