// Cierre de remuneraciones del mes: lo que se envía a quien hace las liquidaciones. Lo usan Remuneraciones → Cierre
// (una empresa) y Grupo → Cierre de remuneraciones (todas las empresas juntas, cada una con su cálculo y sus permisos).
// Se ordena en tres pasos: 1) Revisar (avisos), 2) Ajustar (movimientos, personas y columnas que van) y 3) Enviar
// (vista previa, PDF y Excel, y marcar el mes como enviado). Como el cierre de InnovaGestión (notas de Enzo, oct-2026):
// - Secciones por empresa: Fijos y Spot. "Cierre del mes" = fijos de todas + spot de las empresas que pagan mensual
//   (el spot de pago semanal ya se pagó cada semana).
// - Fijos: mes de 30 días (o desde que rige su sueldo) en Días y Días liq.; spot: días con horas, y Días liq. =
//   total ÷ valor del día de trato, redondeado (0,5 sube). Solo informativo: no cambia ningún pago.
// - Empresas de pago mensual (IS Performance): lo que un fijo hace fuera de su jornada son "Horas extras" y
//   "$ Horas extras"; en el resto son "Horas trato" y "Tratos".
// - Movimientos del mes para cualquiera (datos.MOVIMIENTOS): bono y aguinaldo suman, descuento resta; anticipo
//   y quincena ya se pagaron (se restan de A pagar). Fijos de pago semanal: lo pagado en los pagos
//   semanales (tratos, vueltas, extras) se resta de A pagar ("Pagado semanal"); sigue en el total (costo del mes).
// - Personas ocultas del cierre (remu_cierres.ocultos) y mes enviado (remu_cierres.cerrado_at): no cambian pagos.
// Columnas, su orden y las secciones que van se recuerdan en este navegador (isg.remu.cierre).
import { el } from '../../core/ui/dom.js?v=a35d6c9';
import { icono } from '../../core/ui/iconos.js?v=a35d6c9';
import { boton } from '../../core/ui/tabla.js?v=a35d6c9';
import { avisar } from '../../core/ui/aviso.js?v=a35d6c9';
import { dinero, horas, hoyISO, moverMes, nombreMes } from '../../core/ui/formato.js?v=a35d6c9';
import { abrirFormulario } from '../../core/ui/modal.js?v=a35d6c9';
import { nombreEmpresa } from '../../core/empresas.js?v=a35d6c9';
import { cargarBase, resumenMes, nombreCompleto, MOVIMIENTOS } from './datos.js?v=a35d6c9';
import { diasDelMes } from './calculo.js?v=a35d6c9';

const estado = { mes: hoyISO().slice(0, 7) };
const CLAVE = 'isg.remu.cierre';

// ---------------------------------------------------------------- Columnas

const esFijo = (r) => r.f.modo === 'fijo';
const esHX = (r) => esFijo(r) && r.mensual;                       // fijos de pago mensual: horas extras
const pagadoSemanal = (r) => (esFijo(r) && !r.mensual ? r.f.total : 0);
const aPagar = (r) => r.f.aPagar - pagadoSemanal(r);
const diasLiq = (r) => (esFijo(r) ? diasDelMes(r.f, r.mes) : r.f.vh ? Math.round(r.f.totalMes / (r.f.vh * r.horasTrato)) : null);

