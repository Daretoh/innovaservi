// Recurrentes (antes "Pagos de cada mes"; 2026-11-27, pedido de Enzo: se cortó el internet porque nadie sabía la fecha de
// corte). Lo que se paga cada cierto tiempo (arriendo, servicios básicos, asesorías, suscripciones) con su ciclo, el día en
// que vence, el día de corte y cuántos días antes avisar. No genera gastos: el documento real se carga en la Bandeja y el
// gasto queda ligado solo al recurrente si es de su proveedor (Costos 017, `recurrente_id` + `periodo`), o se elige a mano
// en el gasto. Aquí se ve el estado del mes: falta cargar, cargado por pagar o pagado. Los avisos por push los manda la
// base (`fin_rec_avisar`) a quien edita Costos.
import { el } from '../../../core/ui/dom.js?v=96471b3';
import { icono } from '../../../core/ui/iconos.js?v=96471b3';
import { boton } from '../../../core/ui/tabla.js?v=96471b3';
import { abrirFormulario } from '../../../core/ui/modal.js?v=96471b3';
import { avisar } from '../../../core/ui/aviso.js?v=96471b3';
import { dinero, fechaLarga, hoyISO, nombreMes, sumarDias } from '../../../core/ui/formato.js?v=96471b3';
import { cargarBase, nombreTercero, DOCS, proximoCobro, mensualCLP, tocaEnMes, fechaEnMes, CICLOS } from '../datos.js?v=96471b3';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TC_KEY = 'isg.costos.dolar';
const leerTc = () => { try { return Number(localStorage.getItem(TC_KEY)) || 0; } catch { return 0; } };
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);

