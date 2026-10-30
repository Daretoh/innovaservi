// Trabajadores de la empresa activa en tarjetas: % de documentación, actividad de los últimos 30 días (como en
// InnovaGestión), Buk y estado (se cambia desde la tarjeta).
import { el } from '../../../core/ui/dom.js?v=ca87e0a';
import { icono } from '../../../core/ui/iconos.js?v=ca87e0a';
import { boton } from '../../../core/ui/tabla.js?v=ca87e0a';
import { abrirFormulario } from '../../../core/ui/modal.js?v=ca87e0a';
import { avisar } from '../../../core/ui/aviso.js?v=ca87e0a';
import { cargarActividad, resumen, lineaTarjeta } from '../actividad.js?v=ca87e0a';
import { hoyISO } from '../../../core/ui/formato.js?v=ca87e0a';
import { cargarRrhh, cumplimiento, nombreCompleto, avatar, nivel, VINCULOS, nombreVinculo } from '../datos.js?v=ca87e0a';

const filtro = { estado: 'activo', texto: '', orden: 'nombre' };   // se mantiene al refrescar

export default async function vista(ctx) {
  const [datos, actividad] = await Promise.all([cargarRrhh(ctx), cargarActividad(ctx)]);
  const puedeEditar = ctx.puede('rrhh', 'editar') && ctx.puede('personas', 'editar');

  const fichas = datos.vinculos.map((v) => ({ v, c: cumplimiento(datos, v.persona_id), a: resumen(actividad.get(v.persona_id)) }));
  const activos = fichas.filter((f) => f.v.estado === 'activo');
  const total = activos.reduce((s, f) => ({ venc: s.venc + f.c.venc, prox: s.prox + f.c.prox, pend: s.pend + f.c.pend }), { venc: 0, prox: 0, pend: 0 });

  const grilla = el('div', { class: 'tarjetas-personas' });
  const contador = el('span', { class: 'texto-suave' });

  function pintar() {
    const q = filtro.texto.trim().toLowerCase();
    let lista = fichas.filter((f) => (filtro.estado === 'todos' || f.v.estado === filtro.estado)
      && (!q || `${nombreCompleto(f.v.personas)} ${f.v.personas.rut} ${f.v.cargo ?? ''}`.toLowerCase().includes(q)));
    if (filtro.orden === 'docs') lista = [...lista].sort((a, b) => a.c.pct - b.c.pct);
    if (filtro.orden === 'activos') lista = [...lista].sort((a, b) => b.a.dias - a.a.dias || b.a.min - a.a.min);
    contador.textContent = `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}`;
    grilla.replaceChildren(...(lista.length
      ? lista.map((f) => tarjeta(ctx, f, puedeEditar, ctx.config.usa_buk))
      : [el('p', { class: 'texto-suave' }, 'No hay personas con ese filtro.')]));
  }

  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar por nombre, RUT o cargo…', 'aria-label': 'Buscar', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; pintar(); });

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    [['activo', 'Activos'], ['inactivo', 'Inactivos'], ['todos', 'Todos']].map(([v, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(filtro.estado === v) }, t);
      b.addEventListener('click', () => {
        filtro.estado = v;
        for (const x of segmento.children) x.setAttribute('aria-pressed', String(x === b));
        pintar();
      });
      return b;
    }));

  const orden = el('select', { class: 'campo campo-filtro', 'aria-label': 'Ordenar' },
    el('option', { value: 'nombre', selected: filtro.orden === 'nombre' }, 'Por nombre'),
    el('option', { value: 'docs', selected: filtro.orden === 'docs' }, 'Menos documentación primero'),
    el('option', { value: 'activos', selected: filtro.orden === 'activos' }, 'Más activos primero (30 días)'));
  orden.addEventListener('change', () => { filtro.orden = orden.value; pintar(); });

  const acciones = [];
  if (ctx.puede('rrhh', 'exportar')) acciones.push(boton('Excel', { icono: 'descargar', title: 'Resumen y planilla de trabajadores con grupos de columnas', onclick: async (ev) => {
    const b = ev.currentTarget; b.classList.add('cargando');
    try { const { exportarExcel } = await import('../excel.js?v=ca87e0a'); await exportarExcel(ctx, datos); avisar('Excel descargado.'); } catch (e) { avisar(e.message, 'error'); } finally { b.classList.remove('cargando'); }
  } }));
  if (ctx.config.usa_buk && ctx.puede('rrhh', 'exportar')) acciones.push(boton('Datos para Buk', { icono: 'descargar', onclick: () => exportarBuk(ctx, datos, puedeEditar) }));
  if (ctx.puede('personas', 'crear')) acciones.push(boton('Nueva persona', { icono: 'mas', tipo: 'primario', onclick: () => nueva(ctx) }));

  // Aviso de fichas de ingreso por revisar
  const { count: pendientes } = await ctx.api.from('rrhh_fichas_ingreso').select('id', { count: 'exact', head: true })
    .eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente');

  pintar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Trabajadores'),
      el('div', { class: 'listado-acciones' }, acciones)),
    pendientes ? el('a', { class: 'aviso-bandeja', href: ctx.ruta('rrhh.fichas') },
      icono('carpeta', { tam: 16 }), `${pendientes} ${pendientes === 1 ? 'ficha de ingreso por revisar' : 'fichas de ingreso por revisar'}`, icono('derecha', { tam: 16 })) : null,
    datos.tiposActivos.length ? el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-venc' }, icono('alerta', { tam: 14 }), `${total.venc} vencidos`),
      el('span', { class: 'chip chip-prox' }, icono('reloj', { tam: 14 }), `${total.prox} por vencer`),
      el('span', { class: 'chip chip-pend' }, icono('circulo', { tam: 14 }), `${total.pend} pendientes`),
      el('span', { class: 'texto-suave' }, 'en personas activas'))
      : el('p', { class: 'texto-suave' }, 'Aún no hay tipos de documento: configúralos en "Tipos de documento".'),
    el('div', { class: 'listado-acciones' }, segmento, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador), orden, contador),
    grilla,
  );
}

