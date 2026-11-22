// Indicadores de los canales de Marketing (WhatsApp, bot, agenda en línea, tarjeta de cliente y avisos) para un mes.
// Todo se calcula en el navegador con lo que la persona puede ver (permiso mkt ver). Lo usa vistas/indicadores.js.
import { el } from '../../core/ui/dom.js?v=65230b8';

const UNA_HORA = 3600_000;
const FRANJAS = [[0, 8, 'Antes de las 8'], [8, 12, '8 a 12'], [12, 15, '12 a 15'], [15, 19, '15 a 19'], [19, 24, 'Después de las 19']];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export async function cargarCanales(ctx, ini, finTs) {
  const e = ctx.empresa.id;
  const rango = (q, col = 'created_at') => q.eq('empresa_id', e).gte(col, ini).lt(col, finTs).limit(20000);
  const [rm, rc, rr, rs, rl, ra, rk] = await Promise.all([
    rango(ctx.api.from('mkt_wa_mensajes').select('conversacion_id, direccion, autor, estado, tipo, created_at').order('created_at')),
    rango(ctx.api.from('mkt_wa_conversaciones').select('id, created_at')),
    rango(ctx.api.from('mkt_reservas').select('estado, origen, orden_id, created_at, resuelta_at')),
    rango(ctx.api.from('mkt_socios').select('origen, created_at').is('deleted_at', null)),
    rango(ctx.api.from('mkt_sellos').select('cantidad, motivo, created_at')),
    rango(ctx.api.from('mkt_wa_avisos').select('tipo, estado, created_at')),
    rango(ctx.api.from('mkt_bot_correcciones').select('estado, origen, created_at'))]);
  // Si alguna tabla no está (módulo sin migrar) o no hay permiso, ese bloque queda vacío en vez de romper la pantalla
  const d = (r) => (r.error ? null : r.data);
  return calcular({ mensajes: d(rm), convs: d(rc), reservas: d(rr), socios: d(rs), sellos: d(rl), avisos: d(ra), correcciones: d(rk) });
}

export function calcular({ mensajes, convs, reservas, socios, sellos, avisos, correcciones }) {
  const r = {};
  // Respuestas del bot marcadas como malas en el mes (Marketing 014)
  r.corr = correcciones ? { total: correcciones.length, pendientes: correcciones.filter((x) => x.estado === 'pendiente').length } : null;
  if (mensajes) {
    const entradas = mensajes.filter((m) => m.direccion === 'entrada');
    const salidas = mensajes.filter((m) => m.direccion === 'salida');
    const porConv = new Map();
    for (const m of mensajes) { const l = porConv.get(m.conversacion_id) ?? []; l.push(m); porConv.set(m.conversacion_id, l); }
    // Tiempo de respuesta: desde el primer mensaje del cliente que queda sin respuesta hasta la siguiente salida que se envió (no plantillas ni avisos)
    const tiempos = []; const tiemposPersona = [];
    let conBot = 0, pasadas = 0, soloBot = 0, sinRespuesta = 0;
    for (const lista of porConv.values()) {
      let espera = null;
      const autores = new Set();
      for (const m of lista) {
        if (m.direccion === 'entrada') { if (!espera) espera = m; continue; }
        if (m.tipo === 'template' || m.estado === 'fallido') continue;   // un envío que falló no le llegó al cliente
        autores.add(m.autor);
        if (espera) {
          const ms = new Date(m.created_at) - new Date(espera.created_at);
          tiempos.push(ms);
          if (m.autor === 'usuario') tiemposPersona.push(ms);
          espera = null;
        }
      }
      if (lista.some((m) => m.direccion === 'entrada')) {
        if (autores.has('bot')) { conBot += 1; if (autores.has('usuario')) pasadas += 1; else soloBot += 1; }
        if (espera) sinRespuesta += 1;
      }
    }
    const activas = [...porConv.values()].filter((l) => l.some((m) => m.direccion === 'entrada')).length;
    r.wa = {
      activas, nuevas: convs?.length ?? 0,
      recibidos: entradas.length,
      porPersona: salidas.filter((m) => m.autor === 'usuario' && m.tipo !== 'template').length,
      porBot: salidas.filter((m) => m.autor === 'bot').length,
      plantillas: salidas.filter((m) => m.tipo === 'template').length,
      fallidos: salidas.filter((m) => m.estado === 'fallido').length,
      leidos: salidas.filter((m) => m.estado === 'leido').length,
      entregables: salidas.filter((m) => ['enviado', 'entregado', 'leido'].includes(m.estado)).length,
      mediana: mediana(tiempos), medianaPersona: mediana(tiemposPersona),
      enUnaHora: tiempos.length ? Math.round((tiempos.filter((t) => t <= UNA_HORA).length / tiempos.length) * 100) : null,
      sinRespuesta, conBot, pasadas, soloBot,
      franjas: contar(entradas, (m) => { const h = new Date(m.created_at).getHours(); return FRANJAS.find(([a, b]) => h >= a && h < b)[2]; }, FRANJAS.map((f) => f[2])),
      dias: contar(entradas, (m) => DIAS[(new Date(m.created_at).getDay() + 6) % 7], DIAS),
    };
  }
  if (reservas) {
    const resueltas = reservas.filter((x) => x.resuelta_at);
    r.agenda = {
      pedidas: reservas.length,
      confirmadas: reservas.filter((x) => x.estado === 'confirmada').length,
      rechazadas: reservas.filter((x) => x.estado === 'rechazada').length,
      pendientes: reservas.filter((x) => x.estado === 'pendiente').length,
      conOrden: reservas.filter((x) => x.orden_id).length,
      porOrigen: contar(reservas, (x) => (x.origen === 'bot' ? 'Desde WhatsApp (bot)' : 'Página de agenda'), ['Página de agenda', 'Desde WhatsApp (bot)']),
      demora: mediana(resueltas.map((x) => new Date(x.resuelta_at) - new Date(x.created_at))),
    };
  }
  if (socios || sellos) {
    r.tarjeta = {
      inscritos: socios?.length ?? 0,
      porOrigen: contar(socios ?? [], (x) => ({ agenda: 'Al agendar', bot: 'Por WhatsApp', manual: 'En el taller' })[x.origen] ?? x.origen, ['Al agendar', 'Por WhatsApp', 'En el taller']),
      sellos: (sellos ?? []).filter((x) => x.cantidad > 0).reduce((s, x) => s + x.cantidad, 0),
      canjes: (sellos ?? []).filter((x) => x.motivo === 'canje').length,
    };
  }
  if (avisos) {
    r.avisos = {
      total: avisos.length,
      enviados: avisos.filter((x) => x.estado === 'enviado').length,
      fallidos: avisos.filter((x) => x.estado === 'fallido').length,
      omitidos: avisos.filter((x) => x.estado === 'omitido').length,
      programados: avisos.filter((x) => x.estado === 'pendiente').length,
    };
  }
  return r;
}

