// Correcciones del bot (Marketing 014): "Esta respuesta estuvo mal" desde la bandeja de WhatsApp o el simulador, y la
// tarjeta de la pestaña Bot para revisarlas: crear una ficha con la corrección, sumarla a una ficha que ya existe o
// descartarla. La base copia la pregunta y la respuesta cuando viene de un mensaje real (mensaje_id).
// También el horario de atención del bot (cuándo responde solo).
import { el } from '../../core/ui/dom.js?v=99f3bd0';
import { icono } from '../../core/ui/iconos.js?v=99f3bd0';
import { boton } from '../../core/ui/tabla.js?v=99f3bd0';
import { avisar } from '../../core/ui/aviso.js?v=99f3bd0';
import { abrirFormulario } from '../../core/ui/modal.js?v=99f3bd0';

const corto = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// Marcar una respuesta del bot. mensajeId (bandeja) o pregunta/respuesta (simulador). Devuelve true si se guardó.
export function marcarMala(ctx, { mensajeId = null, pregunta = null, respuesta, alListo }) {
  abrirFormulario({
    titulo: 'Esta respuesta estuvo mal', textoGuardar: 'Guardar corrección',
    mensaje: `El bot respondió: «${corto(respuesta, 400)}». La corrección queda en Marketing → Bot → Respuestas por corregir, donde se convierte en una ficha para que no lo repita.`,
    campos: [
      { id: 'correccion', etiqueta: '¿Qué debió responder o qué debe saber?', tipo: 'textarea', filas: 5, requerido: true,
        ayuda: 'Ej.: "El lavado de motor sale $25.000 y demora 1 hora" o "No debe dar plazos: eso lo confirma el taller".' },
    ],
    alGuardar: async (v) => {
      const correccion = v.correccion.trim();
      if (correccion.length < 3) throw new Error('Escribe la corrección.');
      if (correccion.length > 2000) throw new Error('La corrección puede tener hasta 2.000 caracteres.');
      const fila = mensajeId ? { empresa_id: ctx.empresa.id, origen: 'whatsapp', mensaje_id: mensajeId, respuesta: '-', correccion }
        : { empresa_id: ctx.empresa.id, origen: 'simulador', pregunta: pregunta ? String(pregunta).slice(0, 2000) : null, respuesta: String(respuesta ?? '').slice(0, 4096), correccion };
      const { error } = await ctx.api.from('mkt_bot_correcciones').insert(fila);
      if (error) throw new Error(/mkt_bot_corr_mensaje/.test(error.message) ? 'Esa respuesta ya está marcada y pendiente de revisar.' : error.message);
      avisar('Corrección guardada: revísala en Marketing → Bot.');
      alListo?.();
    },
  });
}

