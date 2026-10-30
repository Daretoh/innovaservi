// Resumen mensual "para remuneraciones" (datos.resumenMes): lo que se envía a quien hace las liquidaciones, en dos
// tablas, Fijos y Spot. Por trabajador: sueldo, horas trato, tratos, vueltas, bonos y extras, aguinaldo, descuentos,
// anticipo y a pagar. En spot, los días son los EQUIVALENTES (tratos ÷ valor del día de trato) para cuadrar la
// liquidación (notas de Enzo, 2026-10-21); no cambia ningún pago. Aguinaldo y anticipo se agregan aquí, solo a fijos.
// El calendario de días y horas está en Asistencia (Registro de horas), no aquí (Enzo, 2026-10-22).
// Extras y descuentos: una semana cuenta en el mes que contiene su jueves (mismo criterio de InnovaGestión).
import { el } from '../../../core/ui/dom.js?v=605af68';
import { icono } from '../../../core/ui/iconos.js?v=605af68';
import { boton } from '../../../core/ui/tabla.js?v=605af68';
import { avisar } from '../../../core/ui/aviso.js?v=605af68';
import { dinero, hoyISO, moverMes, nombreMes } from '../../../core/ui/formato.js?v=605af68';
import { abrirFormulario } from '../../../core/ui/modal.js?v=605af68';
import { cargarBase, resumenMes, nombreCompleto } from '../datos.js?v=605af68';
import { tablaGrupo, exportarGrupos } from '../grupos.js?v=605af68';

const estado = { mes: hoyISO().slice(0, 7), ver: 'todos' };

export default async function vista(ctx) {
  const mes = estado.mes;
  const base = await cargarBase(ctx);
  const RM = await resumenMes(ctx, base, mes);
  const horasTrato = Number(base.config.horas_trato) || 8;
  const todas = RM.filas.map((f) => ({ ...f, diasEq: f.modo !== 'fijo' && f.vh ? f.baseContable / (f.vh * horasTrato) : null }));
  const suma = (L) => L.reduce((s, f) => ({
    n: s.n + 1, dias: s.dias + f.dias, min: s.min + f.totMin, tratos: s.tratos + f.baseContable, sueldo: s.sueldo + f.sueldo,
    vueltas: s.vueltas + f.montoVueltas, extra: s.extra + f.extra, desc: s.desc + f.descuento, total: s.total + f.totalMes,
    bono: s.bono + (f.bonoAutos || 0), ag: s.ag + f.aguinaldo, an: s.an + f.anticipo, pagar: s.pagar + f.aPagar, diasEq: s.diasEq + (f.diasEq ?? 0),
  }), { n: 0, dias: 0, min: 0, tratos: 0, sueldo: 0, vueltas: 0, extra: 0, desc: 0, total: 0, bono: 0, ag: 0, an: 0, pagar: 0, diasEq: 0 });
  const spot = todas.filter((f) => f.modo !== 'fijo'); const fijos = todas.filter((f) => f.modo === 'fijo');
  const sinJornada = fijos.filter((f) => !f.ventana && !f.jornadaHoras);
  const filas = estado.ver === 'spot' ? spot : estado.ver === 'fijos' ? fijos : todas;   // para exportar lo que se ve

  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [];
  if (ctx.puede('remu', 'exportar') && filas.length) {
    const exp = (formato) => async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const G = columnasGrupos(ctx, mes).map((g) => ({ ...g, filas: g.k === 'fijos' ? fijos : spot }))
          .filter((g) => g.filas.length && (estado.ver === 'todos' || estado.ver === g.k));
        const T = suma(filas);
        await exportarGrupos(ctx, { formato, titulo: `Remuneraciones · ${nombreMes(mes)}`, subtitulo: `${T.n} trabajadores · a pagar ${dinero(T.pagar)}`,
          nombre: `remuneraciones-${mes}`, grupos: G, total: G.length > 1 ? T.pagar : null, notas: NOTAS });
      } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
    };
    acciones.push(boton('Excel', { icono: 'descargar', onclick: exp('excel') }));
    acciones.push(boton('PDF para remuneraciones', { icono: 'descargar', tipo: 'primario', onclick: exp('pdf') }));
  }
  return vistaRemuneraciones(ctx, { mes, spot, fijos, filas, suma, acciones, mover, sinJornada });
}

