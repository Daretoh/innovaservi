// Costos con la patente (como el OS, 2026-10-22): en la orden del taller, los gastos de Costos y gastos registrados con
// la patente del vehículo: los de esta visita (entre el ingreso y la entrega, o ligados a la orden), los de otras
// visitas y lo que queda por pagar. Cada uno abre su registro. Requiere permiso de ver Costos.
// Trabajo de un tercero (2026-10-28): p. ej. desabolladura y pintura de un contratista, que cobra su parte; queda como
// gasto suyo ligado a la orden y entra en su cuenta (Costos → Pagos). Las compras hechas por cuenta de un tercero
// (fin_registros.a_cuenta_de) se muestran aparte: no son costo de la empresa, se le descuentan a él.
import { el } from '../../core/ui/dom.js?v=a8e0f26';
import { boton } from '../../core/ui/tabla.js?v=a8e0f26';
import { abrirFormulario } from '../../core/ui/modal.js?v=a8e0f26';
import { avisar } from '../../core/ui/aviso.js?v=a8e0f26';
import { dinero, fechaLarga, diaLocal, hoyISO } from '../../core/ui/formato.js?v=a8e0f26';
import { nombreVehiculo } from './datos.js?v=a8e0f26';

const nombreT = (t) => t?.nombre_fantasia || t?.razon_social || '';

export async function seccionCostosPatente(ctx, o, v) {
  if (!v?.patente || !ctx.puede('costos', 'ver')) return null;
  const { data, error } = await ctx.api.from('fin_registros')
    .select('id, fecha, concepto, total, estado_pago, orden_id, a_cuenta_de, tercero_id, cuenta:terceros!fin_registros_a_cuenta_de_fkey(razon_social, nombre_fantasia)')
    .eq('empresa_id', ctx.empresa.id).eq('patente', v.patente).eq('tipo', 'gasto').is('deleted_at', null).order('fecha', { ascending: false });
  if (error) return null;
  const puedeCrear = ctx.puede('costos', 'crear');
  if (!data.length && !puedeCrear) return null;
  const desde = diaLocal(o.ingreso_at) || o.fecha_cita || diaLocal(o.created_at);
  const hasta = diaLocal(o.entregado_at) || hoyISO();
  const estaVisita = (r) => r.orden_id === o.id || (r.fecha >= desde && r.fecha <= hasta);
  const propios = data.filter((r) => !r.a_cuenta_de); const aCuenta = data.filter((r) => r.a_cuenta_de);
  const visita = propios.filter(estaVisita); const otras = propios.filter((r) => !estaVisita(r));
  const suma = (l) => l.reduce((s, r) => s + Number(r.total || 0), 0);
  const porPagar = suma(data.filter((r) => r.estado_pago !== 'pagado'));
  const fila = (r) => el('a', { class: 'doc-fila', href: ctx.ruta('costos.registro', { id: r.id }) },
    el('span', { class: 'doc-nombre' }, el('strong', {}, r.concepto), el('span', { class: 'texto-suave texto-chico' }, fechaLarga(r.fecha), r.a_cuenta_de ? ` · por cuenta de ${nombreT(r.cuenta)}` : '')),
    el('span', {}, dinero(r.total), r.estado_pago !== 'pagado' ? el('span', { class: 'chip chip-prox', style: 'margin-left:6px' }, 'Por pagar') : null));
  return el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Costos con la patente'),
      puedeCrear ? boton('Trabajo de un tercero', { icono: 'mas', title: 'Ej.: desabolladura y pintura de un contratista', onclick: () => trabajoTercero(ctx, o, v) }) : null),
    data.length ? el('div', { class: 'cobro-resumen' },
      el('div', {}, el('span', {}, 'Esta visita'), el('strong', {}, dinero(suma(visita)))),
      otras.length ? el('div', {}, el('span', {}, 'Otras visitas'), el('span', {}, dinero(suma(otras)))) : null,
      aCuenta.length ? el('div', {}, el('span', {}, 'Por cuenta de terceros'), el('span', { class: 'texto-suave' }, dinero(suma(aCuenta)))) : null,
      porPagar ? el('div', {}, el('span', {}, 'Por pagar'), el('span', { class: 'pct-mal' }, dinero(porPagar))) : null)
      : el('p', { class: 'texto-suave texto-chico' }, 'Sin costos con esta patente.'),
    visita.map(fila),
    aCuenta.length ? el('details', {}, el('summary', { class: 'texto-suave' }, `Compras por cuenta de terceros (${aCuenta.length}): se les descuentan, no son costo de la empresa`), aCuenta.map(fila)) : null,
    otras.length ? el('details', {}, el('summary', { class: 'texto-suave' }, `Otras visitas (${otras.length})`), otras.map(fila)) : null);
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
