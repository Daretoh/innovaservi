// Panel de gerencia de la empresa: indicadores del mes (con el mes anterior), tendencia de 6 meses,
// por cobrar y por pagar, taller (autos, ticket, servicios más vendidos) y alertas de todos los módulos.
import { el } from '../../../core/ui/dom.js?v=08113ef';
import { icono } from '../../../core/ui/iconos.js?v=08113ef';
import { boton } from '../../../core/ui/tabla.js?v=08113ef';
import { dinero, hoyISO, nombreMes, moverMes, rangoMes } from '../../../core/ui/formato.js?v=08113ef';
import { mesesEntre, cargarEstado, sumarTotales, puntoEquilibrio, pct } from '../../resultados/datos.js?v=08113ef';
import { cargarAlertas } from '../alertas.js?v=08113ef';

const estado = { mes: hoyISO().slice(0, 7) };
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const compacto = (n) => { const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace('.', ',')} M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} k` : `${s}${a}`; };

export default async function vista(ctx) {
  const mes = estado.mes;
  const anterior = moverMes(mes, -1);
  const meses = mesesEntre(moverMes(mes, -5), mes);
  const conResultados = ctx.puede('resultados', 'ver');
  const [est, pend, alertas, servicios, ordenes] = await Promise.all([
    conResultados ? cargarEstado(ctx, meses) : Promise.resolve(null),
    conResultados ? ctx.api.rpc('res_pendientes', { p_empresa: ctx.empresa.id }) : Promise.resolve({ data: [] }),
    cargarAlertas(ctx),
    ctx.puede('taller', 'ver') ? ctx.api.rpc('ger_servicios_mes', { p_empresa: ctx.empresa.id, p_mes: mes }) : Promise.resolve({ data: null }),
    ctx.puede('resultados', 'ver') && ctx.puede('taller', 'ver') ? ctx.api.rpc('res_ordenes', { p_empresa: ctx.empresa.id, p_desde: rangoMes(mes).desde, p_hasta: rangoMes(mes).hasta }) : Promise.resolve({ data: null }),
  ]);
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };

  const secciones = [];
  if (est) {
    const t = sumarTotales(est, [mes]);
    const ta = sumarTotales(est, [anterior]);
    const pe = puntoEquilibrio(t);
    const variacion = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}% vs ${MES_CORTO[Number(anterior.slice(5, 7)) - 1]}` : 'sin mes anterior');
    const cobrar = (pend.data ?? []).filter((x) => x.lado === 'cobrar').reduce((s, x) => s + Number(x.monto), 0);
    const pagar = (pend.data ?? []).filter((x) => x.lado === 'pagar').reduce((s, x) => s + Number(x.monto), 0);
    const tarjeta = (titulo, valor, nota, clase = '', href = null) => el(href ? 'a' : 'div', { class: `ficha doc-grupo fin-tarjeta ger-tarjeta ${clase}`, href },
      el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
    secciones.push(el('div', { class: 'fin-tarjetas' },
      tarjeta('Ingresos (neto)', dinero(t.ingresos), variacion(t.ingresos, ta.ingresos), '', ctx.ruta('resultados.estado')),
      tarjeta('Margen bruto', pct(t.margen, t.ingresos), dinero(t.margen)),
      tarjeta('Resultado', dinero(t.resultado), `${pct(t.resultado, t.ingresos)} · ${variacion(t.resultado, ta.resultado)}`, t.resultado < 0 ? 'fin-alerta' : 'fin-bien'),
      tarjeta('Punto de equilibrio', pe ? dinero(pe) : '—', pe ? `${pct(t.ingresos, pe)} alcanzado` : 'sin margen positivo'),
      tarjeta('Por cobrar', dinero(cobrar), 'total con IVA', '', ctx.ruta('resultados.pendientes')),
      tarjeta('Por pagar', dinero(pagar), 'total con IVA', pagar > cobrar ? 'fin-alerta' : '', ctx.ruta('resultados.pendientes'))));
    if (est.avisoPersonal) secciones.push(el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), est.avisoPersonal));

    // Tendencia 6 meses
    const datos = meses.map((m) => { const x = est.totales.get(m); return { m, ing: x.ingresos, egr: x.costo + x.gastos + x.personal, res: x.resultado }; });
    const max = Math.max(1, ...datos.flatMap((d) => [d.ing, d.egr]));
    secciones.push(el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Últimos 6 meses'), el('a', { href: ctx.ruta('resultados.estado') }, 'Estado de resultados')),
      el('div', { class: 'res-tendencia' }, datos.map((d) => el('div', { class: `res-col${d.m === mes ? ' res-col-actual' : ''}` },
        el('span', { class: `texto-chico ${d.res < 0 ? 'pct-mal' : 'pct-bien'}` }, compacto(d.res)),
        el('div', { class: 'res-barras' },
          el('span', { class: 'res-barra res-ing', style: `height:${Math.round((d.ing / max) * 100)}%`, title: `Ingresos ${dinero(d.ing)}` }),
          el('span', { class: 'res-barra res-egr', style: `height:${Math.round((d.egr / max) * 100)}%`, title: `Costos, gastos y personal ${dinero(d.egr)}` })),
        el('span', { class: 'texto-chico' }, `${MES_CORTO[Number(d.m.slice(5, 7)) - 1]} ${d.m.slice(2, 4)}`)))),
      el('p', { class: 'texto-suave texto-chico' }, el('span', { class: 'res-leyenda res-ing' }), ' Ingresos   ', el('span', { class: 'res-leyenda res-egr' }), ' Costos, gastos y personal   · resultado arriba')));
  } else {
    secciones.push(el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Para ver ingresos y resultado, activa el módulo Estado de resultados y dale permiso a tu rol.'));
  }

  // Taller: autos, ticket promedio y servicios más vendidos
  if (servicios.data) {
    const ords = ordenes.data ?? [];
    const ingreso = ords.reduce((s, o) => s + Number(o.ingreso), 0);
    const util = ords.reduce((s, o) => s + Number(o.ingreso) - Number(o.insumos) - Number(o.gastos), 0);
    const maxC = Math.max(1, ...servicios.data.map((s) => Number(s.cantidad)));
    secciones.push(el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Taller del mes'), el('a', { href: ctx.ruta('resultados.ordenes') }, 'Utilidad por orden')),
      el('div', { class: 'fin-tarjetas' },
        el('div', { class: 'fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Órdenes cobradas'), el('strong', {}, String(ords.length))),
        el('div', { class: 'fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Ticket promedio (neto)'), el('strong', {}, ords.length ? dinero(Math.round(ingreso / ords.length)) : '—')),
        el('div', { class: 'fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Utilidad directa'), el('strong', {}, dinero(util)), el('span', { class: 'texto-suave texto-chico' }, pct(util, ingreso)))),
      el('h3', {}, 'Servicios más vendidos'),
      servicios.data.length ? servicios.data.map((s) => el('div', { class: 'ger-barra-fila' },
        el('span', {}, s.nombre), el('span', { class: 'ger-barra' }, el('i', { style: `width:${Math.round((Number(s.cantidad) / maxC) * 100)}%` })), el('strong', {}, String(s.cantidad))))
        : el('p', { class: 'texto-suave' }, 'Sin servicios en el mes.')));
  }

  // Alertas
  secciones.push(el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, `Requiere atención (${alertas.length})`),
    alertas.length ? alertas.map((a) => el('a', { class: 'doc-fila ger-alerta', href: a.ruta },
      el('span', { class: `chip ${a.nivel === 'venc' ? 'chip-venc' : 'chip-prox'}` }, String(a.cantidad)),
      el('div', { class: 'doc-nombre' }, el('strong', {}, a.modulo), el('span', { class: 'texto-suave' }, a.texto)),
      icono('derecha', { tam: 16 })))
      : el('p', { class: 'texto-suave' }, icono('check', { tam: 14 }), ' Todo al día en los módulos que puedes ver.')));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Panel de gerencia'),
      el('div', { class: 'listado-acciones' },
        el('div', { class: 'nav-periodo' },
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
          el('strong', {}, nombreMes(mes)),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha'))),
        ctx.puede('gerencia', 'ver') ? boton('Vista Grupo', { icono: 'building', onclick: () => { location.hash = ctx.ruta('gerencia.grupo'); } }) : null)),
    secciones);
}