export const COLUMNAS = [
  { k: 'rut', t: 'RUT', tipo: 'texto', v: (r) => r.f.persona.rut },
  { k: 'cargo', t: 'Cargo', tipo: 'texto', v: (r) => r.f.cargo?.nombre ?? r.f.vinculo.cargo ?? '' },
  { k: 'dias', t: 'Días', tipo: 'numero', suma: true, v: (r) => (esFijo(r) ? diasDelMes(r.f, r.mes) : r.f.dias), nota: 'Días: fijos, mes de 30 días (o desde que rige su sueldo) menos los días de licencia médica; spot, días con horas.' },
  { k: 'dliq', t: 'Días liq.', tipo: 'numero', suma: true, v: diasLiq, nota: 'Días liq.: spot, total ÷ valor del día de trato (redondeado); fijos, los días del mes. Solo para la liquidación, no cambia pagos.' },
  { k: 'horas', t: 'Horas', tipo: 'horas', suma: true, v: (r) => r.f.totMin },
  { k: 'htrato', t: 'Horas trato', tipo: 'horas', suma: true, v: (r) => (esHX(r) ? null : r.f.pagoMin), nota: 'Horas trato: spot, todas; fijos, las de fuera de su jornada, fines de semana y feriados.' },
  { k: 'hextra', t: 'Horas extras', tipo: 'horas', suma: true, v: (r) => (esHX(r) ? r.f.pagoMin : null), nota: 'Horas extras (fijos de pago mensual): las de fuera de su jornada; su monto va en "$ Horas extras".' },
  { k: 'sueldo', t: 'Sueldo base', tipo: 'dinero', suma: true, v: (r) => r.f.sueldo },
  { k: 'tratos', t: 'Tratos', tipo: 'dinero', suma: true, v: (r) => (esHX(r) ? 0 : r.f.baseContable) },
  { k: 'mextra', t: '$ Horas extras', tipo: 'dinero', suma: true, v: (r) => (esHX(r) ? r.f.baseContable : 0) },
  { k: 'nvueltas', t: 'N° vueltas', tipo: 'numero', suma: true, v: (r) => r.f.vueltas },
  { k: 'vueltas', t: '$ Vueltas', tipo: 'dinero', suma: true, v: (r) => r.f.montoVueltas },
  { k: 'autos', t: 'N° vehículos', tipo: 'numero', v: (r) => (r.f.bonoAutos ? r.autos : null), nota: 'N° vehículos: autos del mes que dan el bono por autos.' },
  { k: 'bonoautos', t: 'Bono autos', tipo: 'dinero', suma: true, v: (r) => r.f.bonoAutos || 0 },
  { k: 'extras', t: 'Extras', tipo: 'dinero', suma: true, v: (r) => r.f.extra },
  { k: 'bonos', t: 'Bonos / aguinaldo', tipo: 'dinero', suma: true, v: (r) => r.f.movHab || 0 },
  { k: 'desc', t: 'Descuentos', tipo: 'dinero', suma: true, neg: true, v: (r) => r.f.descuento + (r.f.movDes || 0) },
  { k: 'total', t: 'Total', tipo: 'dinero', suma: true, fuerte: true, v: (r) => r.f.totalMes, nota: 'Total = costo del mes.' },
  { k: 'antic', t: 'Anticipos', tipo: 'dinero', suma: true, neg: true, v: (r) => r.f.movPag || 0, nota: 'Anticipos y quincenas ya pagados: se restan de A pagar, no del total.' },
  { k: 'psem', t: 'Pagado semanal', tipo: 'dinero', suma: true, neg: true, v: pagadoSemanal, nota: 'Pagado semanal (fijos de pago semanal): tratos, vueltas y extras ya pagados cada semana; se restan de A pagar.' },
  { k: 'pagar', t: 'A pagar', tipo: 'dinero', suma: true, fuerte: true, v: aPagar },
];
const PORDEFECTO = ['rut', 'dias', 'dliq', 'horas', 'htrato', 'hextra', 'sueldo', 'tratos', 'mextra', 'vueltas', 'autos', 'bonoautos', 'extras', 'bonos', 'desc', 'total', 'antic', 'psem', 'pagar'];
const PRESETS = [['cierre', 'Cierre del mes'], ['todo', 'Todo'], ['fijos', 'Solo fijos'], ['spot', 'Solo spot']];

function leerPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { /* sin almacenamiento */ }
  const validas = new Set(COLUMNAS.map((c) => c.k));
  const cols = Array.isArray(p.cols) ? p.cols.filter((k) => validas.has(k)) : [...PORDEFECTO];
  return { preset: p.preset ?? 'cierre', secs: p.secs ?? {}, cols, vacias: p.vacias ?? true };
}
const guardarPrefs = (p) => { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento */ } };

const texto = (c, v) => {
  if (c.tipo === 'dinero') return v ? `${c.neg ? '−' : ''}${dinero(v)}` : '—';
  if (c.tipo === 'horas') return v ? horas(v) : '—';
  if (c.tipo === 'numero') return v || v === 0 ? Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }) : '—';
  return v ?? '';
};
const vacia = (c, filas) => filas.every((r) => { const v = c.v(r); return v == null || v === 0 || v === ''; });

// ---------------------------------------------------------------- Datos

