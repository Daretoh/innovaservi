// Costos con la patente (como el OS, 2026-10-22): en la orden del taller, los gastos de Costos y gastos registrados con
// la patente del vehículo: los de esta visita (entre el ingreso y la entrega, o ligados a la orden), los de otras
// visitas y lo que queda por pagar. Cada uno abre su registro. Requiere permiso de ver Costos.
// Trabajo de un tercero (2026-10-28): p. ej. desabolladura y pintura de un contratista, que cobra su parte; queda como
// gasto suyo ligado a la orden y entra en su cuenta (Costos → Pagos). Las compras hechas por cuenta de un tercero
// (fin_registros.a_cuenta_de) se muestran aparte: no son costo de la empresa, se le descuentan a él.
// Cada fila dice qué es (Mano de obra del contratista o Material) y cómo se paga; "A servicios" la cobra en la orden con nuestro margen.
import { el } from '../../core/ui/dom.js?v=36a65ad';
import { boton } from '../../core/ui/tabla.js?v=36a65ad';
import { abrirFormulario } from '../../core/ui/modal.js?v=36a65ad';
import { avisar } from '../../core/ui/aviso.js?v=36a65ad';
import { dinero, fechaLarga, diaLocal, hoyISO } from '../../core/ui/formato.js?v=36a65ad';
import { nombreVehiculo } from './datos.js?v=36a65ad';

const nombreT = (t) => t?.nombre_fantasia || t?.razon_social || '';

