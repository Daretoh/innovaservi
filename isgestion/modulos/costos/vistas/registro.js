// Gasto u otro ingreso.
// - Nuevo:  #/costos.registro?tipo=gasto|ingreso
// - Ver y editar: #/costos.registro?id=<id>
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js';
import { dinero, hoyISO, fechaLarga } from '../../../core/ui/formato.js';
import { cargarBase, nombreTercero, DOCS, MEDIOS, netoDe } from '../datos.js';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];

export default async function vista(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.registros') }, icono('volver', { tam: 16 }), 'Gastos e ingresos');
  const conTaller = ctx.puede('taller', 'ver');
  const [base, reg, ordenes] = await Promise.all([
    cargarBase(ctx),
    ctx.params.id ? ctx.api.from('fin_registros').select('*, fin_recurrentes(concepto)').eq('id', ctx.params.id).maybeSingle() : Promise.resolve({ data: null }),
    conTaller ? ctx.api.from('tal_ordenes').select('id, numero, fecha_cita, tal_vehiculos(patente, marca, modelo)').eq('empresa_id', ctx.empresa.id)
      .neq('estado', 'anulada').order('numero', { ascending: false }).limit(150) : Promise.resolve({ data: [] }),
  ]);
  if (reg.error) throw reg.error;
  const r = reg.data;
  if (ctx.params.id && !r) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Registro no encontrado'));
  const tipo = r?.tipo ?? (ctx.params.tipo === 'ingreso' ? 'ingreso' : 'gasto');
  const esIngreso = tipo === 'ingreso';
  const puedeGuardar = r ? ctx.puede('costos', 'editar') : ctx.puede('costos', 'crear');
  const cats = base.categorias.filter((c) => (esIngreso ? c.clase === 'ingreso' : c.clase !== 'ingreso') && (c.activo || c.id === r?.categoria_id));
  if (!cats.length) {
    return el('section', { class: 'listado' }, volver, el('h1', {}, esIngreso ? 'Nuevo ingreso' : 'Nuevo gasto'),
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `Primero crea una categoría de ${esIngreso ? 'ingreso' : 'gasto'}. `,
        el('a', { href: ctx.ruta('costos.config') }, 'Ir a Categorías y centros')));
  }

  // Controles
  const campo = (id, attrs = {}, valor = '') => Object.assign(el('input', { class: 'campo', id: `r-${id}`, ...attrs }), { value: valor ?? '' });
  const select = (id, opciones, valor) => el('select', { class: 'campo', id: `r-${id}` }, opciones.map(([v, t]) => el('option', { value: v, selected: v === (valor ?? '') }, t)));
  const fecha = campo('fecha', { type: 'date', required: true }, r?.fecha ?? hoyISO());
  const concepto = campo('concepto', { required: true, placeholder: esIngreso ? 'Ej.: servicio de limpieza de septiembre' : 'Ej.: pintura y lija' }, r?.concepto);
  const categoria = select('categoria', cats.map((c) => [c.id, c.nombre + (c.clase === 'inventario' ? ' (stock)' : c.clase === 'personal' ? ' (personal)' : '')]), r?.categoria_id ?? cats[0].id);
  const centro = select('centro', [['', 'Sin centro'], ...base.centros.filter((c) => c.activo || c.id === r?.centro_id).map((c) => [c.id, c.nombre])], r?.centro_id);
  const tercero = select('tercero', [['', esIngreso ? 'Sin cliente del maestro' : 'Sin proveedor del maestro'],
    ...base.terceros.filter((t) => t.tipo?.includes(esIngreso ? 'cliente' : 'proveedor') || t.id === r?.tercero_id).map((t) => [t.id, nombreTercero(t)])], r?.tercero_id);
  const doc = select('doc', DOCS, r?.doc_tipo ?? (esIngreso ? 'factura' : 'factura'));
  const docNum = campo('docnum', { placeholder: 'N° (opcional)' }, r?.doc_numero);
  const total = campo('total', { type: 'number', min: 1, step: 1, required: true }, r?.total);
  const desglose = el('span', { class: 'texto-suave texto-chico' });
  const pintarDesglose = () => {
    const { neto, iva } = netoDe(total.value, doc.value);
    desglose.textContent = Number(total.value) > 0 ? (iva ? `Neto ${dinero(neto)} + IVA ${dinero(iva)}` : `Neto ${dinero(neto)} (sin IVA separado)`) : '';
  };
  total.addEventListener('input', pintarDesglose); doc.addEventListener('change', pintarDesglose); pintarDesglose();
  const patente = campo('patente', { placeholder: 'Opcional, para la utilidad por vehículo' }, r?.patente);
  const orden = conTaller && !esIngreso ? select('orden', [['', 'Sin orden'], ...(ordenes.data ?? []).map((o) => [o.id,
    `N° ${o.numero} · ${[o.tal_vehiculos?.patente, o.tal_vehiculos?.marca, o.tal_vehiculos?.modelo].filter(Boolean).join(' ')}`])], r?.orden_id) : null;
  const pagado = el('input', { type: 'checkbox', id: 'r-pagado', checked: r?.estado_pago === 'pagado' });
  const fechaPago = campo('fpago', { type: 'date' }, r?.fecha_pago ?? hoyISO());
  const medio = select('medio', MEDIOS, r?.medio_pago ?? 'transferencia');
  const filaPago = el('div', { class: 'rejilla-campos' });
  const pintarPago = () => filaPago.replaceChildren(...(pagado.checked ? [fila('Fecha', fechaPago), fila('Medio', medio)] : []));
  pagado.addEventListener('change', pintarPago);
  const archivo = el('input', { class: 'campo', id: 'r-archivo', type: 'file', accept: ARCHIVOS.join(',') });
  const notas = Object.assign(el('textarea', { class: 'campo', id: 'r-notas', rows: 2 }), { value: r?.notas ?? '' });
  function fila(label, ctl, ayuda) { return el('div', { class: 'form-fila' }, el('label', { for: ctl.id }, label), ctl, ayuda ?? null); }
  pintarPago();

  const guardar = async (ev) => {
    const b = ev.currentTarget;
    if (!concepto.value.trim()) { avisar('Escribe el concepto.', 'error'); return; }
    if (!(Number(total.value) > 0)) { avisar('El total debe ser mayor a cero.', 'error'); return; }
    b.disabled = true;
    let ruta = null;
    try {
      if (archivo.files[0]) ruta = (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'costos', archivo: archivo.files[0], tabla: 'fin_registros', registroId: r?.id ?? null, tipos: ARCHIVOS })).ruta;
      const datos = {
        fecha: fecha.value, concepto: concepto.value.trim(), categoria_id: categoria.value, centro_id: centro.value || null, tercero_id: tercero.value || null,
        doc_tipo: doc.value, doc_numero: docNum.value.trim() || null, total: Math.round(Number(total.value)), patente: patente.value.trim() || null,
        orden_id: orden ? orden.value || null : r?.orden_id ?? null,
        estado_pago: pagado.checked ? 'pagado' : 'pendiente', fecha_pago: pagado.checked ? fechaPago.value || hoyISO() : null, medio_pago: pagado.checked ? medio.value : null,
        notas: notas.value.trim() || null, ...(ruta ? { archivo: ruta } : {}),
      };
      const res = r ? await ctx.api.from('fin_registros').update(datos).eq('id', r.id).select('id').single()
        : await ctx.api.from('fin_registros').insert({ ...datos, empresa_id: ctx.empresa.id, tipo }).select('id').single();
      if (res.error) throw new Error(res.error.message);
      if (ruta && r?.archivo) eliminarArchivo(ctx.api, r.archivo).catch(() => {});
      avisar(r ? 'Guardado.' : `${esIngreso ? 'Ingreso' : 'Gasto'} registrado.`);
      location.hash = r ? ctx.ruta('costos.registro', { id: r.id }) : ctx.ruta('costos.registros');
      if (r) ctx.refrescar();
    } catch (err) {
      if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {});
      avisar(err.message, 'error'); b.disabled = false;
    }
  };

  const eliminar = () => abrirFormulario({
    titulo: `Eliminar ${esIngreso ? 'ingreso' : 'gasto'}`,
    mensaje: `"${r.concepto}" sale de los listados y del Estado de resultados. Queda en la auditoría.`,
    campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { error } = await ctx.api.from('fin_registros').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw new Error(error.message);
      avisar('Eliminado.'); location.hash = ctx.ruta('costos.registros');
    },
  });

  const acciones = [];
  if (r?.archivo) acciones.push(boton('Ver respaldo', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, r.archivo, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }));
  if (r && ctx.puede('costos', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: eliminar }));
  const origen = [r?.fin_recurrentes ? `Generado del recurrente "${r.fin_recurrentes.concepto}" (${r.periodo})` : null,
    r?.documento_id ? 'Compra traída de Inventario' : null,
    r?.moneda === 'USD' ? `US$ ${r.monto_origen} × ${dinero(r.tipo_cambio)}` : null].filter(Boolean);

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, r ? r.concepto : esIngreso ? 'Nuevo ingreso' : 'Nuevo gasto'),
        r ? el('p', { class: 'texto-suave' }, [fechaLarga(r.fecha), dinero(r.total), r.estado_pago === 'pagado' ? (esIngreso ? 'cobrado' : 'pagado') : (esIngreso ? 'por cobrar' : 'por pagar')].join(' · ')) : null),
      el('div', { class: 'listado-acciones' }, acciones)),
    origen.length ? el('p', { class: 'texto-suave texto-chico' }, origen.join(' · ')) : null,
    el('div', { class: 'ficha doc-grupo fin-form' },
      el('div', { class: 'rejilla-campos' }, fila('Fecha', fecha), fila('Concepto', concepto)),
      el('div', { class: 'rejilla-campos' }, fila('Categoría', categoria), fila('Centro de costo', centro), fila(esIngreso ? 'Cliente' : 'Proveedor', tercero)),
      el('div', { class: 'rejilla-campos' }, fila('Documento', doc), fila('N° de documento', docNum), fila('Total (con IVA si lo tiene)', total, desglose)),
      esIngreso ? null : el('div', { class: 'rejilla-campos' }, fila('Patente', patente), orden ? fila('Orden de trabajo', orden) : null),
      el('label', { class: 'casilla' }, pagado, esIngreso ? 'Ya está cobrado' : 'Ya está pagado'),
      filaPago,
      fila(r?.archivo ? 'Reemplazar respaldo (factura, boleta o comprobante)' : 'Respaldo (factura, boleta o comprobante)', archivo),
      fila('Notas', notas),
      puedeGuardar ? el('div', {}, boton(r ? 'Guardar cambios' : 'Registrar', { icono: 'check', tipo: 'primario', onclick: guardar })) : null));
}
