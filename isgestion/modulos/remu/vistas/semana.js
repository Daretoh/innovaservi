// Pago semanal (lunes a domingo): totales por día y por trabajador.
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { avisar } from '../../../core/ui/aviso.js?v=b8da9fc';
import { dinero, horas, hoyISO, lunesDe, sumarDias, nombreDia, fechaCorta, numSemana } from '../../../core/ui/formato.js?v=b8da9fc';
import { cargarBase, calcularRango, nombreCompleto } from '../datos.js?v=b8da9fc';

const estado = { lunes: lunesDe(hoyISO()) };

export default async function vista(ctx) {
  if (ctx.params.s) { estado.lunes = lunesDe(ctx.params.s); history.replaceState(null, '', ctx.ruta('remu.semana')); }
  const lunes = estado.lunes;
  const domingo = sumarDias(lunes, 6);
  const base = await cargarBase(ctx);
  const R = await calcularRango(ctx, base, { desde: lunes, hasta: domingo });

  const mover = (n) => { estado.lunes = sumarDias(estado.lunes, n * 7); ctx.refrescar(); };
  const nav = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, `Semana ${numSemana(lunes)} · ${fechaCorta(lunes)} – ${fechaCorta(domingo)}`),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Semana siguiente', onclick: () => mover(1) }, icono('derecha')),
    boton('Hoy', { onclick: () => { estado.lunes = lunesDe(hoyISO()); ctx.refrescar(); } }));

  const dias = el('div', { class: 'dias-semana' }, [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const f = sumarDias(lunes, i);
    const d = R.porDia[f];
    const feriado = R.feriados.get(f);
    return el('a', { class: `dia-tarjeta dia-enlace ${f === hoyISO() ? 'hoy' : ''} ${feriado ? 'feriado' : ''}`, href: ctx.ruta('remu.dia', { f }), title: `${feriado ? `${feriado} · ` : ''}Ver el detalle del día` },
      el('span', {}, `${nombreDia(f)} ${Number(f.slice(8))}`),
      el('strong', {}, d?.monto ? dinero(d.monto) : '—'),
      el('span', { class: 'texto-suave texto-chico' }, feriado ? 'Feriado' : d?.min ? horas(d.min) : ''));
  }));

  // Faenas del trabajador en la semana (plegadas): faena, días y horas en cada una
  const faenasDe = (f) => {
    const por = new Map();
    for (const d of f.detalle) for (const x of d.faenas ?? []) { const o = por.get(x.faena) ?? []; o.push(`${nombreDia(d.fecha)} ${Number(d.fecha.slice(8))} · ${horas(x.min)}`); por.set(x.faena, o); }
    if (!por.size) return null;
    return el('details', { class: 'remu-faenas', onclick: (ev) => ev.stopPropagation() },
      el('summary', {}, `ver ${por.size} faena${por.size > 1 ? 's' : ''}`),
      [...por].map(([fa, ds]) => el('div', { class: 'remu-faenas-item' }, el('strong', {}, fa || 'Sin faena'), el('span', { class: 'texto-suave' }, ds.join(' · ')))));
  };

  const filas = R.filas.map((f) => {
    const href = ctx.ruta('remu.detalle', { p: f.vinculo.persona_id, s: lunes });
    const desc = [f.cargo?.nombre ?? f.vinculo.cargo, f.modo === 'fijo' ? `fijo${f.ventana ? ` ${f.ventana}` : f.jornadaHoras ? ` ${f.jornadaHoras} h/día` : ''}` : 'por hora']
      .filter(Boolean).join(' · ');
    const fila = el('tr', { class: `fila-enlace${f.modo === 'fijo' ? ' fila-fijo' : ''}`, title: 'Ver el detalle, ajustar días y extras' },
      el('td', {}, el('a', { href }, nombreCompleto(f.persona)), el('div', { class: 'texto-suave texto-chico' }, desc), faenasDe(f)),
      el('td', { class: 'centro' }, f.dias),
      el('td', {}, horas(f.totMin), f.modo === 'fijo' ? el('div', { class: 'texto-suave texto-chico' }, `${horas(f.pagoMin)} pagables`) : null),
      el('td', { class: 'num' }, f.vh ? dinero(f.vh) : el('span', { class: 'pct-mal', title: 'Sin trato ni valor hora' }, 'Sin valor')),
      el('td', { class: 'num' }, dinero(f.baseContable)),
      el('td', { class: 'num' }, f.montoVueltas ? dinero(f.montoVueltas) : '—'),
      el('td', { class: 'num pct-bien' }, f.extra ? dinero(f.extra) : '—'),
      el('td', { class: 'num pct-mal' }, f.descuento ? `−${dinero(f.descuento)}` : '—'),
      el('td', { class: 'num' }, el('strong', {}, dinero(f.total)),
        f.hayAjuste ? el('div', { class: 'texto-suave texto-chico', title: 'Hay días con ajuste contable' }, `real ${dinero(f.real)}`) : null),
      el('td', { class: 'acciones-fila' }, el('a', { class: 'boton boton-secundario boton-chico', href }, icono('editar', { tam: 14 }), ctx.puede('remu', 'editar') ? 'Editar' : 'Ver')));
    fila.addEventListener('click', (ev) => { if (!ev.target.closest('a, button, input')) location.hash = href; });
    return fila;
  });

  const acciones = [];
  if (ctx.puede('remu', 'exportar') && R.filas.length) {
    acciones.push(boton('PDF', { icono: 'descargar', onclick: (ev) => exportarPdf(ctx, R, lunes, domingo, ev.currentTarget) }));
  }

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Pago semanal'),
      el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande' }, dinero(R.total)), acciones)),
    base.config.periodo === 'mensual' ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Esta empresa paga mensual: el pago (con bono por autos y extras del mes) está en ', el('a', { href: ctx.ruta('remu.pagomes') }, 'Pago mensual'), '.') : null,
    nav,
    dias,
    R.diasRepetidos ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `${R.diasRepetidos} ${R.diasRepetidos === 1 ? 'día con horas que se pisan' : 'días con horas que se pisan'}: se contaron una sola vez.`) : null,
    el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Días', 'Horas', 'Valor hora', 'Base', 'Vueltas', 'Extras', 'Desc.', 'Total', '']
          .map((t, i) => el('th', { class: i >= 3 ? 'num' : i === 1 ? 'centro' : '' }, t)))),
        el('tbody', {}, filas.length ? filas
          : el('tr', {}, el('td', { colspan: 10, class: 'tabla-vacia' }, 'Sin horas ni pagos esta semana. Las horas se cargan en Asistencia → Registro de horas.'))))),
    el('p', { class: 'texto-suave texto-chico' }, 'Fijos: solo se pagan las horas fuera de su turno o sobre su jornada; fines de semana y feriados se pagan completos. Haz clic en una fila (o en Editar) para ver el detalle, ajustar días y agregar o editar extras y descuentos.'),
  );
}

async function exportarPdf(ctx, R, lunes, domingo, b) {
  b.disabled = true;
  try {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=b8da9fc');
    const pdf = await nuevoPdf(ctx, { titulo: `Pago semanal · semana ${numSemana(lunes)}`, subtitulo: `${fechaCorta(lunes)} al ${fechaCorta(domingo)} · total ${dinero(R.total)}`, horizontal: true });
    pdf.tabla({
      columnas: ['Trabajador', 'RUT', 'Modo', 'Días', 'Horas', 'Base', 'Vueltas', 'Extras', 'Descuentos', 'Total'],
      filas: [...R.filas.map((f) => [nombreCompleto(f.persona), f.persona.rut, f.modo === 'fijo' ? 'Fijo' : 'Por hora', f.dias, horas(f.totMin),
        dinero(f.baseContable), dinero(f.montoVueltas), dinero(f.extra), dinero(f.descuento), dinero(f.total)]),
      ['Total', '', '', '', '', '', '', '', '', dinero(R.total)]],
    });
    pdf.guardar(`pago-semana-${lunes}`);
  } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}
