// Parámetros de remuneraciones y feriados de la empresa (antes fijos en el código de InnovaGestión).
import { el } from '../../../core/ui/dom.js?v=14ad9ff';
import { icono } from '../../../core/ui/iconos.js?v=14ad9ff';
import { boton } from '../../../core/ui/tabla.js?v=14ad9ff';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14ad9ff';
import { avisar } from '../../../core/ui/aviso.js?v=14ad9ff';
import { dinero, fechaLarga, nombreDia, hoyISO } from '../../../core/ui/formato.js?v=14ad9ff';

let anio = Number(hoyISO().slice(0, 4));

export default async function vista(ctx) {
  const [config, feriados] = await Promise.all([
    ctx.api.from('remu_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle(),
    ctx.api.from('remu_feriados').select('*').eq('empresa_id', ctx.empresa.id).gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha'),
  ]);
  if (config.error) throw config.error;
  if (feriados.error) throw feriados.error;
  const cfg = config.data ?? { valor_vuelta: 0, valor_hora: 0, horas_trato: 8, periodo: 'semanal', bono_auto: 0, bono_auto_tope: 0 };
  const editable = ctx.puede('remu', 'editar') && ctx.puede('remu', 'crear');

  const parametros = el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' },
      el('h2', {}, 'Parámetros'),
      editable ? boton('Editar', { icono: 'editar', onclick: () => editarConfig(ctx, cfg, !!config.data) }) : null),
    el('dl', { class: 'datos-lista' },
      el('dt', {}, 'Valor por vuelta'), el('dd', {}, dinero(cfg.valor_vuelta)),
      el('dt', {}, 'Valor hora general'), el('dd', {}, `${dinero(cfg.valor_hora)} (si el cargo no tiene trato ni la persona un valor propio)`),
      el('dt', {}, 'Horas por trato'), el('dd', {}, `${Number(cfg.horas_trato)} (valor hora = trato ÷ ${Number(cfg.horas_trato)})`),
      el('dt', {}, 'Período de pago'), el('dd', {}, cfg.periodo === 'mensual' ? 'Mensual (extras y descuentos por mes)' : 'Semanal (extras y descuentos por semana)'),
      el('dt', {}, 'Ajuste contable'), el('dd', {}, cfg.ajuste_contable ? 'Sí: en el detalle de pago se puede ajustar el monto de cada día o faena (real vs. contable) con su motivo' : 'No: se paga lo calculado'),
      el('dt', {}, 'Bono por auto'), el('dd', {}, cfg.bono_auto ? `${dinero(cfg.bono_auto)} por auto trabajado en el mes${cfg.bono_auto_tope ? `, máximo ${dinero(cfg.bono_auto_tope)} por persona` : ''}, a cada persona que trabajó (pago mensual)` : 'Sin bono')));

  const filasFer = feriados.data.map((f) => el('tr', {},
    el('td', {}, `${nombreDia(f.fecha)} ${fechaLarga(f.fecha)}`),
    el('td', {}, f.nombre),
    el('td', { class: 'acciones-fila' }, ctx.puede('remu', 'eliminar')
      ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${f.nombre}`, onclick: () => quitarFeriado(ctx, f) }, icono('basura', { tam: 16 }))
      : null)));

  const feriadosCaja = el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' },
      el('div', { class: 'nav-periodo' },
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año anterior', onclick: () => { anio -= 1; ctx.refrescar(); } }, icono('volver')),
        el('h2', {}, `Feriados ${anio}`),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año siguiente', onclick: () => { anio += 1; ctx.refrescar(); } }, icono('derecha'))),
      el('div', { class: 'listado-acciones' },
        editable ? boton(`Cargar feriados de Chile ${anio}`, { icono: 'copiar', onclick: () => cargarChile(ctx) }) : null,
        editable ? boton('Agregar', { icono: 'mas', onclick: () => agregarFeriado(ctx) }) : null)),
    el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Feriado'), el('th', {}, ''))),
      el('tbody', {}, filasFer.length ? filasFer : el('tr', {}, el('td', { colspan: 3, class: 'tabla-vacia' }, `Sin feriados cargados para ${anio}.`)))),
    el('p', { class: 'texto-suave texto-chico' }, 'Para los trabajadores fijos, las horas de fines de semana y feriados se pagan completas como trato. Revisa cada año los feriados que se trasladan y agrega los que se decreten (por ejemplo, elecciones).'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Parámetros y feriados')),
    parametros,
    feriadosCaja);
}

function editarConfig(ctx, cfg, existe) {
  abrirFormulario({
    titulo: 'Parámetros de remuneraciones',
    campos: [
      { id: 'valor_vuelta', etiqueta: 'Valor por vuelta ($)', tipo: 'number', valor: String(cfg.valor_vuelta) },
      { id: 'valor_hora', etiqueta: 'Valor hora general ($)', tipo: 'number', valor: String(cfg.valor_hora) },
      { id: 'horas_trato', etiqueta: 'Horas por trato', tipo: 'number', valor: String(cfg.horas_trato) },
      { id: 'periodo', etiqueta: 'Período de pago', opciones: [['semanal', 'Semanal (lunes a domingo)'], ['mensual', 'Mensual']], valor: cfg.periodo ?? 'semanal' },
      { id: 'bono_auto', etiqueta: 'Bono por auto del mes ($, solo pago mensual; 0 = sin bono)', tipo: 'number', valor: String(cfg.bono_auto ?? 0) },
      { id: 'bono_auto_tope', etiqueta: 'Tope del bono por persona ($; 0 = sin tope)', tipo: 'number', valor: String(cfg.bono_auto_tope ?? 0) },
      { id: 'ajuste_contable', etiqueta: 'Ajuste contable (real vs. contable)', opciones: [['no', 'No: se paga lo calculado'], ['si', 'Sí: ajustar el monto de un día o faena con motivo']], valor: cfg.ajuste_contable ? 'si' : 'no' },
    ],
    alGuardar: async (v) => {
      const datos = { valor_vuelta: Number(v.valor_vuelta) || 0, valor_hora: Number(v.valor_hora) || 0, horas_trato: Number(v.horas_trato) || 8, periodo: v.periodo, bono_auto: Math.max(0, Math.round(Number(v.bono_auto) || 0)), bono_auto_tope: Math.max(0, Math.round(Number(v.bono_auto_tope) || 0)), ajuste_contable: v.ajuste_contable === 'si' };
      const r = existe
        ? await ctx.api.from('remu_config').update(datos).eq('empresa_id', ctx.empresa.id).select('empresa_id')
        : await ctx.api.from('remu_config').insert({ ...datos, empresa_id: ctx.empresa.id }).select('empresa_id');
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso.');
      avisar('Parámetros guardados.');
      ctx.refrescar();
    },
  });
}

// Domingo de Pascua (algoritmo de Meeus/Butcher)
function pascua(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
  const h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
  return new Date(a, mes - 1, dia);
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function feriadosChile(a) {
  const p = pascua(a);
  const viernes = new Date(p); viernes.setDate(p.getDate() - 2);
  const sabado = new Date(p); sabado.setDate(p.getDate() - 1);
  return [
    [`${a}-01-01`, 'Año Nuevo'], [iso(viernes), 'Viernes Santo'], [iso(sabado), 'Sábado Santo'],
    [`${a}-05-01`, 'Día del Trabajo'], [`${a}-05-21`, 'Día de las Glorias Navales'],
    [`${a}-06-21`, 'Día Nacional de los Pueblos Indígenas (revisar fecha)'], [`${a}-06-29`, 'San Pedro y San Pablo (revisar traslado)'],
    [`${a}-07-16`, 'Virgen del Carmen'], [`${a}-08-15`, 'Asunción de la Virgen'],
    [`${a}-09-18`, 'Independencia Nacional'], [`${a}-09-19`, 'Día de las Glorias del Ejército'],
    [`${a}-10-12`, 'Encuentro de Dos Mundos (revisar traslado)'], [`${a}-10-31`, 'Día de las Iglesias Evangélicas (revisar traslado)'],
    [`${a}-11-01`, 'Día de Todos los Santos'], [`${a}-12-08`, 'Inmaculada Concepción'], [`${a}-12-25`, 'Navidad'],
  ];
}

async function cargarChile(ctx) {
  const filas = feriadosChile(anio).map(([fecha, nombre]) => ({ empresa_id: ctx.empresa.id, fecha, nombre }));
  const { error } = await ctx.api.from('remu_feriados').upsert(filas, { onConflict: 'empresa_id,fecha', ignoreDuplicates: true });
  if (error) { avisar(error.message, 'error'); return; }
  avisar(`Feriados de ${anio} cargados. Revisa los que se trasladan.`);
  ctx.refrescar();
}

function agregarFeriado(ctx) {
  abrirFormulario({
    titulo: 'Agregar feriado',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true },
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('remu_feriados').insert({ empresa_id: ctx.empresa.id, fecha: v.fecha, nombre: v.nombre.trim() });
      if (error) throw new Error(error.code === '23505' ? 'Ya hay un feriado en esa fecha.' : error.message);
      avisar('Feriado agregado.');
      ctx.refrescar();
    },
  });
}

async function quitarFeriado(ctx, f) {
  const { data, error } = await ctx.api.from('remu_feriados').delete().eq('empresa_id', ctx.empresa.id).eq('fecha', f.fecha).select('fecha');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso.', 'error'); return; }
  avisar('Feriado quitado.');
  ctx.refrescar();
}
