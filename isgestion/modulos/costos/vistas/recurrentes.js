// Pagos de cada mes (antes "Gastos recurrentes"; 2026-11-24, pedido de Enzo): recordatorio de lo que se paga todos los
// meses (arriendo, servicios básicos, asesorías, suscripciones, colaciones) con un monto aproximado, porque cambia mes a
// mes. Ya no se generan gastos con un botón: cada mes se carga el documento real en la Bandeja y aquí se ve si ya está
// (un gasto del mes ligado al recordatorio o del mismo proveedor). Equivalente mensual y costo por persona.
import { el } from '../../../core/ui/dom.js?v=d971811';
import { boton } from '../../../core/ui/tabla.js?v=d971811';
import { abrirFormulario } from '../../../core/ui/modal.js?v=d971811';
import { avisar } from '../../../core/ui/aviso.js?v=d971811';
import { dinero, fechaLarga, hoyISO, nombreMes, sumarDias, rangoMes } from '../../../core/ui/formato.js?v=d971811';
import { cargarBase, nombreTercero, DOCS, proximoCobro, mensualCLP, tocaEnMes, fechaEnMes } from '../datos.js?v=d971811';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TC_KEY = 'isg.costos.dolar';
const leerTc = () => { try { return Number(localStorage.getItem(TC_KEY)) || 0; } catch { return 0; } };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const mes = hoyISO().slice(0, 7);
  const [base, rec, per, hechos] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).order('activo', { ascending: false }).order('orden').order('concepto'),
    ctx.api.from('persona_empresa').select('persona_id, personas(nombres, apellido_paterno)').eq('empresa_id', e).is('deleted_at', null).eq('estado', 'activo'),
    ctx.api.from('fin_registros').select('recurrente_id, tercero_id').eq('empresa_id', e).eq('tipo', 'gasto').gte('fecha', rangoMes(mes).desde).lte('fecha', rangoMes(mes).hasta).is('deleted_at', null),
  ]);
  if (rec.error) throw rec.error;
  const lista = rec.data;
  const personas = (per.data ?? []).map((p) => [p.persona_id, [p.personas?.nombres, p.personas?.apellido_paterno].filter(Boolean).join(' ')]);
  const nombrePersona = new Map(personas);
  const gastosCat = base.categorias.filter((c) => c.clase !== 'ingreso' && c.activo);
  // ¿Ya está en Gastos este mes? Un gasto ligado al recordatorio o del mismo proveedor
  const conRec = new Set((hechos.data ?? []).map((h) => h.recurrente_id).filter(Boolean));
  const conTer = new Set((hechos.data ?? []).map((h) => h.tercero_id).filter(Boolean));
  const ya = { has: (id) => { const r = lista.find((x) => x.id === id); return conRec.has(id) || (!!r?.tercero_id && conTer.has(r.tercero_id)); } };
  const faltan = lista.filter((r) => r.activo && tocaEnMes(r, mes) && !ya.has(r.id) && fechaEnMes(mes, r.dia) <= hoyISO());
  const tc = leerTc() || Math.round((await import('../../../core/economia.js?v=d971811').then((m) => m.dolarDelDia()).catch(() => 0)) ?? 0);

  const hoy = hoyISO();
  const semaforo = (r) => {
    if (!r.activo) return el('span', { class: 'chip chip-na' }, 'Inactivo');
    // Si el pago de este mes aún no está en Gastos, se muestra ese (aunque la fecha ya pasó)
    const pendienteMes = tocaEnMes(r, mes) && !ya.has(r.id);
    const f = pendienteMes ? fechaEnMes(mes, r.dia) : proximoCobro(r);
    if (!f) return el('span', { class: 'chip chip-na' }, 'Sin próximo cobro');
    const dias = Math.round((new Date(`${f}T12:00`) - new Date(`${hoy}T12:00`)) / 864e5);
    const generado = f.slice(0, 7) === mes && ya.has(r.id);
    if (pendienteMes && dias < 0) return el('span', { class: 'chip chip-venc' }, `${fechaLarga(f)} · falta cargarlo`);
    return el('span', { class: `chip ${generado ? 'chip-ok' : dias <= 5 ? 'chip-prox' : 'chip-pend'}` },
      `${fechaLarga(f)}${generado ? ' · ya está en Gastos' : dias === 0 ? ' · hoy' : dias <= 5 ? ` · en ${dias} d` : ''}`);
  };

  const editar = (r) => abrirFormulario({
    titulo: r ? r.concepto : 'Nuevo pago de cada mes',
    campos: [
      { id: 'concepto', etiqueta: 'Concepto', requerido: true, valor: r?.concepto ?? '' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: gastosCat.map((c) => [c.id, c.nombre]), valor: r?.categoria_id ?? gastosCat[0]?.id },
      ...(ctx.config?.centros ? [{ id: 'centro', etiqueta: 'Centro de costo', opciones: [['', 'Sin centro'], ...base.centros.filter((c) => c.activo).map((c) => [c.id, c.nombre])], valor: r?.centro_id ?? '' }] : []),
      { id: 'tercero', etiqueta: 'Proveedor', opciones: [['', 'Sin proveedor del maestro'], ...base.terceros.filter((t) => t.tipo?.includes('proveedor')).map((t) => [t.id, nombreTercero(t)])], valor: r?.tercero_id ?? '' },
      { id: 'monto', etiqueta: 'Monto aproximado (cambia mes a mes)', tipo: 'number', requerido: true, valor: r?.monto ?? '' },
      { id: 'moneda', etiqueta: 'Moneda', opciones: [['CLP', 'Pesos (CLP)'], ['USD', 'Dólares (USD)']], valor: r?.moneda ?? 'CLP' },
      { id: 'ciclo', etiqueta: 'Ciclo', opciones: [['mensual', 'Mensual'], ['anual', 'Anual']], valor: r?.ciclo ?? 'mensual' },
      { id: 'dia', etiqueta: 'Día de cobro', tipo: 'number', valor: r?.dia ?? '' },
      { id: 'mes_anual', etiqueta: 'Mes de cobro (si es anual)', opciones: [['', '—'], ...MESES.map((m, i) => [String(i + 1), m])], valor: r?.mes_anual ? String(r.mes_anual) : '' },
      { id: 'doc', etiqueta: 'Documento', opciones: DOCS.filter(([k]) => k !== 'guia'), valor: r?.doc_tipo ?? 'factura' },
      { id: 'autopago', etiqueta: 'Se paga solo (cargo automático o PAC)', opciones: [['no', 'No'], ['si', 'Sí']], valor: r?.autopago ? 'si' : 'no' },
      { id: 'asignado', etiqueta: 'Asignado a (costo por persona)', opciones: [['', 'Empresa'], ...personas], valor: r?.asignado_a ?? '' },
      { id: 'desde', etiqueta: 'Rige desde', tipo: 'date', requerido: true, valor: r?.desde ?? hoyISO() },
      { id: 'hasta', etiqueta: 'Hasta (opcional)', tipo: 'date', valor: r?.hasta ?? '' },
      ...(r ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(r.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const dia = v.dia ? Number(v.dia) : null;
      if (dia !== null && !(dia >= 1 && dia <= 31)) throw new Error('El día de cobro va de 1 a 31.');
      if (v.ciclo === 'anual' && !v.mes_anual) throw new Error('Indica el mes de cobro del gasto anual.');
      if (!(Number(v.monto) > 0)) throw new Error('El monto debe ser mayor a cero.');
      const datos = {
        concepto: v.concepto.trim(), categoria_id: v.categoria, ...(ctx.config?.centros ? { centro_id: v.centro || null } : {}), tercero_id: v.tercero || null, monto: Number(v.monto),
        moneda: v.moneda, ciclo: v.ciclo, dia, mes_anual: v.ciclo === 'anual' ? Number(v.mes_anual) : null, doc_tipo: v.doc, autopago: v.autopago === 'si',
        asignado_a: v.asignado || null, desde: v.desde, hasta: v.hasta || null, ...(r ? { activo: v.activo === 'true' } : {}),
      };
      const res = r ? await ctx.api.from('fin_recurrentes').update(datos).eq('id', r.id)
        : await ctx.api.from('fin_recurrentes').insert({ ...datos, empresa_id: e, orden: lista.length + 1 });
      if (res.error) throw new Error(res.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });

  const activos = lista.filter((r) => r.activo);
  const total = activos.reduce((s, r) => s + mensualCLP(r, tc), 0);
  const sinTc = activos.some((r) => r.moneda === 'USD') && !tc;
  const porPersona = new Map();
  for (const r of activos.filter((x) => x.asignado_a)) porPersona.set(r.asignado_a, (porPersona.get(r.asignado_a) ?? 0) + mensualCLP(r, tc));
  const proximos = activos.map((r) => ({ r, f: proximoCobro(r) })).filter((x) => x.f && x.f <= sumarDias(hoy, 7)).length;

  const acciones = [];
  if (ctx.puede('costos', 'crear')) {
    acciones.push(boton('Nuevo pago de cada mes', { icono: 'mas', onclick: () => (gastosCat.length ? editar(null) : avisar('Primero crea una categoría de gasto.', 'error')) }));
  }
  const puedeEditar = ctx.puede('costos', 'editar');

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Pagos de cada mes'),
      el('p', { class: 'texto-suave' }, 'Recordatorio de lo que se paga todos los meses. El monto es aproximado: cada mes se carga el documento real (o el gasto sin papel) en la Bandeja, y aquí se marca solo cuando ya está.')), el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Mensual estimado'), el('strong', {}, dinero(total)),
        el('span', { class: 'texto-suave texto-chico' }, `${activos.length} activos · anuales / 12${sinTc ? ' · USD sin valor del dólar' : tc ? ` · dólar ${dinero(tc)}` : ''}`)),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${proximos ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, 'Cobros en los próximos 7 días'), el('strong', {}, String(proximos))),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${faltan.length ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, `Faltan cargar de ${nombreMes(mes)}`), el('strong', {}, String(faltan.length)))),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Concepto', 'Categoría', 'Monto', 'Ciclo', 'Próximo cobro', 'Asignado'].map((t, i) => el('th', { class: i === 2 ? 'num' : '' }, t)))),
      el('tbody', {}, lista.length ? lista.map((r) => el('tr', { class: r.activo ? '' : 'fila-inactiva' },
        el('td', {}, puedeEditar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); editar(r); } }, el('strong', {}, r.concepto)) : el('strong', {}, r.concepto),
          el('div', { class: 'texto-suave texto-chico' }, [ctx.config?.centros ? base.centroDe.get(r.centro_id)?.nombre : null, nombreTercero(base.terceros.find((t) => t.id === r.tercero_id)), r.autopago ? 'pago automático' : null].filter(Boolean).join(' · '))),
        el('td', {}, base.categoriaDe.get(r.categoria_id)?.nombre ?? ''),
        el('td', { class: 'num' }, r.moneda === 'USD' ? `US$ ${Number(r.monto)}${tc ? ` · ${dinero(r.monto * tc)}` : ''}` : dinero(r.monto)),
        el('td', {}, r.ciclo === 'anual' ? `Anual (${MESES[r.mes_anual - 1]})` : `Mensual${r.dia ? `, día ${r.dia}` : ''}`),
        el('td', {}, semaforo(r)),
        el('td', {}, r.asignado_a ? nombrePersona.get(r.asignado_a) ?? 'Persona' : 'Empresa')))
        : el('tr', {}, el('td', { colspan: 6, class: 'tabla-vacia' }, 'Sin pagos de cada mes. Agrega el arriendo, internet, asesorías, suscripciones o colaciones.'))))),
    porPersona.size ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Costo mensual por persona'),
      [...porPersona].map(([id, m]) => el('div', { class: 'doc-fila' }, el('span', { class: 'doc-nombre' }, nombrePersona.get(id) ?? 'Persona'), el('strong', {}, dinero(m))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Un pago sin boleta ni factura (ej.: solo transferencia) se carga en la Bandeja como "Gasto sin papel", con el comprobante como foto: queda como no declarado.'));
}
