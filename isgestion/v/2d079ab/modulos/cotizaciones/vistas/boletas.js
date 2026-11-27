// Ventas y cobros → Boletas por ligar (Cotizaciones 013, 2026-11-25, pedido de Enzo): bandeja de las boletas que
// emitió la máquina TUU y todavía no están en ningún cobro ni abono (opcional: ver también las ligadas y dónde están). Las que no están en nada (ni en un cobro o abono de una
// orden, ni en un abono o cobro de una cotización) se ligan aquí: Luisa las registra y, si al subirlas no quedaron
// ligadas, las pone donde van. Un abono no reemplaza a otro: cada boleta queda en su propio abono.
// Las facturas de la TUU por registrar están en Facturas (arriba, "Traer del SII").
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { dinero, fechaLarga, fechaCorta, hoyISO, sumarDias, diaLocal } from '../../../core/ui/formato.js';
import { llamarDte, estadoDte, ofrecerPdf } from '../../../core/dte.js';
import { numeroTexto, verPatente, totales } from '../datos.js';
import { totales as totalesOrden } from '../../taller/datos.js';

const rango = { desde: null, hasta: null, solo: 'libres' };
const estadoVacio = ({ icono: ic, titulo, texto }) => el('div', { class: 'estado-vacio' }, el('span', { class: 'estado-vacio-icono' }, icono(ic, { tam: 28 })), el('h2', {}, titulo), texto ? el('p', { class: 'texto-suave' }, texto) : null);

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  rango.desde ??= sumarDias(hoy, -60); rango.hasta ??= hoy;
  const verTaller = ctx.puede('taller', 'ver');
  const ligarOrden = ctx.puede('taller', 'crear') && ctx.puede('taller', 'editar');
  const ligarCot = ctx.puede('cotizaciones', 'editar');

  const titulo = el('h1', {}, icono('documento', { tam: 22 }), ' Bandeja');
  const ayuda = el('p', { class: 'texto-suave texto-chico' }, 'Boletas por ligar: las de la TUU que todavía no están en ningún cobro ni abono. Con Ligar quedan en una orden del taller o en una cotización (venta sin orden), y salen de esta lista. Las facturas por registrar están en ',
    el('a', { href: ctx.ruta('cotizaciones.oc') }, 'Facturas'), '.');
  const est = await estadoDte(ctx);
  if (!est.conectado) {
    return el('section', { class: 'listado' }, titulo, ayuda, estadoVacio({ icono: 'alerta', titulo: 'OpenFactura no está conectado', texto: est.error ?? 'Falta la clave de la empresa.' }));
  }

  // Dónde se puede ligar: cotizaciones enviadas o aceptadas sin orden ni cobro, y órdenes abiertas o cobradas sin boleta
  const [rc, ro] = await Promise.all([
    ctx.api.from('cot_cotizaciones').select('id, numero, fecha, estado, cliente_nombre, factura_numero, cobro_fecha, con_iva, desc_adic_pct, cot_grupos(id, orden_id, patente, titulo), cot_lineas(grupo_id, tipo, cantidad, precio, desc_pct), cot_pagos(tipo, monto, deleted_at)')
      .eq('empresa_id', e).is('deleted_at', null).is('madre_id', null).is('cobro_fecha', null).in('estado', ['enviada', 'aceptada'])
      .gte('fecha', sumarDias(hoy, -365)).order('numero', { ascending: false }).limit(300),
    verTaller ? ctx.api.from('tal_ordenes').select('id, numero, estado, cobrado, cobrado_at, boleta_ruta, doc_tipo, tipo_venta, descuento, abono, created_at, tal_vehiculos(patente, marca, modelo), terceros(razon_social, nombre_fantasia), tal_orden_servicios(precio)')
      .eq('empresa_id', e).eq('tipo_venta', 'normal').neq('estado', 'anulada').gte('created_at', `${sumarDias(hoy, -180)}T00:00:00`).order('numero', { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  if (rc.error) throw rc.error;
  const cots = (rc.data ?? []).filter((c) => !c.cot_grupos.some((g) => g.orden_id)).map((c) => {
    const pagos = (c.cot_pagos ?? []).filter((p) => !p.deleted_at);
    const total = totales(c, c.cot_grupos, c.cot_lineas).total;
    const abonado = pagos.filter((p) => p.tipo === 'abono').reduce((s, p) => s + Number(p.monto), 0);
    return { c, total, abonado, saldo: Math.max(0, total - abonado), conSaldo: pagos.some((p) => p.tipo === 'saldo') };
  });
  const ords = (ro.data ?? []).filter((o) => !o.cobrado || !o.boleta_ruta).map((o) => ({ o, t: totalesOrden(o, o.tal_orden_servicios ?? []) }));

  const zona = el('div', {});
  const estado = el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' });
  const desde = el('input', { type: 'date', class: 'campo', value: rango.desde, 'aria-label': 'Desde' });
  const hasta = el('input', { type: 'date', class: 'campo', value: rango.hasta, 'aria-label': 'Hasta' });
  const solo = el('select', { class: 'campo', 'aria-label': 'Mostrar' },
    [['libres', 'Solo por ligar'], ['todas', 'También las ligadas']].map(([v, t]) => el('option', { value: v, selected: v === rango.solo }, t)));

  // Destinos para una boleta: solo lo cercano a su fecha (cotizaciones de 120 días antes a 15 después; órdenes abiertas
  // creadas desde 120 días antes; cobros sin boleta de 20 días antes a 20 después), primero el mismo monto y lo más cercano
  const opcionesPara = (b) => {
    const mismo = (n) => n === b.total;
    const dias = (f) => (f ? Math.round((new Date(`${f}T12:00`) - new Date(`${b.fecha}T12:00`)) / 864e5) : 9999);
    const op = [];
    for (const x of cots) {
      const dd = dias(x.c.fecha);
      if (dd < -120 || dd > 15) continue;
      const nom = [`Cot. ${numeroTexto(x.c.numero)}`, x.c.cot_grupos.map((g) => verPatente(g.patente) || g.titulo).filter(Boolean).join(', ') || x.c.cliente_nombre, x.c.cliente_nombre].filter(Boolean);
      const base = [...new Set(nom)].join(' · ');
      if (ligarCot) op.push({ v: `ca:${x.c.id}`, t: `${base} · abono (total ${dinero(x.total)}${x.abonado ? `, abonado ${dinero(x.abonado)}` : ''})`, peso: mismo(x.total) || mismo(x.saldo) ? 2 : 0, dd, x });
      if (ligarCot && !x.c.factura_numero && !x.conSaldo) op.push({ v: `cs:${x.c.id}`, t: `${base} · cobro final (saldo ${dinero(x.saldo)})`, peso: mismo(x.saldo) ? 3 : 0, dd, x });
    }
    for (const y of ords) {
      if (!ligarOrden) break;
      const v = y.o.tal_vehiculos;
      const base = [`Orden ${y.o.numero}`, `${verPatente(v?.patente) || 'S/P'} ${[v?.marca, v?.modelo].filter(Boolean).join(' ')}`.trim(), y.o.terceros?.nombre_fantasia || y.o.terceros?.razon_social].filter(Boolean).join(' · ');
      if (!y.o.cobrado) {
        const dd = dias(diaLocal(y.o.created_at));
        if (dd < -120 || dd > 15) continue;
        op.push({ v: `oa:${y.o.id}`, t: `${base} · abono (saldo ${dinero(y.t.saldo)})`, peso: mismo(y.t.saldo) ? 2 : 0, dd, y });
      } else {
        const dd = dias(diaLocal(y.o.cobrado_at));
        if (Math.abs(dd) > 20) continue;
        op.push({ v: `oc:${y.o.id}`, t: `${base} · cobro del ${fechaCorta(diaLocal(y.o.cobrado_at))} sin boleta`, peso: mismo(y.t.saldo) || mismo(y.t.total) ? 3 : 1, dd, y });
      }
    }
    return op.sort((a, z) => z.peso - a.peso || Math.abs(a.dd) - Math.abs(z.dd));
  };

  const ligar = (b) => {
    const ops = opcionesPara(b);
    abrirFormulario({
      titulo: `Ligar la boleta N° ${b.folio}`,
      mensaje: `${fechaLarga(b.fecha)}${b.hora ? ` ${b.hora}` : ''} · ${dinero(b.total)}. Arriba, lo que tiene el mismo monto. Un abono queda aparte: no reemplaza a otro.`,
      campos: [
        { id: 'destino', etiqueta: 'A qué va', requerido: true, opciones: [['', ops.length ? 'Elegir…' : 'No hay cotizaciones ni órdenes donde ligarla'], ...ops.map((o) => [o.v, `${o.t}${o.peso >= 2 ? ' · mismo monto' : ''}`])] },
        { id: 'medio', etiqueta: 'Medio de pago', opciones: [['debito', 'Débito'], ['credito', 'Crédito'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['otro', 'Otro']], valor: 'debito',
          ayuda: 'Para el abono o el cobro que se registra con la boleta.' },
      ],
      textoGuardar: est.prueba ? 'Ver el PDF (prueba)' : 'Ligar boleta',
      alGuardar: async (v) => {
        const op = ops.find((o) => o.v === v.destino);
        if (!op) throw new Error('Elige a qué va.');
        const [tipo, id] = op.v.split(':');
        let r;
        if (tipo === 'ca' || tipo === 'cs') {
          const pagoId = crypto.randomUUID();
          if (!est.prueba) {
            const { error } = await ctx.api.from('cot_pagos').insert({ id: pagoId, empresa_id: e, cotizacion_id: id, tipo: tipo === 'cs' ? 'saldo' : 'abono', fecha: b.fecha, monto: b.total, medio: v.medio, nota: `Boleta N° ${b.folio}` });
            if (error) throw new Error(error.message);
          }
          r = await llamarDte(ctx, 'ligar_boleta', { cot_pago_id: pagoId, token: b.token }).catch(async (err) => {
            if (!est.prueba) await ctx.api.from('cot_pagos').update({ deleted_at: new Date().toISOString(), nota: `Boleta N° ${b.folio} · no se pudo ligar` }).eq('id', pagoId);
            throw err;
          });
        } else if (tipo === 'oa') {
          const abonoId = crypto.randomUUID();
          if (!est.prueba) {
            const { error } = await ctx.api.from('tal_abonos').insert({ id: abonoId, empresa_id: e, orden_id: id, fecha: b.fecha, monto: b.total, medio: v.medio, nota: `Boleta N° ${b.folio}` });
            if (error) throw new Error(error.message);
          }
          r = await llamarDte(ctx, 'ligar_boleta', { orden_id: id, abono_id: abonoId, token: b.token }).catch(async (err) => {
            if (!est.prueba) await ctx.api.from('tal_abonos').update({ deleted_at: new Date().toISOString() }).eq('id', abonoId);
            throw err;
          });
        } else {
          r = await llamarDte(ctx, 'ligar_boleta', { orden_id: id, token: b.token });
        }
        ofrecerPdf(r.pdf, { titulo: `Boleta N° ${r.folio}`, texto: r.prueba ? 'Ambiente de pruebas: no se guardó.' : 'Quedó ligada.' });
        if (r.aviso) avisar(r.aviso, 'error'); else if (!r.prueba) avisar(`Boleta N° ${r.folio} ligada.`);
        if (!r.prueba) ctx.refrescar();
      },
    });
  };

  const enlaceUso = (b) => {
    if (b.cotizacion_id) return el('a', { href: ctx.ruta('cotizaciones.editor', { id: b.cotizacion_id }) }, b.uso);
    if (b.orden_id) return el('a', { href: ctx.ruta('taller.orden', { id: b.orden_id, ir: 'cobro' }) }, b.uso);
    return el('span', {}, b.uso);
  };

  const buscar = async () => {
    rango.desde = desde.value; rango.hasta = hasta.value || desde.value; rango.solo = solo.value;
    if (!rango.desde) return;
    if (rango.hasta < rango.desde) { estado.textContent = '"Hasta" es anterior a "Desde".'; return; }
    estado.textContent = 'Buscando las boletas en el SII…';
    zona.replaceChildren();
    try {
      // El SII entrega hasta dos meses por consulta: se pide por tramos
      const tramos = [];
      for (let d = rango.desde; d <= rango.hasta; d = sumarDias(d, 61)) { const h = sumarDias(d, 60); tramos.push([d, h < rango.hasta ? h : rango.hasta]); }
      const todas = [];
      let completo = true;
      for (const [d, h] of tramos.slice(0, 6)) {
        const r = await llamarDte(ctx, 'boletas', { desde: d, hasta: h, tipo: 39 });
        todas.push(...r.boletas); completo &&= r.completo;
      }
      todas.sort((a, z) => `${z.fecha}${z.hora ?? ''}`.localeCompare(`${a.fecha}${a.hora ?? ''}`));
      const libres = todas.filter((b) => !b.uso);
      const lista = rango.solo === 'libres' ? libres : todas;
      estado.textContent = `${libres.length === 1 ? '1 boleta por ligar' : `${libres.length} boletas por ligar`} del ${fechaLarga(rango.desde)} al ${fechaLarga(rango.hasta)} (de ${todas.length} emitidas).${completo && tramos.length <= 6 ? '' : ' (Se revisó solo una parte: acorta el rango.)'}${est.prueba ? ' Ambiente de pruebas: son de la empresa de pruebas de Haulmer.' : ''}`;
      if (!lista.length) {
        zona.replaceChildren(estadoVacio({ icono: 'check', titulo: rango.solo === 'libres' ? 'Nada por ligar' : 'Sin boletas en esas fechas', texto: rango.solo === 'libres' ? 'Todas las boletas de la TUU de esas fechas ya están en un cobro o un abono.' : '' }));
        return;
      }
      zona.replaceChildren(el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Boleta', 'Fecha', 'Total', 'Dónde está', ''].map((t) => el('th', { class: t === 'Total' ? 'num' : null }, t)))),
        el('tbody', {}, lista.map((b) => el('tr', {},
          el('td', {}, el('strong', {}, `N° ${b.folio}`)),
          el('td', {}, `${fechaLarga(b.fecha)}${b.hora ? ` ${b.hora}` : ''}`),
          el('td', { class: 'num' }, dinero(b.total)),
          el('td', {}, b.uso ? enlaceUso(b) : el('span', { class: 'chip chip-pend' }, 'Por ligar')),
          el('td', {}, b.uso || !(ligarCot || ligarOrden) ? null : boton('Ligar', { icono: 'enlace', class: 'boton boton-primario boton-chico', onclick: () => ligar(b) }))))))));
    } catch (err) { estado.textContent = err.message; }
  };
  for (const x of [desde, hasta, solo]) x.addEventListener('change', buscar);
  setTimeout(buscar, 0);

  return el('section', { class: 'listado' },
    titulo, ayuda,
    el('div', { class: 'bol-filtros' },
      el('label', {}, el('span', { class: 'texto-chico texto-suave' }, 'Desde'), desde),
      el('label', {}, el('span', { class: 'texto-chico texto-suave' }, 'Hasta'), hasta),
      el('label', {}, el('span', { class: 'texto-chico texto-suave' }, 'Mostrar'), solo),
      boton('Buscar', { icono: 'buscar', class: 'boton boton-secundario', onclick: buscar })),
    estado, zona);
}
