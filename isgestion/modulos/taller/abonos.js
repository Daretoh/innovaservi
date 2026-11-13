// Abonos de la orden con su boleta (Taller 012, 2026-11-12, decisión de Enzo). Van en la sección Cobro de la orden:
// cada abono (anticipo cobrado en la TUU) con fecha, medio, monto, nota y su boleta (foto o PDF subido, o traída del
// SII con "Boleta de la TUU"). La base suma los abonos vigentes en tal_ordenes.abono (saldo, caja y resultados igual).
// Con la orden cobrada o anulada no se agregan ni quitan abonos; la boleta de un abono sí se adjunta o cambia.
import { el } from '../../core/ui/dom.js?v=882cc93';
import { icono } from '../../core/ui/iconos.js?v=882cc93';
import { boton } from '../../core/ui/tabla.js?v=882cc93';
import { abrirFormulario } from '../../core/ui/modal.js?v=882cc93';
import { avisar } from '../../core/ui/aviso.js?v=882cc93';
import { subirArchivo, eliminarArchivo, urlFirmada } from '../../core/adjuntos.js?v=882cc93';
import { comprimirFoto } from '../../core/imagenes.js?v=882cc93';
import { dinero, fechaLarga, hoyISO } from '../../core/ui/formato.js?v=882cc93';
import { MODOS_PAGO } from './datos.js?v=882cc93';
import { traerDeTuu } from './boleta-tuu.js?v=882cc93';

const MEDIOS = MODOS_PAGO.filter(([k]) => k);
const nombreMedio = (k) => MEDIOS.find(([m]) => m === k)?.[1] ?? '';
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function cargarAbonos(ctx, ordenId) {
  const { data, error } = await ctx.api.from('tal_abonos').select('*').eq('orden_id', ordenId).is('deleted_at', null).order('fecha').order('created_at');
  if (error) throw error;
  return data ?? [];
}

// Sube la boleta de un abono (privada, en <empresa>/taller/…)
async function subirBoleta(ctx, archivo, abonoId) {
  const a = archivo.type.startsWith('image/') ? await comprimirFoto(archivo) : archivo;
  const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'taller', archivo: a, tabla: 'tal_abonos', registroId: abonoId, tipos: TIPOS });
  return { boleta_ruta: ruta, boleta_nombre: archivo.name.slice(0, 200) };
}

