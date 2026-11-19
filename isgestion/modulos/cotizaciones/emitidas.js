// Facturas emitidas fuera de ISgestión (la TUU o la plataforma de OpenFactura), Núcleo 021-022, 2026-11-10.
// Decisión de Enzo: las facturas las hace la máquina; ISgestión las trae del SII y las registra en Facturas con su
// PDF y XML (folio = N°), ligadas a la cotización u orden del taller. Emitir desde ISgestión queda para los cierres.
// 2026-11-12 (pedido de Enzo): se traen todas, desde la N° 1 (y se dice qué folios no están en OpenFactura); cada
// una se puede ver (PDF y detalle) antes de registrarla, y al registrarla se sugiere la cotización que calza
// (mismo cliente y monto, con sus patentes) para que quede tan completa como las ya registradas.
// En el ambiente de pruebas se ven las de la empresa de pruebas de Haulmer y "Registrar" solo muestra el PDF.
import { el } from '../../core/ui/dom.js?v=548645c';
import { icono } from '../../core/ui/iconos.js?v=548645c';
import { boton } from '../../core/ui/tabla.js?v=548645c';
import { abrirFormulario } from '../../core/ui/modal.js?v=548645c';
import { avisar } from '../../core/ui/aviso.js?v=548645c';
import { dinero, fechaLarga, fechaCorta, sumarDias } from '../../core/ui/formato.js?v=548645c';
import { llamarDte, estadoDte, NOMBRE_DTE, ofrecerPdf } from '../../core/dte.js?v=548645c';
import { numeroTexto, nombreTercero, totales, verPatente } from './datos.js?v=548645c';
import { PLAZO_PAGO } from './facturas.js?v=548645c';

const limpio = (r) => String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
const REF = { 801: 'OC', 802: 'Nota de pedido', 803: 'Contrato', HES: 'HES', 33: 'Factura', 52: 'Guía' };