// empresas: [{ empresa, puede }] (una sola en Remuneraciones; todas las del usuario con Remuneraciones en el Grupo)
async function cargar(ctx, empresas, mes) {
  return Promise.all(empresas.map(async (g, i) => {
    const ctxE = { ...ctx, empresa: g.empresa, puede: g.puede };
    try {
      const base = await cargarBase(ctxE);
      const [RM, cierre] = await Promise.all([resumenMes(ctxE, base, mes),
        ctx.api.from('remu_cierres').select('*').eq('empresa_id', g.empresa.id).eq('mes', mes).maybeSingle()]);
      const mensual = base.config.periodo === 'mensual';
      const horasTrato = Number(base.config.horas_trato) || 8;
      const filas = RM.filas.map((f) => ({ f, e: g.empresa, i, ctxE, mes, mensual, horasTrato, autos: RM.autos.length }));
      return { ...g, i, ctxE, base, RM, mensual, filas, cierre: cierre.error ? null : cierre.data, sinCierres: !!cierre.error,
        ocultos: new Set(cierre.data?.ocultos ?? []), repetidos: RM.R?.diasRepetidos ?? 0 };
    } catch (err) { return { ...g, i, error: err.message, filas: [] }; }
  }));
}

// Secciones: por empresa, Fijos y Spot
function secciones(datos, varias) {
  return datos.flatMap((d) => d.error ? [] : [
    { k: `${d.empresa.id}|fj`, d, fijo: true, titulo: varias ? `${nombreEmpresa(d.empresa)} · Fijos` : 'Fijos', filas: d.filas.filter(esFijo) },
    { k: `${d.empresa.id}|sp`, d, fijo: false, titulo: varias ? `${nombreEmpresa(d.empresa)} · Spot` : 'Spot (por trato)', filas: d.filas.filter((r) => !esFijo(r)) },
  ]).filter((s) => s.filas.length);
}
const enPreset = (preset, s) => (preset === 'todo' ? true : preset === 'fijos' ? s.fijo : preset === 'spot' ? !s.fijo : s.fijo || s.d.mensual);
const seccionVa = (p, s) => p.secs[s.k] ?? enPreset(p.preset, s);

// ---------------------------------------------------------------- Vista

