// Tablero del taller: órdenes por estado (agendado → en espera → en proceso → terminado → entregado).
// Toda la tarjeta abre la orden; buscador por patente, vehículo o cliente; la tarjeta recién movida queda
// resaltada; se actualiza solo cada 2 minutos (pensado para la tablet del taller). Arriba, el resumen del Seguimiento
// del OS (avance y arrastrar para priorizar); el botón de pantalla completa abre el detalle para la tablet.
import { el } from '../../../core/ui/dom.js?v=89cd423';
import { icono } from '../../../core/ui/iconos.js?v=89cd423';
import { boton } from '../../../core/ui/tabla.js?v=89cd423';
import { fechaCorta, hhmm, hoyISO } from '../../../core/ui/formato.js?v=89cd423';
import { ESTADOS, PRIORIDADES, CHIP_PRIORIDAD, SELECT_ORDEN, verPatente, nombreVehiculo, nombreTercero, minutosTrabajo, textoMinutos, hora, cargarTrabajadores } from '../datos.js?v=89cd423';
import { mover } from '../acciones.js?v=89cd423';
import { recepcion } from '../recepcion.js?v=89cd423';
import { avance, ordenarActivos, marcaCotizar, resumenTaller, detalleVehiculo } from '../seguimiento.js?v=89cd423';
import { ETAPAS, tarjetaAuto } from '../movil.js?v=89cd423';
import { esTelefono } from '../../../core/movil.js?v=89cd423';

const MAX_ENTREGADOS = 6;
const ESPERA_LARGA = 60;   // minutos en espera para avisar
const estado = { buscar: '', movida: null, timer: null, scroll: 0, etapa: null };

