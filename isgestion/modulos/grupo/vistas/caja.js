// Grupo → Caja del grupo (2026-11-24, pedido de Enzo: Flujo de caja y Balance salen de Costos y se leen sin saber de
// finanzas). Por empresa y en total, tres respuestas con semáforo:
// 1. ¿Cuánto tenemos hoy? (bancos y caja, con el aviso de saldos sin anotar)
// 2. ¿Cuánto nos deben y cuánto debemos?
// 3. ¿Nos alcanza las próximas 8 semanas? (la semana más justa)
// El detalle va plegado y cada empresa abre su Flujo de caja y su Balance (donde se anotan saldos y deudas).
// Cada empresa se calcula con sus permisos (costos.aprobar); los números salen de modulos/costos/tesoreria.js.
import { el } from '../../../core/ui/dom.js?v=1d279d8';
import { icono } from '../../../core/ui/iconos.js?v=1d279d8';
import { dinero, fechaCorta } from '../../../core/ui/formato.js?v=1d279d8';
import { empresasCon, ctxDe, marcaEmpresa, enlaceEmpresa } from '../empresas.js?v=1d279d8';
import { calcularFlujo, calcularBalance } from '../../costos/tesoreria.js?v=1d279d8';

const SEMANAS = 8;

export default async function vista(ctx) {
  const visibles = empresasCon(ctx, 'costos', 'aprobar');
  const datos = await Promise.all(visibles.map(async (g) => {
    const c = ctxDe(ctx, g);
    try {
      const [f, b] = await Promise.all([calcularFlujo(c, SEMANAS), calcularBalance(c)]);
      return { e: g.empresa, f, b };
    } catch (err) { return { e: g.empresa, error: err.message }; }
  }));
  const ok = datos.filter((d) => !d.error);

  const total = {
    hoy: ok.reduce((s, d) => s + d.f.saldoHoy, 0),
    sinCuentas: ok.every((d) => !d.f.caja.length),
    cobrar: ok.reduce((s, d) => s + d.b.porCobrar, 0),
    debemos: ok.reduce((s, d) => s + d.b.pasivos, 0),
    sinSaldo: ok.flatMap((d) => d.f.sinSaldo.map((c) => `${c.nombre} (${d.e.nombre_fantasia || d.e.razon_social})`)),
    // Semana más justa del grupo: se suman los saldos de cada semana
    semanas: Array.from({ length: SEMANAS }, (_, i) => ({ desde: ok[0]?.f.semanas[i].desde, saldo: ok.reduce((s, d) => s + d.f.semanas[i].saldo, 0) })),
  };
  const justa = (semanas) => semanas.reduce((a, s) => (s.saldo < a.saldo ? s : a), semanas[0]);

  return el('section', { class: 'listado caja-grupo' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Caja del grupo'),
      el('p', { class: 'texto-suave' }, 'Cuánta plata hay, cuánto nos deben, cuánto debemos y si alcanza las próximas semanas.'))),
    !visibles.length ? el('p', { class: 'texto-suave' }, 'Esta pantalla la ve quien tiene el permiso "aprobar" en Costos en alguna empresa.') : null,
    ok.length > 1 ? bloque('Todo el grupo', null, {
      hoy: total.hoy, sinCuentas: total.sinCuentas, sinSaldo: total.sinSaldo, cobrar: total.cobrar, debemos: total.debemos, justa: justa(total.semanas), semanas: null,
    }) : null,
    datos.map((d) => (d.error
      ? el('div', { class: 'ficha doc-grupo' }, marcaEmpresa(d.e), el('p', { class: 'texto-error' }, d.error))
      : bloque(marcaEmpresa(d.e), d, {
        hoy: d.f.saldoHoy, sinCuentas: !d.f.caja.length, sinSaldo: d.f.sinSaldo.map((c) => c.nombre), cobrar: d.b.porCobrar, debemos: d.b.pasivos, justa: d.f.masJusta, semanas: d.f.semanas,
      }))),
    el('p', { class: 'texto-suave texto-chico' }, 'Es una estimación para ordenarse, no un balance tributario. Los saldos de bancos y caja se anotan a mano en el Balance de cada empresa: si están viejos, todo lo demás también.'));

  function bloque(titulo, d, x) {
    // Sin cuentas de banco ni caja anotadas no se sabe cuánto hay: no se puede decir si alcanza
    const sinDatos = x.sinCuentas;
    const alcanza = x.justa ? x.justa.saldo >= 0 : true;
    const ajustado = alcanza && x.justa && x.justa.saldo < Math.max(1, x.hoy) * 0.2;
    const semaforo = sinDatos ? 'amarillo' : !alcanza ? 'rojo' : ajustado ? 'amarillo' : 'verde';
    const respuesta = (pregunta, valor, explica, clase = '') => el('div', { class: `caja-respuesta ${clase}` },
      el('span', { class: 'texto-suave texto-chico' }, pregunta), el('strong', {}, valor), el('span', { class: 'texto-chico' }, explica));
    const semanaTxt = x.justa?.desde ? `la semana del ${fechaCorta(x.justa.desde)}` : 'las próximas semanas';
    return el('div', { class: 'ficha doc-grupo caja-bloque' },
      el('div', { class: 'caja-titulo' }, typeof titulo === 'string' ? el('h2', {}, titulo) : el('h2', {}, titulo),
        d ? el('div', { class: 'caja-enlaces texto-chico' },
          enlaceEmpresa(ctx, d.e, '#/costos.flujo', 'Flujo semana a semana'), ' · ', enlaceEmpresa(ctx, d.e, '#/costos.balance', 'Anotar saldos y deudas')) : null),
      el('div', { class: 'caja-respuestas' },
        sinDatos ? respuesta('¿Cuánto tenemos hoy?', 'Sin anotar', d ? 'No hay cuentas de banco ni caja: agrégalas en "Anotar saldos y deudas".' : 'Ninguna empresa tiene sus cuentas de banco y caja anotadas.', 'caja-amarillo')
          : respuesta('¿Cuánto tenemos hoy?', dinero(x.hoy), x.sinSaldo.length ? `Falta anotar el saldo de ${x.sinSaldo.join(', ')}.` : 'En bancos y caja.', x.sinSaldo.length ? 'caja-amarillo' : ''),
        respuesta('¿Cuánto nos deben?', dinero(x.cobrar), 'Cobros pendientes a clientes.'),
        respuesta('¿Cuánto debemos?', dinero(x.debemos), 'Proveedores por pagar, tarjetas, créditos y préstamos.'),
        sinDatos ? respuesta('¿Nos alcanza las próximas 8 semanas?', 'No se sabe', 'Primero hay que anotar cuánto hay en bancos y caja.', 'caja-amarillo')
          : respuesta('¿Nos alcanza las próximas 8 semanas?', !alcanza ? 'No' : ajustado ? 'Justo' : 'Sí',
            !alcanza ? `En ${semanaTxt} faltarían ${dinero(-x.justa.saldo)}: hay que adelantar cobros o mover pagos.`
              : `El momento más justo es ${semanaTxt}, con ${dinero(x.justa.saldo)}.`, `caja-${semaforo}`)),
      x.semanas ? el('details', { class: 'caja-detalle' }, el('summary', {}, 'Ver semana a semana'),
        el('div', { class: 'caja-semanas' }, x.semanas.map((s, i) => el('div', { class: `caja-semana ${s.saldo < 0 ? 'caja-rojo' : ''}` },
          el('span', { class: 'texto-chico texto-suave' }, i === 0 ? 'Esta semana' : fechaCorta(s.desde)),
          el('span', { class: 'texto-chico' }, s.entra ? `entra ${dinero(s.entra)}` : 'no entra nada'),
          el('span', { class: 'texto-chico' }, s.sale ? `sale ${dinero(s.sale)}` : 'no sale nada'),
          el('strong', {}, `queda ${dinero(s.saldo)}`))))) : null,
      !alcanza && !sinDatos ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), ' Revisa qué cobros se pueden adelantar en Por cobrar y qué pagos se pueden mover.') : null);
  }
}
