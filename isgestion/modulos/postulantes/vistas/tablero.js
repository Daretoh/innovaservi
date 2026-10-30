// Postulantes: tablero por etapa (arrastrar entre columnas o mover con los botones), filtro por proceso, búsqueda,
// contratados y descartados en lista, y traer fichas de ingreso pendientes de RRHH.
import { el } from '../../../core/ui/dom.js?v=a665921';
import { icono } from '../../../core/ui/iconos.js?v=a665921';
import { listado, boton } from '../../../core/ui/tabla.js?v=a665921';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a665921';
import { avisar } from '../../../core/ui/aviso.js?v=a665921';
import { hoyISO, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=a665921';
import { cargarBase, formularioPostulante, nombreCompleto, iniciales, requisitosDe, nombreFuente } from '../datos.js?v=a665921';

const estado = { ver: 'activo', proceso: '', buscar: '', movido: null };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  try { const pedido = sessionStorage.getItem('sel.proceso'); if (pedido) { estado.proceso = pedido; estado.ver = 'activo'; sessionStorage.removeItem('sel.proceso'); } } catch { /* sin almacenamiento */ }
  const base = await cargarBase(ctx);
  if (estado.proceso && !base.procesoDe.has(estado.proceso)) estado.proceso = '';
  let q = ctx.api.from('sel_postulantes').select('*').eq('empresa_id', e).is('deleted_at', null).eq('estado', estado.ver)
    .order(estado.ver === 'activo' ? 'proximo_contacto' : 'updated_at', { ascending: estado.ver === 'activo', nullsFirst: false }).limit(500);
  if (estado.proceso) q = q.eq('proceso_id', estado.proceso);
  const verFichas = ctx.puede('rrhh', 'ver') && ctx.puede('postulantes', 'crear');
  const [{ data, error }, fichas] = await Promise.all([q,
    verFichas ? ctx.api.from('rrhh_fichas_ingreso').select('id, created_at, rut, nombres, apellido_paterno, datos').eq('empresa_id', e).eq('estado', 'pendiente').order('created_at', { ascending: false }).limit(100) : { data: [] }]);
  if (error) throw error;
  const pendientes = fichas.data ?? [];
  const editar = ctx.puede('postulantes', 'editar');
  const hoy = hoyISO();
  const abrir = (p) => { location.hash = ctx.ruta('postulantes.ficha', { id: p.id }); };

  const contacto = (p) => {
    if (!p.proximo_contacto) return null;
    const c = p.proximo_contacto < hoy ? 'chip-venc' : p.proximo_contacto === hoy ? 'chip-prox' : 'chip-pend';
    return el('span', { class: `chip ${c}` }, icono('calendario', { tam: 12 }), ` ${p.proximo_contacto < hoy ? 'Contactar (atrasado)' : p.proximo_contacto === hoy ? 'Contactar hoy' : `Contactar ${fechaLarga(p.proximo_contacto)}`}`);
  };
  const mover = async (p, etapaId) => {
    const { error: er } = await ctx.api.from('sel_postulantes').update({ etapa_id: etapaId }).eq('id', p.id);
    if (er) { avisar(er.message, 'error'); return; }
    estado.movido = p.id; ctx.refrescar();
  };

  // ---- Tablero (activos)
  const etapas = base.etapas.filter((x) => x.activo || data.some((p) => p.etapa_id === x.id));
  const tarjeta = (p, i) => {
    const req = requisitosDe(p, base.procesoDe);
    const proc = base.procesoDe.get(p.proceso_id);
    const nodo = el('article', {
      class: `tal-tarjeta sel-tarjeta${estado.movido === p.id ? ' tal-movida' : ''}${p.proximo_contacto && p.proximo_contacto < hoy ? ' sel-atrasado' : ''}`,
      draggable: editar ? 'true' : 'false', tabindex: '0', 'data-buscar': [nombreCompleto(p), p.rut, p.cargo, p.comuna, proc?.nombre].filter(Boolean).join(' ').toLowerCase(),
    },
      el('div', { class: 'sel-tarjeta-cabeza' }, el('span', { class: `avatar sel-avatar${req.lista.length && req.cumplidos === req.lista.length ? ' avatar-bien' : ''}`, style: `--pct:${req.lista.length ? Math.round((req.cumplidos / req.lista.length) * 100) : 0}`, 'aria-hidden': 'true' }, el('span', {}, iniciales(p))),
        el('div', {}, el('strong', {}, nombreCompleto(p)), el('span', { class: 'texto-suave texto-chico' }, [p.cargo, proc?.nombre].filter(Boolean).join(' · ') || nombreFuente[p.fuente]))),
      req.lista.length ? el('div', { class: 'tal-progreso', title: `${req.cumplidos} de ${req.lista.length} requisitos` },
        el('span', { class: 'tal-progreso-barra' }, el('i', { style: `width:${Math.round((req.cumplidos / req.lista.length) * 100)}%` })),
        el('span', { class: 'texto-chico texto-suave' }, `${req.cumplidos}/${req.lista.length} requisitos`)) : null,
      el('div', { class: 'chips-fila' }, contacto(p), p.valoracion ? el('span', { class: 'chip chip-na' }, `Valoración ${p.valoracion}/5`) : null),
      editar ? el('div', { class: 'tal-botones' },
        i > 0 ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', 'aria-label': `Volver ${nombreCompleto(p)} a ${etapas[i - 1].nombre}`, onclick: () => mover(p, etapas[i - 1].id) }, icono('volver', { tam: 14 })) : el('span'),
        i < etapas.length - 1 ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', 'aria-label': `Pasar ${nombreCompleto(p)} a ${etapas[i + 1].nombre}`, onclick: () => mover(p, etapas[i + 1].id) }, etapas[i + 1].nombre, icono('derecha', { tam: 14 })) : null) : null);
    nodo.addEventListener('click', (ev) => { if (!ev.target.closest('button, a')) abrir(p); });
    nodo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target === nodo) abrir(p); });
    nodo.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', p.id); nodo.classList.add('sel-arrastrando'); });
    nodo.addEventListener('dragend', () => nodo.classList.remove('sel-arrastrando'));
    return nodo;
  };
  const sinEtapa = data.filter((p) => !p.etapa_id || !etapas.some((x) => x.id === p.etapa_id));
  const columnas = etapas.map((et, i) => {
    const items = data.filter((p) => p.etapa_id === et.id || (i === 0 && sinEtapa.includes(p)));
    const col = el('div', { class: 'plan-columna tal-columna sel-columna', 'data-etapa': et.id },
      el('div', { class: 'plan-cabecera tal-cabecera' }, el('strong', {}, et.nombre), el('span', { class: 'tal-cuenta' }, String(items.length))),
      items.length ? items.map((p) => tarjeta(p, i)) : el('p', { class: 'tal-vacia texto-suave texto-chico' }, editar ? 'Arrastra aquí' : 'Sin postulantes'));
    if (editar) {
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('sel-soltar'); });
      col.addEventListener('dragleave', () => col.classList.remove('sel-soltar'));
      col.addEventListener('drop', (ev) => {
        ev.preventDefault(); col.classList.remove('sel-soltar');
        const p = data.find((x) => x.id === ev.dataTransfer.getData('text/plain'));
        if (p && p.etapa_id !== et.id) mover(p, et.id);
      });
    }
    return col;
  });
  const tablero = el('div', { class: 'plan-tablero tal-tablero sel-tablero', style: `--sel-columnas:${Math.max(etapas.length, 1)}` }, columnas);

  // ---- Lista (contratados o descartados)
  const lista = () => listado({
    titulo: estado.ver === 'contratado' ? 'Contratados' : 'Descartados',
    filas: data,
    vacio: estado.ver === 'contratado' ? 'Aún no hay postulantes contratados.' : 'No hay postulantes descartados.',
    columnas: [
      { titulo: 'Nombre', valor: (p) => el('a', { href: ctx.ruta('postulantes.ficha', { id: p.id }) }, nombreCompleto(p)) },
      { titulo: 'RUT', valor: (p) => p.rut ?? '—' },
      { titulo: 'Proceso', valor: (p) => base.procesoDe.get(p.proceso_id)?.nombre ?? '—' },
      { titulo: estado.ver === 'contratado' ? 'Contratado' : 'Motivo', valor: (p) => (estado.ver === 'contratado' ? fechaLarga(diaLocal(p.updated_at)) : p.motivo_descarte ?? '—') },
    ],
  });

  // ---- Buscador, filtros y acciones
  const sinResultados = el('p', { class: 'texto-suave', hidden: true }, 'Ningún postulante coincide con la búsqueda.');
  const filtrar = () => {
    const q2 = estado.buscar.trim().toLowerCase(); let n = 0;
    for (const t of tablero.querySelectorAll('.sel-tarjeta')) { const ok = !q2 || t.dataset.buscar.includes(q2); t.hidden = !ok; if (ok) n += 1; }
    sinResultados.hidden = !q2 || n > 0;
  };
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Nombre, RUT, cargo o comuna…', value: estado.buscar, 'aria-label': 'Buscar postulantes' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; filtrar(); });
  filtrar();
  const filtroProceso = el('select', { class: 'campo sel-filtro', 'aria-label': 'Proceso de selección', onchange: (ev) => { estado.proceso = ev.currentTarget.value; ctx.refrescar(); } },
    el('option', { value: '' }, 'Todos los procesos'), base.procesos.map((x) => el('option', { value: x.id, selected: x.id === estado.proceso }, `${x.nombre}${x.estado === 'cerrado' ? ' (cerrado)' : ''}`)));
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['activo', 'En proceso'], ['contratado', 'Contratados'], ['descartado', 'Descartados']].map(([k, n]) =>
      el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, n)));
  const acciones = [segmento, filtroProceso];
  if (estado.ver === 'activo') acciones.unshift(el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador));
  if (pendientes.length) acciones.push(boton(`Fichas de ingreso (${pendientes.length})`, { icono: 'documento', onclick: () => traerFichas(ctx, base, pendientes) }));
  if (ctx.puede('postulantes', 'crear')) acciones.push(boton('Nuevo postulante', { icono: 'mas', tipo: 'primario', onclick: () => formularioPostulante(ctx, base, null, { alListo: (id) => { location.hash = ctx.ruta('postulantes.ficha', { id }); } }) }));

  const atrasados = estado.ver === 'activo' ? data.filter((p) => p.proximo_contacto && p.proximo_contacto <= hoy).length : 0;
  estado.movido = null;
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Postulantes'), el('div', { class: 'listado-acciones' }, acciones)),
    estado.ver === 'activo' && data.length ? el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-pend' }, `${data.length} en proceso`),
      atrasados ? el('span', { class: 'chip chip-venc' }, `${atrasados} por contactar hoy o atrasados`) : null,
      editar ? el('span', { class: 'texto-suave' }, 'Arrastra una tarjeta para cambiarla de etapa') : null) : null,
    estado.ver === 'activo'
      ? (etapas.length ? [tablero, sinResultados] : el('p', { class: 'texto-suave' }, 'No hay etapas. Créalas en Postulantes → Etapas.'))
      : lista());
}