function tarjeta(ctx, { v, c, a }, puedeEditar, usaBuk) {
  const p = v.personas;
  const href = ctx.ruta('rrhh.ficha', { p: v.persona_id });

  const buk = !usaBuk ? null : puedeEditar
    ? el('button', {
        type: 'button', class: `chip chip-buk ${v.buk ? 'activo' : ''}`,
        title: v.buk ? `Pasado a Buk${v.buk_at ? ` el ${new Date(v.buk_at).toLocaleDateString('es-CL')}` : ''}` : 'Marcar como pasado a Buk',
        onclick: () => marcarBuk(ctx, v),
      }, v.buk ? icono('check', { tam: 14 }) : icono('mas', { tam: 14 }), 'Buk')
    : el('span', { class: `chip chip-buk ${v.buk ? 'activo' : ''}` }, v.buk ? icono('check', { tam: 14 }) : null, 'Buk');

  const textoEstado = v.estado === 'activo' ? 'Activo' : 'Inactivo';
  const estado = puedeEditar
    ? el('button', { type: 'button', class: `chip chip-boton ${v.estado === 'activo' ? 'chip-ok' : 'chip-na'}`, title: 'Cambiar estado', 'aria-label': `Estado: ${textoEstado}. Cambiar`,
        onclick: () => cambiarEstado(ctx, v) }, textoEstado, icono('abajo', { tam: 12 }))
    : el('span', { class: `chip ${v.estado === 'activo' ? 'chip-ok' : 'chip-na'}` }, textoEstado);

  // Toda la tarjeta abre la ficha, salvo los botones; el nombre es el enlace accesible.
  return el('div', {
    class: `tarjeta-persona borde-${nivel(c.pct)} ${v.estado !== 'activo' ? 'inactiva' : ''}`,
    onclick: (ev) => { if (!ev.target.closest('button, a')) location.hash = href; },
  },
    avatar(p, c.pct),
    el('div', { class: 'tp-cuerpo' },
      el('a', { class: 'tp-nombre', href }, nombreCompleto(p)),
      el('span', { class: 'tp-cargo' }, [v.cargo, nombreVinculo[v.tipo_vinculo]].filter(Boolean).join(' · ')),
      el('span', { class: 'tp-linea' },
        `${p.rut} · ${c.entregados} ${c.entregados === 1 ? 'doc' : 'docs'} · `,
        el('strong', { class: `pct-${nivel(c.pct)}` }, `${c.pct}% docs`),
        c.venc ? el('span', { class: 'pct-mal' }, ` · ${c.venc} vencido${c.venc === 1 ? '' : 's'}`) : null),
      lineaTarjeta(a),
    ),
    el('div', { class: 'tp-chips' }, buk, estado),
    el('span', { class: 'tp-flecha' }, icono('derecha', { tam: 18 })),
  );
}

function exportarBuk(ctx, datos, puedeMarcar) {
  const activos = datos.vinculos.filter((v) => v.estado === 'activo');
  const sinBuk = activos.filter((v) => !v.buk);
  abrirFormulario({
    titulo: 'Exportar Datos para Buk',
    mensaje: 'Descarga un archivo que Excel abre directo, con los datos personales, previsionales, bancarios y del contrato.',
    campos: [
      { id: 'alcance', etiqueta: 'Quiénes', opciones: [['sin', `Activos sin marca de Buk (${sinBuk.length})`], ['todos', `Todos los activos (${activos.length})`]], valor: sinBuk.length ? 'sin' : 'todos' },
      ...(puedeMarcar ? [{ id: 'marcar', etiqueta: 'Después de descargar', opciones: [['no', 'No marcar nada'], ['si', 'Marcarlos como pasados a Buk']], valor: 'no' }] : []),
    ],
    textoGuardar: 'Descargar',
    alGuardar: async (v) => {
      const lista = v.alcance === 'sin' ? sinBuk : activos;
      if (!lista.length) throw new Error('No hay personas para exportar.');
      const { csvBuk, descargar } = await import('../buk.js?v=ca87e0a');
      descargar(csvBuk(lista), `datos-buk-${ctx.empresa.rut}-${new Date().toISOString().slice(0, 10)}.csv`);
      if (v.marcar === 'si') {
        const { error } = await ctx.api.from('persona_empresa')
          .update({ buk: true, buk_at: new Date().toISOString() }).in('id', lista.map((x) => x.id));
        if (error) throw new Error(`Se descargó, pero no se pudieron marcar: ${error.message}`);
        ctx.refrescar();
      }
      avisar(`Se exportaron ${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}.`);
    },
  });
}

