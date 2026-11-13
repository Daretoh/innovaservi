// Facturas emitidas fuera de ISgestión (la TUU o la plataforma de OpenFactura), Núcleo 021-022, 2026-11-10.
// Decisión de Enzo: las facturas las hace la máquina; ISgestión las trae del SII y las registra en Facturas con su
// PDF y XML (folio = N°), ligadas a la cotización u orden del taller. Emitir desde ISgestión queda para los cierres.
// 2026-11-12 (pedido de Enzo): se traen todas, desde la N° 1 (y se dice qué folios no están en OpenFactura); cada
// una se puede ver (PDF y detalle) antes de registrarla, y al registrarla se sugiere la cotización que calza
// (mismo cliente y monto, con sus patentes) para que quede tan completa como las ya registradas.
// En el ambiente de pruebas se ven las de la empresa de pruebas de Haulmer y "Registrar" solo muestra el PDF.
import { el } from '../../core/ui/dom.js?v=16e128e';
import { icono } from '../../core/ui/iconos.js?v=16e128e';
import { boton } from '../../core/ui/tabla.js?v=16e128e';
import { abrirFormulario } from '../../core/ui/modal.js?v=16e128e';
import { avisar } from '../../core/ui/aviso.js?v=16e128e';
import { dinero, fechaLarga, sumarDias } from '../../core/ui/formato.js?v=16e128e';
import { llamarDte, estadoDte, NOMBRE_DTE, ofrecerPdf } from '../../core/dte.js?v=16e128e';
import { numeroTexto, nombreTercero, totales, verPatente } from './datos.js?v=16e128e';
import { PLAZO_PAGO } from './facturas.js?v=16e128e';

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
      ...(ords.length ? [{ id: 'orden', etiqueta: 'Vehículo del taller (orden sin cobrar)', opciones: [['', 'Sin vehículo'], ...ords.map((o) => [o.id, `${o.texto}${o.neto === netoFac ? ' · mismo monto' : ''}`])],
        ayuda: 'Al registrar el pago de la factura, la orden queda cobrada.' }] : []),
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
      const r = await llamarDte(ctx, 'registrar_emitida', { token: d.token, cotizacion_id: v.cotizacion || null, orden_id: v.orden || null, otra: v.otra === 'si',
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

// Panel: trae las facturas emitidas en el SII (todas o las recientes) y muestra las que faltan en Facturas
export function panelEmitidas(ctx, { cotizaciones = [], clientes = [], ordenes = [], alGuardar } = {}) {
  const zona = el('div', {});
  const alcance = el('select', { class: 'campo campo-filtro', 'aria-label': 'Desde cuándo' },
    el('option', { value: 'todas' }, 'Todas (desde la N° 1)'), el('option', { value: 'recientes' }, 'Últimos 45 días'));
  const estado = el('p', { class: 'texto-suave texto-chico', 'aria-live': 'polite' },
    'Las facturas que hace la máquina TUU o la plataforma de OpenFactura se traen del SII y se registran aquí con su PDF.');
  const puedeCrear = ctx.puede('cotizaciones', 'crear');
  const traer = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.classList.add('cargando'); }
    estado.textContent = alcance.value === 'todas' ? 'Buscando todas las facturas emitidas en el SII… puede tardar un minuto.' : 'Buscando facturas emitidas en el SII…';
    try {
      const est = await estadoDte(ctx);
      if (!est.conectado) throw new Error(`OpenFactura no está conectado: ${est.error ?? 'falta la clave'}`);
      const r = await llamarDte(ctx, 'emitidas', { todas: alcance.value === 'todas' });
      const facturas = r.documentos.filter((d) => [33, 34].includes(d.tipo)).sort((a, b) => b.folio - a.folio);
      const faltan = facturas.filter((d) => !d.factura_id);
      const notas = r.documentos.filter((d) => d.tipo === 61);
      const sinSii = r.folios?.no_en_sii ?? [];
      estado.textContent = `${r.prueba ? 'Ambiente de pruebas (empresa de pruebas de Haulmer). ' : ''}${alcance.value === 'todas' ? 'Desde la primera' : `Desde el ${fechaLarga(r.desde)}`}: ${facturas.length} facturas en el SII, ${facturas.length - faltan.length} ya en Facturas y ${faltan.length} por registrar${notas.length ? `; ${notas.length} notas de crédito` : ''}.${r.completo ? '' : ' (Se revisaron las primeras 600.)'}`;
      const fila = (d) => el('tr', {},
        el('td', {}, el('strong', {}, `N° ${d.folio}`), d.tipo === 34 ? el('span', { class: 'texto-suave texto-chico ban-linea' }, 'Exenta') : null),
        el('td', { class: 'fac-fecha' }, fechaLarga(d.fecha)),
        el('td', {}, el('strong', {}, d.razon ?? 'Sin nombre'), el('span', { class: 'texto-suave texto-chico ban-linea' }, d.rut ?? '')),
        el('td', { class: 'num' }, dinero(d.total)),
        el('td', {}, el('div', { class: 'ban-acciones-fila' },
          boton('Ver', { icono: 'ojo', class: 'boton boton-secundario boton-chico', onclick: () => verEmitida(ctx, d) }),
          puedeCrear && !r.prueba ? boton('Registrar', { icono: 'mas', class: 'boton boton-primario boton-chico', onclick: () => formRegistrar(ctx, d, { cotizaciones, clientes, ordenes, prueba: r.prueba, alGuardar }) }) : null)));
      zona.replaceChildren(
        faltan.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla ban-tabla' },
          el('thead', {}, el('tr', {}, ['Factura', 'Emisión', 'Cliente', 'Total', ''].map((c, i) => el('th', { class: i === 3 ? 'num' : null }, c)))),
          el('tbody', {}, faltan.map(fila)))) : el('p', { class: 'texto-suave' }, 'Todas las facturas del SII ya están en Facturas.'),
        sinSii.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
          ` Folios del 1 al ${r.folios.max} que no están en OpenFactura: ${rangos(sinSii.map((x) => x.folio))}. `,
          sinSii.some((x) => x.factura_id) ? `De esos, ${sinSii.filter((x) => x.factura_id).length} ya están en Facturas (registradas a mano). ` : '',
          'Pueden haberse emitido en otra plataforma antes de OpenFactura o estar anulados.') : null);
    } catch (err) { estado.textContent = err.message; }
    finally { if (b) { b.disabled = false; b.classList.remove('cargando'); } }
  };
  return el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Facturas emitidas en el SII'),
    el('div', { class: 'listado-acciones' }, alcance, boton('Traer del SII', { icono: 'descargar', tipo: 'primario', onclick: traer })),
    estado, zona);
}