export default async function vista(ctx) {
  const inicioMes = `${hoyISO().slice(0, 7)}-01`;
  // En curso, y terminados o entregados del mes (o aún sin cobrar)
  const base = () => ctx.api.from('tal_ordenes').select(SELECT_ORDEN.replace('orden)', 'orden, tal_servicios(variable))')).eq('empresa_id', ctx.empresa.id).order('fecha_cita', { nullsFirst: false }).order('hora_cita', { nullsFirst: false });
  const [enCurso, cerradas, trabajadores, cot] = await Promise.all([
    base().in('estado', ['agendado', 'espera', 'proceso']),
    base().in('estado', ['terminado', 'entregado']).or(`termino_at.gte.${inicioMes},cobrado.eq.false`),
    cargarTrabajadores(ctx),
    ctx.puede('cotizaciones', 'ver') ? ctx.api.from('cot_grupos').select('orden_id').eq('empresa_id', ctx.empresa.id).not('orden_id', 'is', null) : Promise.resolve({ data: [] }),
  ]);
  const cotizadas = new Set((cot.data ?? []).map((g) => g.orden_id));
  if (enCurso.error) throw enCurso.error;
  if (cerradas.error) throw cerradas.error;
  const data = [...enCurso.data, ...cerradas.data];
  const puedeMover = ctx.puede('taller', 'editar');
  const movida = estado.movida; estado.movida = null;

  // Actualización automática mientras se mira el tablero (sin ventanas abiertas)
  clearInterval(estado.timer);
  const ruta = location.hash;
  estado.timer = setInterval(() => {
    if (location.hash !== ruta) { clearInterval(estado.timer); return; }
    if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input, textarea, select')) ctx.refrescar();
  }, 120000);

  if (esTelefono()) return tableroMovil(ctx, data.filter((o) => o.estado !== 'entregado'), { puedeMover, movida });

  const largo = (m) => (m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : textoMinutos(m));
  const minutosDesde = (ts) => (ts ? Math.max(0, Math.round((Date.now() - new Date(ts)) / 60000)) : null);
  const tarjeta = (o, ci) => {
    const v = o.tal_vehiculos;
    const pend = o.tareas.filter((t) => !t.ok).length;
    const tiempos = [
      o.fecha_cita && ci === 0 ? `Cita ${fechaCorta(o.fecha_cita)}${o.hora_cita ? ` ${hhmm(o.hora_cita)}` : ''}` : null,
      o.ingreso_at && ci !== 1 ? `Ingreso ${hora(o.ingreso_at)}` : null,
      o.inicio_at ? `Inicio ${hora(o.inicio_at)}` : null,
      o.termino_at ? `Término ${hora(o.termino_at)}` : null,
    ].filter(Boolean).join(' · ');
    const dur = ci >= 2 ? minutosTrabajo(o) : null;
    const espera = ci === 1 ? minutosDesde(o.ingreso_at) : null;
    const nodo = el('div', { class: `tal-tarjeta prio-${o.prioridad}${o.id === movida ? ' tal-movida' : ''}`, 'data-buscar': [v?.patente, verPatente(v?.patente), nombreVehiculo(v), o.terceros ? nombreTercero(o.terceros) : '', `n° ${o.numero}`].join(' ').toLowerCase() },
      el('div', { class: 'plan-fila' },
        el('span', { class: 'texto-chico texto-suave' }, marcaCotizar(o, cotizadas), `N° ${o.numero}`),
        el('span', { class: 'plan-fila' },
          el('span', { class: `chip ${CHIP_PRIORIDAD[o.prioridad]}` }, PRIORIDADES.find((p) => p[0] === o.prioridad)[1]),
          ci < 4 ? el('button', { type: 'button', class: 'boton-icono boton-chico', title: 'Pantalla completa', 'aria-label': 'Abrir en pantalla completa', onclick: () => detalleVehiculo(ctx, o, { alCambiar: () => ctx.refrescar() }) }, icono('expandir', { tam: 14 })) : null)),
      el('a', { class: 'tal-vehiculo', href: ctx.ruta('taller.orden', { id: o.id }) }, nombreVehiculo(v)),
      el('span', { class: 'tal-placa' }, verPatente(v?.patente) || 'Sin patente'),
      o.terceros ? el('span', { class: 'texto-chico' }, nombreTercero(o.terceros)) : null,
      o.tal_orden_servicios.length ? el('span', { class: 'texto-suave texto-chico' }, o.tal_orden_servicios.sort((a, b) => a.orden - b.orden).map((s) => s.nombre).join(' + ')) : null,
      o.tareas.length ? el('div', { class: 'tal-progreso', title: pend ? `Faltan ${pend} de ${o.tareas.length} tareas` : 'Tareas listas' },
        el('span', { class: 'tal-progreso-barra' }, el('i', { style: `width:${Math.round(((o.tareas.length - pend) / o.tareas.length) * 100)}%` })),
        el('span', { class: 'texto-chico texto-suave' }, `${o.tareas.length - pend}/${o.tareas.length} tareas · ${avance(o)}%`)) : null,
      tiempos ? el('span', { class: 'texto-suave texto-chico' }, tiempos) : null,
      espera != null ? el('span', { class: `chip ${espera >= ESPERA_LARGA ? 'chip-prox' : 'chip-pend'}` }, icono('reloj', { tam: 12 }), ` Esperando ${largo(espera)}`) : null,
      dur != null ? el('span', { class: 'texto-chico' }, icono('reloj', { tam: 12 }), ` ${ci === 2 ? 'Lleva' : 'Demoró'} ${textoMinutos(dur)}`) : null,
      o.trabajador_id ? el('span', { class: 'texto-chico tal-trabajador' }, icono('users', { tam: 12 }), ` ${trabajadores.de.get(o.trabajador_id)?.nombre ?? ''}`) : null,
      ci >= 3 && !o.cobrado ? el('span', { class: 'chip chip-venc' }, 'Por cobrar') : null,
      puedeMover ? el('div', { class: 'tal-botones' },
        ci > 0 ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: async () => { if (await mover(ctx, o, -1)) { estado.movida = o.id; ctx.refrescar(); } } }, icono('volver', { tam: 14 }), 'Volver') : el('span'),
        ESTADOS[ci][2] ? el('button', { type: 'button', class: 'boton boton-primario boton-chico', onclick: async () => { if (await mover(ctx, o, 1)) { estado.movida = o.id; ctx.refrescar(); } } }, ESTADOS[ci][2], icono('derecha', { tam: 14 })) : null) : null);
    // Toda la tarjeta abre la orden (salvo los botones y enlaces)
    nodo.addEventListener('click', (ev) => { if (!ev.target.closest('button, a')) location.hash = ctx.ruta('taller.orden', { id: o.id }); });
    return nodo;
  };

  const columnas = ESTADOS.map(([k, nombre], ci) => {
    let items = ordenarActivos(data.filter((o) => o.estado === k));
    let ocultos = 0;
    if (k === 'entregado') {
      items = items.sort((a, b) => (b.entregado_at ?? '').localeCompare(a.entregado_at ?? ''));
      ocultos = Math.max(0, items.length - MAX_ENTREGADOS); items = items.slice(0, MAX_ENTREGADOS);
    }
    return el('div', { class: `plan-columna tal-columna tal-col-${k}` },
      el('div', { class: 'plan-cabecera tal-cabecera' }, el('strong', {}, nombre), el('span', { class: 'tal-cuenta' }, String(items.length + ocultos))),
      items.length ? items.map((o) => tarjeta(o, ci)) : el('p', { class: 'tal-vacia texto-suave texto-chico' }, 'Sin vehículos'),
      ocultos ? el('a', { class: 'texto-chico', href: ctx.ruta('taller.cobros') }, `+${ocultos} más este mes`) : null);
  });

  // Buscador: filtra las tarjetas sin recargar
  const tablero = el('div', { class: 'plan-tablero tal-tablero' }, columnas);
  // Al refrescar (cada 2 minutos o al mover un auto) el tablero no vuelve a la primera columna: se mantiene donde
  // estaba y, si se movió un auto, se muestra su tarjeta en la columna nueva (en el teléfono se ve una columna a la vez)
  tablero.addEventListener('scroll', () => { estado.scroll = tablero.scrollLeft; }, { passive: true });
  requestAnimationFrame(() => {
    const nueva = movida ? tablero.querySelector('.tal-movida') : null;
    if (nueva) nueva.scrollIntoView({ block: 'nearest', inline: 'center' });
    else if (estado.scroll) tablero.scrollLeft = estado.scroll;
  });
  const sinResultados = el('p', { class: 'texto-suave', hidden: true }, 'Ningún vehículo coincide con la búsqueda.');
  const filtrar = () => {
    const q = estado.buscar.trim().toLowerCase();
    let n = 0;
    for (const t of tablero.querySelectorAll('.tal-tarjeta')) { const ok = !q || t.dataset.buscar.includes(q); t.hidden = !ok; if (ok) n += 1; }
    sinResultados.hidden = !q || n > 0;
  };
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Patente, vehículo o cliente…', value: estado.buscar, 'aria-label': 'Buscar en el tablero' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; filtrar(); });
  filtrar();

  const activos = data.filter((o) => ['agendado', 'espera', 'proceso'].includes(o.estado));
  const acciones = [el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador)];
  if (ctx.puede('taller', 'crear')) acciones.push(boton('Agendar vehículo', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx) }));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Tablero del taller'), el('div', { class: 'listado-acciones' }, acciones)),
    activos.length ? el('div', { class: 'resumen-chips' },
      PRIORIDADES.map(([p, n]) => { const c = activos.filter((o) => o.prioridad === p).length; return c ? el('span', { class: `chip ${CHIP_PRIORIDAD[p]}` }, `${c} ${n.toLowerCase()}`) : null; }),
      el('span', { class: 'texto-suave' }, `${activos.length} en curso · terminados y entregados del mes · se actualiza cada 2 minutos`)) : null,
    resumenTaller(ctx, data, { alAbrir: (o) => detalleVehiculo(ctx, o, { alCambiar: () => ctx.refrescar() }) }),
    sinResultados,
    tablero);
}