// Fichas de ingreso pendientes de RRHH → postulantes (la ficha queda "En Postulantes")
function traerFichas(ctx, base, fichas) {
  abrirFormulario({
    titulo: 'Pasar fichas de ingreso a Postulantes',
    mensaje: 'Las fichas elegidas quedan como postulantes en la primera etapa. Al contratar, la ficha se incorpora sola en RRHH.',
    campos: [
      { id: 'fichas', etiqueta: 'Fichas pendientes', tipo: 'checks', opciones: fichas.map((f) => [f.id, `${f.nombres} ${f.apellido_paterno} · ${f.rut}${f.datos?.cargo_postula ? ` · ${f.datos.cargo_postula}` : ''}`]) },
      { id: 'proceso', etiqueta: 'Proceso de selección', opciones: [['', 'Sin proceso'], ...base.procesos.filter((x) => x.estado === 'abierto').map((x) => [x.id, x.nombre])] },
    ],
    textoGuardar: 'Pasar a Postulantes',
    alGuardar: async (v) => {
      if (!v.fichas.length) throw new Error('Elige al menos una ficha.');
      for (const f of v.fichas) {
        const { error } = await ctx.api.rpc('sel_desde_ficha', { p_ficha: f, p_proceso: v.proceso || null });
        if (error) throw new Error(error.message);
      }
      avisar(v.fichas.length === 1 ? 'La ficha pasó a Postulantes.' : `${v.fichas.length} fichas pasaron a Postulantes.`);
      ctx.refrescar();
    },
  });
}
