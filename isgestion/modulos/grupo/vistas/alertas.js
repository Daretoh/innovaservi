// Grupo → Alertas y pendientes: lo que requiere atención en cada empresa (las alertas de todos sus módulos, las mismas del
// Inicio de cada empresa) y el cierre de remuneraciones del mes anterior si aún no se marcó como enviado.
// Cada alerta abre su pantalla en la empresa que corresponde.
import { el } from '../../../core/ui/dom.js?v=b159e43';
import { icono } from '../../../core/ui/iconos.js?v=b159e43';
import { boton } from '../../../core/ui/tabla.js?v=b159e43';
import { hoyISO, moverMes, nombreMes } from '../../../core/ui/formato.js?v=b159e43';
import { cargarAlertas } from '../../gerencia/alertas.js?v=b159e43';
import { ctxDe, marcaEmpresa, enlaceEmpresa } from '../empresas.js?v=b159e43';

// Fila de alerta que abre su pantalla en la empresa
const fila = (...x) => { const a = enlaceEmpresa(...x); a.className = 'doc-fila ger-alerta'; return a; };

export default async function vista(ctx) {
  const anterior = moverMes(hoyISO().slice(0, 7), -1);
  const datos = await Promise.all((ctx.grupo ?? []).map(async (g) => {
    const ctxE = ctxDe(ctx, g);
    const conRemu = g.modulos.has('remu') && g.puede('remu', 'ver');
    const [alertas, cierre] = await Promise.all([
      cargarAlertas(ctxE).catch(() => []),
      conRemu ? ctx.api.from('remu_cierres').select('cerrado_at').eq('empresa_id', g.empresa.id).eq('mes', anterior).maybeSingle() : null,
    ]);
    // Sin la tabla (migración Remuneraciones 007 pendiente) no se avisa
    const remuPendiente = conRemu && cierre && !cierre.error && !cierre.data?.cerrado_at;
    return { g, alertas, remuPendiente, sinDato: conRemu && !!cierre?.error };
  }));

  const venc = datos.reduce((s, d) => s + d.alertas.filter((a) => a.nivel === 'venc').length, 0);
  const prox = datos.reduce((s, d) => s + d.alertas.filter((a) => a.nivel !== 'venc').length, 0);
  const cierres = datos.filter((d) => d.remuPendiente);
  const sinDato = datos.some((d) => d.sinDato);
  const tarjeta = (t, v, nota, clase = '') => el('div', { class: `ficha fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Alertas y pendientes'), el('p', { class: 'texto-suave' }, 'Lo que requiere atención en las empresas del grupo.'))),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Vencidos', venc, 'tipos de alerta con algo vencido', venc ? 'fin-alerta' : 'fin-bien'),
      tarjeta('Por vencer o pendientes', prox),
      tarjeta(`Cierre de remuneraciones · ${nombreMes(anterior)}`, cierres.length ? 'Pendiente' : sinDato ? '—' : 'Enviado', cierres.length ? cierres.map((d) => d.g.empresa.nombre_fantasia || d.g.empresa.razon_social).join(', ') : sinDato ? 'falta la migración Remuneraciones 007' : 'marcado como enviado', cierres.length ? 'fin-alerta' : sinDato ? '' : 'fin-bien')),
    cierres.length && ctx.hayVista('grupo.remu') ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `El cierre de remuneraciones de ${nombreMes(anterior)} no está marcado como enviado. `, el('a', { href: ctx.ruta('grupo.remu') }, 'Ir al cierre')) : null,
    el('div', { class: 'grupo-empresas' }, datos.map((d) => el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, marcaEmpresa(d.g.empresa)),
        boton('Entrar', { icono: 'derecha', onclick: () => ctx.abrirEnEmpresa(d.g.empresa, '#/') })),
      d.alertas.length ? d.alertas.map((a) => fila(ctx, d.g.empresa, a.ruta,
        el('span', { class: `chip ${a.nivel === 'venc' ? 'chip-venc' : 'chip-prox'}` }, String(a.cantidad)),
        el('div', { class: 'doc-nombre' }, el('strong', {}, a.modulo), el('span', { class: 'texto-suave' }, a.texto)),
        icono('derecha', { tam: 16 })))
        : el('p', { class: 'texto-suave' }, icono('check', { tam: 14 }), ' Todo al día en los módulos que puedes ver.')))));
}
