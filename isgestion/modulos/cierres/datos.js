// Datos compartidos de Cierres y cuentas.
import { el } from '../../core/ui/dom.js?v=e4cf9a2';
import { abrirFormulario } from '../../core/ui/modal.js?v=e4cf9a2';
import { avisar } from '../../core/ui/aviso.js?v=e4cf9a2';
import { dinero, fechaLarga, diaLocal } from '../../core/ui/formato.js?v=e4cf9a2';

export const ESTADOS = [['borrador', 'Borrador'], ['emitido', 'Emitido'], ['oc', 'OC recibida'], ['facturado', 'Facturado'], ['cobrado', 'Cobrado']];
export const nombreEstado = Object.fromEntries(ESTADOS);
export const CHIP_ESTADO = { borrador: 'chip-pend', emitido: 'chip-prox', oc: 'chip-prox', facturado: 'chip-venc', cobrado: 'chip-ok' };
export const indiceEstado = (e) => ESTADOS.findIndex(([k]) => k === e);
export const MEDIOS = [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['cheque', 'Cheque'], ['debito', 'Débito'], ['credito', 'Crédito'], ['otro', 'Otro']];
export const nombreMedio = Object.fromEntries(MEDIOS);
export const IVA = 0.19;
export const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';
export const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');
export const numeroTexto = (n) => (n ? String(n).padStart(6, '0') : '—');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMesLargo = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`.replace(/^./, (c) => c.toUpperCase());

// Totales de un cierre: en borrador se calculan de las líneas; emitido usa los congelados
export function totalesCierre(c, lineas) {
  if (c.estado !== 'borrador') return { neto: c.neto, iva: c.iva, total: c.total };
  const neto = lineas.filter((l) => !l.excluida).reduce((s, l) => s + Number(l.monto || 0), 0);
  const iva = c.afecto_iva ? Math.round(neto * IVA) : 0;
  return { neto, iva, total: neto + iva };
}

// Total de una cotización (igual que cie_total_cotizacion en la base)
export function totalCotizacion(c) {
  const sub = (c.cot_lineas ?? []).filter((l) => l.tipo === 'item')
    .reduce((s, l) => s + Math.round(Number(l.cantidad) * Number(l.precio) * (1 - Number(l.desc_pct || 0) / 100)), 0);
  const neto = sub - Math.round(sub * Number(c.desc_adic_pct || 0) / 100);
  return neto + (c.con_iva ? Math.round(neto * IVA) : 0);
}

// Cuenta: total, abonado, saldo y por cotización
export function totalesCuenta(items, abonos) {
  const vivos = abonos.filter((a) => !a.deleted_at);
  const porCot = new Map(items.map((i) => {
    const total = i.monto ?? (i.cot_cotizaciones ? totalCotizacion(i.cot_cotizaciones) : 0);
    const abonado = vivos.filter((a) => a.cotizacion_id === i.cotizacion_id).reduce((s, a) => s + a.monto, 0);
    return [i.cotizacion_id, { total, abonado, saldo: total - abonado }];
  }));
  const total = [...porCot.values()].reduce((s, x) => s + x.total, 0);
  const abonado = vivos.reduce((s, a) => s + a.monto, 0);
  return { total, abonado, saldo: total - abonado, porCot, general: vivos.filter((a) => !a.cotizacion_id).reduce((s, a) => s + a.monto, 0) };
}

export function estadoCuenta(k, t) {
  if (k.estado === 'cerrada') return ['Cerrada', 'chip-na'];
  if (t.total > 0 && t.saldo <= 0) return ['Pagada', 'chip-ok'];
  if (t.abonado > 0) return ['Con abonos', 'chip-prox'];
  return ['Pendiente', 'chip-pend'];
}

// Historial (auditoría) de un cierre o una cuenta, en un modal de solo lectura
const TABLA = { cie_cierres: 'Cierre', cie_lineas: 'Línea', cie_cuentas: 'Cuenta', cie_cuenta_cotizaciones: 'Cotización', cie_abonos: 'Abono' };
const ACCION = { insert: 'agregó', update: 'cambió', delete: 'quitó' };
function describir(h) {
  const d = h.despues ?? {}, a = h.antes ?? {};
  if (h.tabla === 'cie_cierres' && d.estado !== a.estado) return `pasó a ${nombreEstado[d.estado] ?? d.estado}${d.numero && !a.numero ? ` (N° ${d.numero})` : ''}`;
  if (h.tabla === 'cie_lineas') return `${ACCION[h.accion]} ${d.descripcion || a.descripcion || 'línea'}${d.excluida && !a.excluida ? ' (excluida)' : ''}`;
  if (h.tabla === 'cie_abonos') return d.deleted_at && !a.deleted_at ? `anuló abono de ${dinero(d.monto)}` : `${ACCION[h.accion]} abono de ${dinero(d.monto ?? a.monto)}`;
  if (h.tabla === 'cie_cuentas' && d.estado !== a.estado) return d.estado === 'cerrada' ? 'cerró la cuenta' : 'reabrió la cuenta';
  return `${ACCION[h.accion]} ${TABLA[h.tabla]?.toLowerCase() ?? h.tabla}`;
}
export async function verHistorial(ctx, id, titulo) {
  const { data, error } = await ctx.api.rpc('cie_historial', { p_id: id });
  if (error) { avisar(error.message, 'error'); return; }
  // Sin campos: el modal sirve como visor
  abrirFormulario({
    titulo: `Historial · ${titulo}`, campos: [], textoGuardar: 'Cerrar',
    mensaje: data.length ? null : 'Sin cambios registrados.',
    alGuardar: async () => {},
  });
  const lista = el('div', { class: 'cie-historial' }, data.map((h) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, describir(h)), el('span', { class: 'texto-suave texto-chico' }, h.email)),
    el('span', { class: 'texto-suave texto-chico' }, `${fechaLarga(diaLocal(h.at))} ${new Date(h.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`))));
  document.querySelector('dialog.modal:last-of-type .modal-cuerpo')?.prepend(lista);
}

// Texto para nombre de archivo: sin tildes, minúsculas y guiones
export const archivoSeguro = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