// ---------------------------------------------------------------- Vista "Para remuneraciones"

const NOTAS = [
  'Fijos: sueldo base mensual más los tratos (lo que excede su jornada: fines de semana, feriados y horas fuera de turno).',
  'Días (spot): tratos del mes ÷ valor del día de trato: días equivalentes para la liquidación (no cambia ningún pago).',
  'Bonos y extras incluye el bono por autos. El anticipo ya se pagó: se resta de "A pagar".',
];

// Columnas de cada grupo (pantalla, Excel y PDF)
function columnasGrupos(ctx, mes, extra = {}) {
  const nombre = { t: 'Trabajador', v: (f) => nombreCompleto(f.persona), celda: extra.nombre ?? ((f) => nombreCompleto(f.persona)) };
  const rut = { t: 'RUT', v: (f) => f.persona.rut, soloExport: true };
  const tratos = { t: 'Tratos', tipo: 'dinero', v: (f) => f.baseContable, suma: true };
  const vueltas = { t: 'Vueltas', tipo: 'dinero', v: (f) => f.montoVueltas, suma: true };
  const bonos = { t: 'Bonos y extras', tipo: 'dinero', v: (f) => f.extra + (f.bonoAutos || 0), suma: true };
  const desc = { t: 'Descuentos', tipo: 'dinero', v: (f) => f.descuento, suma: true, neg: true };
  const pagar = { t: 'A pagar', tipo: 'dinero', v: (f) => f.aPagar, suma: true, fuerte: true };
  return [
    { k: 'fijos', titulo: 'Fijos', cols: [nombre, rut,
      { t: 'Sueldo base', tipo: 'dinero', v: (f) => f.sueldo, suma: true },
      { t: 'Horas trato', tipo: 'horas', v: (f) => f.pagoMin, suma: true },
      tratos, vueltas, bonos,
      { t: 'Aguinaldo', tipo: 'dinero', v: (f) => f.aguinaldo, suma: true },
      desc,
      { t: 'Anticipo', tipo: 'dinero', v: (f) => f.anticipo, suma: true, neg: true },
      pagar] },
    { k: 'spot', titulo: 'Spot (por trato)', cols: [nombre, rut,
      { t: 'Días', tipo: 'numero', v: (f) => f.diasEq ?? f.dias, suma: true },
      tratos, vueltas, bonos, desc, pagar] },
  ];
}