// Fecha de corte del ciclo que vence en `vence` (si el día de corte es menor que el de vencimiento, cae el mes siguiente)
export function fechaCorte(r, vence) {
  if (!r.dia_corte || !vence) return null;
  const mes = vence.slice(0, 7);
  if (r.dia_corte >= (r.dia ?? 1)) return fechaEnMes(mes, r.dia_corte);
  const [a, m] = mes.split('-').map(Number);
  return fechaEnMes(m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`, r.dia_corte);
}

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const [base, rec, per, hechos] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).order('activo', { ascending: false }).order('orden').order('concepto'),
    ctx.api.from('persona_empresa').select('persona_id, personas(nombres, apellido_paterno)').eq('empresa_id', e).is('deleted_at', null).eq('estado', 'activo'),
    ctx.api.from('fin_registros').select('id, recurrente_id, total, estado_pago, fecha_pago, fecha').order('fecha').eq('empresa_id', e).eq('tipo', 'gasto').eq('periodo', mes).not('recurrente_id', 'is', null).is('deleted_at', null),
  ]);
  if (rec.error) throw rec.error;
  if (hechos.error) throw hechos.error;
  const lista = rec.data;
  const personas = (per.data ?? []).map((p) => [p.persona_id, [p.personas?.nombres, p.personas?.apellido_paterno].filter(Boolean).join(' ')]);
  const nombrePersona = new Map(personas);
  const gastosCat = base.categorias.filter((c) => c.clase !== 'ingreso' && c.activo);
  // Pagos del mes por recurrente (Costos 019: puede haber varios, ej.: la contadora en dos transferencias)
  const delMes = new Map();
  for (const g of hechos.data ?? []) delMes.set(g.recurrente_id, [...(delMes.get(g.recurrente_id) ?? []), g]);
  const tc = leerTc() || Math.round((await import('../../../core/economia.js?v=96471b3').then((m) => m.dolarDelDia()).catch(() => 0)) ?? 0);

  // Estado de este mes: no toca · falta cargar · cargado por pagar · pagado
  const estadoMes = (r) => {
    if (!r.activo || !tocaEnMes(r, mes)) return { clase: 'no' };
    const pagos = delMes.get(r.id) ?? [];
    const vence = r.dia ? fechaEnMes(mes, r.dia) : null;
    const g = pagos.find((x) => x.estado_pago !== 'pagado') ?? pagos[pagos.length - 1];
    const total = pagos.reduce((t, x) => t + Number(x.total), 0);
    if (pagos.length && pagos.every((x) => x.estado_pago === 'pagado')) return { clase: 'pagado', g, pagos, total, vence };
    if (pagos.length) return { clase: 'cargado', g, pagos, total, vence };
    return { clase: 'falta', vence, pagos };
  };
  const pagado = (r) => estadoMes(r).clase === 'pagado';

  const chipEstado = (r) => {
    if (!r.activo) return el('span', { class: 'chip chip-na' }, 'Inactivo');
    if (r.hasta && r.hasta < hoy && !delMes.has(r.id)) return el('span', { class: 'chip chip-na' }, `Terminó el ${fechaLarga(r.hasta)}`);
    const s = estadoMes(r);
    const enlace = (nodo) => (s.g ? el('a', { href: ctx.ruta('costos.registro', { id: s.g.id }), title: 'Abrir el gasto' }, nodo) : nodo);
    if (s.clase === 'no') {
      const f = proximoCobro(r);
      return el('span', { class: 'chip chip-na' }, f ? `Próximo: ${fechaLarga(f)}` : 'Sin próximo cobro');
    }
    const varios = s.pagos.length > 1 ? ` · ${s.pagos.length} pagos, ${dinero(s.total)}` : '';
    if (s.clase === 'pagado') return enlace(el('span', { class: 'chip chip-ok' }, `Pagado${s.g.fecha_pago ? ` el ${fechaLarga(s.g.fecha_pago)}` : ''}${varios}`));
    if (r.autopago && s.clase === 'falta') return el('span', { class: 'chip chip-pend' }, s.vence && s.vence < hoy ? 'Pago automático · falta el documento' : 'Pago automático');
    const d = s.vence ? diasEntre(hoy, s.vence) : null;
    const cuando = d === null ? '' : d < 0 ? ` · venció hace ${-d} d` : d === 0 ? ' · vence hoy' : ` · vence en ${d} d`;
    const clase = d !== null && d <= 0 ? 'chip-venc' : d !== null && d <= (r.aviso_dias ?? 3) ? 'chip-prox' : 'chip-pend';
    return s.clase === 'cargado'
      ? enlace(el('span', { class: `chip ${clase}` }, `${s.pagos.length > 1 ? `${s.pagos.length} pagos, falta pagar uno` : 'Cargado, por pagar'}${cuando}`))
      : el('span', { class: `chip ${clase}` }, `Falta cargar${cuando}`);
  };

  const textoCiclo = (r) => {
    const c = CICLOS.find(([k]) => k === r.ciclo)?.[1].replace(/ \(.*\)/, '') ?? r.ciclo;
    return r.ciclo === 'mensual' ? c : `${c} (${r.ciclo === 'anual' ? MESES[r.mes_anual - 1] : `desde ${MESES[r.mes_anual - 1]?.toLowerCase() ?? '—'}`})`;
  };
  const textoFechas = (r) => {
    if (!r.dia) return el('span', { class: 'texto-error texto-chico' }, 'Sin día: no avisa');
    const corte = r.dia_corte ? `, corte el ${r.dia_corte}${r.dia_corte < r.dia ? ' (mes siguiente)' : ''}` : '';
    return `Vence el ${r.dia}${corte}`;
  };

  const editar = (r) => abrirFormulario({
    titulo: r ? r.concepto : 'Nuevo recurrente',
    campos: [
      { id: 'concepto', etiqueta: 'Concepto', requerido: true, valor: r?.concepto ?? '' },
      { id: 'tercero', etiqueta: 'Proveedor (sus gastos quedan ligados solos)', opciones: [['', 'Sin proveedor del maestro'], ...base.terceros.filter((t) => t.tipo?.includes('proveedor') || t.id === r?.tercero_id).map((t) => [t.id, nombreTercero(t)])], valor: r?.tercero_id ?? '' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: gastosCat.map((c) => [c.id, c.nombre]), valor: r?.categoria_id ?? gastosCat[0]?.id },
      ...(ctx.config?.centros ? [{ id: 'centro', etiqueta: 'Centro de costo', opciones: [['', 'Sin centro'], ...base.centros.filter((c) => c.activo).map((c) => [c.id, c.nombre])], valor: r?.centro_id ?? '' }] : []),
      { id: 'ciclo', etiqueta: 'Ciclo', opciones: CICLOS.map(([k, t]) => [k, t]), valor: r?.ciclo ?? 'mensual' },
      { id: 'mes_anual', etiqueta: 'Mes en que toca (si no es mensual)', opciones: [['', '—'], ...MESES.map((m, i) => [String(i + 1), m])], valor: r?.mes_anual ? String(r.mes_anual) : '' },
      { id: 'monto', etiqueta: 'Monto aproximado (opcional: cambia cada vez)', tipo: 'number', valor: Number(r?.monto) ? r.monto : '' },
      { id: 'moneda', etiqueta: 'Moneda', opciones: [['CLP', 'Pesos (CLP)'], ['USD', 'Dólares (USD)']], valor: r?.moneda ?? 'CLP' },
      { id: 'dia', etiqueta: 'Vence el día', tipo: 'number', valor: r?.dia ?? '' },
      { id: 'dia_corte', etiqueta: 'Día de corte si no se paga (opcional)', tipo: 'number', valor: r?.dia_corte ?? '' },
      { id: 'aviso_dias', etiqueta: 'Avisar con cuántos días de anticipación', tipo: 'number', valor: r?.aviso_dias ?? 3 },
      { id: 'doc', etiqueta: 'Documento', opciones: DOCS.filter(([k]) => k !== 'guia'), valor: r?.doc_tipo ?? 'factura' },
      { id: 'autopago', etiqueta: 'Se paga solo (cargo automático o PAC: no avisa)', opciones: [['no', 'No'], ['si', 'Sí']], valor: r?.autopago ? 'si' : 'no' },
      { id: 'asignado', etiqueta: 'Asignado a (costo por persona)', opciones: [['', 'Empresa'], ...personas], valor: r?.asignado_a ?? '' },
      { id: 'desde', etiqueta: 'Rige desde', tipo: 'date', requerido: true, valor: r?.desde ?? hoy },
      { id: 'hasta', etiqueta: 'Hasta (opcional)', tipo: 'date', valor: r?.hasta ?? '' },
      ...(r ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(r.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const num = (x) => (x === '' || x == null ? null : Number(x));
      const dia = num(v.dia); const corte = num(v.dia_corte); const aviso = num(v.aviso_dias) ?? 3;
      if (dia !== null && !(dia >= 1 && dia <= 31)) throw new Error('El día de vencimiento va de 1 a 31.');
      if (corte !== null && !(corte >= 1 && corte <= 31)) throw new Error('El día de corte va de 1 a 31.');
      if (!(aviso >= 0 && aviso <= 20)) throw new Error('El aviso va de 0 a 20 días antes.');
      if (v.ciclo !== 'mensual' && !v.mes_anual) throw new Error('Indica un mes en que toca (para saber desde cuándo se repite).');
      if (Number(v.monto || 0) < 0) throw new Error('El monto no puede ser negativo.');
      const datos = {
        concepto: v.concepto.trim(), categoria_id: v.categoria, ...(ctx.config?.centros ? { centro_id: v.centro || null } : {}), tercero_id: v.tercero || null, monto: Number(v.monto || 0),
        moneda: v.moneda, ciclo: v.ciclo, dia, dia_corte: corte, aviso_dias: aviso, mes_anual: v.ciclo === 'mensual' ? null : Number(v.mes_anual), doc_tipo: v.doc, autopago: v.autopago === 'si',
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
  const delMesTocan = activos.filter((r) => tocaEnMes(r, mes));
  const faltaPagar = delMesTocan.filter((r) => !pagado(r) && !r.autopago);
  const proximos = faltaPagar.filter((r) => r.dia && fechaEnMes(mes, r.dia) <= sumarDias(hoy, 7)).length;
  const sinProveedor = activos.filter((r) => !r.tercero_id).length;
  const sinDia = activos.filter((r) => !r.dia && !r.autopago).length;

  const acciones = [];
  if (ctx.puede('costos', 'crear')) {
    acciones.push(boton('Nuevo recurrente', { icono: 'mas', onclick: () => (gastosCat.length ? editar(null) : avisar('Primero crea una categoría de gasto.', 'error')) }));
  }
  const puedeEditar = ctx.puede('costos', 'editar');
  // Orden: primero lo que falta pagar este mes por fecha, después lo pagado y lo que no toca, al final los inactivos
  const peso = (r) => { const s = estadoMes(r).clase; return !r.activo || (r.hasta && r.hasta < hoy) ? 4 : s === 'falta' || s === 'cargado' ? (r.autopago ? 1 : 0) : s === 'pagado' ? 2 : 3; };
  const ordenada = [...lista].sort((a, b) => peso(a) - peso(b) || (a.dia ?? 99) - (b.dia ?? 99) || a.concepto.localeCompare(b.concepto));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Recurrentes'),
      el('p', { class: 'texto-suave' }, 'Lo que se paga cada cierto tiempo, con su vencimiento y corte. Cada vez se carga el documento real en la Bandeja: si es del proveedor del recurrente queda ligado solo (o se elige en el gasto), y aquí se ve si ya está pagado. Quien edita Costos recibe el aviso antes del vencimiento y del corte.')),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      el('div', { class: `ficha doc-grupo fin-tarjeta ${faltaPagar.length ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, `Falta pagar de ${nombreMes(mes)}`), el('strong', {}, String(faltaPagar.length)),
        el('span', { class: 'texto-suave texto-chico' }, `${delMesTocan.length - faltaPagar.length} de ${delMesTocan.length} pagados o automáticos`)),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${proximos ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, 'Vencen en 7 días o vencidos, sin pagar'), el('strong', {}, String(proximos))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Mensual estimado'), el('strong', {}, dinero(total)),
        el('span', { class: 'texto-suave texto-chico' }, `${activos.length} activos${sinTc ? ' · USD sin valor del dólar' : tc ? ` · dólar ${dinero(tc)}` : ''}`))),
    sinProveedor || sinDia ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      [sinProveedor ? `${sinProveedor} sin proveedor (sus gastos no se ligan solos: elígelo en el gasto o ponle proveedor)` : null,
        sinDia ? `${sinDia} sin día de vencimiento (no avisan)` : null].filter(Boolean).join(' · ') + '. Ábrelos para completarlos.') : null,
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Concepto', 'Ciclo', 'Vencimiento', 'Monto aprox.', nombreMes(mes), 'Asignado'].map((t, i) => el('th', { class: i === 3 ? 'num' : '' }, t)))),
      el('tbody', {}, ordenada.length ? ordenada.map((r) => el('tr', { class: r.activo ? '' : 'fila-inactiva' },
        el('td', {}, puedeEditar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); editar(r); } }, el('strong', {}, r.concepto)) : el('strong', {}, r.concepto),
          el('div', { class: 'texto-suave texto-chico' }, [ctx.config?.centros ? base.centroDe.get(r.centro_id)?.nombre : null,
            r.tercero_id ? nombreTercero(base.terceros.find((t) => t.id === r.tercero_id)) : 'sin proveedor', base.categoriaDe.get(r.categoria_id)?.nombre, r.autopago ? 'pago automático' : null].filter(Boolean).join(' · '))),
        el('td', {}, textoCiclo(r)),
        el('td', {}, textoFechas(r)),
        el('td', { class: 'num' }, r.moneda === 'USD' ? `US$ ${Number(r.monto)}${tc ? ` · ${dinero(r.monto * tc)}` : ''}` : Number(r.monto) ? dinero(r.monto) : '—'),
        el('td', {}, chipEstado(r)),
        el('td', {}, r.asignado_a ? nombrePersona.get(r.asignado_a) ?? 'Persona' : 'Empresa')))
        : el('tr', {}, el('td', { colspan: 6, class: 'tabla-vacia' }, 'Sin recurrentes. Agrega el arriendo, internet, luz, asesorías o suscripciones.'))))),
    porPersona.size ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Costo mensual por persona'),
      [...porPersona].map(([id, m]) => el('div', { class: 'doc-fila' }, el('span', { class: 'doc-nombre' }, nombrePersona.get(id) ?? 'Persona'), el('strong', {}, dinero(m))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Un pago sin boleta ni factura (ej.: solo transferencia) se carga en la Bandeja como "Gasto sin papel", con el comprobante como foto. Si el gasto no es del proveedor del recurrente, ábrelo en Gastos y elige el recurrente.'));
}