// o = orden, t = totales(o), abonos = cargarAbonos. Devuelve el bloque para la sección Cobro.
export function seccionAbonos(ctx, { o, t, abonos, alCambiar }) {
  const anulada = o.estado === 'anulada';
  const conArchivo = ctx.puede('taller', 'crear') && ctx.puede('taller', 'editar') && !anulada;   // subir boletas
  const puedeAbonar = conArchivo && !o.cobrado;                                                   // agregar o quitar abonos
  const borrarArchivo = async (ruta) => { if (ruta && ctx.puede('taller', 'eliminar')) await eliminarArchivo(ctx.api, ruta).catch(() => {}); };
  const campoBoleta = { id: 'boleta', etiqueta: 'Boleta del abono (foto o PDF, opcional)', tipo: 'file', accept: 'image/*,application/pdf', multiple: false,
    ayuda: 'La boleta o el comprobante que entregó la TUU. También se puede traer del SII después.' };

  const registrar = () => abrirFormulario({
    titulo: `Registrar abono · N° ${o.numero}`,
    mensaje: t.total ? `Total ${dinero(t.total)} · abonado ${dinero(t.abono)} · falta ${dinero(t.saldo)}.` : null,
    campos: [
      { id: 'monto', etiqueta: 'Monto del abono ($)', tipo: 'number', requerido: true },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'medio', etiqueta: 'Medio de pago', opciones: MEDIOS, valor: o.modo_pago || 'debito' },
      { id: 'nota', etiqueta: 'Nota (opcional)' },
      ...(conArchivo ? [campoBoleta] : []),
    ],
    textoGuardar: 'Registrar abono',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto del abono.');
      if (t.total && o.tipo_venta === 'normal' && monto > t.saldo
        && !confirm(`El abono (${dinero(monto)}) es mayor que lo que falta (${dinero(t.saldo)}). ¿Registrarlo igual?`)) throw new Error('Revisa el monto.');
      const id = crypto.randomUUID();
      const boleta = v.boleta ? await subirBoleta(ctx, v.boleta, id) : {};
      const { error } = await ctx.api.from('tal_abonos').insert({ id, empresa_id: ctx.empresa.id, orden_id: o.id, fecha: v.fecha, monto, medio: v.medio || null, nota: v.nota?.trim() || null, ...boleta });
      if (error) { if (boleta.boleta_ruta) await eliminarArchivo(ctx.api, boleta.boleta_ruta).catch(() => {}); throw new Error(error.message); }
      avisar(`Abono de ${dinero(monto)} registrado.`);
      alCambiar?.();
    },
  });

  const adjuntar = (a) => abrirFormulario({
    titulo: `${a.boleta_ruta ? 'Cambiar' : 'Adjuntar'} boleta del abono`,
    mensaje: `Abono de ${dinero(a.monto)} del ${fechaLarga(a.fecha)}.`,
    campos: [{ ...campoBoleta, etiqueta: 'Boleta del abono (foto o PDF)', requerido: true }],
    textoGuardar: 'Guardar boleta',
    alGuardar: async (v) => {
      if (!v.boleta) throw new Error('Elige la foto o el PDF de la boleta.');
      const boleta = await subirBoleta(ctx, v.boleta, a.id);
      const { error } = await ctx.api.from('tal_abonos').update(boleta).eq('id', a.id);
      if (error) { await eliminarArchivo(ctx.api, boleta.boleta_ruta).catch(() => {}); throw new Error(error.message); }
      await borrarArchivo(a.boleta_ruta);
      avisar('Boleta guardada en el abono.');
      alCambiar?.();
    },
  });

  const ver = async (a) => { try { window.open(await urlFirmada(ctx.api, a.boleta_ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } };
  const tuu = (a) => traerDeTuu(ctx, o, { tipo: 39, total: a.monto, abono: a, alGuardar: () => alCambiar?.() });
  const quitar = async (a) => {
    if (!confirm(`¿Quitar el abono de ${dinero(a.monto)} del ${fechaLarga(a.fecha)}? El saldo de la orden vuelve a subir.`)) return;
    const { error } = await ctx.api.from('tal_abonos').update({ deleted_at: new Date().toISOString() }).eq('id', a.id);
    if (error) { avisar(error.message, 'error'); return; }
    avisar('Abono quitado.');
    alCambiar?.();
  };

  const fila = (a) => el('div', { class: 'cobro-abono' },
    icono(a.boleta_ruta ? 'documento' : 'dinero', { tam: 16 }),
    el('div', { class: 'cobro-boleta-texto' },
      el('strong', {}, dinero(a.monto)),
      el('span', { class: 'texto-chico texto-suave' }, [fechaLarga(a.fecha), nombreMedio(a.medio), a.nota].filter(Boolean).join(' · ')),
      a.boleta_ruta
        ? el('button', { type: 'button', class: 'enlace texto-chico', title: 'Ver la boleta del abono', onclick: () => ver(a) }, a.boleta_nombre ?? 'Ver boleta')
        : el('span', { class: 'texto-chico texto-suave' }, 'Sin boleta')),
    el('div', { class: 'cobro-boleta-acciones' },
      a.boleta_ruta ? boton('Ver', { icono: 'ojo', class: 'boton boton-secundario boton-chico', onclick: () => ver(a) }) : null,
      conArchivo && !a.boleta_ruta ? boton('Boleta de la TUU', { icono: 'buscar', class: 'boton boton-secundario boton-chico', title: 'Traer del SII la boleta que emitió la TUU', onclick: () => tuu(a) }) : null,
      conArchivo ? boton(a.boleta_ruta ? 'Cambiar' : 'Adjuntar', { icono: a.boleta_ruta ? 'editar' : 'documento', class: 'boton boton-secundario boton-chico', onclick: () => adjuntar(a) }) : null,
      puedeAbonar ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar el abono', 'aria-label': 'Quitar el abono', onclick: () => quitar(a) }, icono('basura', { tam: 15 })) : null));

  if (!abonos.length && !puedeAbonar) return null;
  return el('div', { class: 'cobro-abonos' },
    el('div', { class: 'cobro-abonos-cabecera' },
      el('span', { class: 'texto-chico texto-suave' }, abonos.length ? `Abonos (${abonos.length})` : 'Abonos'),
      puedeAbonar ? boton('Registrar abono', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: registrar }) : null),
    abonos.map(fila));
}

// Compra como costo desde el Cobro de la orden (2026-11-12, pedido de Enzo): boleta o factura de un proveedor, en foto
// o PDF (lector de Costos con ?orden=) o una compra traída del SII que espera en la Bandeja de Costos. El gasto queda
// con la patente y ligado a esta orden: sale en "Costos de este vehículo" y en el margen. Pide costos.crear.
export function compraComoCosto(ctx, o) {
  if (!ctx.puede('costos', 'crear') || o.estado === 'anulada') return null;
  const lector = (extra = {}) => { location.hash = ctx.ruta('costos.lector', { orden: o.id, ...extra }); };
  const delSii = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const { data, error } = await ctx.api.from('fin_bandeja').select('id, nombre, dte, created_at')
      .eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente').eq('origen', 'sii').order('created_at', { ascending: false }).limit(300);
    b.disabled = false;
    if (error) { avisar(error.message, 'error'); return; }
    if (!data.length) { avisar('No hay compras del SII esperando en la Bandeja de Costos. Tráelas desde Costos → Bandeja.', 'error'); return; }
    const texto = (x) => {
      const d = x.dte ?? {};
      return [d.razon ?? d.rut ?? x.nombre, d.folio ? `N° ${d.folio}` : null, d.fecha ? fechaLarga(d.fecha) : null, d.total != null ? dinero(Number(d.total)) : null].filter(Boolean).join(' · ');
    };
    abrirFormulario({
      titulo: `Compra del SII · orden N° ${o.numero}`,
      mensaje: 'Elige la compra: se abre en el lector con sus datos y queda como costo de este vehículo.',
      campos: [{ id: 'doc', etiqueta: 'Compra', requerido: true, opciones: [['', 'Elegir…'], ...data.map((x) => [x.id, texto(x)])] }],
      textoGuardar: 'Abrir en el lector',
      alGuardar: (v) => { if (!v.doc) throw new Error('Elige la compra.'); lector({ bandeja: v.doc }); },
    });
  };
  return el('div', { class: 'cobro-abonos' },
    el('span', { class: 'texto-chico texto-suave' }, 'Compras de este trabajo (costo)'),
    el('div', { class: 'cobro-compras' },
        boton('Subir compra', { icono: 'documento', class: 'boton boton-secundario boton-chico', title: 'Boleta o factura del proveedor (foto o PDF): queda como costo de este vehículo', onclick: () => lector() }),
        boton('Compra del SII', { icono: 'buscar', class: 'boton boton-secundario boton-chico', title: 'Una compra traída del SII que espera en la Bandeja de Costos', onclick: delSii })));
}