// Teléfono (dirección B): pestañas por etapa con contador e indicador que se desliza, y la lista de autos de esa etapa
// con su placa, avance y prioridad. Al cambiar de etapa las tarjetas entran escalonadas (sin recargar).
function tableroMovil(ctx, data, { puedeMover, movida }) {
  const nombres = { agendado: 'Agendado', espera: 'Espera', proceso: 'Proceso', terminado: 'Listos' };
  const de = (k) => ordenarActivos(data.filter((o) => o.estado === k));
  // Etapa al abrir: la que se miraba, la del auto recién movido o la primera con autos (En proceso si tiene)
  const deMovida = movida ? data.find((o) => o.id === movida)?.estado : null;
  if (deMovida) estado.etapa = deMovida;
  if (!estado.etapa) estado.etapa = de('proceso').length ? 'proceso' : ETAPAS.find(([k]) => de(k).length)?.[0] ?? 'agendado';

  const lista = el('div', { class: 'tm-lista', role: 'tabpanel' });
  const indicador = el('span', { class: 'tm-indicador', 'aria-hidden': 'true' });
  const pestanas = ETAPAS.map(([k]) => el('button', { type: 'button', role: 'tab', class: 'tm-pestana', onclick: () => elegir(k) },
    nombres[k], el('span', { class: 'tm-cuenta' }, String(de(k).length))));
  const vacio = (k) => el('div', { class: 'tm-vacio' }, icono('auto', { tam: 28 }), el('span', {}, `Sin vehículos ${k === 'terminado' ? 'listos para entregar' : `en ${nombres[k].toLowerCase()}`}.`),
    k === 'agendado' && ctx.puede('taller', 'crear') ? boton('Agendar vehículo', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx) }) : null);
  const pintar = () => {
    const pos = ETAPAS.findIndex(([k]) => k === estado.etapa);
    indicador.style.transform = `translateX(${pos * 100}%)`;
    pestanas.forEach((b, i) => b.setAttribute('aria-selected', String(i === pos)));
    const q = estado.buscar.trim().toLowerCase();
    const autos = de(estado.etapa).filter((o) => !q || [o.tal_vehiculos?.patente, verPatente(o.tal_vehiculos?.patente), nombreVehiculo(o.tal_vehiculos), o.terceros ? nombreTercero(o.terceros) : ''].join(' ').toLowerCase().includes(q));
    lista.replaceChildren(...(autos.length ? autos.map((o, i) => {
      const ci = ESTADOS.findIndex(([k]) => k === o.estado);
      const accion = puedeMover && ESTADOS[ci][2] ? el('button', { type: 'button', class: 'tm-mover', onclick: async () => { if (await mover(ctx, o, 1)) { estado.movida = o.id; ctx.refrescar(); } } }, ESTADOS[ci][2], icono('derecha', { tam: 14 })) : null;
      const t = tarjetaAuto(ctx, o, { pie: 'avance', retraso: i * 50, accion });
      if (o.id === movida) t.classList.add('tal-movida');
      return t;
    }) : [q ? el('p', { class: 'texto-suave' }, 'Ningún vehículo coincide con la búsqueda.') : vacio(estado.etapa)]));
  };
  const elegir = (k) => { if (k === estado.etapa) return; estado.etapa = k; pintar(); };
  // Deslizar a los lados cambia de etapa
  let x0 = null;
  lista.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  lista.addEventListener('touchend', (ev) => {
    if (x0 == null) return;
    const dx = ev.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 70) return;
    const pos = ETAPAS.findIndex(([k]) => k === estado.etapa) + (dx < 0 ? 1 : -1);
    if (ETAPAS[pos]) elegir(ETAPAS[pos][0]);
  }, { passive: true });

  const buscador = el('input', { type: 'search', placeholder: 'Patente', value: estado.buscar, 'aria-label': 'Buscar por patente, vehículo o cliente' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; pintar(); });
  pintar();
  return el('section', { class: 'listado tm' },
    el('header', { class: 'tm-cab' },
      el('div', { class: 'tm-cab-fila' }, el('h1', {}, 'Taller'), el('label', { class: 'tm-buscar' }, icono('buscar', { tam: 18 }), buscador)),
      el('div', { class: 'tm-pestanas', role: 'tablist', 'aria-label': 'Etapas' }, indicador, pestanas)),
    lista);
}
