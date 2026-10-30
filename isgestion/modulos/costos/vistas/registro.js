// Gasto u otro ingreso.
// - Nuevo:  #/costos.registro?tipo=gasto|ingreso
// - Ver y editar: #/costos.registro?id=<id>
import { el } from '../../../core/ui/dom.js?v=af5b0f2';
import { icono } from '../../../core/ui/iconos.js?v=af5b0f2';
import { boton } from '../../../core/ui/tabla.js?v=af5b0f2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=af5b0f2';
import { avisar } from '../../../core/ui/aviso.js?v=af5b0f2';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=af5b0f2';
import { dinero, hoyISO, fechaLarga, sumarDias } from '../../../core/ui/formato.js?v=af5b0f2';
import { leerConIA, iaDisponible, numIA, fechaIA, pagadoAlComprar, textoModelo } from '../../../core/lector-ia.js?v=af5b0f2';
import { cargarBase, nombreTercero, DOCS, MEDIOS, netoDe, estadosDe, estadoInicial, nombreEstado, opcionesACuenta } from '../datos.js?v=af5b0f2';


const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];

export default async function vista(ctx) {
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.registros') }, icono('volver', { tam: 16 }), 'Gastos e ingresos');
  const conTaller = ctx.puede('taller', 'ver');
  const conFaenas = ctx.puede('ope', 'ver');
  const [base, reg, ordenes, faenas] = await Promise.all([
    cargarBase(ctx),
    ctx.params.id ? ctx.api.from('fin_registros').select('*, fin_recurrentes(concepto)').eq('id', ctx.params.id).maybeSingle() : Promise.resolve({ data: null }),
    conTaller ? ctx.api.from('tal_ordenes').select('id, numero, fecha_cita, tal_vehiculos(patente, marca, modelo)').eq('empresa_id', ctx.empresa.id)
      .neq('estado', 'anulada').order('numero', { ascending: false }).limit(150) : Promise.resolve({ data: [] }),
    conFaenas ? ctx.api.from('ope_faenas').select('id, titulo, fecha_inicio, fecha_fin').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).neq('estado', 'cancelada')
      .gte('fecha_fin', sumarDias(hoyISO(), -120)).lte('fecha_inicio', sumarDias(hoyISO(), 30)).order('fecha_inicio', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  if (reg.error) throw reg.error;
  const r = reg.data;
  if (ctx.params.id && !r) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Registro no encontrado'));
  const tipo = r?.tipo ?? (ctx.params.tipo === 'ingreso' ? 'ingreso' : 'gasto');
  const esIngreso = tipo === 'ingreso';
  const puedeGuardar = r ? ctx.puede('costos', 'editar') || (ctx.puede('costos', 'crear') && r.created_by === ctx.usuario?.id && r.estado_pago === 'pendiente') : ctx.puede('costos', 'crear');
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
  // Compra por cuenta de un tercero (no es gasto de la empresa: se le descuenta de su pago)
  const aCuenta = esIngreso ? null : select('acuenta', opcionesACuenta(base, r?.a_cuenta_de), r?.a_cuenta_de);
  const orden = conTaller && !esIngreso ? select('orden', [['', 'Sin orden'], ...(ordenes.data ?? []).map((o) => [o.id,
    `N° ${o.numero} · ${[o.tal_vehiculos?.patente, o.tal_vehiculos?.marca, o.tal_vehiculos?.modelo].filter(Boolean).join(' ')}`])], r?.orden_id) : null;
  // Faena (Innova) para el costo por faena
  const listaFaenas = [...(faenas.data ?? [])];
  if (r?.faena_id && !listaFaenas.some((f) => f.id === r.faena_id)) listaFaenas.push({ id: r.faena_id, titulo: 'Faena anterior', fecha_inicio: '' });
  const faena = conFaenas ? select('faena', [['', 'Sin faena (gasto general)'], ...listaFaenas.map((f) => [f.id, `${f.fecha_inicio ? `${fechaLarga(f.fecha_inicio)} · ` : ''}${f.titulo}`])], r?.faena_id) : null;
  // Estado: por revisar → listo (por pagar o cobrar) → pagado. Nuevo: según el documento, hasta que se elija a mano.
  // Quien solo carga (sin permiso de editar) deja todo "por revisar" y lo revisa otra persona
  const soloCarga = !ctx.puede('costos', 'editar');
  const estado = select('estado', soloCarga ? estadosDe(tipo).filter(([k]) => k === 'pendiente' || k === r?.estado_pago) : estadosDe(tipo), r?.estado_pago ?? (soloCarga ? 'pendiente' : estadoInicial(tipo, r?.doc_tipo ?? 'factura')));
  let estadoTocado = !!r || soloCarga;
  estado.addEventListener('change', () => { estadoTocado = true; pintarPago(); });
  doc.addEventListener('change', () => { if (!estadoTocado) { estado.value = estadoInicial(tipo, doc.value); pintarPago(); } });
  const vence = campo('vence', { type: 'date' }, r?.vence);
  const fechaPago = campo('fpago', { type: 'date' }, r?.fecha_pago ?? hoyISO());
  const medio = select('medio', MEDIOS, r?.medio_pago ?? 'transferencia');
  const filaPago = el('div', { class: 'rejilla-campos' });
  const pintarPago = () => filaPago.replaceChildren(...(estado.value === 'pagado' ? [fila(esIngreso ? 'Fecha de cobro' : 'Fecha de pago', fechaPago), fila('Medio', medio)] : [fila(esIngreso ? 'Vence el cobro' : 'Vence el pago', vence)]));
  const archivo = el('input', { class: 'campo', id: 'r-archivo', type: 'file', accept: ARCHIVOS.join(',') });
  // Al elegir la foto, la IA lee el documento y llena los datos (como InnovaGestión)
  const iaEstado = el('span', { class: 'texto-chico campo-accion-estado', 'aria-live': 'polite' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f || !f.type.startsWith('image/') || !iaDisponible()) return;
    iaEstado.textContent = 'Leyendo el documento con IA…'; iaEstado.className = 'texto-chico campo-accion-estado';
    try {
      const res = await leerConIA(ctx.api, { empresaId: ctx.empresa.id, modo: esIngreso ? 'venta' : 'compra', archivos: [f] });
      const d = res.datos ?? {};
      const pon = (c, v) => { if (v != null && v !== '') { c.value = v; c.dispatchEvent(new Event('change')); } };
      pon(fecha, fechaIA(d.fecha));
      pon(doc, { 33: 'factura', 34: 'factura', 39: 'boleta', 41: 'boleta', 52: 'guia', 61: 'otro', 0: 'otro' }[d.tipo]);
      pon(docNum, d.folio ? String(d.folio) : null); pon(total, numIA(d.total)); pintarDesglose();
      const rn = (x) => String(x ?? '').replace(/[^\dkK]/g, '').toUpperCase();
      const t = d.rut ? base.terceros.find((x) => rn(x.rut) === rn(d.rut)) : null;
      if (t && [...tercero.options].some((o) => o.value === t.id)) pon(tercero, t.id);
      const it = Array.isArray(d.items) && d.items[0]?.descripcion;
      if (!concepto.value.trim()) concepto.value = it ? `${it}${d.items.length > 1 ? ` y ${d.items.length - 1} más` : ''}` : d.razon || '';
      if (!esIngreso && !r && !soloCarga && pagadoAlComprar(d)) { estado.value = 'pagado'; estadoTocado = true; pintarPago(); }
      iaEstado.textContent = `${textoModelo(res)}. Revisa antes de guardar.${t ? '' : d.razon ? ` ${esIngreso ? 'Cliente' : 'Proveedor'}: ${d.razon}${d.rut ? ` (${d.rut})` : ''}, no está en el maestro.` : ''}${d.observaciones ? ` ${d.observaciones}` : ''}`;
      iaEstado.className = 'texto-chico campo-accion-estado estado-ok';
    } catch (err) { iaEstado.textContent = `${err.message}. Completa los datos a mano.`; iaEstado.className = 'texto-chico campo-accion-estado estado-mal'; }
  });
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
      // Posible duplicado (como InnovaGestión): mismo N° y proveedor, o mismo proveedor, total y fecha
      if (!r && !(await revisarDuplicado())) { b.disabled = false; return; }
      if (archivo.files[0]) ruta = (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'costos', archivo: archivo.files[0], tabla: 'fin_registros', registroId: r?.id ?? null, tipos: ARCHIVOS })).ruta;
      const datos = {
        fecha: fecha.value, concepto: concepto.value.trim(), categoria_id: categoria.value, centro_id: centro.value || null, tercero_id: tercero.value || null,
        doc_tipo: doc.value, doc_numero: docNum.value.trim() || null, total: Math.round(Number(total.value)), patente: patente.value.trim() || null,
        orden_id: orden ? orden.value || null : r?.orden_id ?? null, ...(aCuenta ? { a_cuenta_de: aCuenta.value || null } : {}),
        estado_pago: estado.value, fecha_pago: estado.value === 'pagado' ? fechaPago.value || fecha.value || hoyISO() : null, medio_pago: estado.value === 'pagado' ? medio.value : null,
        vence: estado.value === 'pagado' ? r?.vence ?? null : vence.value || null, ...(faena ? { faena_id: faena.value || null } : {}),
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

  // Devuelve true si no hay parecidos o si se confirma registrarlo igual
  async function revisarDuplicado() {
    const t = Math.round(Number(total.value));
    let q = ctx.api.from('fin_registros').select('id, fecha, concepto, total, doc_numero').eq('empresa_id', ctx.empresa.id).eq('tipo', tipo).is('deleted_at', null).limit(5);
    if (tercero.value && docNum.value.trim()) q = q.eq('tercero_id', tercero.value).eq('doc_numero', docNum.value.trim());
    else if (tercero.value) q = q.eq('tercero_id', tercero.value).eq('total', t).eq('fecha', fecha.value);
    else q = q.eq('total', t).eq('fecha', fecha.value).ilike('concepto', concepto.value.trim());
    const { data } = await q;
    if (!data?.length) return true;
    const d = data[0];
    return new Promise((resolver) => {
      abrirFormulario({
        titulo: 'Posible duplicado',
        mensaje: `Ya hay un registro parecido: "${d.concepto}", ${fechaLarga(d.fecha)}, ${dinero(d.total)}${d.doc_numero ? `, N° ${d.doc_numero}` : ''}.\n¿Registrarlo igual?`,
        campos: [], textoGuardar: 'Registrar igual',
        alGuardar: async () => { resolver(true); },
      });
      // Si se cierra sin confirmar, no se registra
      const dlg = document.querySelector('dialog.modal:last-of-type');
      dlg?.addEventListener('close', () => resolver(false), { once: true });
    });
  }

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
  // Respaldo: el archivo principal y los adjuntos (fotos extra del lector o de la migración)
  const respaldos = [r?.archivo, ...(r?.adjuntos ?? [])].filter(Boolean);
  respaldos.forEach((ruta, i) => acciones.push(boton(respaldos.length > 1 ? `Respaldo ${i + 1}` : 'Ver respaldo', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } })));
  if (r && ctx.puede('costos', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: eliminar }));
  const origen = [r?.fin_recurrentes ? `Generado del recurrente "${r.fin_recurrentes.concepto}" (${r.periodo})` : null,
    r?.documento_id ? 'Compra traída de Inventario' : null,
    r?.moneda === 'USD' ? `US$ ${r.monto_origen} × ${dinero(r.tipo_cambio)}` : null].filter(Boolean);

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, r ? r.concepto : esIngreso ? 'Nuevo ingreso' : 'Nuevo gasto'),
        r ? el('p', { class: 'texto-suave' }, [fechaLarga(r.fecha), dinero(r.total), nombreEstado(r).toLowerCase()].join(' · ')) : null),
      el('div', { class: 'listado-acciones' }, acciones)),
    origen.length ? el('p', { class: 'texto-suave texto-chico' }, origen.join(' · ')) : null,
    el('div', { class: 'ficha doc-grupo fin-form' },
      el('div', { class: 'rejilla-campos' }, fila('Fecha', fecha), fila('Concepto', concepto)),
      el('div', { class: 'rejilla-campos' }, fila('Categoría', categoria), fila('Centro de costo', centro), fila(esIngreso ? 'Cliente' : 'Proveedor', tercero)),
      el('div', { class: 'rejilla-campos' }, fila('Documento', doc), fila('N° de documento', docNum), fila('Total (con IVA si lo tiene)', total, desglose)),
      esIngreso ? (faena ? el('div', { class: 'rejilla-campos' }, fila('Faena', faena)) : null) : el('div', { class: 'rejilla-campos' }, faena ? fila('Faena', faena) : null, fila('Patente', patente), orden ? fila('Orden de trabajo', orden) : null),
      aCuenta ? el('div', { class: 'rejilla-campos' }, fila('¿Compra por cuenta de un tercero?', aCuenta, el('span', { class: 'texto-suave texto-chico' }, 'Ej.: materiales del pintor: se paga al local, no es gasto de la empresa y se descuenta de lo que se le paga.'))) : null,
      el('div', { class: 'rejilla-campos' }, fila('Estado', estado, el('span', { class: 'texto-suave texto-chico' }, 'Boleta o ticket: pagado al comprar. Factura: por pagar.'))),
      filaPago,
      fila(respaldos.length ? 'Reemplazar respaldo (factura, boleta o comprobante)' : 'Respaldo (factura, boleta o comprobante): con una foto, la IA llena los datos', archivo, iaEstado),
      fila('Notas', notas),
      puedeGuardar ? el('div', {}, boton(r ? 'Guardar cambios' : 'Registrar', { icono: 'check', tipo: 'primario', onclick: guardar })) : null));
}