// Abre el PDF (base64) en otra pestaña
function abrirPdf(b64, nombre) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const w = window.open(url, '_blank', 'noopener');
  if (!w) { const a = el('a', { href: url, download: `${nombre}.pdf` }); document.body.append(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Ver la factura del SII: PDF en otra pestaña
export async function verEmitida(ctx, d) {
  try {
    avisar(`Abriendo la factura N° ${d.folio}…`);
    const r = await llamarDte(ctx, 'ver_emitida', { token: d.token });
    if (!r.pdf) throw new Error('OpenFactura no entregó el PDF de esta factura.');
    abrirPdf(r.pdf, `Factura-${r.folio}`);
  } catch (err) { avisar(err.message, 'error'); }
}

// Registrar: primero trae el detalle (ítems, OC) y luego el formulario con las sugerencias ordenadas
export async function formRegistrar(ctx, d, { cotizaciones, clientes, ordenes, prueba, alGuardar }) {
  let det = null;
  try { det = await llamarDte(ctx, 'ver_emitida', { token: d.token }); } catch (err) { avisar(`No se pudo leer el detalle: ${err.message}`, 'error'); }
  const cliente = clientes.find((t) => limpio(t.rut) === limpio(d.rut));
  // Cotizaciones: las del mismo cliente y con el mismo neto primero; se muestran con sus patentes y monto
  const netoDe = (c) => (c.cot_grupos && c.cot_lineas ? totales(c, c.cot_grupos, c.cot_lineas).neto : null);
  const netoFac = d.neto + d.exento;
  const ocFac = String(det?.referencias?.find((r) => r.tipo === '801')?.folio ?? '').replace(/\D/g, '');
  const mismaOc = (c) => !!ocFac && String(c.oc_numero ?? '').replace(/\D/g, '') === ocFac;
  const puntaje = (c) => (c.tercero_id && c.tercero_id === cliente?.id ? 2 : 0) + (netoDe(c) === netoFac ? 3 : 0) + (mismaOc(c) ? 5 : 0);
  const cots = [...cotizaciones].sort((a, b) => puntaje(b) - puntaje(a) || b.numero - a.numero);
  const textoCot = (c) => {
    const pat = (c.cot_grupos ?? []).map((g) => verPatente(g.patente)).filter(Boolean).join(', ');
    const n = netoDe(c);
    return [`N° ${numeroTexto(c.numero)}`, c.cliente_nombre, pat, n != null ? `neto ${dinero(n)}` : null, n === netoFac ? 'mismo monto' : null, mismaOc(c) ? 'misma OC' : null].filter(Boolean).join(' · ');
  };
  const ords = [...ordenes].sort((a, b) => (Number(b.tercero === cliente?.id) + Number(b.neto === netoFac) * 2) - (Number(a.tercero === cliente?.id) + Number(a.neto === netoFac) * 2));
  const sugerida = cots.find((c) => puntaje(c) >= 5) ?? null;
  const oc = det?.referencias?.find((r) => r.tipo === '801')?.folio ?? '';
  const items = det?.items ?? [];
  const resumen = el('div', { class: 'emi-detalle' },
    el('p', {}, el('strong', {}, d.razon ?? 'Sin nombre'), ` · ${d.rut ?? ''} · ${fechaLarga(d.fecha)}`),
    items.length ? el('ul', { class: 'emi-items' }, items.slice(0, 12).map((l) => el('li', {}, el('span', {}, `${l.cant && l.cant !== 1 ? `${l.cant} × ` : ''}${l.nombre}`), el('span', {}, dinero(l.monto))))) : null,
    items.length > 12 ? el('p', { class: 'texto-suave texto-chico' }, `y ${items.length - 12} ítems más (ver el PDF).`) : null,
    (det?.referencias ?? []).length ? el('p', { class: 'texto-suave texto-chico' }, 'Referencias: ', det.referencias.map((r) => `${REF[r.tipo] ?? r.tipo} ${r.folio ?? ''}`).join(' · ')) : null,
    el('p', {}, `Neto ${dinero(d.neto + d.exento)} · IVA ${dinero(d.iva)} · `, el('strong', {}, `Total ${dinero(d.total)}`)),
    det?.pdf ? boton('Ver el PDF', { icono: 'ojo', class: 'boton boton-secundario boton-chico', onclick: () => abrirPdf(det.pdf, `Factura-${d.folio}`) }) : null);
  abrirFormulario({
    titulo: `Registrar ${NOMBRE_DTE[d.tipo].toLowerCase()} N° ${d.folio}`,
    mensaje: prueba ? 'Ambiente de pruebas: solo se muestra el PDF; no se registra.'
      : 'Queda en Facturas con el PDF y el XML del SII; el N°, el cliente y los montos no se pueden cambiar. Lígala a su cotización o vehículo para que quede completa.',
    campos: [
      // Toda venta queda ligada a algo (pedido de Enzo): cotización, vehículo del taller u "otra venta" con detalle
      { id: 'cotizacion', etiqueta: 'Cotización', opciones: [['', 'Sin cotización'], ...cots.map((c) => [c.id, textoCot(c)])], valor: sugerida?.id ?? '',
        ayuda: sugerida ? 'Sugerida por cliente, monto u OC. Revísala.' : 'Arriba, las del mismo cliente y monto.' },
      ...(ords.length ? [{ id: 'orden', etiqueta: 'Vehículo del taller', opciones: [['', 'Sin vehículo'], ...ords.map((o) => [o.id, `${o.texto}${o.cobrado ? ' · cobrada' : ''}${o.neto === netoFac ? ' · mismo monto' : ''}`])],
        ayuda: 'Si la orden ya está cobrada, la factura queda pagada con esa fecha; si no, al pagar la factura la orden queda cobrada.' }] : []),
      { id: 'otra', etiqueta: 'Si no es de una cotización ni de un vehículo', opciones: [['', 'Es de una cotización o un vehículo'], ['si', 'Otra venta (escribe qué se vendió abajo)']] },
      { id: 'cliente', etiqueta: 'Cliente', opciones: [['', cliente ? 'Elegir…' : `Sin ficha (${d.razon ?? 'sin nombre'})`], ...clientes.map((t) => [t.id, nombreTercero(t)])], valor: cliente?.id ?? '' },
      { id: 'oc', etiqueta: 'OC u orden de servicio', valor: oc },
      { id: 'detalle', etiqueta: 'Detalle de trabajos', valor: items.map((l) => l.nombre).filter((n) => n && !/^nombre [ií]tem/i.test(n)).join(', ').slice(0, 300) },   // la TUU pone 'Nombre ítem 1'
      { id: 'ejecucion', etiqueta: 'Fecha de ejecución del trabajo', tipo: 'date', valor: '' },
      { id: 'estimada', etiqueta: 'Fecha de pago estimada', tipo: 'date', valor: sumarDias(d.fecha, PLAZO_PAGO) },
    ],
    textoGuardar: prueba ? 'Ver el PDF' : 'Registrar en Facturas',
    alGuardar: async (v) => {
      if (!prueba && !v.cotizacion && !v.orden && !(v.otra === 'si' && v.detalle?.trim().length >= 4)) {
        throw new Error('Liga la factura a una cotización o a un vehículo, o elige "Otra venta" y escribe qué se vendió.');
      }
      // Cobro que ya consta en ISgestión (orden cobrada o cobro en la cotización): la factura entra pagada
      const o = ordenes.find((x) => x.id === v.orden); const c = cotizaciones.find((x) => x.id === v.cotizacion);
      const pago = cobroDe(o ? { tipo: 'o', o } : c ? { tipo: 'c', c } : null);
      const r = await llamarDte(ctx, 'registrar_emitida', { token: d.token, pago: pago ? { fecha: pago.fecha, medio: pago.medio } : null, cotizacion_id: v.cotizacion || null, orden_id: v.orden || null, otra: v.otra === 'si',
        tercero_id: v.cliente || null, fecha_pago_estimada: v.estimada || null, detalle: v.detalle?.trim() || null, oc_numero: v.oc?.trim() || null, fecha_ejecucion: v.ejecucion || null });
      if (prueba) ofrecerPdf(r.pdf, { titulo: `Factura N° ${r.folio}`, texto: 'Ambiente de pruebas: no se registró.' });
      avisar(prueba ? `Factura de prueba N° ${r.folio}: no se registró.` : `Factura N° ${r.folio} registrada en Facturas.`);
      alGuardar?.();
    },
  });
  // El detalle de la factura va arriba del formulario
  const dlg = [...document.querySelectorAll('dialog[open]')].pop();
  dlg?.querySelector('.modal-mensaje')?.after(resumen);
}

// Rangos de folios: [1,2,3,7,9,10] → "1–3, 7, 9–10"
const rangos = (ns) => {
  const out = []; let i = 0;
  while (i < ns.length) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`); i = j + 1; }
  return out.join(', ');
};

// Medio de pago de la orden → medio de la factura
const MEDIOS = ['transferencia', 'efectivo', 'cheque', 'debito', 'credito', 'otro'];
const medioDe = (m) => (MEDIOS.includes(m) ? m : 'otro');

// Cobro que ya consta en ISgestión para lo ligado: orden cobrada en el taller o cobro anotado en la cotización
export function cobroDe(liga) {
  if (!liga) return null;
  if (liga.tipo === 'o' && liga.o.cobrado && liga.o.cobradoFecha) return { fecha: liga.o.cobradoFecha, medio: medioDe(liga.o.modo), donde: `orden N° ${liga.o.numero}` };
  if (liga.tipo === 'c' && liga.c.cobro_fecha) return { fecha: liga.c.cobro_fecha, medio: medioDe(liga.c.cobro_medio), donde: `cotización N° ${numeroTexto(liga.c.numero)}` };
  return null;
}

// La lista del SII queda en memoria entre visitas a Facturas (por empresa) y se vuelve a revisar sola si tiene más
// de 3 minutos, sin tocar nada (pedido de Enzo, 2026-11-18)
const memoria = new Map();
const FRESCO = 3 * 60e3;

// Panel (2026-11-18, pedido de Enzo): al abrir Facturas se traen solas las facturas del SII (todas, desde la N° 1);
// las que faltan se ven con a qué van (sugerido: cotización u orden del mismo cliente y monto) y si ya están cobradas
// según ISgestión (orden cobrada en el taller o cobro en la cotización). Se marcan varias y se registran juntas.
// Las anuladas con nota de crédito (mismo RUT y total) se muestran aparte y no se registran.
export function panelEmitidas(ctx, { cotizaciones = [], clientes = [], ordenes = [], alGuardar } = {}) {
  const e = ctx.empresa.id;
  const zona = el('div', {});
  const estado = el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' }, 'Buscando las facturas emitidas en el SII…');
  const puedeCrear = ctx.puede('cotizaciones', 'crear');

  const pintar = (r) => {
    const facturas = r.documentos.filter((d) => [33, 34].includes(d.tipo)).sort((a, b) => b.folio - a.folio);
    const notas = r.documentos.filter((d) => d.tipo === 61);
    // Anulada: una nota de crédito al mismo RUT, por el mismo total y desde la fecha de la factura (cada nota, una vez)
    const usadas = new Set();
    const anulada = new Map();
    for (const d of [...facturas].sort((a, b) => a.folio - b.folio)) {
      const nc = notas.find((n) => !usadas.has(n.folio) && n.rut === d.rut && n.total === d.total && n.fecha >= d.fecha);
      if (nc) { usadas.add(nc.folio); anulada.set(d.folio, nc); }
    }
    const faltan = facturas.filter((d) => !d.factura_id && !anulada.has(d.folio));
    const anuladas = facturas.filter((d) => !d.factura_id && anulada.has(d.folio));
    const sinSii = r.folios?.no_en_sii ?? [];
    estado.textContent = `${r.prueba ? 'Ambiente de pruebas (empresa de pruebas de Haulmer). ' : ''}${facturas.length} facturas en el SII: ${facturas.length - faltan.length - anuladas.length} ya en Facturas, ${faltan.length} por registrar${anuladas.length ? ` y ${anuladas.length} anuladas con nota de crédito` : ''}.${r.completo ? '' : ' (Se revisaron las primeras 600.)'}`;

    // Opciones para ligar cada factura: primero lo del mismo cliente y monto; la sugerencia no se repite en la lista
    const sugeridas = new Set();
    // 2026-11-18 (Enzo): solo lo que puede ser de esa factura: cerca de su fecha (órdenes de 60 días antes a 15
    // después; cotizaciones de 120 días antes, porque se aceptan después de enviarlas) y con su monto o del mismo cliente.
    // Primero lo que tiene el mismo monto, después lo del mismo cliente; los cierres van como su cotización del mes.
    const opcionesDe = (d) => {
      const cli = clientes.find((t) => limpio(t.rut) === limpio(d.rut));
      const netoFac = d.neto + d.exento;
      const dias = (f) => (f ? Math.round((new Date(`${f}T12:00`) - new Date(`${d.fecha}T12:00`)) / 864e5) : null);
      const netoCot = (c) => (c.cot_grupos && c.cot_lineas ? totales(c, c.cot_grupos, c.cot_lineas).neto : null);
      const orden = (a, b) => (b.monto * 2 + b.mismo) - (a.monto * 2 + a.mismo) || Math.abs(a.dias) - Math.abs(b.dias);
      const cots = cotizaciones.map((c) => ({ c, mismo: !!cli && c.tercero_id === cli.id, monto: netoCot(c) === netoFac, dias: dias(c.fecha) ?? 0 }))
        .filter((x) => (x.monto || x.mismo) && x.dias >= -120 && x.dias <= 15).sort(orden);
      // Órdenes: neto igual al de la factura, o igual al total (precio con IVA incluido, como en la TUU)
      const ords = ordenes.map((o) => ({ o, mismo: !!cli && o.tercero === cli.id, monto: o.neto === netoFac || o.neto === d.total, dias: dias(o.fecha || o.cobradoFecha) }))
        .filter((x) => (x.monto || x.mismo) && x.dias != null && x.dias >= -60 && x.dias <= 15).sort(orden);
      const cotSug = cots.find((x) => x.monto && (x.mismo || !cli) && !sugeridas.has(`c:${x.c.id}`));
      const ordSug = ords.find((x) => x.monto && (x.mismo || !cli) && x.dias >= -20 && !sugeridas.has(`o:${x.o.id}`));
      const sug = cotSug ? `c:${cotSug.c.id}` : ordSug ? `o:${ordSug.o.id}` : '';
      if (sug) sugeridas.add(sug);
      const liga = new Map([...cots.map((x) => [`c:${x.c.id}`, { tipo: 'c', c: x.c }]), ...ords.map((x) => [`o:${x.o.id}`, { tipo: 'o', o: x.o }])]);
      const patentes = (c) => (c.cot_grupos ?? []).map((g) => verPatente(g.patente)).filter(Boolean).join(', ');
      const opciones = [['', cots.length || ords.length ? 'Elegir a qué va…' : 'Nada con ese monto cerca de la fecha'],
        ...cots.slice(0, 12).map((x) => [`c:${x.c.id}`, [`Cot. ${numeroTexto(x.c.numero)}`, patentes(x.c) || x.c.cliente_nombre, fechaCorta(x.c.fecha), dinero(netoCot(x.c) ?? 0), x.monto ? 'mismo monto' : 'otro monto'].filter(Boolean).join(' · ')]),
        ...ords.slice(0, 12).map((x) => [`o:${x.o.id}`, [`Orden ${x.o.numero}`, `${verPatente(x.o.patente) || 'S/P'} ${x.o.auto}`.trim(), (x.o.fecha || x.o.cobradoFecha) ? fechaCorta(x.o.fecha || x.o.cobradoFecha) : null, dinero(x.o.neto), x.o.cobrado ? 'cobrada' : 'por cobrar', x.monto ? 'mismo monto' : 'otro monto'].filter(Boolean).join(' · ')]),
        ['otra', 'Otra venta (escribir qué)']];
      return { opciones, sug, liga, cli };
    };

    const filas = faltan.map((d) => {
      const { opciones, sug, liga, cli } = opcionesDe(d);
      const marca = el('input', { type: 'checkbox', 'aria-label': `Elegir la factura N° ${d.folio}` });
      const ligar = el('select', { class: 'campo emi-ligar', 'aria-label': `A qué va la factura N° ${d.folio}` }, opciones.map(([v, t]) => el('option', { value: v, selected: v === sug }, t)));
      const otra = el('input', { class: 'campo emi-otra', placeholder: 'Qué se vendió', 'aria-label': 'Qué se vendió' });
      otra.hidden = true;
      const cobro = el('span', {});
      const nota = el('span', { class: 'texto-chico emi-nota', role: 'status' });
      const pintarCobro = () => {
        otra.hidden = ligar.value !== 'otra';
        const c = cobroDe(liga.get(ligar.value));
        cobro.replaceChildren(c ? el('span', { class: 'chip chip-ok', title: `Según la ${c.donde}` }, `Cobrada ${fechaCorta(c.fecha)}`)
          : el('span', { class: `chip ${ligar.value ? 'chip-prox' : 'chip-pend'}` }, ligar.value ? 'Por cobrar' : 'Sin ligar'));
      };
      ligar.addEventListener('change', () => { pintarCobro(); if (ligar.value) marca.checked = true; contar(); });
      marca.addEventListener('change', contar);
      pintarCobro();
      const tr = el('tr', {},
        el('td', {}, puedeCrear && !r.prueba ? marca : null),
        el('td', {}, el('strong', {}, `N° ${d.folio}`), el('span', { class: 'texto-suave texto-chico ban-linea' }, `${fechaLarga(d.fecha)}${d.tipo === 34 ? ' · exenta' : ''}`)),
        el('td', {}, el('strong', {}, d.razon ?? 'Sin nombre'), el('span', { class: 'texto-suave texto-chico ban-linea' }, `${d.rut ?? ''}${cli ? '' : ' · sin ficha de cliente'}`)),
        el('td', { class: 'num' }, dinero(d.total)),
        el('td', { class: 'emi-celda-ligar' }, ligar, otra, nota),
        el('td', {}, cobro),
        el('td', {}, el('div', { class: 'ban-acciones-fila' },
          boton('Ver', { icono: 'ojo', class: 'boton boton-secundario boton-chico', onclick: () => verEmitida(ctx, d) }),
          puedeCrear ? boton(r.prueba ? 'Probar' : 'Con detalle', { class: 'boton boton-secundario boton-chico', title: 'Registrar con el formulario completo (OC, ejecución, pago estimado)',
            onclick: () => formRegistrar(ctx, d, { cotizaciones, clientes, ordenes, prueba: r.prueba, alGuardar: () => { memoria.delete(e); alGuardar?.(); } }) }) : null)));
      return { d, tr, marca, ligar, otra, nota, liga, cli };
    });

    const textoLote = el('span', {}, 'Registrar seleccionadas');
    const btnLote = el('button', { type: 'button', class: 'boton boton-primario', disabled: true, onclick: () => registrarLote() }, icono('check', { tam: 16 }), textoLote);
    const todas = el('input', { type: 'checkbox', 'aria-label': 'Elegir todas' });
    function contar() {
      const n = filas.filter((f) => f.marca.checked).length;
      btnLote.disabled = !n;
      textoLote.textContent = n ? `Registrar seleccionadas (${n})` : 'Registrar seleccionadas';
      todas.checked = n > 0 && n === filas.filter((f) => !f.marca.disabled).length;
    }
    todas.addEventListener('change', () => { filas.forEach((f) => { if (!f.marca.disabled) f.marca.checked = todas.checked; }); contar(); });

    async function registrarLote() {
      const elegidas = filas.filter((f) => f.marca.checked);
      // Revisión antes de llamar al SII: cada una ligada, y una orden o cotización en una sola factura
      let mal = 0; const vistos = new Map();
      for (const f of elegidas) {
        f.nota.textContent = ''; f.nota.className = 'texto-chico emi-nota';
        const err = !f.ligar.value ? 'Elige a qué va.' : f.ligar.value === 'otra' && f.otra.value.trim().length < 4 ? 'Escribe qué se vendió.'
          : vistos.has(f.ligar.value) ? `Va a lo mismo que la N° ${vistos.get(f.ligar.value)}.` : null;
        if (f.ligar.value && f.ligar.value !== 'otra') vistos.set(f.ligar.value, f.d.folio);
        if (err) { mal++; f.nota.textContent = err; f.nota.classList.add('estado-error'); }
      }
      if (mal) { avisar(`Revisa ${mal === 1 ? 'la factura marcada' : `las ${mal} facturas marcadas`} en rojo.`, 'error'); return; }
      btnLote.disabled = true; btnLote.classList.add('cargando');
      let ok = 0;
      for (const [i, f] of elegidas.entries()) {
        estado.textContent = `Registrando ${i + 1} de ${elegidas.length}: factura N° ${f.d.folio}…`;
        const l = f.liga.get(f.ligar.value);
        const pago = cobroDe(l);
        try {
          await llamarDte(ctx, 'registrar_emitida', { token: f.d.token, cotizacion_id: l?.tipo === 'c' ? l.c.id : null, orden_id: l?.tipo === 'o' ? l.o.id : null,
            otra: f.ligar.value === 'otra', detalle: f.ligar.value === 'otra' ? f.otra.value.trim() : null, tercero_id: f.cli?.id ?? null,
            fecha_pago_estimada: sumarDias(f.d.fecha, PLAZO_PAGO), pago: pago ? { fecha: pago.fecha, medio: pago.medio } : null });
          ok++; f.marca.checked = false; f.marca.disabled = true; f.ligar.disabled = true; f.otra.disabled = true;
          f.nota.textContent = pago ? 'Registrada y pagada.' : 'Registrada.'; f.nota.classList.add('estado-ok');
        } catch (err) { f.nota.textContent = err.message; f.nota.classList.add('estado-error'); }
      }
      btnLote.classList.remove('cargando');
      memoria.delete(e);
      avisar(`${ok} de ${elegidas.length} ${elegidas.length === 1 ? 'factura registrada' : 'facturas registradas'}.`, ok === elegidas.length ? 'ok' : 'error');
      if (ok === elegidas.length) alGuardar?.(); else { estado.textContent = `${ok} registradas; las que fallaron dicen por qué.`; contar(); }
    }

    zona.replaceChildren(...[
      faltan.length ? el('div', {},
        puedeCrear && !r.prueba ? el('div', { class: 'listado-acciones' }, btnLote,
          el('span', { class: 'texto-suave texto-chico' }, 'Las que ya están cobradas en ISgestión quedan pagadas con esa fecha.')) : null,
        el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla ban-tabla emi-tabla' },
          el('thead', {}, el('tr', {}, el('th', {}, puedeCrear && !r.prueba ? todas : null), ...['Factura', 'Cliente', 'Total', 'A qué va', 'Cobro', ''].map((c) => el('th', { class: c === 'Total' ? 'num' : null }, c)))),
          el('tbody', {}, filas.map((f) => f.tr)))))
        : el('p', { class: 'texto-suave' }, 'Todas las facturas del SII ya están en Facturas.'),
      anuladas.length ? el('details', { class: 'emi-anuladas' }, el('summary', { class: 'texto-suave texto-chico' }, `Anuladas con nota de crédito (${anuladas.length}): no se registran`),
        anuladas.map((d) => el('p', { class: 'texto-chico' }, `Factura N° ${d.folio} · ${d.razon ?? ''} · ${fechaLarga(d.fecha)} · ${dinero(d.total)} → nota de crédito N° ${anulada.get(d.folio).folio}`))) : null,
      sinSii.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
        ` Folios del 1 al ${r.folios.max} que no están en OpenFactura: ${rangos(sinSii.map((x) => x.folio))}. `,
        sinSii.some((x) => x.factura_id) ? `De esos, ${sinSii.filter((x) => x.factura_id).length} ya están en Facturas (registradas a mano). ` : '',
        'Pueden haberse emitido en otra plataforma antes de OpenFactura o estar anulados.') : null].filter(Boolean));
  };

  const cargar = async ({ forzar = false } = {}) => {
    const m = memoria.get(e);
    if (m && !forzar) pintar(m.r);
    if (m && !forzar && Date.now() - m.at < FRESCO) return;
    if (!m) estado.textContent = 'Buscando las facturas emitidas en el SII… la primera vez puede tardar un poco.';
    try {
      const est = await estadoDte(ctx);
      if (!est.conectado) throw new Error(`OpenFactura no está conectado: ${est.error ?? 'falta la clave'}`);
      const r = await llamarDte(ctx, 'emitidas', { todas: true });
      memoria.set(e, { r, at: Date.now() });
      // Si ya se estaba usando la lista en memoria (algo marcado), no se repinta encima
      if (forzar || !m || !zona.querySelector('.emi-tabla input:checked')) pintar(r);
    } catch (err) { estado.textContent = err.message; }
  };
  queueMicrotask(cargar);
  return el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'emi-cabecera' }, el('h2', {}, 'Facturas emitidas en el SII'),
      boton('Actualizar', { class: 'boton boton-secundario boton-chico', title: 'Volver a revisar el SII ahora',
        onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; await cargar({ forzar: true }); b.disabled = false; } })),
    estado, zona);
}
