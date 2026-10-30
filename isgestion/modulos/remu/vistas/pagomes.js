// Pago mensual (IS Performance): calendario del mes, bono por autos y pago por trabajador
// (sueldo base de los fijos, horas, vueltas, bono por autos, extras y descuentos del mes, aguinaldo y anticipo de los
// fijos, que se agregan en Resumen mensual → Para remuneraciones). Total = a pagar (el anticipo ya se pagó).
import { el } from '../../../core/ui/dom.js?v=ca87e0a';
import { icono } from '../../../core/ui/iconos.js?v=ca87e0a';
import { boton } from '../../../core/ui/tabla.js?v=ca87e0a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=ca87e0a';
import { avisar } from '../../../core/ui/aviso.js?v=ca87e0a';
import { dinero, horas, hoyISO, rangoMes, moverMes, nombreMes, sumarDias, diaSemana, fechaLarga } from '../../../core/ui/formato.js?v=ca87e0a';
import { cargarBase, resumenMes, nombreCompleto } from '../datos.js?v=ca87e0a';
import { tablaGrupo, exportarGrupos } from '../grupos.js?v=ca87e0a';

const estado = { mes: hoyISO().slice(0, 7) };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default async function vista(ctx) {
  const mes = estado.mes;
  const base = await cargarBase(ctx);
  const P = await resumenMes(ctx, base, mes);
  const aPagar = P.filas.reduce((s, f) => s + f.aPagar, 0);
  const { R } = P;
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };

  // Calendario del mes (lunes a domingo)
  const { desde, hasta } = rangoMes(mes);
  const celdas = DIAS.map((d) => el('div', { class: 'cal-mes-cab' }, d));
  for (let i = 0; i < diaSemana(desde); i++) celdas.push(el('div'));
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const d = R.porDia[f];
    const feriado = R.feriados.get(f);
    celdas.push(el('div', { class: `dia-tarjeta ${f === hoyISO() ? 'hoy' : ''} ${feriado ? 'feriado' : ''} ${d?.min ? '' : 'cero'}`, title: feriado ?? '' },
      el('span', {}, String(Number(f.slice(8)))),
      el('strong', {}, d?.monto ? dinero(d.monto) : '—'),
      el('span', { class: 'texto-suave texto-chico' }, feriado ? 'Feriado' : d?.min ? horas(d.min) : '')));
  }

  const verAutos = () => abrirFormulario({
    titulo: `Autos de ${nombreMes(mes)} (${P.autos.length})`,
    mensaje: P.autos.length ? null : 'Sin autos en proceso, terminados o entregados con ingreso en el mes.',
    campos: [], textoGuardar: 'Cerrar', alGuardar: async () => {},
  });
  const abrirAutos = () => {
    verAutos();
    const lista = el('div', { class: 'cie-historial' }, P.autos.map((a) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, [a.vehiculo, a.patente].filter(Boolean).join(' · ') || `Orden N° ${a.numero}`),
        el('span', { class: 'texto-suave texto-chico' }, [`N° ${a.numero}`, a.cliente, fechaLarga(a.fecha)].filter(Boolean).join(' · '))))));
    document.querySelector('dialog.modal:last-of-type .modal-cuerpo')?.prepend(lista);
  };

  const fijos = P.filas.filter((f) => f.modo === 'fijo'); const spot = P.filas.filter((f) => f.modo !== 'fijo');
  const G = grupos(ctx, mes, fijos, spot);
  const alFila = (tr, f) => {
    const href = ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, m: mes });
    tr.classList.add('fila-enlace'); tr.title = 'Ver el detalle, ajustar días y extras';
    tr.addEventListener('click', (ev) => { if (!ev.target.closest('a, button, input')) location.hash = href; });
  };

  const acciones = [];
  if (ctx.puede('remu', 'exportar') && P.filas.length) {
    const exp = (formato) => async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        await exportarGrupos(ctx, { formato, titulo: `Pago mensual · ${nombreMes(mes)}`, nombre: `pago-mensual-${mes}`, grupos: G, total: aPagar,
          subtitulo: `A pagar ${dinero(aPagar)} · costo del mes ${dinero(P.total)}${P.valorAuto ? ` · bono por autos ${P.autos.length} × ${dinero(P.valorAuto)}${P.tope ? ` (tope ${dinero(P.tope)})` : ''}` : ''}` });
      } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
    };
    acciones.push(boton('Excel', { icono: 'descargar', onclick: exp('excel') }));
    acciones.push(boton('PDF', { icono: 'descargar', onclick: exp('pdf') }));
  }
  const nAutos = P.autos.length;
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Pago mensual'),
      el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande', title: `Costo del mes ${dinero(P.total)}` }, dinero(aPagar)), acciones)),
    base.config.periodo !== 'mensual' ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      'Esta empresa paga semanal: usa "Pago semanal" y "Resumen mensual". Puedes cambiarlo en Parámetros y feriados.') : null,
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, nombreMes(mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Este mes', { onclick: () => { estado.mes = hoyISO().slice(0, 7); ctx.refrescar(); } })),
    P.valorAuto ? el('div', { class: 'aviso-bandeja remu-bono' },
      icono('camion', { tam: 16 }),
      el('span', {}, 'Bono por autos: ', el('strong', {}, `${nAutos} ${nAutos === 1 ? 'auto' : 'autos'}`), ` × ${dinero(P.valorAuto)} = `,
        el('strong', {}, dinero(P.tope ? Math.min(nAutos * P.valorAuto, P.tope) : nAutos * P.valorAuto)),
        P.tope ? ` (tope ${dinero(P.tope)})` : '', ' por persona que trabajó en el mes'),
      boton('Ver autos', { onclick: abrirAutos })) : null,
    el('div', { class: 'cal-mes' }, celdas),
    P.filas.length ? G.filter((g) => g.filas.length).map((g) => tablaGrupo({ ...g, alFila })) : el('p', { class: 'tabla-vacia' }, 'Sin actividad este mes.'),
    R.diasRepetidos ? el('p', { class: 'texto-suave texto-chico' }, `${R.diasRepetidos} ${R.diasRepetidos === 1 ? 'día con registros que se pisan' : 'días con registros que se pisan'}: el tiempo repetido se cuenta una vez.`) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Horas desde Registro de horas (incluye las del marcaje en tablet). Fijos: sueldo base desde que rige y solo lo que excede la jornada; antes de "fijo desde" se pagan por hora. Extras y descuentos del mes en el detalle de cada persona.'));
}