function mediana(lista) {
  if (!lista.length) return null;
  const s = [...lista].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function contar(lista, clave, orden) {
  const m = new Map(orden.map((k) => [k, 0]));
  for (const x of lista) { const k = clave(x); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m];
}

export function duracion(ms) {
  if (ms == null) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.round(h / 24);
  return `${d} día${d === 1 ? '' : 's'}`;
}

const cifras = (pares) => el('div', { class: 'mkt-cifras' }, pares.map(([t, v, clase]) =>
  el('div', { class: clase ?? '' }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v)))));
function barras(filas) {
  const max = Math.max(1, ...filas.map(([, n]) => n));
  return filas.some(([, n]) => n) ? el('div', { class: 'mkt-barras' }, filas.map(([k, n]) => el('div', { class: 'mkt-barras-fila' },
    el('span', { class: 'texto-chico' }, k),
    el('span', { class: 'mkt-barra' }, el('span', { style: `width: ${Math.round((n / max) * 100)}%` })),
    el('span', { class: 'texto-chico mkt-num' }, String(n)))))
    : el('p', { class: 'texto-suave texto-chico' }, 'Sin mensajes en el mes.');
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

// Paneles para la pantalla (un panel por canal; solo los que tienen tabla)
export function panelesCanales(c) {
  const p = [];
  if (c.wa) {
    const w = c.wa;
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'WhatsApp'),
      cifras([['Conversaciones con mensajes', w.activas], ['Conversaciones nuevas', w.nuevas], ['Mensajes recibidos', w.recibidos],
        ['Respuestas de una persona', w.porPersona], ['Respuestas del bot', w.porBot], ['Plantillas y avisos', w.plantillas],
        ['Tiempo de respuesta (mediana)', duracion(w.mediana)], ['Respondidos en menos de 1 hora', w.enUnaHora == null ? '—' : `${w.enUnaHora}%`],
        ['Esperando respuesta', w.sinRespuesta, w.sinRespuesta ? 'mkt-cifra-mal' : '']]),
      w.fallidos ? el('p', { class: 'mkt-wa-error texto-chico' }, `${w.fallidos} mensaje${w.fallidos === 1 ? '' : 's'} no se ${w.fallidos === 1 ? 'pudo' : 'pudieron'} enviar.`) : null,
      el('p', { class: 'texto-suave texto-chico' }, `Tiempo de respuesta: desde que el cliente escribe hasta la primera respuesta (de una persona: ${duracion(w.medianaPersona)}). "Esperando respuesta": conversaciones cuyo último mensaje del cliente en el mes no tiene respuesta.`)));
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'El bot'),
      cifras([['Conversaciones que atendió', w.conBot], ['Resueltas solo por el bot', `${w.soloBot} · ${pct(w.soloBot, w.conBot)}`], ['Pasaron a una persona', `${w.pasadas} · ${pct(w.pasadas, w.conBot)}`],
        ...(c.corr ? [['Respuestas marcadas como malas', c.corr.total], ['Sin revisar', c.corr.pendientes, c.corr.pendientes ? 'mkt-cifra-mal' : '']] : [])]),
      el('p', { class: 'texto-suave texto-chico' }, '"Pasaron a una persona": conversaciones del mes en las que el bot respondió y después también respondió alguien del equipo.')));
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'Cuándo escriben'), el('h3', { class: 'texto-chico' }, 'Por hora'), barras(w.franjas), el('h3', { class: 'texto-chico' }, 'Por día'), barras(w.dias)));
  }
  if (c.agenda) {
    const a = c.agenda;
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'Agenda en línea'),
      cifras([['Horas pedidas', a.pedidas], ['Confirmadas', `${a.confirmadas} · ${pct(a.confirmadas, a.pedidas)}`], ['Rechazadas', a.rechazadas],
        ['Por revisar', a.pendientes, a.pendientes ? 'mkt-cifra-mal' : ''], ['Con orden de trabajo', a.conOrden], ['Tiempo en confirmar (mediana)', duracion(a.demora)]]),
      a.pedidas ? barras(a.porOrigen) : null));
  }
  if (c.tarjeta) {
    const t = c.tarjeta;
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'Tarjeta de cliente'),
      cifras([['Clientes inscritos en el mes', t.inscritos], ['Sellos entregados', t.sellos], ['Premios canjeados', t.canjes]]),
      t.inscritos ? barras(t.porOrigen) : null));
  }
  if (c.avisos && c.avisos.total) {
    const v = c.avisos;
    p.push(el('div', { class: 'ficha' }, el('h2', {}, 'Avisos automáticos'),
      cifras([['Enviados', v.enviados], ['Programados', v.programados], ['Omitidos', v.omitidos], ['No se pudieron enviar', v.fallidos, v.fallidos ? 'mkt-cifra-mal' : '']])));
  }
  return p;
}

