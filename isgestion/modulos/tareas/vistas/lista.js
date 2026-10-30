// Tareas (v2, como InnovaGestión): pestañas Mis tareas / Todas / por persona / Avisos, filtros (abiertas, en proceso,
// terminadas), búsqueda y orden; cada fila con prioridad inteligente, estado, responsables, vencimiento con color, días
// abierta y clip con los archivos. Clic abre el detalle (detalle.js). ?nueva=1 abre "Nueva tarea"; ?id= abre una.
import { el } from '../../../core/ui/dom.js?v=25e9201';
import { icono } from '../../../core/ui/iconos.js?v=25e9201';
import { boton } from '../../../core/ui/tabla.js?v=25e9201';
import { abrirFormulario } from '../../../core/ui/modal.js?v=25e9201';
import { avisar } from '../../../core/ui/aviso.js?v=25e9201';
import { fechaLarga, fechaCorta, diaLocal } from '../../../core/ui/formato.js?v=25e9201';
import { PRIORIDADES, nombrePrioridad, nombreEstado, CHIP_ESTADO, REPETIR, CATEGORIAS, nombreCategoria, categoriaAuto, prioridad, ordenar, diasHasta, diasAbierta } from '../datos.js?v=25e9201';
import { abrirDetalle } from './detalle.js?v=25e9201';