// Columnas de cada grupo: los fijos con sueldo y horas trato (lo que excede su jornada), aguinaldo y anticipo;
// los spot con horas y valor hora.
function grupos(ctx, mes, fijos, spot) {
  const nombre = { t: 'Trabajador', v: (f) => nombreCompleto(f.persona), celda: (f) => [
    el('a', { href: ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, m: mes }) }, nombreCompleto(f.persona)),
    el('div', { class: 'texto-suave texto-chico' }, [f.persona.rut, f.cargo?.nombre ?? f.vinculo.cargo, f.modo === 'fijo' && (f.jornadaHoras ? `${f.jornadaHoras} h/día` : f.ventana)].filter(Boolean).join(' · '))] };
  const rut = { t: 'RUT', v: (f) => f.persona.rut };
  const dias = { t: 'Días', tipo: 'numero', v: (f) => f.dias, suma: true };
  const comunes = [
    { t: 'Vueltas', tipo: 'dinero', v: (f) => f.montoVueltas, suma: true },
    { t: 'Bono autos', tipo: 'dinero', v: (f) => (f.sinBono ? 0 : f.bonoAutos), suma: true, celda: (f) => (f.sinBono ? el('span', { class: 'texto-suave texto-chico' }, 'excluido') : f.bonoAutos ? dinero(f.bonoAutos) : '—') },
    { t: 'Extras', tipo: 'dinero', v: (f) => f.extra, suma: true },
    { t: 'Desc.', tipo: 'dinero', v: (f) => f.descuento, suma: true, neg: true },
  ];
  const aPagar = { t: 'A pagar', tipo: 'dinero', v: (f) => f.aPagar, suma: true, fuerte: true };
  return [
    { titulo: 'Fijos', filas: fijos, cols: [nombre, rut, dias,
      { t: 'Sueldo base', tipo: 'dinero', v: (f) => f.sueldo, suma: true },
      { t: 'Horas trato', tipo: 'horas', v: (f) => f.pagoMin, suma: true },
      { t: 'Pago trato', tipo: 'dinero', v: (f) => f.baseContable, suma: true },
      ...comunes,
      { t: 'Aguinaldo', tipo: 'dinero', v: (f) => f.aguinaldo, suma: true },
      { t: 'Anticipo', tipo: 'dinero', v: (f) => f.anticipo, suma: true, neg: true },
      aPagar].map(sinRutEnPantalla) },
    { titulo: 'Por hora (spot)', filas: spot, cols: [nombre, rut, dias,
      { t: 'Horas', tipo: 'horas', v: (f) => f.totMin, suma: true },
      { t: 'Valor h', tipo: 'dinero', v: (f) => f.vh, celda: (f) => (f.vh ? dinero(f.vh) : el('span', { class: 'pct-mal' }, 'Sin valor')) },
      { t: 'Pago horas', tipo: 'dinero', v: (f) => f.baseContable, suma: true },
      ...comunes, aPagar].map(sinRutEnPantalla) },
  ];
}
// El RUT va en el Excel y el PDF; en pantalla ya se ve bajo el nombre
const sinRutEnPantalla = (c) => (c.t === 'RUT' ? { ...c, soloExport: true } : c);