function vistaRemuneraciones(ctx, { mes, spot, fijos, filas, suma, acciones, mover, sinJornada }) {
  const puedeFijos = ctx.puede('remu', 'crear');
  const nombre = (f) => [
    el('a', { href: ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, m: mes }) }, el('strong', {}, nombreCompleto(f.persona))),
    el('div', { class: 'texto-suave texto-chico' }, [f.persona.rut, f.cargo?.nombre ?? f.vinculo.cargo].filter(Boolean).join(' · ')),
    f.modo === 'fijo' ? el('div', { class: 'remu-fijos' },
      f.itemsFijos.map((it) => el('span', { class: `chip ${it.clase === 'aguinaldo' ? 'chip-ok' : 'chip-pend'}`, title: it.concepto },
        `${it.clase === 'aguinaldo' ? 'Aguinaldo' : 'Anticipo'} ${dinero(it.monto)}`,
        ctx.puede('remu', 'eliminar') ? el('button', { type: 'button', class: 'chip-quitar', 'aria-label': `Quitar ${it.clase} de ${dinero(it.monto)}`, onclick: () => quitarFijo(ctx, it) }, icono('cerrar', { tam: 12 })) : null)),
      puedeFijos ? el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => agregarFijo(ctx, f, mes) }, '+ Aguinaldo o anticipo') : null) : null,
  ];
  const G = columnasGrupos(ctx, mes, { nombre }).map((g) => ({ ...g, filas: g.k === 'fijos' ? fijos : spot }))
    .filter((g) => g.filas.length && (estado.ver === 'todos' || estado.ver === g.k));
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['todos', 'Todos'], ['spot', 'Spot'], ['fijos', 'Fijos']].map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, t)));
  const T = suma(filas);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Resumen mensual'), el('p', { class: 'texto-suave' }, 'Para enviar a quien hace las remuneraciones.')),
      el('div', { class: 'listado-acciones' }, segmento, acciones)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, nombreMes(mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Este mes', { onclick: () => { estado.mes = hoyISO().slice(0, 7); ctx.refrescar(); } })),
    el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'A pagar'), el('strong', { class: 'total-grande' }, dinero(T.pagar)),
        el('span', { class: 'texto-suave texto-chico' }, `${T.n} trabajador${T.n === 1 ? '' : 'es'}${T.an ? ` · anticipos ${dinero(T.an)} ya pagados` : ''}`)),
      ...G.map((g) => { const x = suma(g.filas); return el('div', { class: 'ficha fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, g.titulo), el('strong', { class: 'total-grande' }, dinero(x.pagar)),
        el('span', { class: 'texto-suave texto-chico' }, `${x.n} persona${x.n === 1 ? '' : 's'}`)); })),
    sinJornada.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `${sinJornada.length === 1 ? 'Un fijo no tiene' : `${sinJornada.length} fijos no tienen`} jornada configurada (${sinJornada.map((f) => nombreCompleto(f.persona)).join(', ')}): todas sus horas se pagan como trato. Configúrala en Condiciones de pago.`) : null,
    G.length ? G.map((g) => tablaGrupo(g)) : el('p', { class: 'tabla-vacia' }, 'Sin actividad este mes.'),
    el('p', { class: 'texto-suave texto-chico' }, NOTAS.join(' ')));
}

function agregarFijo(ctx, f, mes) {
  abrirFormulario({
    titulo: `Aguinaldo o anticipo · ${nombreCompleto(f.persona)}`,
    mensaje: `${nombreMes(mes)}. Solo para personal fijo.`,
    campos: [
      { id: 'clase', etiqueta: 'Tipo', opciones: [['aguinaldo', 'Aguinaldo (se suma al pago)'], ['anticipo', 'Anticipo (ya pagado: se resta de lo que queda por pagar)']] },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
      { id: 'concepto', etiqueta: 'Detalle (opcional)', ayuda: 'Ej.: Aguinaldo Fiestas Patrias; Anticipo del 15.' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero.');
      const { error } = await ctx.api.from('remu_items').insert({
        empresa_id: ctx.empresa.id, persona_id: f.vinculo.persona_id, mes, clase: v.clase, tipo: v.clase === 'aguinaldo' ? 'extra' : 'descuento',
        concepto: v.concepto.trim() || (v.clase === 'aguinaldo' ? 'Aguinaldo' : 'Anticipo'), monto,
      });
      if (error) throw new Error(error.message);
      avisar(v.clase === 'aguinaldo' ? 'Aguinaldo agregado.' : 'Anticipo agregado.');
      ctx.refrescar();
    },
  });
}

async function quitarFijo(ctx, it) {
  if (!confirm(`¿Quitar ${it.clase === 'aguinaldo' ? 'el aguinaldo' : 'el anticipo'} de ${dinero(it.monto)}?`)) return;
  const { error } = await ctx.api.from('remu_items').delete().eq('id', it.id);
  if (error) { avisar(error.message, 'error'); return; }
  avisar('Quitado.'); ctx.refrescar();
}