// Tarjeta de la pestaña Bot: pendientes arriba, revisadas plegadas
export function tarjetaCorrecciones(ctx, { correcciones, fichas, categorias, editar, alCambiar }) {
  const pend = correcciones.filter((c) => c.estado === 'pendiente');
  const hechas = correcciones.filter((c) => c.estado !== 'pendiente').slice(0, 30);
  const nombreFicha = new Map(fichas.map((f) => [f.id, f.titulo]));
  const resolver = async (c, cambio, ok) => {
    const { error } = await ctx.api.from('mkt_bot_correcciones').update(cambio).eq('id', c.id);
    if (error) throw new Error(error.message);
    avisar(ok); alCambiar();
  };
  const crearFicha = (c) => abrirFormulario({
    titulo: 'Crear ficha con la corrección', textoGuardar: 'Crear ficha',
    mensaje: 'La ficha queda activa: el bot la usa desde la próxima respuesta.',
    campos: [
      { id: 'categoria', etiqueta: 'Tema', opciones: categorias, valor: 'faq' },
      { id: 'titulo', etiqueta: 'Título', requerido: true, valor: corto(c.pregunta || c.correccion, 110) },
      { id: 'contenido', etiqueta: 'Lo que el bot debe saber', tipo: 'textarea', filas: 7, requerido: true, valor: c.correccion },
    ],
    alGuardar: async (v) => {
      if (v.titulo.trim().length > 120) throw new Error('El título puede tener hasta 120 caracteres.');
      if (v.contenido.trim().length > 4000) throw new Error('El contenido puede tener hasta 4.000 caracteres.');
      const orden = fichas.filter((f) => f.categoria === v.categoria).length + 1;
      const { data, error } = await ctx.api.from('mkt_bot_fichas').insert({ empresa_id: ctx.empresa.id, categoria: v.categoria, titulo: v.titulo.trim(), contenido: v.contenido.trim(), orden }).select('id').single();
      if (error) throw new Error(error.message);
      await resolver(c, { estado: 'resuelta', ficha_id: data.id }, 'Ficha creada y corrección resuelta.');
    },
  });
  const sumarAFicha = (c) => {
    if (!fichas.length) { crearFicha(c); return; }
    abrirFormulario({
      titulo: 'Sumar a una ficha', textoGuardar: 'Guardar ficha',
      campos: [
        { id: 'ficha', etiqueta: 'Ficha', opciones: fichas.map((f) => [f.id, f.titulo]), valor: fichas[0].id,
          alCambiar: ({ valor, poner }) => { const f = fichas.find((x) => x.id === valor); if (f) poner('contenido', `${f.contenido}\n\n${c.correccion}`); } },
        { id: 'contenido', etiqueta: 'Contenido de la ficha (revisa cómo queda)', tipo: 'textarea', filas: 9, requerido: true, valor: `${fichas[0].contenido}\n\n${c.correccion}` },
      ],
      alGuardar: async (v) => {
        if (v.contenido.trim().length > 4000) throw new Error('El contenido puede tener hasta 4.000 caracteres.');
        const { error } = await ctx.api.from('mkt_bot_fichas').update({ contenido: v.contenido.trim(), activa: true }).eq('id', v.ficha);
        if (error) throw new Error(error.message);
        await resolver(c, { estado: 'resuelta', ficha_id: v.ficha }, 'Ficha actualizada y corrección resuelta.');
      },
    });
  };
  const descartar = (c) => abrirFormulario({ titulo: 'Descartar corrección', textoGuardar: 'Descartar',
    campos: [{ id: 'nota', etiqueta: 'Motivo (opcional)', valor: '' }],
    alGuardar: (v) => resolver(c, { estado: 'descartada', nota: v.nota.trim().slice(0, 500) || null }, 'Corrección descartada.') });

  const fila = (c) => el('li', { class: 'mkt-corr' },
    el('div', { class: 'mkt-corr-txt' },
      c.pregunta ? el('span', { class: 'texto-chico' }, el('span', { class: 'texto-suave' }, 'Cliente: '), corto(c.pregunta, 220)) : null,
      el('span', { class: 'texto-chico' }, el('span', { class: 'texto-suave' }, 'Bot: '), corto(c.respuesta, 260)),
      el('span', { class: 'mkt-corr-bien texto-chico' }, icono('check', { tam: 13 }), ` ${c.correccion}`),
      el('span', { class: 'texto-suave texto-chico' }, `${c.origen === 'whatsapp' ? 'WhatsApp' : 'Simulador'} · ${new Date(c.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}`,
        c.estado === 'resuelta' && c.ficha_id ? ` · en la ficha "${nombreFicha.get(c.ficha_id) ?? 'eliminada'}"` : '',
        c.estado === 'descartada' ? ` · descartada${c.nota ? `: ${c.nota}` : ''}` : '')),
    c.estado === 'pendiente' && editar ? el('div', { class: 'listado-acciones' },
      boton('Crear ficha', { icono: 'mas', class: 'boton boton-primario boton-chico', onclick: () => crearFicha(c) }),
      boton('Sumar a una ficha', { class: 'boton boton-secundario boton-chico', onclick: () => sumarAFicha(c) }),
      boton('Descartar', { class: 'boton boton-secundario boton-chico', onclick: () => descartar(c) })) : null,
    c.estado !== 'pendiente' && editar ? el('div', { class: 'listado-acciones' },
      el('button', { type: 'button', class: 'mkt-wa-reintentar', onclick: () => resolver(c, { estado: 'pendiente' }, 'Corrección pendiente otra vez.') }, 'Reabrir')) : null);

  return el('div', { class: 'ficha' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Respuestas por corregir'), pend.length ? el('span', { class: 'chip chip-pend' }, String(pend.length)) : null),
    pend.length ? el('ul', { class: 'mkt-ajustes-lista' }, pend.map(fila))
      : el('p', { class: 'texto-suave texto-chico' }, 'Nada pendiente. Cuando una respuesta del bot esté mal, márcala con "Estuvo mal" en la bandeja de WhatsApp o en el simulador.'),
    hechas.length ? el('details', { class: 'mkt-av-hist' }, el('summary', {}, `Revisadas (${hechas.length})`), el('ul', { class: 'mkt-ajustes-lista' }, hechas.map(fila))) : null);
}

// ---------------------------------------------------------------- Horario del bot
const DIAS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['7', 'Domingo']];
const HH = /^([01]?\d|2[0-3]):[0-5]\d$/;
const dosDig = (h) => (h.length === 4 ? `0${h}` : h);

