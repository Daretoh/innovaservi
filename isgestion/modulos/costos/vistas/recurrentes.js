// Gastos recurrentes (arriendo, servicios básicos, asesorías, suscripciones): próximo cobro con semáforo,
// equivalente mensual, costo por persona y "Generar el mes" (crea los gastos del mes por pagar).
import { el } from '../../../core/ui/dom.js?v=6f62ff2';
import { icono } from '../../../core/ui/iconos.js?v=6f62ff2';
import { boton } from '../../../core/ui/tabla.js?v=6f62ff2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6f62ff2';
import { avisar } from '../../../core/ui/aviso.js?v=6f62ff2';
import { dinero, fechaLarga, hoyISO, nombreMes, sumarDias } from '../../../core/ui/formato.js?v=6f62ff2';
import { cargarBase, nombreTercero, DOCS, proximoCobro, mensualCLP, tocaEnMes, generarMes, fechaEnMes } from '../datos.js?v=6f62ff2';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TC_KEY = 'isg.costos.dolar';
const leerTc = () => { try { return Number(localStorage.getItem(TC_KEY)) || 0; } catch { return 0; } };
const guardarTc = (v) => { try { localStorage.setItem(TC_KEY, String(v)); } catch { /* sin almacenamiento */ } };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const mes = hoyISO().slice(0, 7);
  const [base, rec, per, hechos] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('fin_recurrentes').select('*').eq('empresa_id', e).order('activo', { ascending: false }).order('orden').order('concepto'),
    ctx.api.from('persona_empresa').select('persona_id, personas(nombres, apellido_paterno)').eq('empresa_id', e).is('deleted_at', null).eq('estado', 'activo'),
    ctx.api.from('fin_registros').select('recurrente_id').eq('empresa_id', e).eq('periodo', mes).is('deleted_at', null),
  ]);
  if (rec.error) throw rec.error;
  const lista = rec.data;
  const personas = (per.data ?? []).map((p) => [p.persona_id, [p.personas?.nombres, p.personas?.apellido_paterno].filter(Boolean).join(' ')]);
  const nombrePersona = new Map(personas);
  const gastosCat = base.categorias.filter((c) => c.clase !== 'ingreso' && c.activo);
  const ya = new Set((hechos.data ?? []).map((h) => h.recurrente_id));
  const faltan = lista.filter((r) => tocaEnMes(r, mes) && !ya.has(r.id));
  let tc = leerTc() || Math.round((await import('../../../core/economia.js?v=6f62ff2').then((m) => m.dolarDelDia()).catch(() => 0)) ?? 0);

  const hoy = hoyISO();
  const semaforo = (r) => {
    if (!r.activo) return el('span', { class: 'chip chip-na' }, 'Inactivo');
    // Si el cobro de este mes aún no se genera, se muestra ese (aunque la fecha ya pasó)
    const pendienteMes = tocaEnMes(r, mes) && !ya.has(r.id);
    const f = pendienteMes ? fechaEnMes(mes, r.dia) : proximoCobro(r);
    if (!f) return el('span', { class: 'chip chip-na' }, 'Sin próximo cobro');
    const dias = Math.round((new Date(`${f}T12:00`) - new Date(`${hoy}T12:00`)) / 864e5);
    const generado = f.slice(0, 7) === mes && ya.has(r.id);
    if (pendienteMes && dias < 0) return el('span', { class: 'chip chip-venc' }, `${fechaLarga(f)} · por generar`);
    return el('span', { class: `chip ${generado ? 'chip-ok' : dias <= 5 ? 'chip-prox' : 'chip-pend'}` },
      `${fechaLarga(f)}${generado ? ' · generado' : dias === 0 ? ' · hoy' : dias <= 5 ? ` · en ${dias} d` : ''}`);
  };

  const editar = (r) => abrirFormulario({
    titulo: r ? r.concepto : 'Nuevo gasto recurrente',
    campos: [
      { id: 'concepto', etiqueta: 'Concepto', requerido: true, valor: r?.concepto ?? '' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: gastosCat.map((c) => [c.id, c.nombre]), valor: r?.categoria_id ?? gastosCat[0]?.id },
      { id: 'centro', etiqueta: 'Centro de costo', opciones: [['', 'Sin centro'], ...base.centros.filter((c) => c.activo).map((c) => [c.id, c.nombre])], valor: r?.centro_id ?? '' },
      { id: 'tercero', etiqueta: 'Proveedor', opciones: [['', 'Sin proveedor del maestro'], ...base.terceros.filter((t) => t.tipo?.includes('proveedor')).map((t) => [t.id, nombreTercero(t)])], valor: r?.tercero_id ?? '' },
      { id: 'monto', etiqueta: 'Monto (total del documento)', tipo: 'number', requerido: true, valor: r?.monto ?? '' },
      { id: 'moneda', etiqueta: 'Moneda', opciones: [['CLP', 'Pesos (CLP)'], ['USD', 'Dólares (USD)']], valor: r?.moneda ?? 'CLP' },
      { id: 'ciclo', etiqueta: 'Ciclo', opciones: [['mensual', 'Mensual'], ['anual', 'Anual']], valor: r?.ciclo ?? 'mensual' },
      { id: 'dia', etiqueta: 'Día de cobro', tipo: 'number', valor: r?.dia ?? '' },
      { id: 'mes_anual', etiqueta: 'Mes de cobro (si es anual)', opciones: [['', '—'], ...MESES.map((m, i) => [String(i + 1), m])], valor: r?.mes_anual ? String(r.mes_anual) : '' },
      { id: 'doc', etiqueta: 'Documento', opciones: DOCS.filter(([k]) => k !== 'guia'), valor: r?.doc_tipo ?? 'factura' },
      { id: 'autopago', etiqueta: 'Pago automático (queda pagado al generarlo)', opciones: [['no', 'No'], ['si', 'Sí']], valor: r?.autopago ? 'si' : 'no' },
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
        concepto: v.concepto.trim(), categoria_id: v.categoria, centro_id: v.centro || null, tercero_id: v.tercero || null, monto: Number(v.monto),
        moneda: v.moneda, ciclo: v.ciclo, dia, mes_anual: v.ciclo === 'anual' ? Number(v.mes_anual) : null, doc_tipo: v.doc, autopago: v.autopago === 'si',
        asignado_a: v.asignado || null, desde: v.desde, hasta: v.hasta || null, ...(r ? { activo: v.activo === 'true' } : {}),
      };
      const res = r ? await ctx.api.from('fin_recurrentes').update(datos).eq('id', r.id)
        : await ctx.api.from('fin_recurrentes').insert({ ...datos, empresa_id: e, orden: lista.length + 1 });
      if (res.error) throw new Error(res.error.message);
      avisar('Guardado. Los meses ya generados no cambian.'); ctx.refrescar();
    },
  });

  const generar = () => {
    const usd = faltan.some((r) => r.moneda === 'USD');
    abrirFormulario({
      titulo: `Generar los gastos de ${nombreMes(mes)}`,
      mensaje: faltan.length ? `Se crearán ${faltan.length} gastos (${faltan.map((r) => r.concepto).join(', ')}), por pagar salvo los de pago automático.`
        : 'Todos los recurrentes del mes ya están generados.',
      campos: usd ? [{ id: 'tc', etiqueta: 'Valor del dólar (CLP)', tipo: 'number', requerido: true, valor: tc || '' }] : [],
      textoGuardar: 'Generar',
      alGuardar: async (v) => {
        if (usd) { tc = Number(v.tc); guardarTc(tc); }
        const n = await generarMes(ctx, lista, mes, tc);
        avisar(n ? `${n} ${n === 1 ? 'gasto generado' : 'gastos generados'}.` : 'No había nada por generar.'); ctx.refrescar();
      },
    });
  };

  const activos = lista.filter((r) => r.activo);
  const total = activos.reduce((s, r) => s + mensualCLP(r, tc), 0);
  const sinTc = activos.some((r) => r.moneda === 'USD') && !tc;
  const porPersona = new Map();
  for (const r of activos.filter((x) => x.asignado_a)) porPersona.set(r.asignado_a, (porPersona.get(r.asignado_a) ?? 0) + mensualCLP(r, tc));
  const proximos = activos.map((r) => ({ r, f: proximoCobro(r) })).filter((x) => x.f && x.f <= sumarDias(hoy, 7)).length;

  const acciones = [];
  if (ctx.puede('costos', 'crear')) {
    acciones.push(boton(`Generar ${nombreMes(mes)}${faltan.length ? ` (${faltan.length})` : ''}`, { icono: 'calendario', tipo: faltan.length ? 'primario' : 'secundario', onclick: generar }));
    acciones.push(boton('Nuevo recurrente', { icono: 'mas', onclick: () => (gastosCat.length ? editar(null) : avisar('Primero crea una categoría de gasto.', 'error')) }));
  }
  const puedeEditar = ctx.puede('costos', 'editar');

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Gastos recurrentes'), el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Mensual estimado'), el('strong', {}, dinero(total)),
        el('span', { class: 'texto-suave texto-chico' }, `${activos.length} activos · anuales / 12${sinTc ? ' · USD sin valor del dólar' : tc ? ` · dólar ${dinero(tc)}` : ''}`)),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${proximos ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, 'Cobros en los próximos 7 días'), el('strong', {}, String(proximos))),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${faltan.length ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, `Por generar en ${nombreMes(mes)}`), el('strong', {}, String(faltan.length)))),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Concepto', 'Categoría', 'Monto', 'Ciclo', 'Próximo cobro', 'Asignado'].map((t, i) => el('th', { class: i === 2 ? 'num' : '' }, t)))),
      el('tbody', {}, lista.length ? lista.map((r) => el('tr', { class: r.activo ? '' : 'fila-inactiva' },
        el('td', {}, puedeEditar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); editar(r); } }, el('strong', {}, r.concepto)) : el('strong', {}, r.concepto),
          el('div', { class: 'texto-suave texto-chico' }, [base.centroDe.get(r.centro_id)?.nombre, nombreTercero(base.terceros.find((t) => t.id === r.tercero_id)), r.autopago ? 'pago automático' : null].filter(Boolean).join(' · '))),
        el('td', {}, base.categoriaDe.get(r.categoria_id)?.nombre ?? ''),
        el('td', { class: 'num' }, r.moneda === 'USD' ? `US$ ${Number(r.monto)}${tc ? ` · ${dinero(r.monto * tc)}` : ''}` : dinero(r.monto)),
        el('td', {}, r.ciclo === 'anual' ? `Anual (${MESES[r.mes_anual - 1]})` : `Mensual${r.dia ? `, día ${r.dia}` : ''}`),
        el('td', {}, semaforo(r)),
        el('td', {}, r.asignado_a ? nombrePersona.get(r.asignado_a) ?? 'Persona' : 'Empresa')))
        : el('tr', {}, el('td', { colspan: 6, class: 'tabla-vacia' }, 'Sin gastos recurrentes. Agrega el arriendo, internet, asesorías y suscripciones.'))))),
    porPersona.size ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Costo mensual por persona'),
      [...porPersona].map(([id, m]) => el('div', { class: 'doc-fila' }, el('span', { class: 'doc-nombre' }, nombrePersona.get(id) ?? 'Persona'), el('strong', {}, dinero(m))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, icono('alerta', { tam: 14 }), ' Cambiar un monto no reescribe los meses ya generados: corrige el gasto de ese mes en Gastos e ingresos.'));
}