export async function seccionCostosPatente(ctx, o, v) {
  if (!v?.patente || !ctx.puede('costos', 'ver')) return null;
  const { data, error } = await ctx.api.from('fin_registros')
    .select('id, fecha, concepto, total, neto, doc_tipo, estado_pago, orden_id, a_cuenta_de, tercero_id, categoria:fin_categorias(nombre), proveedor:terceros!fin_registros_tercero_id_fkey(razon_social, nombre_fantasia), cuenta:terceros!fin_registros_a_cuenta_de_fkey(razon_social, nombre_fantasia)')
    .eq('empresa_id', ctx.empresa.id).eq('patente', v.patente).eq('tipo', 'gasto').is('deleted_at', null).order('fecha', { ascending: false });
  if (error) return null;
  // Contratistas con cuenta corriente: sus trabajos no se pagan uno a uno, van al saldo de su cuenta
  const { data: cuentas } = await ctx.api.from('fin_proveedores').select('tercero_id').eq('empresa_id', ctx.empresa.id).eq('modalidad', 'cuenta');
  const conCuenta = new Set((cuentas ?? []).map((c) => c.tercero_id));
  const porSaldo = (r) => r.estado_pago !== 'pagado' && conCuenta.has(r.tercero_id);
  const puedeCrear = ctx.puede('costos', 'crear');
  if (!data.length && !puedeCrear) return null;
  const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at);
  const hasta = diaLocal(o.entregado_at) || hoyISO();
  const estaVisita = (r) => r.orden_id === o.id || (r.fecha >= desde && r.fecha <= hasta);
  const propios = data.filter((r) => !r.a_cuenta_de); const aCuenta = data.filter((r) => r.a_cuenta_de);
  const visita = propios.filter(estaVisita); const otras = propios.filter((r) => !estaVisita(r));
  const suma = (l) => l.reduce((s, r) => s + Number(r.total || 0), 0);
  const porPagar = suma(data.filter((r) => r.estado_pago !== 'pagado' && !porSaldo(r)));
  const puedeCobrar = ctx.puede('taller', 'editar') && !o.cobrado && o.estado !== 'anulada';
  const lineas = o.tal_orden_servicios ?? [];
  // Mano de obra o Material según la categoría del gasto (2026-11-10: una ampolleta comprada sin boleta salía como mano de obra);
  // sin categoría, como antes: documento "otro" de un proveedor = trabajo de un contratista
  const esContratista = (r) => (r.categoria?.nombre ? /tercero|mano de obra|desabollad|pintura|contratista/i.test(r.categoria.nombre) : !!(r.doc_tipo === 'otro' && r.tercero_id));
  const fila = (r) => {
    const quien = nombreT(r.proveedor);
    const enServicios = lineas.some((l) => l.nombre === r.concepto);
    return el('div', { class: 'doc-fila' },
      el('span', { class: `chip ${esContratista(r) ? 'chip-prox' : 'chip-pend'}` }, esContratista(r) ? 'Mano de obra' : 'Material'),
      el('a', { class: 'doc-nombre', href: ctx.ruta('costos.registro', { id: r.id }) }, el('strong', {}, r.concepto),
        el('span', { class: 'texto-suave texto-chico' }, `${esContratista(r) && quien ? `${quien} · ` : ''}${fechaLarga(r.fecha)}`, r.a_cuenta_de ? ` · por cuenta de ${nombreT(r.cuenta)}` : '')),
      el('span', {}, dinero(r.total)),
      porSaldo(r) ? el('a', { class: 'chip chip-na', href: ctx.ruta('costos.cuenta', { t: r.tercero_id }), title: 'No se paga por trabajo: suma al saldo de su cuenta' }, 'En su cuenta')
        : r.estado_pago !== 'pagado' ? el('span', { class: 'chip chip-prox' }, 'Por pagar') : el('span', { class: 'chip chip-ok' }, 'Pagado'),
      r.a_cuenta_de ? null : enServicios ? el('span', { class: 'chip chip-na' }, 'En servicios')
        : puedeCobrar ? boton('A servicios', { icono: 'mas', class: 'boton boton-secundario boton-chico', title: 'Cobrar este costo en la orden, con nuestro margen', onclick: () => aServicios(ctx, o, r, lineas) }) : null);
  };
  return el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Costos con la patente'),
      puedeCrear ? boton('Trabajo de un tercero', { icono: 'mas', title: 'Ej.: desabolladura y pintura de un contratista', onclick: () => trabajoTercero(ctx, o, v) }) : null),
    data.length ? el('div', { class: 'cobro-resumen' },
      el('div', {}, el('span', {}, 'Esta visita'), el('strong', {}, dinero(suma(visita)))),
      visita.length ? el('div', {}, el('span', {}, 'Mano de obra'), el('span', {}, dinero(suma(visita.filter(esContratista))))) : null,
      visita.length ? el('div', {}, el('span', {}, 'Material'), el('span', {}, dinero(suma(visita.filter((r) => !esContratista(r)))))) : null,
      otras.length ? el('div', {}, el('span', {}, 'Otras visitas'), el('span', {}, dinero(suma(otras)))) : null,
      aCuenta.length ? el('div', {}, el('span', {}, 'Por cuenta de terceros'), el('span', { class: 'texto-suave' }, dinero(suma(aCuenta)))) : null,
      porPagar ? el('div', {}, el('span', {}, 'Por pagar'), el('span', { class: 'pct-mal' }, dinero(porPagar))) : null)
      : el('p', { class: 'texto-suave texto-chico' }, 'Sin costos con esta patente.'),
    visita.map(fila),
    aCuenta.length ? el('details', {}, el('summary', { class: 'texto-suave' }, `Compras por cuenta de terceros (${aCuenta.length}): se les descuentan, no son costo de la empresa`), aCuenta.map(fila)) : null,
    otras.length ? el('details', {}, el('summary', { class: 'texto-suave' }, `Otras visitas (${otras.length})`), otras.map(fila)) : null);
}

// Pasa un costo a Servicios de la orden: precio neto = costo + nuestro margen. El gasto no cambia.
function aServicios(ctx, o, r, lineas) {
  const costo = r.doc_tipo === 'factura' && r.neto ? Number(r.neto) : Number(r.total);   // en neto, como la cotización
  const precioCon = (pct) => Math.round(costo * (1 + (Number(pct) || 0) / 100));
  abrirFormulario({
    titulo: 'Pasar a Servicios',
    mensaje: `Costo: ${dinero(costo)} neto. Revisa que no esté ya incluido en otro servicio de la orden, para no cobrarlo dos veces.`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre en la orden', requerido: true, valor: r.concepto },
      { id: 'margen', etiqueta: 'Nuestro margen sobre el costo (%)', tipo: 'number', valor: '0', alCambiar: ({ valor, poner }) => poner('precio', precioCon(valor)) },
      { id: 'precio', etiqueta: 'Precio a cobrar, neto ($)', tipo: 'number', requerido: true, valor: String(costo), alCambiar: ({ valor, poner }) => { if (costo > 0) poner('margen', Math.round(((Number(valor) || 0) / costo - 1) * 1000) / 10); } },
    ],
    textoGuardar: 'Agregar a Servicios',
    alGuardar: async (x) => {
      const { error } = await ctx.api.from('tal_orden_servicios').insert({ orden_id: o.id, empresa_id: ctx.empresa.id, nombre: x.nombre.trim(), precio: Math.max(0, Math.round(Number(x.precio) || 0)), orden: lineas.length + 1 });
      if (error) throw new Error(error.message);
      avisar('Agregado a Servicios.'); ctx.refrescar();
    },
  });
}