const estado = { ver: 'mias', persona: '', filtro: 'abiertas', buscar: '', orden: 'prioridad', categoria: '' };
const CHIP_PRIO = { alta: 'chip-venc', media: 'chip-prox', baja: 'chip-pend' };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const yo = ctx.usuario.id;
  let q = ctx.api.from('tar_tareas').select('*, tar_adjuntos(id), tar_obs(id)').eq('empresa_id', e).is('deleted_at', null);
  if (estado.filtro === 'hechas') q = q.eq('estado', 'hecha').gte('hecha_at', new Date(Date.now() - 60 * 864e5).toISOString());
  else if (estado.filtro === 'en_proceso') q = q.eq('estado', 'en_proceso');
  else q = q.neq('estado', 'hecha');
  const [{ data, error }, us, av] = await Promise.all([q.limit(500), ctx.api.rpc('tar_usuarios', { p_empresa: e }),
    ctx.api.from('tar_avisos').select('*, tar_tareas(titulo)').eq('empresa_id', e).eq('user_id', yo).order('created_at', { ascending: false }).limit(100)]);
  if (error) throw error;
  const usuarios = us.data ?? [];
  const nombre = new Map(usuarios.map((u) => [u.user_id, u.nombre]));
  const avisos = av.data ?? [];
  const sinLeer = avisos.filter((a) => !a.leido_at).length;
  const crear = ctx.puede('tareas', 'crear');

  const abrir = (t) => abrirDetalle(ctx, t, { usuarios, alCambiar: () => ctx.refrescar() });
  const nueva = () => abrirFormulario({
    titulo: 'Nueva tarea',
    mensaje: 'Después de crearla puedes adjuntar fotos y archivos (también pegando un pantallazo con Ctrl+V).',
    campos: [
      { id: 'titulo', etiqueta: 'Tarea', requerido: true },
      { id: 'detalle', etiqueta: 'Detalle', tipo: 'textarea' },
      { id: 'fecha', etiqueta: 'Vence', tipo: 'date' },
      { id: 'prioridad', etiqueta: 'Prioridad', opciones: PRIORIDADES, valor: 'media' },
      { id: 'responsable', etiqueta: 'Responsable', opciones: [['', 'Sin asignar'], ...usuarios.map((u) => [u.user_id, u.nombre])], valor: estado.ver === 'persona' && estado.persona ? estado.persona : yo },
      { id: 'responsable2', etiqueta: '2.º responsable (opcional)', opciones: [['', 'Ninguno'], ...usuarios.map((u) => [u.user_id, u.nombre])] },
      { id: 'repetir', etiqueta: 'Repetir', opciones: REPETIR, valor: 'no' },
      { id: 'categoria', etiqueta: 'Categoría', opciones: [['', 'Según el título'], ...CATEGORIAS], valor: '' },
    ],
    textoGuardar: 'Crear tarea',
    alGuardar: async (v) => {
      if (v.repetir !== 'no' && !v.fecha) throw new Error('Una tarea que se repite necesita fecha.');
      const { data: t, error: er } = await ctx.api.from('tar_tareas').insert({
        empresa_id: e, titulo: v.titulo.trim(), detalle: v.detalle.trim() || null, fecha: v.fecha || null, prioridad: v.prioridad,
        responsable_id: v.responsable || null, responsable2_id: v.responsable2 && v.responsable2 !== v.responsable ? v.responsable2 : null, repetir: v.repetir,
        categoria: v.categoria || categoriaAuto(v.titulo),
      }).select('*, tar_adjuntos(id), tar_obs(id)').single();
      if (er) throw new Error(er.message);
      avisar('Tarea creada.'); ctx.refrescar();
      setTimeout(() => abrir(t), 150);
    },
  });

  // Filtrado en pantalla
  const q2 = estado.buscar.trim().toLowerCase();
  let filas = data.filter((t) => (estado.ver === 'mias' ? t.responsable_id === yo || t.responsable2_id === yo
    : estado.ver === 'persona' ? !estado.persona || t.responsable_id === estado.persona || t.responsable2_id === estado.persona : true))
    .filter((t) => !estado.categoria || (t.categoria ?? 'general') === estado.categoria)
    .filter((t) => !q2 || [t.titulo, t.detalle, nombre.get(t.responsable_id), nombre.get(t.responsable2_id)].join(' ').toLowerCase().includes(q2));
  filas = estado.orden === 'vence' ? [...filas].sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'))
    : estado.orden === 'nuevas' ? [...filas].sort((a, b) => b.created_at.localeCompare(a.created_at)) : ordenar(filas);

  const fila = (t) => {
    const pr = prioridad(t);
    const dn = t.fecha ? diasHasta(t.fecha) : null;
    return el('button', { type: 'button', class: `tar2-fila tar2-${pr.p}`, onclick: () => abrir(t) },
      el('span', { class: `chip ${CHIP_PRIO[pr.p]}`, title: pr.sube ? `Sube de ${nombrePrioridad[t.prioridad].toLowerCase()}: ${pr.por}` : 'Prioridad' }, nombrePrioridad[pr.p], pr.sube ? ' ↑' : ''),
      el('span', { class: 'tar2-titulo' }, el('strong', {}, t.titulo),
        el('span', { class: 'texto-suave texto-chico' }, [nombreCategoria[t.categoria ?? 'general'], nombre.get(t.responsable_id) ?? 'Sin asignar', t.responsable2_id ? `+ ${nombre.get(t.responsable2_id) ?? ''}` : null,
          t.estado !== 'hecha' ? `${diasAbierta(t)} d abierta` : `terminada ${fechaLarga(diaLocal(t.hecha_at))}`, t.repetir !== 'no' ? (t.repetir === 'semanal' ? 'cada semana' : 'cada mes') : null].filter(Boolean).join(' · '))),
      el('span', { class: 'tar2-meta' },
        t.tar_adjuntos?.length ? el('span', { class: 'texto-suave texto-chico', title: 'Archivos' }, icono('carpeta', { tam: 13 }), ` ${t.tar_adjuntos.length}`) : null,
        t.tar_obs?.length ? el('span', { class: 'texto-suave texto-chico', title: 'Seguimiento' }, icono('lista', { tam: 13 }), ` ${t.tar_obs.length}`) : null,
        el('span', { class: `chip ${CHIP_ESTADO[t.estado]}` }, nombreEstado[t.estado]),
        dn == null ? el('span', { class: 'texto-suave texto-chico' }, 'Sin fecha')
          : el('span', { class: `texto-chico ${t.estado !== 'hecha' && dn < 0 ? 'texto-error' : t.estado !== 'hecha' && dn <= 3 ? 'tar2-pronto' : 'texto-suave'}` },
            t.estado !== 'hecha' && dn < 0 ? `Venció ${fechaCorta(t.fecha)}` : dn === 0 ? 'Vence hoy' : fechaCorta(t.fecha))));
  };

  // Bandeja de avisos
  const bandeja = () => el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Avisos'),
      sinLeer ? boton('Marcar todo leído', { onclick: async () => { await ctx.api.from('tar_avisos').update({ leido_at: new Date().toISOString() }).eq('user_id', yo).is('leido_at', null); ctx.refrescar(); } }) : null),
    avisos.length ? avisos.map((a) => el('button', { type: 'button', class: `tar2-aviso${a.leido_at ? '' : ' sin-leer'}`, onclick: async () => {
      if (!a.leido_at) await ctx.api.from('tar_avisos').update({ leido_at: new Date().toISOString() }).eq('id', a.id);
      const { data: t } = await ctx.api.from('tar_tareas').select('*, tar_adjuntos(id), tar_obs(id)').eq('id', a.tarea_id).maybeSingle();
      if (t) abrir(t); else avisar('La tarea ya no existe.', 'error');
    } },
      el('span', { class: 'chip chip-pend' }, a.tipo === 'recordatorio' ? 'Recordatorio' : 'Mención'),
      el('span', { class: 'tar2-titulo' }, el('strong', {}, a.tar_tareas?.titulo ?? 'Tarea'),
        el('span', { class: 'texto-suave texto-chico' }, `${nombre.get(a.autor) ?? 'Alguien'} · ${fechaLarga(diaLocal(a.created_at))}${a.texto ? ` — ${a.texto}` : ''}`))))
      : el('p', { class: 'texto-suave' }, 'Sin avisos. Aquí llegan las menciones (@) y los recordatorios.'));

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['mias', 'Mis tareas'], ['todas', 'Todas'], ['persona', 'Por persona'], ['avisos', sinLeer ? `Avisos (${sinLeer})` : 'Avisos']].map(([k, n]) =>
      el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, n)));
  const persona = el('select', { class: 'campo', 'aria-label': 'Persona' }, el('option', { value: '' }, 'Todas las personas'), usuarios.map((u) => el('option', { value: u.user_id, selected: u.user_id === estado.persona }, u.nombre)));
  persona.addEventListener('change', () => { estado.persona = persona.value; ctx.refrescar(); });
  const filtro = el('select', { class: 'campo', 'aria-label': 'Estado' }, [['abiertas', 'Abiertas'], ['en_proceso', 'En proceso'], ['hechas', 'Terminadas (60 días)']].map(([k, n]) => el('option', { value: k, selected: k === estado.filtro }, n)));
  filtro.addEventListener('change', () => { estado.filtro = filtro.value; ctx.refrescar(); });
  const categoria = el('select', { class: 'campo', 'aria-label': 'Categoría' }, el('option', { value: '' }, 'Todas las categorías'), CATEGORIAS.map(([k, n]) => el('option', { value: k, selected: k === estado.categoria }, n)));
  categoria.addEventListener('change', () => { estado.categoria = categoria.value; ctx.refrescar(); });
  const orden = el('select', { class: 'campo', 'aria-label': 'Orden' }, [['prioridad', 'Por prioridad'], ['vence', 'Por vencimiento'], ['nuevas', 'Más nuevas']].map(([k, n]) => el('option', { value: k, selected: k === estado.orden }, n)));
  orden.addEventListener('change', () => { estado.orden = orden.value; ctx.refrescar(); });
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar tarea o persona…', value: estado.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => { ctx.refrescar(); }, 300); });

  const vencidas = filas.filter((t) => t.estado !== 'hecha' && t.fecha && diasHasta(t.fecha) < 0).length;
  const nodo = el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Tareas'),
      el('div', { class: 'listado-acciones' }, segmento, crear ? boton('Nueva tarea', { icono: 'mas', tipo: 'primario', onclick: nueva }) : null)),
    estado.ver === 'avisos' ? bandeja() : [
      el('div', { class: 'listado-acciones tar2-filtros' }, estado.ver === 'persona' ? persona : null, filtro, categoria, orden, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador)),
      el('p', { class: 'texto-suave texto-chico' }, `${filas.length} tarea${filas.length === 1 ? '' : 's'}${vencidas ? ` · ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''} · la prioridad sube sola si la tarea lleva días sin movimiento o está por vencer (↑)`),
      filas.length ? el('div', { class: 'ficha doc-grupo tar2-lista' }, filas.map(fila))
        : el('p', { class: 'texto-suave' }, icono('check', { tam: 14 }), estado.ver === 'mias' ? ' No tienes tareas en esta vista.' : ' No hay tareas en esta vista.')]);

  // Enlaces directos: ?nueva=1 y ?id= (se usan una vez: la dirección vuelve a la lista)
  if (ctx.params?.nueva || ctx.params?.id) history.replaceState(null, '', ctx.ruta('tareas.lista'));
  if (ctx.params?.nueva && crear) setTimeout(nueva, 50);
  if (ctx.params?.id) {
    const t = data.find((x) => x.id === ctx.params.id);
    setTimeout(async () => {
      const tarea = t ?? (await ctx.api.from('tar_tareas').select('*, tar_adjuntos(id), tar_obs(id)').eq('id', ctx.params.id).maybeSingle()).data;
      if (tarea) abrir(tarea);
    }, 50);
  }
  return nodo;
}