export function textoAtencion(atencion) {
  if (!atencion) return '';
  return DIAS.map(([k, n]) => (atencion[k] ? `${n.slice(0, 3)} ${atencion[k][0]}–${atencion[k][1]}` : null)).filter(Boolean).join(' · ') || 'Sin horario (siempre cerrado)';
}

export function formHorario(ctx, cfg, alGuardar) {
  const at = cfg?.atencion ?? { 1: ['09:00', '18:30'], 2: ['09:00', '18:30'], 3: ['09:00', '18:30'], 4: ['09:00', '18:30'], 5: ['09:00', '18:30'], 6: ['09:00', '13:00'] };
  abrirFormulario({
    titulo: 'Horario del bot', textoGuardar: 'Guardar',
    mensaje: 'Fuera del horario, cuando el bot pase la conversación a una persona, le dice al cliente cuándo le responden (por ejemplo "mañana a las 09:00").',
    campos: [
      { id: 'modo', etiqueta: 'Cuándo responde el bot en WhatsApp', opciones: [['siempre', 'Siempre'], ['fuera', 'Solo fuera del horario de atención (en horario responde el equipo)']], valor: cfg?.horario_modo ?? 'siempre' },
      ...DIAS.map(([k, n]) => ({ id: `d${k}`, etiqueta: `${n} (ej.: 09:00-18:30; vacío = cerrado)`, valor: at[k] ? `${at[k][0]}-${at[k][1]}` : '' })),
      { id: 'aviso', etiqueta: 'Mensaje fuera de horario (opcional)', tipo: 'textarea', filas: 2, valor: cfg?.aviso_fuera ?? '',
        ayuda: 'Ej.: "Estamos fuera de horario; te respondemos apenas abramos. Puedes agendar en el enlace."' },
    ],
    alGuardar: async (v) => {
      const atencion = {};
      for (const [k, n] of DIAS) {
        const t = String(v[`d${k}`] ?? '').replace(/\s/g, '').replace('–', '-');
        if (!t) continue;
        const [a, b] = t.split('-');
        if (!HH.test(a ?? '') || !(HH.test(b ?? '') || b === '24:00')) throw new Error(`${n}: escribe el horario como 09:00-18:30.`);
        if (dosDig(a) >= dosDig(b)) throw new Error(`${n}: la apertura tiene que ser antes del cierre.`);
        atencion[k] = [dosDig(a), dosDig(b)];
      }
      if (v.modo === 'fuera' && !Object.keys(atencion).length) throw new Error('Para "solo fuera del horario" indica al menos un día con horario.');
      const datos = { horario_modo: v.modo, atencion, aviso_fuera: v.aviso.trim().slice(0, 300) || null };
      const eid = ctx.empresa.id;
      const { error } = cfg ? await ctx.api.from('mkt_bot_config').update(datos).eq('empresa_id', eid) : await ctx.api.from('mkt_bot_config').insert({ ...datos, empresa_id: eid });
      if (error) throw new Error(error.message);
      avisar('Horario del bot guardado.'); alGuardar?.();
    },
  });
}
