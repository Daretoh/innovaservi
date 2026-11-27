// Consumo de IA (Consola 005, 2026-11-24): cuánto gasta ISgestión en la API de Claude sin entrar a la Consola de
// Anthropic. Cada llamada la anotan las Edge Functions en con_ia_consumo (supabase/functions/_shared/ia-consumo.ts) y la
// base calcula su costo con los precios de con_ia_precios (editables abajo). El crédito y el saldo del mes se anotan a
// mano (con_ia_saldos) con lo que muestra la Consola de Anthropic (organización IS Performance → Billing).
// Desde Consola 006 (2026-11-27) se mide por ciclo del crédito (del día de renovación al día anterior del mes
// siguiente; ?mes=AAAA-MM es el mes en que empieza el ciclo) y se ven los topes por función, los umbrales y los avisos.
// Ruta: #/ia (?mes=AAAA-MM). Solo el equipo (es_equipo()).
import { el } from '../../core/ui/dom.js?v=96471b3';
import { icono } from '../../core/ui/iconos.js?v=96471b3';
import { boton } from '../../core/ui/tabla.js?v=96471b3';
import { avisar } from '../../core/ui/aviso.js?v=96471b3';
import { abrirFormulario } from '../../core/ui/modal.js?v=96471b3';
import { moverMes } from '../../core/ui/formato.js?v=96471b3';
import { nuevoExcel } from '../../core/excel.js?v=96471b3';

const PERFORMANCE = '78270149-1000-4000-8000-000000000001';   // la organización de Anthropic que paga es IS Performance
const MESES_ATRAS = 5;
const FUNCIONES = {
  'leer-documento': 'Lector de documentos', soporte: 'Asistente de Ayuda', 'revisar-documento': 'Revisar con IA',
  'mkt-bot': 'Bot de clientes (simulador)', 'mkt-whatsapp': 'Bot de WhatsApp (automático)', 'bot-clientes': 'Bot de clientes',
};
const MODULOS = { costos: 'Costos', rrhh: 'RRHH', flota: 'Flota', acreditacion: 'Acreditación', sst: 'Prevención SST', mkt: 'Marketing', soporte: 'Ayuda', cotizaciones: 'Cotizaciones' };