// Filas para el Excel
export function filasCanales(c) {
  const f = [];
  if (c.wa) {
    const w = c.wa;
    f.push(['WhatsApp: conversaciones con mensajes', w.activas], ['WhatsApp: conversaciones nuevas', w.nuevas], ['WhatsApp: mensajes recibidos', w.recibidos],
      ['WhatsApp: respuestas de una persona', w.porPersona], ['WhatsApp: respuestas del bot', w.porBot], ['WhatsApp: plantillas y avisos', w.plantillas],
      ['WhatsApp: mensajes que no se enviaron', w.fallidos], ['WhatsApp: tiempo de respuesta, mediana (min)', w.mediana == null ? '' : Math.round(w.mediana / 60000)],
      ['WhatsApp: respondidos en menos de 1 hora (%)', w.enUnaHora ?? ''], ['WhatsApp: esperando respuesta', w.sinRespuesta],
      ['Bot: conversaciones que atendió', w.conBot], ['Bot: resueltas solo por el bot', w.soloBot], ['Bot: pasaron a una persona', w.pasadas]);
    if (c.corr) f.push(['Bot: respuestas marcadas como malas', c.corr.total], ['Bot: correcciones sin revisar', c.corr.pendientes]);
  }
  if (c.agenda) {
    const a = c.agenda;
    f.push(['Agenda: horas pedidas', a.pedidas], ['Agenda: confirmadas', a.confirmadas], ['Agenda: rechazadas', a.rechazadas], ['Agenda: por revisar', a.pendientes],
      ['Agenda: con orden de trabajo', a.conOrden], ['Agenda: tiempo en confirmar, mediana (min)', a.demora == null ? '' : Math.round(a.demora / 60000)]);
  }
  if (c.tarjeta) f.push(['Tarjeta: clientes inscritos', c.tarjeta.inscritos], ['Tarjeta: sellos entregados', c.tarjeta.sellos], ['Tarjeta: premios canjeados', c.tarjeta.canjes]);
  if (c.avisos) f.push(['Avisos: enviados', c.avisos.enviados], ['Avisos: programados', c.avisos.programados], ['Avisos: omitidos', c.avisos.omitidos], ['Avisos: no se pudieron enviar', c.avisos.fallidos]);
  return f;
}
