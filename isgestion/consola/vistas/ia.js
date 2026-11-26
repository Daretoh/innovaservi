// Consumo de IA (Consola 005, 2026-11-24): cuánto gasta ISgestión en la API de Claude sin entrar a la Consola de
// Anthropic. Cada llamada la anotan las Edge Functions en con_ia_consumo (supabase/functions/_shared/ia-consumo.ts) y la
// base calcula su costo con los precios de con_ia_precios (editables abajo). El crédito y el saldo del mes se anotan a
// mano (con_ia_saldos) con lo que muestra la Consola de Anthropic (organización IS Performance → Billing).
// Ruta: #/ia (?mes=AAAA-MM). Solo el equipo (es_equipo()).
import { el } from '../../core/ui/dom.js?v=4fd87dc';
import { icono } from '../../core/ui/iconos.js?v=4fd87dc';
import { boton } from '../../core/ui/tabla.js?v=4fd87dc';
import { avisar } from '../../core/ui/aviso.js?v=4fd87dc';
import { abrirFormulario } from '../../core/ui/modal.js?v=4fd87dc';
import { nombreMes, rangoMes, moverMes } from '../../core/ui/formato.js?v=4fd87dc';
import { nuevoExcel } from '../../core/excel.js?v=4fd87dc';

const PERFORMANCE = '78270149-1000-4000-8000-000000000001';   // la organización de Anthropic que paga es IS Performance
const MESES_ATRAS = 5;
const FUNCIONES = {
  'leer-documento': 'Lector de documentos', soporte: 'Asistente de Ayuda', 'revisar-documento': 'Revisar con IA',
  'mkt-bot': 'Bot de clientes (simulador)', 'mkt-whatsapp': 'Bot de WhatsApp (automático)', 'bot-clientes': 'Bot de clientes',
};
const MODULOS = { costos: 'Costos', rrhh: 'RRHH', flota: 'Flota', acreditacion: 'Acreditación', sst: 'Prevención SST', mkt: 'Marketing', soporte: 'Ayuda' };

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const usd = (v, dec = 2) => (v == null || Number.isNaN(v) ? '—'
  : `US$ ${Number(v).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`);
const usdFino = (v) => usd(v, Math.abs(v) < 1 && v !== 0 ? 4 : 2);
const miles = (n) => Math.round(n || 0).toLocaleString('es-CL');
const tokens = (c) => c.entrada + c.salida + c.cache_5m + c.cache_1h + c.cache_lectura;
const numero = (t) => { const s = String(t ?? '').trim().replace(/\s|US\$|\$/g, ''); if (!s) return null; const v = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); if (!Number.isFinite(v) || v < 0) throw new Error(`"${t}" no es un monto válido.`); return v; };
const fechaHora = (iso) => new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nombreFuncion = (c) => {
  const f = FUNCIONES[c.funcion] ?? c.funcion;
  return c.funcion === 'leer-documento' && c.modulo ? `${f} · ${MODULOS[c.modulo] ?? c.modulo}` : c.funcion === 'revisar-documento' ? `${f} (SST)` : f;
};

// Suma por una clave: [{ clave, nombre, llamadas, tokens, usd }] de mayor a menor gasto
function agrupar(filas, clave, nombre) {
  const m = new Map();
  for (const c of filas) {
    const k = clave(c);
    const g = m.get(k) ?? m.set(k, { clave: k, nombre: nombre(c), llamadas: 0, tokens: 0, usd: 0 }).get(k);
    g.llamadas++; g.tokens += tokens(c); g.usd += Number(c.costo_usd || 0);
  }
  return [...m.values()].sort((a, b) => b.usd - a.usd || b.llamadas - a.llamadas);
}