const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Ciclo del crédito que empieza el día `dia` del mes `mes` (AAAA-MM): días, desde y hasta (igual que con_ia_ciclo)
function ciclo(mes, dia) {
  const [a, m] = mes.split('-').map(Number);
  const fin = new Date(a, m, dia - 1, 12); const dias = [];   // a mediodía: el cambio de hora no corre los días
  for (const d = new Date(a, m - 1, dia, 12); d <= fin; d.setDate(d.getDate() + 1)) dias.push(isoDe(d));
  return { mes, desde: dias[0], hasta: dias[dias.length - 1], dias };
}
const cicloDeHoy = (hoy, dia) => (Number(hoy.slice(8, 10)) >= dia ? hoy.slice(0, 7) : moverMes(hoy.slice(0, 7), -1));
const corto = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES_C[m - 1]}`; };
const nombreCiclo = (c) => `${corto(c.desde)} – ${corto(c.hasta)} ${c.hasta.slice(0, 4)}`;
const MOTIVO = { tope: 'Llegó a su tope', reserva: 'En pausa: reserva para las esenciales', sin_credito: 'En pausa: sin crédito', apagada: 'Apagada' };
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
        el('td', { class: 'ia-barra-celda' }, el('span', { class: 'ia-barra', style: `width:${total > 0 ? Math.max(2, Math.round((g.usd / total) * 100)) : 0}%`, title: total > 0 ? `${Math.round((g.usd / total) * 100)} %` : '' })))))))
      : el('p', { class: 'texto-suave' }, 'Sin llamadas en este ciclo.'));
}

// Barras por día del ciclo (gasto en USD), con el valor de cada día al pasar el mouse
function tendencia(C, porDia, hasta) {
  const dias = C.dias.length;
  const max = Math.max(...Object.values(porDia), 0);
  const W = 720, H = 190, izq = 54, abajo = 22, arriba = 10, ancho = (W - izq - 6) / dias;
  const alto = (v) => (max > 0 ? ((H - abajo - arriba) * v) / max : 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'ia-grafico'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Gasto diario del ciclo ${nombreCiclo(C)}`);
  const nodo = (tag, at, texto) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); if (texto != null) n.textContent = texto; svg.append(n); return n; };
  for (const f of [0, 0.5, 1]) {
    const y = H - abajo - (H - abajo - arriba) * f;
    nodo('line', { x1: izq, x2: W - 4, y1: y, y2: y, class: 'ia-guia' });
    nodo('text', { x: izq - 6, y: y + 4, 'text-anchor': 'end', class: 'ia-eje' }, usd(max * f, max * f < 1 && f > 0 ? 3 : 2).replace('US$ ', '$'));
  }
  for (let d = 1; d <= dias; d++) {
    const dia = C.dias[d - 1];
    const v = porDia[dia] || 0; const h = alto(v);
    const x = izq + (d - 1) * ancho + 1;
    if (dia <= hasta) {
      const r = nodo('rect', { x, y: H - abajo - h, width: Math.max(1, ancho - 2), height: Math.max(h, v > 0 ? 1 : 0), rx: 2, class: 'ia-dia' });
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${corto(dia)}: ${usdFino(v)}`; r.append(t);
    }
    if (d === 1 || d % 5 === 0) nodo('text', { x: x + ancho / 2 - 1, y: H - 6, 'text-anchor': 'middle', class: 'ia-eje' }, corto(dia));
  }
  return svg;
}

export default async function vista(ctx) {
  const hoy = hoyChile();
  const [aj, est] = await Promise.all([ctx.api.from('con_ia_ajustes').select('*').maybeSingle(), ctx.api.rpc('con_ia_estado_equipo')]);
  for (const r of [aj, est]) if (r.error) throw new Error(r.error.message);
  const ajustes = aj.data ?? { dia_ciclo: 20, credito_usd: 100, aviso_pct: 20, reserva_pct: 10, corte_pct: 5 };
  const DIA = ajustes.dia_ciclo;
  const estado = est.data ?? {};
  const mesActual = cicloDeHoy(hoy, DIA);
  const mes = /^\d{4}-\d{2}$/.test(ctx.params.mes || '') && ctx.params.mes <= mesActual ? ctx.params.mes : mesActual;
  const primero = moverMes(mesActual, -MESES_ATRAS);
  const desde = ciclo(mes < primero ? mes : primero, DIA).desde;
  const C = ciclo(mes, DIA);
  const [det, sal, pre, avi] = await Promise.all([
    ctx.api.rpc('con_ia_detalle', { p_desde: desde, p_hasta: hoy }),
    ctx.api.from('con_ia_saldos').select('*'),
    ctx.api.from('con_ia_precios').select('*').order('modelo'),
    ctx.api.from('con_ia_avisos').select('*').eq('ciclo', C.desde).order('enviado_at'),
  ]);
  for (const r of [det, sal, pre, avi]) if (r.error) throw new Error(r.error.message);
  const todas = (det.data ?? []).map((c) => ({ ...c, costo_usd: c.costo_usd == null ? null : Number(c.costo_usd) }));
  const saldos = new Map((sal.data ?? []).map((s) => [s.mes.slice(0, 7), s]));
  const precios = pre.data ?? [];

  const d0 = C.desde, d1 = C.hasta, dias = C.dias.length;
  const delMes = todas.filter((c) => c.dia >= d0 && c.dia <= d1);
  const gasto = delMes.reduce((s, c) => s + (c.costo_usd || 0), 0);
  const sinPrecio = [...new Set(delMes.filter((c) => c.costo_usd == null).map((c) => c.modelo))];
  const historicos = delMes.filter((c) => c.historico).length;
  const s = saldos.get(mes);
  const credito = s?.credito_usd == null ? Number(ajustes.credito_usd) : Number(s.credito_usd);
  const saldoVisto = s?.saldo_usd == null || !s.saldo_al || s.saldo_al < `${d0}T03:00:00Z` ? null : Number(s.saldo_usd);
  const gastoDesdeSaldo = s?.saldo_al ? delMes.filter((c) => c.created_at > s.saldo_al).reduce((t, c) => t + (c.costo_usd || 0), 0) : 0;
  const queda = saldoVisto != null ? saldoVisto - gastoDesdeSaldo : credito != null ? credito - gasto : null;
  const esActual = mes === mesActual;
  const diasPasados = esActual ? C.dias.indexOf(hoy) + 1 : dias;
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
    const r = ciclo(m, DIA); const f = todas.filter((c) => c.dia >= r.desde && c.dia <= r.hasta);
    return { mes: m, llamadas: f.length, tokens: f.reduce((t, c) => t + tokens(c), 0), usd: f.reduce((t, c) => t + (c.costo_usd || 0), 0), saldo: saldos.get(m) };
  };

  // ---- Anotar crédito y saldo (lo que muestra la Consola de Anthropic)
  const anotar = () => abrirFormulario({
    titulo: `Crédito y saldo de ${nombreCiclo(C)}`,
    mensaje: 'Lo que ves en la Consola de Anthropic (organización IS Performance → Billing), en dólares. El saldo queda con la fecha y hora de ahora: lo que se gaste después se descuenta solo.',
    campos: [
      { id: 'credito', etiqueta: 'Crédito del ciclo (USD)', valor: s?.credito_usd ?? '', ayuda: `Lo que llega con la renovación. Vacío usa el habitual (US$ ${ajustes.credito_usd}).` },
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
    mensaje: 'USD por millón de tokens, como en la página de precios de Anthropic. Se usan para las llamadas nuevas; para corregir las ya anotadas usa "Recalcular este ciclo".',
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
  const recalcular = boton('Recalcular este ciclo', { icono: 'reloj', title: 'Vuelve a calcular el costo de las llamadas del ciclo con los precios de esta tabla' });
  recalcular.addEventListener('click', async () => {
    if (!confirm(`¿Recalcular el costo de las llamadas de ${nombreCiclo(C)} con los precios actuales?`)) return;
    recalcular.disabled = true;
    const { data, error } = await ctx.api.rpc('con_ia_recalcular', { p_desde: d0, p_hasta: d1 });
    recalcular.disabled = false;
    if (error) { avisar(error.message, 'error'); return; }
    avisar(`${data} llamadas recalculadas.`); ctx.refrescar();
  });

  // ---- Protección: topes por función, umbrales y avisos (Consola 006)
  const editarTope = (f) => abrirFormulario({
    titulo: f.nombre,
    mensaje: 'Tope en USD por ciclo del crédito. Al llegar al tope la función se pausa hasta la renovación y se avisa por push. Las esenciales siguen funcionando con la reserva.',
    campos: [
      { id: 'tope', etiqueta: 'Tope por ciclo (USD)', valor: f.tope_usd ?? '', ayuda: 'Vacío: sin tope propio' },
      { id: 'esencial', etiqueta: 'Tipo', opciones: [['no', 'Opcional (se pausa con la reserva)'], ['si', 'Esencial (sigue con la reserva)']], valor: f.esencial ? 'si' : 'no' },
      { id: 'activa', etiqueta: 'Estado', opciones: [['si', 'Activa'], ['no', 'Apagada']], valor: f.activa ? 'si' : 'no' },
      { id: 'nota', etiqueta: 'Nota', valor: f.nota ?? '' },
    ],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('con_ia_topes').update({ tope_usd: numero(v.tope), esencial: v.esencial === 'si', activa: v.activa === 'si',
        nota: String(v.nota || '').trim() || null, updated_at: new Date().toISOString() }).eq('funcion', f.funcion);
      if (error) throw new Error(error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });
  const editarAjustes = () => abrirFormulario({
    titulo: 'Ajustes del crédito de IA',
    campos: [
      { id: 'dia', etiqueta: 'Día en que se renueva el crédito', valor: ajustes.dia_ciclo, requerido: true, ayuda: 'Del 1 al 28. El ciclo va de ese día al anterior del mes siguiente.' },
      { id: 'credito', etiqueta: 'Crédito habitual por ciclo (USD)', valor: ajustes.credito_usd, requerido: true, ayuda: 'Se usa si el ciclo no tiene uno anotado.' },
      { id: 'aviso', etiqueta: 'Avisar bajo (%)', valor: ajustes.aviso_pct, requerido: true },
      { id: 'reserva', etiqueta: 'Reserva para las esenciales bajo (%)', valor: ajustes.reserva_pct, requerido: true, ayuda: 'Bajo este porcentaje se pausan las funciones opcionales.' },
      { id: 'corte', etiqueta: 'Parar todo bajo (%)', valor: ajustes.corte_pct, requerido: true, ayuda: 'Margen por si el estimado difiere de Anthropic.' },
    ],
    alGuardar: async (v) => {
      const entero = (t, min, max) => { const n = Math.round(numero(t) ?? NaN); if (!(n >= min && n <= max)) throw new Error(`"${t}" debe estar entre ${min} y ${max}.`); return n; };
      const fila = { dia_ciclo: entero(v.dia, 1, 28), credito_usd: numero(v.credito) ?? 0, aviso_pct: entero(v.aviso, 1, 90), reserva_pct: entero(v.reserva, 0, 90), corte_pct: entero(v.corte, 0, 50), updated_at: new Date().toISOString() };
      if (!(fila.corte_pct <= fila.reserva_pct && fila.reserva_pct <= fila.aviso_pct)) throw new Error('Debe ser: parar todo ≤ reserva ≤ aviso.');
      const { error } = await ctx.api.from('con_ia_ajustes').update(fila).eq('id', true);
      if (error) throw new Error(error.message);
      avisar('Ajustes guardados.'); ctx.refrescar();
    },
  });
  const chipEstado = (f) => (f.estado?.permitido ? el('span', { class: 'chip chip-ok' }, 'Activa')
    : el('span', { class: `chip ${f.estado?.motivo === 'apagada' ? 'chip-na' : 'chip-venc'}`, title: f.estado?.mensaje ?? '' }, MOTIVO[f.estado?.motivo] ?? 'En pausa'));
  const proteccion = el('section', { class: 'ficha ia-reparto ia-proteccion' },
    el('header', { class: 'ia-proteccion-cabecera' },
      el('h2', {}, `Protección del crédito · ciclo actual (${estado.inicio ? nombreCiclo(ciclo(estado.inicio.slice(0, 7), DIA)) : ''})`),
      boton('Ajustes', { icono: 'ajustes', onclick: editarAjustes })),
    el('p', { class: 'texto-suave texto-chico' },
      `Saldo estimado ${usd(estado.saldo)} (${estado.pct == null ? '—' : Number(estado.pct).toLocaleString('es-CL')} %), se renueva el ${estado.renueva ? corto(estado.renueva) : '—'}. `,
      `Aviso por push bajo el ${ajustes.aviso_pct} %; bajo el ${ajustes.reserva_pct} % solo siguen las esenciales; bajo el ${ajustes.corte_pct} % se para todo.`),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Función'), el('th', {}, 'Tipo'), el('th', { class: 'num' }, 'Gasto del ciclo'), el('th', { class: 'num' }, 'Tope'), el('th', {}, ''), el('th', {}, 'Estado'), el('th', {}, ''))),
      el('tbody', {}, (estado.funciones ?? []).map((f) => el('tr', {},
        el('td', {}, f.nombre, f.nota ? el('div', { class: 'texto-suave texto-chico' }, f.nota) : null),
        el('td', {}, f.esencial ? 'Esencial' : 'Opcional'),
        el('td', { class: 'num' }, usdFino(Number(f.gasto || 0))),
        el('td', { class: 'num' }, f.tope_usd != null ? usd(Number(f.tope_usd)) : 'Sin tope'),
        el('td', { class: 'ia-barra-celda' }, f.tope_usd > 0 ? el('span', { class: `ia-barra ${f.gasto >= f.tope_usd ? 'ia-barra-llena' : ''}`, style: `width:${Math.min(100, Math.max(2, Math.round((f.gasto / f.tope_usd) * 100)))}%` }) : null),
        el('td', {}, chipEstado(f)),
        el('td', {}, el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${f.nombre}`, onclick: () => editarTope(f) }, icono('editar', { tam: 16 })))))))),
    (avi.data ?? []).length ? el('div', { class: 'ia-avisos' }, el('strong', {}, 'Avisos enviados en este ciclo'),
      el('ul', {}, avi.data.map((a) => el('li', { class: 'texto-chico' }, `${fechaHora(a.enviado_at)} · ${a.detalle ?? a.tipo}`)))) : null);

  // ---- Excel con el membrete de IS Performance (la organización que paga los créditos)
  const excel = boton('Excel', { icono: 'descargar' });
  excel.addEventListener('click', async () => {
    excel.disabled = true;
    try {
      let { data: emp } = await ctx.api.from('empresas').select('*').eq('id', PERFORMANCE).maybeSingle();
      emp ??= { razon_social: 'ISgestión', rut: '', color: '#1f4e8c' };
      const x = await nuevoExcel({ api: ctx.api, empresa: emp }, { titulo: 'Consumo de IA (API de Claude)', subtitulo: `${nombreCiclo(C)} · emitido el ${new Date().toLocaleString('es-CL')}` });
      x.tabla({ titulo: 'Resumen', columnas: ['Concepto', { t: 'USD', tipo: 'usd' }], filas: [
        ['Gasto del ciclo', gasto], ['Crédito anotado', credito], ['Queda (estimado)', queda], [esActual ? 'Proyección al fin del ciclo' : 'Total del ciclo', proyeccion]] });
      const cols = ['', { t: 'Llamadas', tipo: 'numero' }, { t: 'Tokens', tipo: 'numero' }, { t: 'USD', tipo: 'usd' }];
      for (const [t, g] of [['Por empresa', grupos.empresa], ['Por función y módulo', grupos.funcion], ['Por usuario', grupos.usuario], ['Por modelo', grupos.modelo]]) {
        x.tabla({ titulo: t, columnas: cols, filas: g.map((r) => [r.nombre, r.llamadas, r.tokens, r.usd]), total: ['Total', delMes.length, delMes.reduce((a, c) => a + tokens(c), 0), gasto] });
      }
      x.tabla({ hoja: 'Por día', titulo: 'Gasto diario', columnas: [{ t: 'Día', tipo: 'fecha' }, { t: 'USD', tipo: 'usd' }],
        filas: Object.keys(porDia).sort().map((d) => [d, porDia[d]]), total: ['Total', gasto] });
      x.tabla({ hoja: 'Ciclos', titulo: 'Ciclos del crédito', columnas: ['Ciclo', { t: 'Llamadas', tipo: 'numero' }, { t: 'Tokens', tipo: 'numero' }, { t: 'USD', tipo: 'usd' }, { t: 'Crédito', tipo: 'usd' }],
        filas: meses.map(resumenMes).map((r) => [nombreCiclo(ciclo(r.mes, DIA)), r.llamadas, r.tokens, r.usd, r.saldo?.credito_usd == null ? null : Number(r.saldo.credito_usd)]) });
      x.tabla({ hoja: 'Llamadas', titulo: `Llamadas de ${nombreCiclo(C)}`,
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
    tarjeta(esActual ? 'Gasto del ciclo (hasta hoy)' : 'Gasto del ciclo', usd(gasto), `${miles(delMes.length)} llamadas`),
    tarjeta('Crédito del ciclo', credito != null ? usd(credito) : 'Sin anotar', s?.credito_usd != null ? 'Anotado a mano' : 'El habitual (Ajustes)'),
    tarjeta('Queda', queda != null ? usd(queda) : '—',
      saldoVisto != null ? `Anthropic mostraba ${usd(saldoVisto)} el ${fechaHora(s.saldo_al)}; después se gastaron ${usdFino(gastoDesdeSaldo)}`
        : credito != null ? 'Crédito menos lo gastado (estimado)' : null, queda != null && queda < 0 ? 'ia-mal' : ''),
    esActual ? tarjeta('Proyección al fin del ciclo', usd(proyeccion),
      `${usdFino(ritmo)} por día${credito != null ? ` · ${Math.round((proyeccion / credito) * 100)} % del crédito` : ''}${diasAlcanza != null ? ` · alcanza para ~${diasAlcanza} días` : ''}`, alcanza) : null);

  const pestanas = el('div', { class: 'pestanas ia-meses', role: 'tablist' },
    [...meses].reverse().map((m) => el('a', { class: 'pestana', href: ctx.ruta('ia', { mes: m }), role: 'tab', 'aria-selected': String(m === mes) }, nombreCiclo(ciclo(m, DIA)))));

  const avisos = [
    sinPrecio.length ? el('p', { class: 'sal-aviso sal-aviso-fuerte' }, icono('alerta', { tam: 16 }), ` Sin precio (no suman al gasto): ${sinPrecio.join(', ')}. Agrégalos en Precios y usa "Recalcular este ciclo".`) : null,
    historicos ? el('p', { class: 'sal-aviso' }, icono('reloj', { tam: 16 }), ` Incluye ${historicos} registros estimados de antes del 24-nov-2026 (asistente y Revisar con IA, sin desglose de caché). El lector de documentos y los bots se anotan desde esa fecha.`) : null,
  ];

  const tablaMeses = el('section', { class: 'ficha ia-reparto' }, el('h2', {}, 'Ciclos del crédito'),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Ciclo'), el('th', { class: 'num' }, 'Llamadas'), el('th', { class: 'num' }, 'Tokens'), el('th', { class: 'num' }, 'Gasto'), el('th', { class: 'num' }, 'Crédito'), el('th', { class: 'num' }, 'Saldo anotado'))),
      el('tbody', {}, meses.map(resumenMes).map((r) => el('tr', { class: r.mes === mes ? 'resaltada' : '' },
        el('td', {}, el('a', { href: ctx.ruta('ia', { mes: r.mes }) }, nombreCiclo(ciclo(r.mes, DIA)))),
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
    pestanas, ...avisos, tarjetas, proteccion,
    el('section', { class: 'ficha ia-reparto ia-tendencia' }, el('h2', {}, `Gasto por día · ${nombreCiclo(C)}`), tendencia(C, porDia, esActual ? hoy : d1)),
    el('div', { class: 'ia-repartos' },
      reparto('Por empresa', grupos.empresa, gasto),
      reparto('Por función y módulo', grupos.funcion, gasto),
      reparto('Por usuario', grupos.usuario, gasto),
      reparto('Por modelo', grupos.modelo, gasto)),
    tablaMeses, tablaPrecios);
}
