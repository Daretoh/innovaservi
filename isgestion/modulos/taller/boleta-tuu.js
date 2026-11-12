// Cobro con la máquina TUU (OpenFactura, Núcleo 021-022, 2026-11-10). La TUU emite la boleta o la factura al cobrar
// (es de Haulmer, igual que OpenFactura), así que ISgestión no emite otra:
// - tarjetaTuu: antes de cobrar, qué marcar en la máquina (documento, datos del cliente si es factura y el monto
//   exacto, con el IVA ya sumado si es factura), para evitar errores.
// - traerDeTuu: después de cobrar, trae del SII el documento de ese día (sugiere el del mismo total y RUT):
//   boleta → su PDF queda como boleta de la orden (y el cobro se registra si faltaba);
//   factura → queda en Cotizaciones → Facturas, ligada a la orden y pagada (la base deja la orden cobrada).
// En el ambiente de pruebas solo se muestra el PDF (documentos de la empresa de pruebas de Haulmer).
import { el } from '../../core/ui/dom.js?v=9dfb925';
import { icono } from '../../core/ui/iconos.js?v=9dfb925';
import { boton } from '../../core/ui/tabla.js?v=9dfb925';
import { abrirFormulario } from '../../core/ui/modal.js?v=9dfb925';
import { avisar } from '../../core/ui/aviso.js?v=9dfb925';
import { dinero, diaLocal, hoyISO } from '../../core/ui/formato.js?v=9dfb925';
import { llamarDte, estadoDte } from '../../core/dte.js?v=9dfb925';