function reparto(titulo, grupos, total) {
  return el('section', { class: 'ficha ia-reparto' },
    el('h2', {}, titulo),
    grupos.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', { class: 'num' }, 'Llamadas'), el('th', { class: 'num' }, 'Tokens'), el('th', { class: 'num' }, 'USD'), el('th', {}, ''))),
      el('tbody', {}, grupos.map((g) => el('tr', {},
        el('td', {}, g.nombre),
        el('td', { class: 'num' }, miles(g.llamadas)),
        el('td', { class: 'num' }, miles(g.tokens)),
        el('td', { class: 'num' }, usdFino(g.usd)),
        el('td', { class: 'ia-barra-celda' }, el('span', { class: 'ia-barra', style: `width:${total > 0 ? Math.max(2, Math.round((g.usd / total) * 100)) : 0}%`, title: total > 0 ? `${Math.round((g.usd / total) * 100)} %` : '' }))))))))
      : el('p', { class: 'texto-suave' }, 'Sin llamadas en este mes.'));
}

// Barras por día del mes (gasto en USD), con el valor de cada día al pasar el mouse
function tendencia(mes, porDia, hasta) {
  const { dias } = rangoMes(mes);
  const max = Math.max(...Object.values(porDia), 0);
  const W = 720, H = 190, izq = 54, abajo = 22, arriba = 10, ancho = (W - izq - 6) / dias;
  const alto = (v) => (max > 0 ? ((H - abajo - arriba) * v) / max : 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'ia-grafico'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Gasto diario de ${nombreMes(mes)}`);
  const nodo = (tag, at, texto) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); if (texto != null) n.textContent = texto; svg.append(n); return n; };
  for (const f of [0, 0.5, 1]) {
    const y = H - abajo - (H - abajo - arriba) * f;
    nodo('line', { x1: izq, x2: W - 4, y1: y, y2: y, class: 'ia-guia' });
    nodo('text', { x: izq - 6, y: y + 4, 'text-anchor': 'end', class: 'ia-eje' }, usd(max * f, max * f < 1 && f > 0 ? 3 : 2).replace('US$ ', '$'));
  }
  for (let d = 1; d <= dias; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    const v = porDia[dia] || 0; const h = alto(v);
    const x = izq + (d - 1) * ancho + 1;
    if (dia <= hasta) {
      const r = nodo('rect', { x, y: H - abajo - h, width: Math.max(1, ancho - 2), height: Math.max(h, v > 0 ? 1 : 0), rx: 2, class: 'ia-dia' });
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${d} de ${nombreMes(mes).split(' ')[0].toLowerCase()}: ${usdFino(v)}`; r.append(t);
    }
    if (d === 1 || d % 5 === 0) nodo('text', { x: x + ancho / 2 - 1, y: H - 6, 'text-anchor': 'middle', class: 'ia-eje' }, String(d));
  }
  return svg;
}