export async function vistaCierre(ctx, { empresas, titulo = 'Cierre de remuneraciones', grupo = false }) {
  const mes = estado.mes;
  const datos = await cargar(ctx, empresas, mes);
  const varias = empresas.length > 1;
  const S = secciones(datos, varias);
  const prefs = leerPrefs();
  const cont = el('div');
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };

  // Columnas y filas que van (lo mismo en pantalla, Excel y PDF)
  const armado = () => {
    const secs = S.filter((s) => seccionVa(prefs, s)).map((s) => ({ ...s, filas: s.filas.filter((r) => !s.d.ocultos.has(r.f.vinculo.persona_id)), ocultas: s.filas.filter((r) => s.d.ocultos.has(r.f.vinculo.persona_id)) }));
    const todas = secs.flatMap((s) => s.filas);
    const cols = prefs.cols.map((k) => COLUMNAS.find((c) => c.k === k)).filter((c) => c && !(prefs.vacias && vacia(c, todas)));
    return { secs, cols, todas };
  };

  const pintar = () => {
    const { secs, cols, todas } = armado();
    const total = todas.reduce((s, r) => s + aPagar(r), 0);
    cont.replaceChildren(
      pasoRevisar(ctx, datos, mes),
      el('div', { class: 'cierre-paso' }, el('span', { class: 'cierre-num' }, '2'), el('div', { class: 'cierre-paso-cuerpo' },
        el('strong', {}, 'Ajustar'),
        el('div', { class: 'cierre-barra' },
          el('div', { class: 'segmento', role: 'group', 'aria-label': 'Qué va en el cierre' }, PRESETS.map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String(prefs.preset === k && !Object.keys(prefs.secs).length),
            onclick: () => { prefs.preset = k; prefs.secs = {}; guardarPrefs(prefs); pintar(); } }, t))),
          menuColumnas(prefs, () => { guardarPrefs(prefs); pintar(); }),
          datos.some((d) => !d.error && d.puede('remu', 'crear')) ? boton('Agregar movimiento', { icono: 'mas', onclick: () => nuevoMovimiento(ctx, datos, mes) }) : null),
        el('div', { class: 'cierre-secs' }, S.map((s) => el('label', { class: 'casilla cierre-sec' },
          el('input', { type: 'checkbox', checked: seccionVa(prefs, s), onchange: (ev) => { prefs.secs[s.k] = ev.target.checked; guardarPrefs(prefs); pintar(); } }),
          s.titulo, el('span', { class: 'texto-suave' }, ` (${s.filas.length})`)))))),
      el('div', { class: 'cierre-paso' }, el('span', { class: 'cierre-num' }, '3'), el('div', { class: 'cierre-paso-cuerpo' },
        el('strong', {}, 'Enviar'),
        el('div', { class: 'cierre-barra' },
          el('span', { class: 'cierre-total' }, 'A pagar ', el('strong', {}, dinero(total)), el('span', { class: 'texto-suave texto-chico' }, ` · ${todas.length} persona${todas.length === 1 ? '' : 's'}`)),
          ctx.puede('remu', 'exportar') && todas.length ? [
            boton('Vista previa', { icono: 'ojo', onclick: (ev) => exportar(ctx, { secs, cols, mes, titulo, grupo: varias }, 'previa', ev.currentTarget) }),
            boton('PDF', { icono: 'descargar', tipo: 'primario', onclick: (ev) => exportar(ctx, { secs, cols, mes, titulo, grupo: varias }, 'pdf', ev.currentTarget) }),
            boton('Excel', { icono: 'descargar', onclick: (ev) => exportar(ctx, { secs, cols, mes, titulo, grupo: varias }, 'excel', ev.currentTarget) })] : null,
          marcarEnviado(ctx, datos, mes)))),
      ...(secs.length ? secs.map((s) => tablaSeccion(ctx, s, cols, { mes, grupo, repintar: pintar })) : [el('p', { class: 'tabla-vacia' }, 'Nada que mostrar con lo elegido en Ajustar.')]),
      el('p', { class: 'texto-suave texto-chico' }, cols.filter((c) => c.nota).map((c) => c.nota).join(' ')));
  };
  pintar();

  return el('section', { class: 'listado cierre-remu' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, titulo), el('p', { class: 'texto-suave' }, varias ? `${empresas.map((g) => nombreEmpresa(g.empresa)).join(' y ')}: para enviar a quien hace las liquidaciones.` : 'Para enviar a quien hace las liquidaciones.')),
      el('div', { class: 'nav-periodo' },
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
        el('strong', {}, nombreMes(mes)),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')))),
    datos.filter((d) => d.error).map((d) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEmpresa(d.empresa)}: ${d.error}`)),
    cont);
}

// Paso 1: lo que conviene revisar antes de enviar
function pasoRevisar(ctx, datos, mes) {
  const avisos = [];
  // Fijo sin sueldo en una empresa porque se lo paga otra del grupo (Yocelyn: fija en Performance; en Innova, fija con la
  // jornada de Performance y sin sueldo: sus horas en Innova dentro de esa jornada no se pagan): no es un error
  const conSueldo = new Set(datos.flatMap((d) => d.filas.filter((r) => esFijo(r) && r.f.condicion?.sueldo_base).map((r) => r.f.vinculo.persona_id)));
  for (const d of datos.filter((x) => !x.error)) {
    const pre = datos.length > 1 ? `${nombreEmpresa(d.empresa)}: ` : '';
    const fijos = d.filas.filter(esFijo).map((r) => r.f);
    const sinJornada = fijos.filter((f) => !f.ventana && !f.jornadaHoras && !f.condicion?.art22);
    if (sinJornada.length) avisos.push(`${pre}${sinJornada.map((f) => nombreCompleto(f.persona)).join(', ')} ${sinJornada.length === 1 ? 'es fijo y no tiene' : 'son fijos y no tienen'} jornada: todas sus horas cuentan como trato (Condiciones de pago).`);
    const sinSueldo = fijos.filter((f) => !f.condicion?.sueldo_base && !conSueldo.has(f.vinculo.persona_id));
    if (sinSueldo.length) avisos.push(`${pre}${sinSueldo.map((f) => nombreCompleto(f.persona)).join(', ')} sin sueldo base en Condiciones de pago${datos.length > 1 ? '' : ' (si su sueldo lo paga otra empresa del grupo, está bien)'}.`);
    const sinValor = d.filas.filter((r) => !esFijo(r) && r.f.totMin && !r.f.vh).map((r) => r.f);
    if (sinValor.length) avisos.push(`${pre}${sinValor.map((f) => nombreCompleto(f.persona)).join(', ')} con horas pero sin cargo ni valor hora: no suman pago.`);
    if (d.repetidos) avisos.push(`${pre}${d.repetidos} día${d.repetidos === 1 ? '' : 's'} con registros de horas que se pisan (el tiempo repetido cuenta una vez).`);
    if (d.ocultos.size) avisos.push(`${pre}${d.ocultos.size} persona${d.ocultos.size === 1 ? '' : 's'} fuera del cierre (ver al final de cada sección).`);
    if (d.sinCierres) avisos.push(`${pre}falta aplicar la migración Remuneraciones 007: no se pueden ocultar personas ni marcar el mes como enviado.`);
  }
  const hoy = hoyISO().slice(0, 7);
  return el('div', { class: 'cierre-paso' }, el('span', { class: 'cierre-num' }, '1'), el('div', { class: 'cierre-paso-cuerpo' },
    el('strong', {}, 'Revisar'),
    mes > hoy ? el('p', { class: 'texto-suave' }, 'Mes que aún no empieza.') : null,
    avisos.length ? el('ul', { class: 'cierre-avisos' }, avisos.map((a) => el('li', {}, icono('alerta', { tam: 14 }), ' ', a)))
      : el('p', { class: 'texto-suave' }, icono('check', { tam: 14 }), ' Sin avisos: horas, jornadas y sueldos en orden.')));
}

// Marcar el mes como enviado (por empresa); se puede deshacer
function marcarEnviado(ctx, datos, mes) {
  const ok = datos.filter((d) => !d.error && !d.sinCierres && d.puede('remu', 'editar'));
  if (!ok.length) return null;
  const enviados = ok.filter((d) => d.cierre?.cerrado_at);
  const todos = enviados.length === ok.length;
  return boton(todos ? `Enviado el ${new Date(enviados[0].cierre.cerrado_at).toLocaleDateString('es-CL')}` : 'Marcar como enviado', {
    icono: 'check',
    title: todos ? 'Toca para volver a dejarlo pendiente' : 'Deja registrado que el cierre del mes se envió a quien hace las liquidaciones',
    onclick: async () => {
      const cerrado = todos ? null : new Date().toISOString();
      for (const d of ok) {
        const { error } = await ctx.api.from('remu_cierres').upsert({ empresa_id: d.empresa.id, mes, ocultos: [...d.ocultos], cerrado_at: cerrado, updated_at: new Date().toISOString() });
        if (error) { avisar(error.message, 'error'); return; }
      }
      avisar(cerrado ? 'Cierre marcado como enviado.' : 'Cierre pendiente otra vez.'); ctx.refrescar();
    },
  });
}

// Menú de columnas: cuáles van y en qué orden
function menuColumnas(prefs, alCambiar) {
  const lista = el('div', { class: 'cierre-cols-lista' });
  const pintarLista = () => {
    const orden = [...prefs.cols, ...COLUMNAS.map((c) => c.k).filter((k) => !prefs.cols.includes(k))];
    lista.replaceChildren(
      el('label', { class: 'casilla' }, el('input', { type: 'checkbox', checked: prefs.vacias, onchange: (ev) => { prefs.vacias = ev.target.checked; alCambiar(); } }), 'Ocultar columnas sin valores'),
      ...orden.map((k) => {
        const c = COLUMNAS.find((x) => x.k === k); const i = prefs.cols.indexOf(k); const va = i >= 0;
        const mover = (d) => { const j = i + d; if (j < 0 || j >= prefs.cols.length) return; const a = [...prefs.cols]; a.splice(i, 1); a.splice(j, 0, k); prefs.cols = a; alCambiar(); pintarLista(); };
        return el('div', { class: 'cierre-col' },
          el('label', { class: 'casilla' }, el('input', { type: 'checkbox', checked: va, onchange: (ev) => {
            prefs.cols = ev.target.checked ? [...prefs.cols, k] : prefs.cols.filter((x) => x !== k); alCambiar(); pintarLista(); } }), c.t),
          va ? el('span', {},
            el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Subir ${c.t}`, title: 'Más a la izquierda', disabled: i === 0, onclick: () => mover(-1) }, icono('arriba', { tam: 14 })),
            el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Bajar ${c.t}`, title: 'Más a la derecha', disabled: i === prefs.cols.length - 1, onclick: () => mover(1) }, icono('abajo', { tam: 14 }))) : null);
      }),
      el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => { prefs.cols = [...PORDEFECTO]; prefs.vacias = true; alCambiar(); pintarLista(); } }, 'Volver a las columnas de siempre'));
  };
  pintarLista();
  return el('details', { class: 'cierre-cols' }, el('summary', { class: 'boton boton-secundario' }, icono('columnas', { tam: 16 }), 'Columnas'), lista);
}

// Tabla de una sección: nombre con sus movimientos, columnas elegidas, subtotal y las personas ocultas al final
function tablaSeccion(ctx, s, cols, { mes, grupo, repintar }) {
  const d = s.d;
  const editar = d.puede('remu', 'editar') && !d.sinCierres;
  const sumar = (filas) => cols.map((c) => (c.suma ? filas.reduce((x, r) => x + (Number(c.v(r)) || 0), 0) : null));
  const ocultar = async (r, ocultar) => {
    const id = r.f.vinculo.persona_id;
    if (ocultar) d.ocultos.add(id); else d.ocultos.delete(id);
    const { error } = await ctx.api.from('remu_cierres').upsert({ empresa_id: d.empresa.id, mes, ocultos: [...d.ocultos], cerrado_at: d.cierre?.cerrado_at ?? null, updated_at: new Date().toISOString() });
    if (error) { avisar(error.message, 'error'); if (ocultar) d.ocultos.delete(id); else d.ocultos.add(id); }
    repintar();
  };
  const detalle = (r) => {
    const hash = ctx.ruta('remu.detalle', { p: r.f.vinculo.persona_id, m: mes });
    return grupo ? el('a', { href: hash, onclick: (ev) => { ev.preventDefault(); ctx.abrirEnEmpresa(d.empresa, hash); } }, el('strong', {}, nombreCompleto(r.f.persona)))
      : el('a', { href: hash }, el('strong', {}, nombreCompleto(r.f.persona)));
  };
  const nombre = (r) => el('td', {},
    el('div', { class: 'cierre-nombre' }, detalle(r),
      editar ? el('button', { type: 'button', class: 'boton-icono cierre-ojo', title: 'Sacar del cierre (no cambia sus pagos)', 'aria-label': `Sacar a ${nombreCompleto(r.f.persona)} del cierre`, onclick: () => ocultar(r, true) }, icono('ojo', { tam: 14 })) : null),
    el('div', { class: 'texto-suave texto-chico' }, [r.f.cargo?.nombre ?? r.f.vinculo.cargo, esFijo(r) && r.f.condicion?.art22 ? 'Art. 22' : null].filter(Boolean).join(' · ')),
    el('div', { class: 'remu-fijos' },
      (r.f.itemsFijos ?? []).map((it) => el('span', { class: `chip ${MOVIMIENTOS[it.clase]?.g === 'hab' ? 'chip-ok' : 'chip-pend'}`, title: it.concepto },
        `${MOVIMIENTOS[it.clase]?.t ?? it.clase} ${dinero(it.monto)}`,
        d.puede('remu', 'eliminar') ? el('button', { type: 'button', class: 'chip-quitar', 'aria-label': `Quitar ${it.clase} de ${dinero(it.monto)}`, onclick: () => quitarMovimiento(ctx, it) }, icono('cerrar', { tam: 12 })) : null)),
      d.puede('remu', 'crear') ? el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => movimiento(ctx, d, r.f, mes) }, '+ Movimiento') : null));
  const tot = sumar(s.filas);
  const clase = (c) => (c.tipo === 'texto' ? '' : 'num');
  return el('div', { class: 'remu-grupo' },
    el('h2', { class: 'remu-grupo-titulo' }, grupo ? el('i', { class: 'cierre-punto', style: `background:${d.empresa.color || 'var(--empresa)'}` }) : null, s.fijo ? el('span', { class: 'chip chip-fijo' }, s.titulo) : s.titulo,
      el('span', { class: 'texto-suave texto-chico' }, ` · ${s.filas.length} ${s.filas.length === 1 ? 'persona' : 'personas'}${s.fijo || d.mensual ? '' : ' · ya pagados cada semana'}`)),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla cierre-tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Trabajador'), cols.map((c) => el('th', { class: clase(c), title: c.nota ?? null }, c.t)))),
      el('tbody', {}, s.filas.map((r) => el('tr', { class: s.fijo ? 'fila-fijo' : '' }, nombre(r), cols.map((c) => { const v = c.v(r);
        return el('td', { class: `${clase(c)}${c.neg && v ? ' pct-mal' : ''}` }, c.fuerte ? el('strong', {}, texto(c, v)) : texto(c, v)); })))),
      el('tfoot', {}, el('tr', { class: 'remu-cal-subtotal' }, el('td', {}, el('strong', {}, 'Subtotal')),
        cols.map((c, i) => el('td', { class: clase(c) }, tot[i] == null ? '' : c.fuerte ? el('strong', {}, texto(c, tot[i])) : texto(c, tot[i]))))))),
    s.ocultas.length ? el('p', { class: 'texto-suave texto-chico cierre-ocultas' }, 'Fuera del cierre: ',
      s.ocultas.map((r, i) => [i ? ', ' : '', nombreCompleto(r.f.persona), editar ? [' ', el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => ocultar(r, false) }, 'volver a incluir')] : null])) : null);
}

// ---------------------------------------------------------------- Movimientos

const OPCIONES_MOV = Object.entries(MOVIMIENTOS).map(([k, m]) => [k, `${m.t}${m.g === 'pag' ? ' (ya pagado: se resta de A pagar)' : m.g === 'des' ? ' (se descuenta del total)' : ' (se suma al total)'}`]);

async function guardarMovimiento(ctx, empresaId, personaId, mes, v) {
  const monto = Math.round(Number(v.monto));
  if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.');
  const m = MOVIMIENTOS[v.clase];
  const { error } = await ctx.api.from('remu_items').insert({ empresa_id: empresaId, persona_id: personaId, mes, clase: v.clase, tipo: m.tipo, concepto: v.concepto.trim() || m.t, monto });
  if (error) throw new Error(error.message);
  avisar(`${m.t} agregado.`); ctx.refrescar();
}

function movimiento(ctx, d, f, mes) {
  abrirFormulario({
    titulo: `Movimiento · ${nombreCompleto(f.persona)}`,
    mensaje: `${nombreMes(mes)}${d.empresa ? ` · ${nombreEmpresa(d.empresa)}` : ''}.`,
    campos: [
      { id: 'clase', etiqueta: 'Tipo', opciones: OPCIONES_MOV },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
      { id: 'concepto', etiqueta: 'Detalle (opcional)', ayuda: 'Ej.: Anticipo del 15; Aguinaldo Fiestas Patrias.' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: (v) => guardarMovimiento(ctx, d.empresa.id, f.vinculo.persona_id, mes, v),
  });
}

// Movimiento a cualquier persona de la empresa (aunque no tenga horas este mes): así entra al cierre
function nuevoMovimiento(ctx, datos, mes) {
  const ok = datos.filter((d) => !d.error && d.puede('remu', 'crear'));
  const personas = (d) => [...d.base.vinculos].filter((v) => v.estado === 'activo' || d.filas.some((r) => r.f.vinculo.persona_id === v.persona_id))
    .sort((a, b) => nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas))).map((v) => [v.persona_id, `${nombreCompleto(v.personas)} · ${v.personas.rut}`]);
  abrirFormulario({
    titulo: 'Agregar movimiento',
    mensaje: `${nombreMes(mes)}. La persona entra al cierre aunque no tenga horas este mes. Para pagarle sueldo, configúralo en Condiciones de pago.`,
    campos: [
      ...(ok.length > 1 ? [{ id: 'empresa', etiqueta: 'Empresa', opciones: ok.map((d) => [d.empresa.id, nombreEmpresa(d.empresa)]),
        alCambiar: ({ valor, opciones }) => opciones('persona', personas(ok.find((d) => d.empresa.id === valor))) }] : []),
      { id: 'persona', etiqueta: 'Trabajador', opciones: personas(ok[0]), requerido: true },
      { id: 'clase', etiqueta: 'Tipo', opciones: OPCIONES_MOV },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
      { id: 'concepto', etiqueta: 'Detalle (opcional)' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: (v) => guardarMovimiento(ctx, v.empresa || ok[0].empresa.id, v.persona, mes, v),
  });
}

async function quitarMovimiento(ctx, it) {
  if (!confirm(`¿Quitar ${(MOVIMIENTOS[it.clase]?.t ?? it.clase).toLowerCase()} de ${dinero(it.monto)}?`)) return;
  const { error } = await ctx.api.from('remu_items').delete().eq('id', it.id);
  if (error) { avisar(error.message, 'error'); return; }
  avisar('Quitado.'); ctx.refrescar();
}

// ---------------------------------------------------------------- Excel y PDF

async function exportar(ctx, { secs, cols, mes, titulo, grupo }, formato, b) {
  b.disabled = true;
  try {
    const todas = secs.flatMap((s) => s.filas);
    const total = todas.reduce((x, r) => x + aPagar(r), 0);
    const tituloDoc = `${titulo} · ${nombreMes(mes)}`;
    const subtitulo = `${todas.length} trabajadores · a pagar ${dinero(total)}`;
    const notas = cols.filter((c) => c.nota).map((c) => c.nota);
    const nombreArchivo = `remuneraciones-${grupo ? 'grupo-' : ''}${mes}`;
    const cab = ['Trabajador', ...cols.map((c) => c.t)];
    const sumar = (filas) => cols.map((c) => (c.suma ? filas.reduce((x, r) => x + (Number(c.v(r)) || 0), 0) : null));
    if (formato === 'excel') {
      const { nuevoExcel } = await import('../../core/excel.js?v=a35d6c9');
      const x = await nuevoExcel(ctx, { titulo: tituloDoc, subtitulo });
      const valor = (c, v) => (c.tipo === 'horas' ? (v == null ? null : Math.round(v / 6) / 10) : c.neg && v ? -v : v);
      const tipo = (c) => (c.tipo === 'horas' ? 'numero' : c.tipo);
      for (const s of secs) {
        x.tabla({ titulo: s.titulo, columnas: [{ t: 'Trabajador', tipo: 'texto' }, ...cols.map((c) => ({ t: c.tipo === 'horas' ? `${c.t} (h)` : c.t, tipo: tipo(c) }))],
          filas: s.filas.map((r) => [nombreCompleto(r.f.persona), ...cols.map((c) => valor(c, c.v(r)))]),
          total: ['Subtotal', ...sumar(s.filas).map((v, i) => (v == null ? null : valor(cols[i], v)))] });
      }
      if (secs.length > 1) x.total('Total a pagar', total);
      if (notas.length) x.tabla({ columnas: ['Notas'], filas: notas.map((n) => [n]) });
      await x.guardar(nombreArchivo);
      return;
    }
    const { nuevoPdf } = await import('../../core/pdf.js?v=a35d6c9');
    const pdf = await nuevoPdf(ctx, { titulo: tituloDoc, subtitulo, horizontal: true });
    const doc = pdf.doc;
    const tam = cols.length > 16 ? 6.3 : cols.length > 12 ? 7 : 8;
    const color = (ctx.empresa.color || '#1f4e8c').match(/\w\w/g).map((h) => parseInt(h, 16));
    for (const s of secs) {
      if (pdf.y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); pdf.saltar(15 - pdf.y); }
      doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(28, 35, 48).text(`${s.titulo} · ${s.filas.length}`, 15, pdf.y);
      const tot = sumar(s.filas);
      doc.autoTable({
        startY: pdf.y + 2, head: [cab],
        body: [...s.filas.map((r) => [nombreCompleto(r.f.persona), ...cols.map((c) => texto(c, c.v(r)))]),
          ['Subtotal', ...cols.map((c, i) => (tot[i] == null ? '' : texto(c, tot[i])))]],
        margin: { left: 15, right: 15, bottom: 18 },
        styles: { font: 'helvetica', fontSize: tam, cellPadding: 1.4, textColor: [28, 35, 48], lineColor: [221, 225, 231], lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        alternateRowStyles: { fillColor: [247, 248, 250] },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i + 1, { halign: c.tipo === 'texto' ? 'left' : 'right', fontStyle: c.fuerte ? 'bold' : 'normal' }])),
        didParseCell: (h) => { if (h.section === 'body' && h.row.index === s.filas.length) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [236, 239, 244]; } },
      });
      pdf.saltar(doc.lastAutoTable.finalY + 8 - pdf.y);
    }
    if (secs.length > 1) pdf.tabla({ columnas: ['Total a pagar', 'Monto'], filas: [...secs.map((s) => [s.titulo, dinero(s.filas.reduce((x, r) => x + aPagar(r), 0))]), ['Total', dinero(total)]] });
    if (notas.length) pdf.tabla({ columnas: ['Notas'], filas: notas.map((n) => [n]) });
    if (formato === 'pdf') { pdf.guardar(nombreArchivo); return; }
    vistaPrevia(pdf.blob(), () => pdf.guardar(nombreArchivo), tituloDoc);
  } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}

function vistaPrevia(blob, descargar, titulo) {
  const url = URL.createObjectURL(blob);
  const dialogo = el('dialog', { class: 'modal cierre-previa', 'aria-label': 'Vista previa' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, `Vista previa · ${titulo}`),
      el('div', { class: 'listado-acciones' }, boton('Descargar PDF', { icono: 'descargar', tipo: 'primario', onclick: () => descargar() }),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar')))),
    el('iframe', { src: url, title: 'Vista previa del PDF' }));
  const cerrar = () => { dialogo.close(); dialogo.remove(); URL.revokeObjectURL(url); };
  dialogo.addEventListener('cancel', () => setTimeout(cerrar));
  document.body.append(dialogo); dialogo.showModal();
}
