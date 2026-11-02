// Grupo → Tareas del grupo: cuadro de mando de las tareas de todas las empresas (pedido de Enzo, 2026-11-01).
// Indicadores (abiertas, vencidas, vencen esta semana, sin movimiento, terminadas en 30 días), una tabla por empresa,
// la carga de cada persona en cada empresa (la misma cuenta en varias empresas suma), las abiertas por categoría y la
// lista unida con la empresa de cada tarea. Las tarjetas y tablas filtran la lista. Desde aquí se trabaja igual que en
// Tareas: crear (eligiendo la empresa), abrir el detalle (estado, datos, seguimiento, @menciones, recordar, archivos)
// y los avisos de todas las empresas; cada acción usa los permisos del usuario en la empresa de la tarea.
import { el } from '../../../core/ui/dom.js?v=c9aedb2';
import { icono } from '../../../core/ui/iconos.js?v=c9aedb2';
import { fechaCorta, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=c9aedb2';
import { boton } from '../../../core/ui/tabla.js?v=c9aedb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=c9aedb2';
import { avisar } from '../../../core/ui/aviso.js?v=c9aedb2';
import { nombreEmpresa } from '../../../core/empresas.js?v=c9aedb2';
import { CATEGORIAS, nombreCategoria, nombrePrioridad, nombreEstado, CHIP_ESTADO, CHIP_PRIO, prioridad, ordenar, diasHasta, diasAbierta, diasQuieta } from '../../tareas/datos.js?v=c9aedb2';
import { abrirDetalle } from '../../tareas/vistas/detalle.js?v=c9aedb2';
import { nuevaTarea, SELECT_TAREA } from '../../tareas/vistas/nueva.js?v=c9aedb2';
import { empresasCon, ctxDe, marcaEmpresa, enlaceEmpresa } from '../empresas.js?v=c9aedb2';

const filtro = { ver: 'abiertas', empresa: '', persona: '', categoria: '', texto: '', orden: 'prioridad' };
const VISTAS = [['abiertas', 'Abiertas'], ['vencidas', 'Vencidas'], ['semana', 'Vencen esta semana'], ['quietas', 'Sin movimiento'], ['hechas', 'Terminadas (30 días)']];
const QUIETA = 7;

export default async function vista(ctx) {
  const empresas = empresasCon(ctx, 'tareas');
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const yo = ctx.usuario.id;
  const datos = await Promise.all(empresas.map(async (g) => {
    const e = g.empresa.id;
    const [ab, he, us, av] = await Promise.all([
      ctx.api.from('tar_tareas').select(SELECT_TAREA).eq('empresa_id', e).is('deleted_at', null).neq('estado', 'hecha').limit(1000),
      ctx.api.from('tar_tareas').select(SELECT_TAREA).eq('empresa_id', e).is('deleted_at', null).eq('estado', 'hecha').gte('hecha_at', desde).limit(1000),
      ctx.api.rpc('tar_usuarios', { p_empresa: e }),
      ctx.api.from('tar_avisos').select('*, tar_tareas(titulo)').eq('empresa_id', e).eq('user_id', yo).order('created_at', { ascending: false }).limit(50),
    ]);
    const error = ab.error?.message ?? he.error?.message;
    const tareas = [...(ab.data ?? []), ...(he.data ?? [])].map((t) => ({ ...t, g }));
    return { g, error, tareas, usuarios: us.data ?? [], avisos: (av.data ?? []).map((a) => ({ ...a, g })) };
  }));
  const usuariosDe = new Map(datos.map((d) => [d.g.empresa.id, d.usuarios]));
  const avisos = datos.flatMap((d) => d.avisos).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sinLeer = avisos.filter((a) => !a.leido_at).length;

  // Abrir el detalle de una tarea con el contexto (empresa y permisos) de su empresa
  const abrir = (t) => abrirDetalle(ctxDe(ctx, t.g), t, { usuarios: usuariosDe.get(t.g.empresa.id) ?? [], alCambiar: () => ctx.refrescar() });
  const conCrear = empresas.filter((g) => g.puede('tareas', 'crear'));
  const crearEn = (g) => nuevaTarea(ctxDe(ctx, g), { usuarios: usuariosDe.get(g.empresa.id) ?? [],
    responsable: filtro.persona && filtro.persona !== '-' ? filtro.persona : yo,
    alCrear: (t) => { ctx.refrescar(); setTimeout(() => abrir({ ...t, g }), 150); } });
  const nueva = () => {
    const previa = conCrear.find((g) => g.empresa.id === filtro.empresa);
    if (previa || conCrear.length === 1) { crearEn(previa ?? conCrear[0]); return; }
    abrirFormulario({
      titulo: 'Nueva tarea', mensaje: '¿En qué empresa va la tarea?',
      campos: [{ id: 'empresa', etiqueta: 'Empresa', opciones: conCrear.map((g) => [g.empresa.id, nombreEmpresa(g.empresa)]), valor: ctx.empresa?.id }],
      textoGuardar: 'Seguir',
      alGuardar: (v) => { setTimeout(() => crearEn(conCrear.find((g) => g.empresa.id === v.empresa)), 50); },
    });
  };

  const todas = datos.flatMap((d) => d.tareas);
  const nombre = new Map(datos.flatMap((d) => d.usuarios.map((u) => [u.user_id, u.nombre])));
  const abierta = (t) => t.estado !== 'hecha';
  const vencida = (t) => abierta(t) && t.fecha && diasHasta(t.fecha) < 0;
  const semana = (t) => abierta(t) && t.fecha && diasHasta(t.fecha) >= 0 && diasHasta(t.fecha) <= 7;
  const quieta = (t) => abierta(t) && diasQuieta(t) >= QUIETA;
  const deVista = { abiertas: abierta, vencidas: vencida, semana, quietas: quieta, hechas: (t) => !abierta(t) };
  const de = (t, uid) => t.responsable_id === uid || t.responsable2_id === uid;
  const n = (lista, f) => lista.filter(f).length;

  // Lista unida (con los filtros)
  const lista = el('div', { class: 'ficha doc-grupo tar2-lista' });
  const resumen = el('p', { class: 'texto-suave texto-chico' });
  const fila = (t) => {
    const pr = prioridad(t);
    const dn = t.fecha ? diasHasta(t.fecha) : null;
    return el('button', { type: 'button', class: `tar2-fila tar2-${pr.p}`, onclick: () => abrir(t) },
      el('span', { class: `chip ${CHIP_PRIO[pr.p]}`, title: pr.sube ? `Sube de ${nombrePrioridad[t.prioridad].toLowerCase()}: ${pr.por}` : 'Prioridad' }, nombrePrioridad[pr.p], pr.sube ? ' ↑' : ''),
      el('span', { class: 'tar2-titulo' }, el('strong', {}, t.titulo),
        el('span', { class: 'texto-suave texto-chico gtar-sub' }, marcaEmpresa(t.g.empresa),
          [nombreCategoria[t.categoria ?? 'general'], nombre.get(t.responsable_id) ?? 'Sin asignar', t.responsable2_id ? `+ ${nombre.get(t.responsable2_id) ?? ''}` : null,
            abierta(t) ? `${diasAbierta(t)} d abierta` : `terminada ${fechaLarga(diaLocal(t.hecha_at))}`,
            quieta(t) ? `${diasQuieta(t)} d sin movimiento` : null].filter(Boolean).join(' · '))),
      el('span', { class: 'tar2-meta' },
        t.tar_obs?.length ? el('span', { class: 'texto-suave texto-chico', title: 'Seguimiento' }, icono('lista', { tam: 13 }), ` ${t.tar_obs.length}`) : null,
        el('span', { class: `chip ${CHIP_ESTADO[t.estado]}` }, nombreEstado[t.estado]),
        dn == null ? el('span', { class: 'texto-suave texto-chico' }, 'Sin fecha')
          : el('span', { class: `texto-chico ${abierta(t) && dn < 0 ? 'texto-error' : abierta(t) && dn <= 3 ? 'tar2-pronto' : 'texto-suave'}` },
            abierta(t) && dn < 0 ? `Venció ${fechaCorta(t.fecha)}` : dn === 0 ? 'Vence hoy' : fechaCorta(t.fecha))));
  };
  const ORDEN = {
    vence: (l) => [...l].sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999')),
    nuevas: (l) => [...l].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    prioridad: ordenar,
  };

  // Avisos de todas las empresas (menciones y recordatorios)
  const bandeja = () => el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Avisos'),
      sinLeer ? boton('Marcar todo leído', { onclick: async () => { await ctx.api.from('tar_avisos').update({ leido_at: new Date().toISOString() }).eq('user_id', yo).is('leido_at', null); ctx.refrescar(); } }) : null),
    avisos.length ? avisos.map((a) => el('button', { type: 'button', class: `tar2-aviso${a.leido_at ? '' : ' sin-leer'}`, onclick: async () => {
      if (!a.leido_at) await ctx.api.from('tar_avisos').update({ leido_at: new Date().toISOString() }).eq('id', a.id);
      const t = todas.find((x) => x.id === a.tarea_id) ?? (await ctx.api.from('tar_tareas').select(SELECT_TAREA).eq('id', a.tarea_id).is('deleted_at', null).maybeSingle()).data;
      if (t) abrir({ ...t, g: a.g }); else avisar('La tarea ya no existe.', 'error');
    } },
      el('span', { class: 'chip chip-pend' }, a.tipo === 'recordatorio' ? 'Recordatorio' : 'Mención'),
      el('span', { class: 'tar2-titulo' }, el('strong', {}, a.tar_tareas?.titulo ?? 'Tarea'),
        el('span', { class: 'texto-suave texto-chico gtar-sub' }, marcaEmpresa(a.g.empresa),
          `${nombre.get(a.autor) ?? 'Alguien'} · ${fechaLarga(diaLocal(a.created_at))}${a.texto ? ` — ${a.texto}` : ''}`))))
      : el('p', { class: 'texto-suave' }, 'Sin avisos. Aquí llegan las menciones (@) y los recordatorios de todas las empresas.'));
  const filtros = el('div', { class: 'listado-acciones tar2-filtros' });
  const pintar = () => {
    const q = filtro.texto.trim().toLowerCase();
    const avisosVista = filtro.ver === 'avisos';
    filtros.style.display = avisosVista ? 'none' : ''; resumen.hidden = avisosVista;
    for (const b of segmento.children) b.setAttribute('aria-pressed', String(b.dataset.k === filtro.ver));
    if (avisosVista) { lista.className = ''; lista.replaceChildren(bandeja()); return; }
    lista.className = 'ficha doc-grupo tar2-lista';
    const filas = ORDEN[filtro.orden](todas.filter((t) => deVista[filtro.ver](t)
      && (!filtro.empresa || t.g.empresa.id === filtro.empresa)
      && (!filtro.persona || (filtro.persona === '-' ? !t.responsable_id : de(t, filtro.persona)))
      && (!filtro.categoria || (t.categoria ?? 'general') === filtro.categoria)
      && (!q || [t.titulo, t.detalle, nombre.get(t.responsable_id), nombre.get(t.responsable2_id)].join(' ').toLowerCase().includes(q))));
    resumen.textContent = `${filas.length} tarea${filas.length === 1 ? '' : 's'} · ${VISTAS.find(([k]) => k === filtro.ver)[1].toLowerCase()}`
      + `${filtro.empresa ? ` · ${nombreEmpresa(empresas.find((g) => g.empresa.id === filtro.empresa).empresa)}` : ''}`
      + `${filtro.persona ? ` · ${filtro.persona === '-' ? 'sin asignar' : filtro.persona === yo ? 'mis tareas' : nombre.get(filtro.persona)}` : ''}`
      + `${filtro.categoria ? ` · ${nombreCategoria[filtro.categoria]}` : ''} · toca una tarea para abrirla`;
    lista.replaceChildren(...(filas.length ? filas.map(fila) : [el('p', { class: 'texto-suave', style: 'padding:12px' }, icono('check', { tam: 14 }), ' No hay tareas con ese filtro.')]));
    for (const s of selects) s.sync();
  };
  // Aplica un filtro desde una tarjeta o tabla y baja a la lista
  const ir = (cambios) => { Object.assign(filtro, { empresa: '', persona: '', categoria: '' }, cambios); pintar(); lista.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const celda = (valor, cambios, clase = '') => el('td', { class: `num ${clase}` }, valor ? el('button', { type: 'button', class: 'gtar-num', onclick: () => ir(cambios) }, String(valor)) : el('span', { class: 'texto-suave' }, '—'));

  // Indicadores
  const tarjeta = (k, t, f, clase = '') => {
    const v = n(todas, f);
    return el('button', { type: 'button', class: `ficha fin-tarjeta gtar-tarjeta ${v ? clase : ''}`, onclick: () => ir({ ver: k }) },
      el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v)),
      el('span', { class: 'texto-suave texto-chico' }, datos.map((d) => `${n(d.tareas, f)} ${nombreEmpresa(d.g.empresa)}`).join(' · ')));
  };

  // Por empresa
  const porEmpresa = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
    el('thead', {}, el('tr', {}, ['Empresa', 'Pendientes', 'En proceso', 'Vencidas', 'Esta semana', 'Sin movimiento', 'Prioridad alta', 'Terminadas 30 d'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
    el('tbody', {}, datos.map((d) => { const e = d.g.empresa.id; const t = d.tareas; return el('tr', {},
      el('td', {}, enlaceEmpresa(ctx, d.g.empresa, ctx.ruta('tareas.lista'), marcaEmpresa(d.g.empresa))),
      celda(n(t, (x) => x.estado === 'pendiente'), { ver: 'abiertas', empresa: e }),
      celda(n(t, (x) => x.estado === 'en_proceso'), { ver: 'abiertas', empresa: e }),
      celda(n(t, vencida), { ver: 'vencidas', empresa: e }, n(t, vencida) ? 'texto-error' : ''),
      celda(n(t, semana), { ver: 'semana', empresa: e }),
      celda(n(t, quieta), { ver: 'quietas', empresa: e }),
      celda(n(t, (x) => abierta(x) && prioridad(x).p === 'alta'), { ver: 'abiertas', empresa: e }),
      celda(n(t, (x) => !abierta(x)), { ver: 'hechas', empresa: e })); }))));

  // Carga por persona (abiertas; entre paréntesis las vencidas)
  const personas = [...new Set(todas.filter(abierta).flatMap((t) => [t.responsable_id, t.responsable2_id]).filter(Boolean))]
    .map((uid) => ({ uid, ab: n(todas, (t) => abierta(t) && de(t, uid)), ve: n(todas, (t) => vencida(t) && de(t, uid)) }))
    .sort((a, b) => b.ab - a.ab || (nombre.get(a.uid) ?? '').localeCompare(nombre.get(b.uid) ?? ''));
  const sinAsignar = n(todas, (t) => abierta(t) && !t.responsable_id);
  const maximo = Math.max(1, ...personas.map((p) => p.ab));
  const cargaPersona = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Persona'), datos.map((d) => el('th', { class: 'num' }, marcaEmpresa(d.g.empresa))), el('th', { class: 'num' }, 'Vencidas'), el('th', {}, 'Total'))),
    el('tbody', {}, personas.length || sinAsignar ? [
      ...personas.map((p) => el('tr', {},
        el('td', {}, el('button', { type: 'button', class: 'gtar-num gtar-persona', onclick: () => ir({ ver: 'abiertas', persona: p.uid }) }, nombre.get(p.uid) ?? 'Usuario')),
        datos.map((d) => celda(n(d.tareas, (t) => abierta(t) && de(t, p.uid)), { ver: 'abiertas', persona: p.uid, empresa: d.g.empresa.id })),
        celda(p.ve, { ver: 'vencidas', persona: p.uid }, p.ve ? 'texto-error' : ''),
        el('td', {}, el('div', { class: 'gtar-barra' }, el('i', { style: `width:${Math.round((p.ab / maximo) * 100)}%` }), el('span', { class: 'texto-chico' }, String(p.ab)))))),
      sinAsignar ? el('tr', {}, el('td', {}, el('button', { type: 'button', class: 'gtar-num gtar-persona texto-suave', onclick: () => ir({ ver: 'abiertas', persona: '-' }) }, 'Sin asignar')),
        datos.map((d) => celda(n(d.tareas, (t) => abierta(t) && !t.responsable_id), { ver: 'abiertas', persona: '-', empresa: d.g.empresa.id })),
        celda(n(todas, (t) => vencida(t) && !t.responsable_id), { ver: 'vencidas', persona: '-' }), el('td', { class: 'texto-chico' }, String(sinAsignar))) : null]
      : [el('tr', {}, el('td', { colspan: datos.length + 3, class: 'tabla-vacia' }, 'Nadie con tareas abiertas.'))])));

  // Abiertas por categoría
  const cats = CATEGORIAS.filter(([k]) => todas.some((t) => abierta(t) && (t.categoria ?? 'general') === k));
  const porCategoria = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Categoría'), datos.map((d) => el('th', { class: 'num' }, marcaEmpresa(d.g.empresa))), el('th', { class: 'num' }, 'Vencidas'))),
    el('tbody', {}, cats.length ? cats.map(([k, nom]) => { const es = (t) => (t.categoria ?? 'general') === k; return el('tr', {},
      el('td', {}, nom),
      datos.map((d) => celda(n(d.tareas, (t) => abierta(t) && es(t)), { ver: 'abiertas', categoria: k, empresa: d.g.empresa.id })),
      celda(n(todas, (t) => vencida(t) && es(t)), { ver: 'vencidas', categoria: k }, n(todas, (t) => vencida(t) && es(t)) ? 'texto-error' : '')); })
      : [el('tr', {}, el('td', { colspan: datos.length + 2, class: 'tabla-vacia' }, 'Sin tareas abiertas.'))])));

  // Filtros de la lista
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [...VISTAS, ['avisos', sinLeer ? `Avisos (${sinLeer})` : 'Avisos']].map(([k, t]) => el('button', { type: 'button', 'data-k': k, 'aria-pressed': String(filtro.ver === k), onclick: () => { filtro.ver = k; pintar(); } }, t)));
  const select = (clave, etiqueta, opciones) => {
    const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v }, t)));
    s.addEventListener('change', () => { filtro[clave] = s.value; pintar(); });
    s.sync = () => { s.value = filtro[clave]; };
    return s;
  };
  const usuarios = [...nombre.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const selects = [
    select('empresa', 'Empresa', [['', 'Todas las empresas'], ...empresas.map((g) => [g.empresa.id, nombreEmpresa(g.empresa)])]),
    select('persona', 'Persona', [['', 'Todas las personas'], [yo, 'Mis tareas'], ...usuarios.filter(([u]) => u !== yo), ['-', 'Sin asignar']]),
    select('categoria', 'Categoría', [['', 'Todas las categorías'], ...CATEGORIAS]),
    select('orden', 'Orden', [['prioridad', 'Por prioridad'], ['vence', 'Por vencimiento'], ['nuevas', 'Más nuevas']]),
  ];
  const buscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar tarea o persona…', 'aria-label': 'Buscar', value: filtro.texto });
  buscar.addEventListener('input', () => { filtro.texto = buscar.value; pintar(); });
  filtros.append(...selects, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscar));
  pintar();

  const bloque = (titulo, nota, ...hijos) => el('div', { class: 'gtar-bloque' }, el('h2', {}, titulo), nota ? el('p', { class: 'texto-suave texto-chico' }, nota) : null, ...hijos);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Tareas del grupo'), el('p', { class: 'texto-suave' }, 'Cuadro de mando de las tareas de las empresas del grupo.')),
      el('div', { class: 'listado-acciones' }, sinLeer ? boton(`${sinLeer} aviso${sinLeer === 1 ? '' : 's'} sin leer`, { icono: 'campana', onclick: () => ir({ ver: 'avisos' }) }) : null,
        conCrear.length ? boton('Nueva tarea', { icono: 'mas', tipo: 'primario', onclick: nueva }) : null)),
    datos.filter((d) => d.error).map((d) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEmpresa(d.g.empresa)}: ${d.error}`)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('abiertas', 'Abiertas', abierta),
      tarjeta('vencidas', 'Vencidas', vencida, 'fin-alerta'),
      tarjeta('semana', 'Vencen esta semana', semana),
      tarjeta('quietas', `Sin movimiento (${QUIETA}+ días)`, quieta, 'fin-alerta'),
      tarjeta('hechas', 'Terminadas en 30 días', (t) => !abierta(t), 'fin-bien')),
    bloque('Por empresa', null, porEmpresa),
    el('div', { class: 'gtar-dos' },
      bloque('Carga por persona', 'Tareas abiertas donde es responsable o 2.º responsable.', cargaPersona),
      bloque('Abiertas por categoría', null, porCategoria)),
    bloque('Tareas', null,
      el('div', { class: 'listado-acciones tar2-filtros' }, segmento),
      filtros,
      resumen, lista));
}