const limpio = (r) => String(r ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

// Lo que hay que marcar en la máquina. t = totales de la orden; facturarA = cliente de la factura (si pide factura).
export function tarjetaTuu({ o, t, facturarA = null, alTraer = null }) {
  const factura = o.doc_tipo === 'factura';
  const monto = t.saldo;
  const copiar = (ev) => {
    navigator.clipboard?.writeText(String(monto)).then(() => avisar(`Monto ${dinero(monto)} copiado.`), () => {});
    ev.currentTarget.blur();
  };
  const fila = (k, v) => el('div', {}, el('span', {}, k), el('strong', {}, v));
  return el('div', { class: 'cobro-tuu' },
    el('p', { class: 'cobro-tuu-titulo' }, icono('dinero', { tam: 16 }), ' Cobrar en la TUU'),
    fila('Documento', factura ? 'Factura' : 'Boleta'),
    factura && facturarA ? fila('RUT', facturarA.rut ?? 'Falta el RUT') : null,
    factura && facturarA ? fila('Razón social', facturarA.razon_social ?? '') : null,
    factura && facturarA?.giro ? fila('Giro', facturarA.giro) : null,
    factura ? fila('Neto + IVA', `${dinero(t.neto)} + ${dinero(t.iva)}`) : null,
    t.abono ? fila('Abono ya pagado', `− ${dinero(t.abono)}`) : null,
    el('div', { class: 'cobro-tuu-monto' }, el('span', {}, 'Monto a marcar'), el('strong', {}, dinero(monto))),
    el('div', { class: 'listado-acciones' },
      boton('Copiar monto', { icono: 'copiar', class: 'boton boton-secundario boton-chico', onclick: copiar }),
      alTraer ? boton(`Ya cobré: traer la ${factura ? 'factura' : 'boleta'}`, { icono: 'descargar', class: 'boton boton-secundario boton-chico', onclick: alTraer }) : null),
    el('p', { class: 'texto-suave texto-chico' }, factura
      ? 'En la TUU elige Factura, escribe este RUT y marca el monto: ya incluye el IVA.'
      : 'En la TUU elige Boleta y marca este monto (precio final, sin desglose de IVA).'));
}

// Después de cobrar: trae la boleta (39) o la factura (33) del día y la liga a la orden.
// alCobrar(): registra el cobro de la orden si faltaba (lo hace la vista; con factura lo hace la base).
// abono = abono de la orden (Taller 012): la boleta queda en ese abono y el cobro de la orden no cambia.
export async function traerDeTuu(ctx, o, { tipo = 39, total = null, rut = null, terceroId = null, medio = null, alCobrar = null, alGuardar, abono = null } = {}) {
  const est = await estadoDte(ctx);
  if (!est.conectado) { avisar(`OpenFactura no está conectado: ${est.error ?? 'falta la clave de la empresa'}`, 'error'); return; }
  const factura = tipo === 33;
  const nombre = factura ? 'factura' : 'boleta';
  let lista = [];
  const buscar = async ({ valor, opciones, poner, estado }) => {
    if (!valor) return;
    estado(`Buscando las ${nombre}s de ese día en el SII…`);
    try {
      const r = await llamarDte(ctx, 'boletas', { fecha: valor, tipo });
      const coincide = (b) => b.total === total && (!factura || !rut || limpio(b.rut) === limpio(rut));
      lista = r.boletas.filter((b) => (!b.orden_id || b.orden_id === o.id) && !b.registrada)
        .sort((a, b) => (Number(coincide(b)) - Number(coincide(a))) || String(b.hora).localeCompare(String(a.hora)));
      opciones('doc', [['', lista.length ? 'Elegir…' : `No hay ${nombre}s libres ese día`],
        ...lista.map((b) => [b.token, `N° ${b.folio}${b.hora ? ` · ${b.hora}` : ''} · ${dinero(b.total)}${factura && b.razon ? ` · ${b.razon}` : ''}${coincide(b) ? ' · coincide con esta orden' : ''}`])]);
      const igual = lista.filter(coincide);
      if (igual.length === 1) poner('doc', igual[0].token);
      estado(`${lista.length} ${lista.length === 1 ? nombre : `${nombre}s`} sin ligar${igual.length ? `; ${igual.length} coincide${igual.length === 1 ? '' : 'n'} con esta orden` : ''}.${r.completo ? '' : ' (Solo las primeras 150.)'}`, 'ok');
    } catch (err) { estado(err.message, 'error'); }
  };
  abrirFormulario({
    titulo: `${factura ? 'Factura' : 'Boleta'} de la TUU · ${abono ? 'abono · ' : ''}N° ${o.numero}`,
    mensaje: est.prueba
      ? 'Ambiente de pruebas de OpenFactura: se ven documentos de la empresa de pruebas de Haulmer y la orden no cambia.'
      : abono
        ? `Elige la boleta que emitió la TUU por el abono (${dinero(abono.monto)}). Su PDF queda en ese abono.`
      : factura
        ? `Elige la factura que emitió la TUU${total != null ? ` (${dinero(total)})` : ''}. Queda en Facturas, pagada, y la orden queda cobrada.`
        : `Elige la boleta que emitió la TUU${total != null ? ` (${dinero(total)})` : ''}. Su PDF queda en la orden${o.cobrado ? '' : ' y el cobro queda registrado'}.`,
    campos: [
      { id: 'fecha', etiqueta: `Día de la ${nombre}`, tipo: 'date', requerido: true, valor: abono?.fecha ?? (diaLocal(o.cobrado_at) || hoyISO()), alCambiar: buscar },
      { id: 'doc', etiqueta: factura ? 'Factura' : 'Boleta', requerido: true, opciones: [['', 'Buscando…']] },
    ],
    textoGuardar: est.prueba ? 'Ver el PDF (prueba)' : 'Guardar en la orden',
    alGuardar: async (v) => {
      if (!v.doc) throw new Error(`Elige la ${nombre}.`);
      const d = lista.find((b) => b.token === v.doc);
      const r = factura
        ? await llamarDte(ctx, 'registrar_emitida', { token: v.doc, orden_id: o.id, tercero_id: terceroId, pago: { fecha: d?.fecha ?? v.fecha, medio: medio ?? 'debito' } })
        : await llamarDte(ctx, 'ligar_boleta', { orden_id: o.id, token: v.doc, ...(abono ? { abono_id: abono.id } : {}) });
      if (r.pdf) window.open(r.pdf, '_blank', 'noopener');
      if (r.aviso) { avisar(r.aviso, 'error'); alGuardar?.(r); return; }
      if (r.prueba) { avisar(`${factura ? 'Factura' : 'Boleta'} de prueba N° ${r.folio}: la orden no cambia.`); alGuardar?.(r); return; }
      if (abono) { avisar(`Boleta N° ${r.folio} guardada en el abono.`); alGuardar?.(r); return; }
      if (!factura && !o.cobrado && alCobrar) await alCobrar(d?.fecha ?? v.fecha);
      avisar(factura ? `Factura N° ${r.folio} registrada y pagada: la orden quedó cobrada.` : `Boleta N° ${r.folio} guardada${o.cobrado ? '' : ' y cobro registrado'}.`);
      alGuardar?.(r);
    },
  });
  setTimeout(() => document.getElementById('f-fecha')?.dispatchEvent(new Event('change')), 0);
}

// Compatibilidad: boleta (lo usaba la orden antes)
export const elegirBoletaTuu = (ctx, o, opciones = {}) => traerDeTuu(ctx, o, { ...opciones, tipo: 39 });