export default async function vista(ctx) {
  const hoy = hoyChile();
  const mesActual = hoy.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(ctx.params.mes || '') && ctx.params.mes <= mesActual ? ctx.params.mes : mesActual;
  const primero = moverMes(mesActual, -MESES_ATRAS);
  const desde = `${mes < primero ? mes : primero}-01`;
  const [det, sal, pre] = await Promise.all([
    ctx.api.rpc('con_ia_detalle', { p_desde: desde, p_hasta: hoy }),
    ctx.api.from('con_ia_saldos').select('*'),
    ctx.api.from('con_ia_precios').select('*').order('modelo'),
  ]);
  for (const r of [det, sal, pre]) if (r.error) throw new Error(r.error.message);
  const todas = (det.data ?? []).map((c) => ({ ...c, costo_usd: c.costo_usd == null ? null : Number(c.costo_usd) }));
  const saldos = new Map((sal.data ?? []).map((s) => [s.mes.slice(0, 7), s]));
  const precios = pre.data ?? [];

  const { desde: d0, hasta: d1, dias } = rangoMes(mes);
  const delMes = todas.filter((c) => c.dia >= d0 && c.dia <= d1);
  const gasto = delMes.reduce((s, c) => s + (c.costo_usd || 0), 0);
  const sinPrecio = [...new Set(delMes.filter((c) => c.costo_usd == null).map((c) => c.modelo))];
  const historicos = delMes.filter((c) => c.historico).length;
  const s = saldos.get(mes);
  const credito = s?.credito_usd == null ? null : Number(s.credito_usd);
  const saldoVisto = s?.saldo_usd == null ? null : Number(s.saldo_usd);
  const gastoDesdeSaldo = s?.saldo_al ? delMes.filter((c) => c.created_at > s.saldo_al).reduce((t, c) => t + (c.costo_usd || 0), 0) : 0;
  const queda = saldoVisto != null ? saldoVisto - gastoDesdeSaldo : credito != null ? credito - gasto : null;
  const esActual = mes === mesActual;
  const diasPasados = esActual ? Number(hoy.slice(8, 10)) : dias;
  const ritmo = diasPasados ? gasto / diasPasados : 0;
  const proyeccion = esActual ? ritmo * dias : gasto;
  const diasAlcanza = esActual && queda != null && ritmo > 0 ? Math.floor(queda / ritmo) : null;
  const porDia = {}; for (const c of delMes) porDia[c.dia] = (porDia[c.dia] || 0) + (c.costo_usd || 0);

  const grupos = {
    empresa: agrupar(delMes, (c) => c.empresa_id ?? '-', (c) => c.empresa ?? 'Sin empresa'),
    funcion: agrupar(delMes, (c) => `${c.funcion}|${c.funcion === 'leer-documento' ? c.modulo : ''}`, nombreFuncion),
    usuario: agrupar(delMes, (c) => c.usuario_id ?? '-', (c) => (c.usuario_id ? c.usuario ?? 'Cuenta eliminada' : 'Automático (sin cuenta)')),
    modelo: agrupar(delMes, (c) => `${c.modelo}|${c.rapido}`, (c) => `${c.modelo}${c.rapido ? ' (modo rápido)' : ''}`),
  };
  const meses = []; for (let m = mesActual; m >= primero; m = moverMes(m, -1)) meses.push(m);
  const resumenMes = (m) => {
    const r = rangoMes(m); const f = todas.filter((c) => c.dia >= r.desde && c.dia <= r.hasta);
    return { mes: m, llamadas: f.length, tokens: f.reduce((t, c) => t + tokens(c), 0), usd: f.reduce((t, c) => t + (c.costo_usd || 0), 0), saldo: saldos.get(m) };
  };

  // ---- Anotar crédito y saldo (lo que muestra la Consola de Anthropic)
  const anotar = () => abrirFormulario({
    titulo: `Crédito y saldo de ${nombreMes(mes)}`,
    mensaje: 'Lo que ves en la Consola de Anthropic (organización IS Performance → Billing), en dólares. El saldo queda con la fecha y hora de ahora: lo que se gaste después se descuenta solo.',
    campos: [
      { id: 'credito', etiqueta: 'Crédito del mes (USD)', valor: credito ?? '', ayuda: 'Lo que se carga o asigna para el mes. Ej.: 100' },
      { id: 'saldo', etiqueta: 'Saldo que muestra Anthropic ahora (USD)', valor: '', ayuda: saldoVisto != null ? `Última vez: ${usd(saldoVisto)} el ${fechaHora(s.saldo_al)}. Vacío deja el anterior.` : 'Opcional. Ej.: 87,40' },
      { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', valor: s?.nota ?? '' },
    ],
    alGuardar: async (v) => {
      const nuevoSaldo = numero(v.saldo);
      const fila = { mes: `${mes}-01`, credito_usd: numero(v.credito), nota: String(v.nota || '').trim() || null, updated_at: new Date().toISOString(), updated_by: ctx.usuario.id,
        ...(nuevoSaldo != null ? { saldo_usd: nuevoSaldo, saldo_al: new Date().toISOString() } : {}) };
      const { error } = await ctx.api.from('con_ia_saldos').upsert(fila, { onConflict: 'mes' });
      if (error) throw new Error(error.message);
      avisar('Anotado.'); ctx.refrescar();
    },
  });

  // ---- Precios
  const editarPrecio = (p = null) => abrirFormulario({
    titulo: p ? `Precio de ${p.modelo}` : 'Agregar modelo',
    mensaje: 'USD por millón de tokens, como en la página de precios de Anthropic. Se usan para las llamadas nuevas; para corregir las ya anotadas usa "Recalcular este mes".',
    campos: [
      ...(p ? [] : [{ id: 'modelo', etiqueta: 'Modelo (id exacto)', requerido: true, ayuda: 'Ej.: claude-sonnet-5-5' }]),
      { id: 'entrada', etiqueta: 'Entrada', requerido: true, valor: p?.entrada ?? '' },
      { id: 'salida', etiqueta: 'Salida', requerido: true, valor: p?.salida ?? '' },
      { id: 'cache_5m', etiqueta: 'Escritura de caché 5 min', requerido: true, valor: p?.cache_5m ?? '', ayuda: 'Normalmente 1,25 × la entrada' },
      { id: 'cache_1h', etiqueta: 'Escritura de caché 1 hora', requerido: true, valor: p?.cache_1h ?? '', ayuda: 'Normalmente 2 × la entrada' },
      { id: 'cache_lectura', etiqueta: 'Lectura de caché', requerido: true, valor: p?.cache_lectura ?? '' },
      { id: 'rapido', etiqueta: 'Multiplicador del modo rápido', requerido: true, valor: p?.rapido ?? 1, ayuda: '1 si el modelo no tiene modo rápido' },
      { id: 'nota', etiqueta: 'Nota', valor: p?.nota ?? '' },
    ],
    alGuardar: async (v) => {
      const fila = { entrada: numero(v.entrada), salida: numero(v.salida), cache_5m: numero(v.cache_5m), cache_1h: numero(v.cache_1h),
        cache_lectura: numero(v.cache_lectura), rapido: Math.max(1, numero(v.rapido) ?? 1), nota: String(v.nota || '').trim() || null, updated_at: new Date().toISOString() };
      const { error } = p ? await ctx.api.from('con_ia_precios').update(fila).eq('modelo', p.modelo)
        : await ctx.api.from('con_ia_precios').insert({ ...fila, modelo: String(v.modelo).trim() });
      if (error) throw new Error(error.message);
      avisar('Precio guardado.'); ctx.refrescar();
    },
  });
  const recalcular = boton('Recalcular este mes', { icono: 'reloj', title: 'Vuelve a calcular el costo de las llamadas del mes con los precios de esta tabla' });
  recalcular.addEventListener('click', async () => {
    if (!confirm(`¿Recalcular el costo de las llamadas de ${nombreMes(mes)} con los precios actuales?`)) return;
    recalcular.disabled = true;
    const { data, error } = await ctx.api.rpc('con_ia_recalcular', { p_desde: d0, p_hasta: d1 });
    recalcular.disabled = false;
    if (error) { avisar(error.message, 'error'); return; }
    avisar(`${data} llamadas recalculadas.`); ctx.refrescar();
  });

  // ---- Excel con el membrete de IS Performance (la organización que paga los créditos)
  const excel = boton('Excel', { icono: 'descargar' });
  excel.addEventListener('click', async () => {
    excel.disabled = true;
    try {
      let { data: emp } = await ctx.api.from('empresas').select('*').eq('id', PERFORMANCE).maybeSingle();
      emp ??= { razon_social: 'ISgestión', rut: '', color: '#1f4e8c' };
      const x = await nuevoExcel({ api: ctx.api, empresa: emp }, { titulo: 'Consumo de IA (API de Claude)', subtitulo: `${nombreMes(mes)} · emitido el ${new Date().toLocaleString('es-CL')}` });
      x.tabla({ titulo: 'Resumen', columnas: ['Concepto', { t: 'USD', tipo: 'usd' }], filas: [
        ['Gasto del mes', gasto], ['Crédito anotado', credito], ['Queda (estimado)', queda], [esActual ? 'Proyección a fin de mes' : 'Total del mes', proyeccion]] });
      const cols = ['', { t: 'Llamadas', tipo: 'numero' }, { t: 'Tokens', tipo: 'numero' }, { t: 'USD', tipo: 'usd' }];
      for (const [t, g] of [['Por empresa', grupos.empresa], ['Por función y módulo', grupos.funcion], ['Por usuario', grupos.usuario], ['Por modelo', grupos.modelo]]) {
        x.tabla({ titulo: t, columnas: cols, filas: g.map((r) => [r.nombre, r.llamadas, r.tokens, r.usd]), total: ['Total', delMes.length, delMes.reduce((a, c) => a + tokens(c), 0), gasto] });
      }
      x.tabla({ hoja: 'Por día', titulo: 'Gasto diario', columnas: [{ t: 'Día', tipo: 'fecha' }, { t: 'USD', tipo: 'usd' }],
        filas: Object.keys(porDia).sort().map((d) => [d, porDia[d]]), total: ['Total', gasto] });
      x.tabla({ hoja: 'Meses', titulo: 'Meses', columnas: ['Mes', { t: 'Llamadas', tipo: 'numero' }, { t: 'Tokens', tipo: 'numero' }, { t: 'USD', tipo: 'usd' }, { t: 'Crédito', tipo: 'usd' }],
        filas: meses.map(resumenMes).map((r) => [nombreMes(r.mes), r.llamadas, r.tokens, r.usd, r.saldo?.credito_usd == null ? null : Number(r.saldo.credito_usd)]) });
      x.tabla({ hoja: 'Llamadas', titulo: `Llamadas de ${nombreMes(mes)}`,
        columnas: ['Fecha y hora', 'Empresa', 'Usuario', 'Función', 'Modelo', { t: 'Entrada', tipo: 'numero' }, { t: 'Salida', tipo: 'numero' }, { t: 'Caché escrita', tipo: 'numero' }, { t: 'Caché leída', tipo: 'numero' }, { t: 'USD', tipo: 'usd' }, 'Detalle'],
        filas: delMes.map((c) => [new Date(c.created_at).toLocaleString('es-CL'), c.empresa ?? '', c.usuario_id ? c.usuario ?? '' : 'Automático', nombreFuncion(c),
          `${c.modelo}${c.rapido ? ' (rápido)' : ''}`, c.entrada, c.salida, c.cache_5m + c.cache_1h, c.cache_lectura, c.costo_usd, [c.historico ? 'Estimado' : '', c.detalle ?? ''].filter(Boolean).join(' · ')]) });
      await x.guardar(`consumo-ia-${mes}`);
    } catch (e) { avisar(e.message, 'error'); }
    excel.disabled = false;
  });

  // ---- Pantalla
  const tarjeta = (t, v, sub, clase = '') => el('div', { class: `ficha fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, v), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null);
  const alcanza = credito != null && esActual ? (proyeccion <= credito ? 'ia-ok' : 'ia-mal') : '';
  const tarjetas = el('div', { class: 'fin-tarjetas' },
    tarjeta(esActual ? 'Gasto del mes (hasta hoy)' : 'Gasto del mes', usd(gasto), `${miles(delMes.length)} llamadas`),
    tarjeta('Crédito del mes', credito != null ? usd(credito) : 'Sin anotar', credito != null ? 'Anotado a mano' : 'Anótalo con el botón de arriba'),
    tarjeta('Queda', queda != null ? usd(queda) : '—',
      saldoVisto != null ? `Anthropic mostraba ${usd(saldoVisto)} el ${fechaHora(s.saldo_al)}; después se gastaron ${usdFino(gastoDesdeSaldo)}`
        : credito != null ? 'Crédito menos lo gastado (estimado)' : null, queda != null && queda < 0 ? 'ia-mal' : ''),
    esActual ? tarjeta('Proyección a fin de mes', usd(proyeccion),
      `${usdFino(ritmo)} por día${credito != null ? ` · ${Math.round((proyeccion / credito) * 100)} % del crédito` : ''}${diasAlcanza != null ? ` · alcanza para ~${diasAlcanza} días` : ''}`, alcanza) : null);

  const pestanas = el('div', { class: 'pestanas ia-meses', role: 'tablist' },
    [...meses].reverse().map((m) => el('a', { class: 'pestana', href: ctx.ruta('ia', { mes: m }), role: 'tab', 'aria-selected': String(m === mes) }, nombreMes(m))));

  const avisos = [
    sinPrecio.length ? el('p', { class: 'sal-aviso sal-aviso-fuerte' }, icono('alerta', { tam: 16 }), ` Sin precio (no suman al gasto): ${sinPrecio.join(', ')}. Agrégalos en Precios y usa "Recalcular este mes".`) : null,
    historicos ? el('p', { class: 'sal-aviso' }, icono('reloj', { tam: 16 }), ` Incluye ${historicos} registros estimados de antes del 24-nov-2026 (asistente y Revisar con IA, sin desglose de caché). El lector de documentos y los bots se anotan desde esa fecha.`) : null,
  ];

  const tablaMeses = el('section', { class: 'ficha ia-reparto' }, el('h2', {}, 'Meses'),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Mes'), el('th', { class: 'num' }, 'Llamadas'), el('th', { class: 'num' }, 'Tokens'), el('th', { class: 'num' }, 'Gasto'), el('th', { class: 'num' }, 'Crédito'), el('th', { class: 'num' }, 'Saldo anotado'))),
      el('tbody', {}, meses.map(resumenMes).map((r) => el('tr', { class: r.mes === mes ? 'resaltada' : '' },
        el('td', {}, el('a', { href: ctx.ruta('ia', { mes: r.mes }) }, nombreMes(r.mes))),
        el('td', { class: 'num' }, miles(r.llamadas)), el('td', { class: 'num' }, miles(r.tokens)), el('td', { class: 'num' }, usd(r.usd)),
        el('td', { class: 'num' }, r.saldo?.credito_usd != null ? usd(Number(r.saldo.credito_usd)) : '—'),
        el('td', { class: 'num' }, r.saldo?.saldo_usd != null ? `${usd(Number(r.saldo.saldo_usd))} (${fechaHora(r.saldo.saldo_al)})` : '—')))))));

  const tablaPrecios = el('details', { class: 'ficha sal-historial ia-precios' },
    el('summary', {}, el('h2', {}, 'Precios por modelo (USD por millón de tokens)')),
    el('p', { class: 'texto-suave texto-chico' }, 'El costo de cada llamada lo calcula la base con esta tabla al anotarla. Si Anthropic cambia un precio, edítalo aquí.'),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, ['Modelo', 'Entrada', 'Salida', 'Caché 5 min', 'Caché 1 h', 'Lectura caché', 'Rápido', 'Nota', ''].map((t, i) => el('th', { class: i && i < 7 ? 'num' : '' }, t)))),
      el('tbody', {}, precios.map((p) => el('tr', {},
        el('td', {}, el('code', {}, p.modelo)),
        ...['entrada', 'salida', 'cache_5m', 'cache_1h', 'cache_lectura'].map((k) => el('td', { class: 'num' }, Number(p[k]).toLocaleString('es-CL', { maximumFractionDigits: 4 }))),
        el('td', { class: 'num' }, `${Number(p.rapido).toLocaleString('es-CL')}×`),
        el('td', { class: 'texto-suave texto-chico' }, p.nota ?? ''),
        el('td', {}, el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${p.modelo}`, onclick: () => editarPrecio(p) }, icono('editar', { tam: 16 })))))))),
    el('div', { class: 'ia-precios-acciones' }, boton('Agregar modelo', { icono: 'mas', onclick: () => editarPrecio() }), recalcular));

  return el('section', { class: 'listado ia' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, icono('grafico'), ' Consumo de IA'),
      el('div', { class: 'listado-acciones' }, boton('Anotar crédito o saldo', { icono: 'dinero', tipo: 'primario', onclick: anotar }), excel)),
    el('p', { class: 'texto-suave ia-intro' }, 'Gasto estimado en la API de Claude (créditos de la organización IS Performance) con los tokens que anota cada función y los precios de abajo. Lo que cobra Anthropic puede diferir en centavos.'),
    pestanas, ...avisos, tarjetas,
    el('section', { class: 'ficha ia-reparto ia-tendencia' }, el('h2', {}, `Gasto por día · ${nombreMes(mes)}`), tendencia(mes, porDia, esActual ? hoy : d1)),
    el('div', { class: 'ia-repartos' },
      reparto('Por empresa', grupos.empresa, gasto),
      reparto('Por función y módulo', grupos.funcion, gasto),
      reparto('Por usuario', grupos.usuario, gasto),
      reparto('Por modelo', grupos.modelo, gasto)),
    tablaMeses, tablaPrecios);
}