// Trabajo de un tercero en esta orden: lo que cobra el contratista (queda por pagar en su cuenta)
async function trabajoTercero(ctx, o, v) {
  const e = ctx.empresa.id;
  const [ter, cat, prov] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).order('razon_social'),
    ctx.api.from('fin_categorias').select('id, nombre, clase').eq('empresa_id', e).eq('activo', true).in('clase', ['gasto', 'personal']).order('orden'),
    ctx.api.from('fin_proveedores').select('tercero_id, modalidad').eq('empresa_id', e).eq('modalidad', 'cuenta'),
  ]);
  const conCuenta = new Set((prov.data ?? []).map((p) => p.tercero_id));
  const terceros = (ter.data ?? []).filter((t) => t.tipo?.includes('proveedor')).sort((a, b) => (conCuenta.has(b.id) - conCuenta.has(a.id)) || nombreT(a).localeCompare(nombreT(b)));
  const cats = cat.data ?? [];
  if (!cats.length) { avisar('Crea primero una categoría de gasto en Costos (Categorías y centros).', 'error'); return; }
  const catSugerida = cats.find((c) => /desabol|pintura|d&p|tercer|servicio/i.test(c.nombre)) ?? cats[0];
  abrirFormulario({
    titulo: `Trabajo de un tercero · ${nombreVehiculo(v)}`,
    mensaje: 'Lo que cobra el contratista por su parte del trabajo. Queda por pagar en su cuenta (Costos → Pagos), donde se le descuentan las compras hechas por su cuenta.',
    campos: [
      { id: 'tercero', etiqueta: 'Contratista', requerido: true, opciones: [['', terceros.length ? 'Elige al contratista' : 'Primero créalo en Clientes y proveedores (tipo Proveedor)'], ...terceros.map((t) => [t.id, nombreT(t)])], valor: terceros.find((t) => conCuenta.has(t.id))?.id ?? '' },
      { id: 'detalle', etiqueta: 'Detalle del trabajo', requerido: true, tipo: 'textarea', ayuda: 'Ej.: parachoque trasero, guardabarro lateral y puerta.' },
      { id: 'piezas', etiqueta: 'Piezas', tipo: 'number', valor: '1' },
      { id: 'monto', etiqueta: 'Monto que cobra', tipo: 'number', requerido: true },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'categoria', etiqueta: 'Categoría', opciones: cats.map((c) => [c.id, c.nombre]), valor: catSugerida.id },
    ],
    textoGuardar: 'Registrar trabajo',
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      if (!x.tercero) throw new Error('Elige al contratista.');
      const { error } = await ctx.api.from('fin_registros').insert({
        empresa_id: e, tipo: 'gasto', fecha: x.fecha, concepto: `${nombreVehiculo(v)}: ${x.detalle.trim()}`.slice(0, 300), categoria_id: x.categoria,
        tercero_id: x.tercero, doc_tipo: 'otro', total: monto, patente: v.patente, orden_id: o.id, estado_pago: 'listo',
        notas: x.piezas ? `Piezas: ${x.piezas}` : null,
      });
      if (error) throw new Error(error.message);
      // El contratista queda con cuenta corriente
      await ctx.api.from('fin_proveedores').upsert({ empresa_id: e, tercero_id: x.tercero, modalidad: 'cuenta' }, { onConflict: 'empresa_id,tercero_id', ignoreDuplicates: true });
      avisar('Trabajo registrado en la cuenta del contratista.'); ctx.refrescar();
    },
  });
}