// Cambiar el estado desde la lista (como en InnovaGestión). Al pasar a inactivo se pide la fecha de término;
// al reactivar se borra. Los postulantes ("en espera" en InnovaGestión) están en el módulo Postulantes.
function cambiarEstado(ctx, v) {
  const nombre = nombreCompleto(v.personas);
  const activo = v.estado === 'activo';
  abrirFormulario({
    titulo: activo ? `Pasar a ${nombre} a inactivo` : `Reactivar a ${nombre}`,
    mensaje: activo ? 'Deja de aparecer en Planificación, Asistencia y en los marcajes. Sus documentos y horas se conservan.'
      : 'Vuelve a estar disponible para planificar y marcar asistencia.',
    campos: activo ? [{ id: 'fecha_termino', etiqueta: 'Fecha de término', tipo: 'date', valor: v.fecha_termino ?? hoyISO(), requerido: true },
      ...(ctx.puede('rrhh', 'ver') ? [{ id: 'despues', etiqueta: 'Después', opciones: [['aviso', 'Preparar el aviso de baja para el cliente'], ['no', 'Nada más']], valor: 'aviso' }] : [])] : [],
    textoGuardar: activo ? 'Pasar a inactivo' : 'Reactivar',
    alGuardar: async (val) => {
      const cambio = activo ? { estado: 'inactivo', fecha_termino: val.fecha_termino } : { estado: 'activo', fecha_termino: null };
      const { data, error } = await ctx.api.from('persona_empresa').update(cambio).eq('id', v.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('No tienes permiso para cambiar esto.');
      avisar(`${nombre} · ${activo ? 'Inactivo' : 'Activo'}`);
      if (val.despues === 'aviso') location.hash = ctx.ruta('rrhh.nomina', { m: 'baja', p: v.persona_id, f: val.fecha_termino });
      else ctx.refrescar();
    },
  });
}

async function marcarBuk(ctx, v) {
  const buk = !v.buk;
  const { data, error } = await ctx.api.from('persona_empresa')
    .update({ buk, buk_at: buk ? new Date().toISOString() : null }).eq('id', v.id).select('id');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso para cambiar esto.', 'error'); return; }
  avisar(buk ? 'Marcado como pasado a Buk.' : 'Se quitó la marca de Buk.');
  ctx.refrescar();
}

function nueva(ctx) {
  abrirFormulario({
    titulo: 'Nueva persona',
    mensaje: 'Si el RUT ya está registrado en otra empresa del grupo, se reutiliza su ficha.',
    campos: [
      { id: 'rut', etiqueta: 'RUT (ej.: 12.345.678-5)', requerido: true },
      { id: 'nombres', etiqueta: 'Nombres', requerido: true },
      { id: 'apellido_paterno', etiqueta: 'Apellido paterno', requerido: true },
      { id: 'apellido_materno', etiqueta: 'Apellido materno' },
      { id: 'cargo', etiqueta: 'Cargo' },
      { id: 'tipo_vinculo', etiqueta: 'Vínculo', opciones: VINCULOS },
      { id: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date' },
    ],
    alGuardar: async (val) => {
      const { data: personaId, error } = await ctx.api.rpc('alta_persona', {
        p_empresa: ctx.empresa.id, p_rut: val.rut, p_nombres: val.nombres.trim(),
        p_apellido_paterno: val.apellido_paterno.trim(), p_apellido_materno: val.apellido_materno.trim() || null,
        p_tipo_vinculo: val.tipo_vinculo, p_cargo: val.cargo.trim() || null, p_fecha_ingreso: val.fecha_ingreso || null,
      });
      if (error) throw new Error(error.code === '23505' ? 'Esta persona ya tiene un vínculo activo en esta empresa.' : error.message);
      // Si el RUT ya estaba (en otra empresa del grupo), se usa esa ficha: avisar si el nombre escrito era otro
      const { data: ya } = await ctx.api.from('personas').select('nombres, apellido_paterno, apellido_materno').eq('id', personaId).maybeSingle();
      const escrito = [val.nombres, val.apellido_paterno, val.apellido_materno].map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean).join(' ');
      const ficha = ya ? [ya.nombres, ya.apellido_paterno, ya.apellido_materno].filter(Boolean).join(' ') : '';
      avisar(ya && ficha.toLowerCase() !== escrito ? `Ese RUT ya estaba registrado como ${ficha}: se usó esa ficha (los datos personales se comparten entre las empresas del grupo).` : 'Persona registrada.');
      ctx.refrescar();
    },
  });
}
