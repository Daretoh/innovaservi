// Orden de trabajo: datos, servicios con precio, tareas, tiempos, fotos y cobro.
// Cabecera con placa y línea de avance por estado (con la hora de cada paso); checklist táctil con avance;
// fotos con zona para arrastrar y soltar.
// Ruta: #/taller.orden?id=<id>
import { el } from '../../../core/ui/dom.js?v=64a4e9f';
import { icono } from '../../../core/ui/iconos.js?v=64a4e9f';
import { boton } from '../../../core/ui/tabla.js?v=64a4e9f';
import { abrirFormulario } from '../../../core/ui/modal.js?v=64a4e9f';
import { avisar } from '../../../core/ui/aviso.js?v=64a4e9f';
import { subirArchivo, eliminarArchivo, urlsFirmadas } from '../../../core/adjuntos.js?v=64a4e9f';
import { comprimirFoto } from '../../../core/imagenes.js?v=64a4e9f';
import { dinero, fechaLarga, fechaCorta, hhmm, diaLocal } from '../../../core/ui/formato.js?v=64a4e9f';
import {
  ESTADOS, nombreEstado, PRIORIDADES, TIPOS_VENTA, MODOS_PAGO, CATEGORIAS_MEDIA, SELECT_ORDEN,
  verPatente, nombreVehiculo, nombreTercero, precioTalla, totales, minutosTrabajo, textoMinutos, cargarServicios, cargarTrabajadores, hora,
} from '../datos.js?v=64a4e9f';
import { mover } from '../acciones.js?v=64a4e9f';
import { seccionInsumos } from '../insumos.js?v=64a4e9f';
import { seccionCostosPatente } from '../costos.js?v=64a4e9f';
import { pasosEtapa, tiempoOrden } from '../movil.js?v=64a4e9f';
import { avance as avanceOrden } from '../seguimiento.js?v=64a4e9f';
import { placa } from '../../../core/ui/placa.js?v=64a4e9f';
import { esTelefono } from '../../../core/movil.js?v=64a4e9f';

const MAX_VIDEO = 25 * 1024 * 1024;
let categoriaSubida = 'exterior';

// timestamptz ↔ input datetime-local (hora local)
const aLocal = (ts) => { if (!ts) return ''; const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const deLocal = (v) => (v ? new Date(v).toISOString() : null);

export default async function vista(ctx) {
  const [{ data: o, error }, servicios, trabajadores, clientes, media, cotizaciones] = await Promise.all([
    ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('id', ctx.params.id).maybeSingle(),
    cargarServicios(ctx),
    cargarTrabajadores(ctx),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('tal_media').select('*').eq('orden_id', ctx.params.id).order('created_at'),
    // Cotizaciones ligadas a esta orden (si la empresa usa Cotizaciones)
    ctx.puede('cotizaciones', 'ver')
      ? ctx.api.from('cot_grupos').select('cotizacion_id, cot_cotizaciones(id, numero, estado, deleted_at)').eq('orden_id', ctx.params.id)
      : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('taller.tablero') }, icono('volver', { tam: 16 }), 'Tablero del taller');
  if (!o) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Orden no encontrada'));
  const v = o.tal_vehiculos;
  const [lista, externo] = await Promise.all([
    // Lista de precios del cliente (Cotizaciones): manda sobre el precio del catálogo
    o.tercero_id && ctx.puede('cotizaciones', 'ver') ? ctx.api.from('cot_precios').select('*').eq('tercero_id', o.tercero_id) : Promise.resolve({ data: [] }),
    // ¿Se cobra en un cierre mensual o una cuenta corriente?
    ctx.puede('cierres', 'ver') ? import('../../cierres/taller.js?v=64a4e9f').then((m) => m.cobroExterno(ctx, o)) : Promise.resolve(null),
  ]);
  const precioLista = new Map((lista.data ?? []).map((p) => [p.descripcion.trim().toLowerCase(), p]));
  const precioDe = (s) => {
    const p = precioLista.get(s.nombre.trim().toLowerCase());
    const t = (v?.talla || 'M').toLowerCase();
    return p ? p[`precio_${t}`] ?? p.precio ?? precioTalla(s, v?.talla) : precioTalla(s, v?.talla);
  };
  const lineas = [...o.tal_orden_servicios].sort((a, b) => a.orden - b.orden);
  const t = totales(o, lineas);
  const anulada = o.estado === 'anulada';
  const editable = ctx.puede('taller', 'editar') && !o.cobrado && !anulada;
  const editableTrabajo = ctx.puede('taller', 'editar') && !anulada;   // tareas, tiempos y fotos (también cobrada)

  const guardar = async (cambios, aviso = 'Guardado.') => {
    const { error: e } = await ctx.api.from('tal_ordenes').update(cambios).eq('id', o.id);
    if (e) { avisar(e.message, 'error'); return false; }
    Object.assign(o, cambios); if (aviso) avisar(aviso); return true;
  };
  const campo = (id, etiqueta, { tipo = 'text', opciones, puede = editable, refrescar = false, conv } = {}) => {
    const valor = conv?.a ? conv.a(o[id]) : o[id] ?? '';
    const c = opciones
      ? el('select', { class: 'campo', id: `o-${id}`, disabled: !puede }, opciones.map(([k, txt]) => el('option', { value: k, selected: String(valor) === k }, txt)))
      : tipo === 'textarea'
        ? Object.assign(el('textarea', { class: 'campo', id: `o-${id}`, rows: 2, disabled: !puede }), { value: valor })
        : el('input', { class: 'campo', id: `o-${id}`, type: tipo, value: valor, disabled: !puede, min: tipo === 'number' ? 0 : null });
    c.addEventListener('change', async () => {
      let val = conv?.de ? conv.de(c.value) : c.value.trim();
      if (tipo === 'number') val = Math.max(0, Math.round(Number(val) || 0));
      else if (val === '') val = null;
      if (await guardar({ [id]: val }) && refrescar) ctx.refrescar();
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `o-${id}` }, etiqueta), c);
  };

  // ---- Servicios
  // Servicios propios de la lista del cliente que no están en el catálogo (ej. Guillermo Morales: Interior, Exterior,
  // Motor… con precio de flota por talla): van primero, en su propio grupo
  const enCatalogo = new Set(servicios.map((s) => s.nombre.trim().toLowerCase()));
  const soloLista = (lista.data ?? []).filter((p) => !enCatalogo.has(p.descripcion.trim().toLowerCase())).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  const precioListaDe = (p) => p[`precio_${(v?.talla || 'M').toLowerCase()}`] ?? p.precio ?? null;
  const opcionServicio = (s) => el('option', { value: s.id }, `${s.nombre}${s.variable && !precioLista.has(s.nombre.trim().toLowerCase()) ? ' (a convenir)' : precioDe(s) != null ? ` · ${dinero(precioDe(s))}${precioLista.has(s.nombre.trim().toLowerCase()) ? ' (lista del cliente)' : ''}` : ''}`);
  const agregarServicio = el('select', { class: 'campo', 'aria-label': 'Agregar servicio', disabled: !editable },
    el('option', { value: '' }, 'Agregar servicio…'),
    soloLista.length ? [
      el('optgroup', { label: `Lista de ${nombreTercero(o.terceros) || 'el cliente'}${v?.talla ? ` (talla ${v.talla})` : ''}` },
        soloLista.map((p) => el('option', { value: `lista:${p.id}` }, `${p.descripcion}${precioListaDe(p) != null ? ` · ${dinero(precioListaDe(p))}` : ''}`))),
      el('optgroup', { label: 'Catálogo del taller' }, servicios.map(opcionServicio)),
    ] : servicios.map(opcionServicio),
    el('option', { value: 'otro' }, 'Otro trabajo (fuera de la lista)…'));
  agregarServicio.addEventListener('change', async () => {
    const id = agregarServicio.value;
    agregarServicio.value = '';
    if (id === 'otro') {
      abrirFormulario({
        titulo: 'Otro trabajo', campos: [{ id: 'nombre', etiqueta: 'Trabajo', requerido: true }, { id: 'precio', etiqueta: 'Precio neto ($)', tipo: 'number', valor: '0' }], textoGuardar: 'Agregar',
        alGuardar: async (x) => {
          const { error: e } = await ctx.api.from('tal_orden_servicios').insert({ orden_id: o.id, empresa_id: ctx.empresa.id, nombre: x.nombre.trim(), precio: Math.max(0, Math.round(Number(x.precio) || 0)), orden: lineas.length + 1 });
          if (e) throw new Error(e.message);
          ctx.refrescar();
        },
      });
      return;
    }
    if (id.startsWith('lista:')) {
      const p = soloLista.find((x) => `lista:${x.id}` === id);
      if (!p) return;
      const { error: e } = await ctx.api.from('tal_orden_servicios').insert({ orden_id: o.id, empresa_id: ctx.empresa.id, nombre: p.descripcion.trim(), precio: precioListaDe(p) ?? 0, orden: lineas.length + 1 });
      if (e) { avisar(e.message, 'error'); return; }
      ctx.refrescar();
      return;
    }
    const s = servicios.find((x) => x.id === id);
    if (!s) return;
    const { error: e } = await ctx.api.from('tal_orden_servicios').insert({ orden_id: o.id, empresa_id: ctx.empresa.id, servicio_id: s.id, nombre: s.nombre, precio: precioDe(s) ?? 0, orden: lineas.length + 1 });
    if (e) { avisar(e.message, 'error'); return; }
    // Las tareas del servicio se suman al checklist
    const nuevas = s.tareas.filter((x) => !o.tareas.some((y) => y.t === x)).map((x) => ({ t: x, ok: false }));
    if (nuevas.length) await guardar({ tareas: [...o.tareas, ...nuevas] }, null);
    avisar(`${s.nombre} agregado.`); ctx.refrescar();
  });
  const filaServicio = (s) => {
    const precio = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: s.precio, disabled: !editable, 'aria-label': `Precio de ${s.nombre}` });
    precio.addEventListener('change', async () => {
      const { error: e } = await ctx.api.from('tal_orden_servicios').update({ precio: Math.max(0, Math.round(Number(precio.value) || 0)) }).eq('id', s.id);
      if (e) avisar(e.message, 'error'); else ctx.refrescar();
    });
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, s.nombre)),
      precio,
      editable ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${s.nombre}`, onclick: async () => {
        const { error: e } = await ctx.api.from('tal_orden_servicios').delete().eq('id', s.id);
        if (e) avisar(e.message, 'error'); else ctx.refrescar();
      } }, icono('basura', { tam: 16 })) : null);
  };

  // ---- Tareas (checklist)
  const filaTarea = (x, i) => {
    const caja = el('input', { type: 'checkbox', checked: x.ok, disabled: !editableTrabajo || o.cobrado });
    caja.addEventListener('change', () => guardar({ tareas: o.tareas.map((y, j) => (j === i ? { ...y, ok: caja.checked } : y)) }, null).then((ok) => ok && ctx.refrescar()));
    return el('div', { class: `doc-fila orden-tarea${x.ok ? ' hecha' : ''}` },
      el('label', { class: `casilla ${x.ok ? 'tarea-lista' : ''}` }, caja, el('span', {}, x.t)),
      editableTrabajo && !o.cobrado ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${x.t}`, onclick: () => guardar({ tareas: o.tareas.filter((_, j) => j !== i) }, null).then((ok) => ok && ctx.refrescar()) }, icono('menos', { tam: 16 })) : null);
  };
  const nuevaTarea = el('input', { class: 'campo', placeholder: 'Otra tarea y Enter', 'aria-label': 'Nueva tarea', disabled: !editableTrabajo || o.cobrado });
  nuevaTarea.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter' || !nuevaTarea.value.trim()) return;
    ev.preventDefault();
    if (await guardar({ tareas: [...o.tareas, { t: nuevaTarea.value.trim(), ok: false }] }, null)) ctx.refrescar();
  });

  // ---- Fotos y documentos
  const entrada = el('input', { type: 'file', accept: 'image/*,video/*,application/pdf', multiple: true, hidden: true });
  const selCat = el('select', { class: 'campo campo-filtro', 'aria-label': 'Categoría de lo que vas a subir' }, CATEGORIAS_MEDIA.map(([k, n]) => el('option', { value: k, selected: k === categoriaSubida }, `Subir como: ${n}`)));
  selCat.addEventListener('change', () => { categoriaSubida = selCat.value; });
  const subir = async (archivos) => {
    let ok = 0;
    for (const a of archivos) {
      try {
        const tipo = a.type.startsWith('video/') ? 'video' : a.type === 'application/pdf' ? 'documento' : 'foto';
        if (tipo === 'video' && a.size > MAX_VIDEO) throw new Error(`${a.name}: el video supera 25 MB.`);
        const archivo = tipo === 'foto' ? await comprimirFoto(a) : a;
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'taller', archivo, tabla: 'tal_ordenes', registroId: o.id, maxBytes: MAX_VIDEO });
        const { error: e } = await ctx.api.from('tal_media').insert({ orden_id: o.id, empresa_id: ctx.empresa.id, ruta, categoria: categoriaSubida, tipo, nombre: a.name });
        if (e) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(e.message); }
        ok += 1;
      } catch (e) { avisar(e.message, 'error'); }
    }
    if (ok) { avisar(`Se subieron ${ok}.`); ctx.refrescar(); }
  };
  entrada.addEventListener('change', () => subir([...entrada.files]));
  const rutas = (media.data ?? []).map((m) => m.ruta);
  const urls = await urlsFirmadas(ctx.api, rutas).catch(() => new Map());
  const tarjetaMedia = (m) => el('div', { class: 'media-tarjeta' },
    m.tipo === 'foto'
      ? el('a', { href: urls.get(m.ruta), target: '_blank', rel: 'noopener' }, el('img', { src: urls.get(m.ruta), alt: m.nombre ?? 'Foto', loading: 'lazy' }))
      : m.tipo === 'video'
        ? el('video', { class: 'media-previa', src: urls.get(m.ruta), controls: true, preload: 'metadata', playsinline: true })
        : el('a', { class: 'media-video', href: urls.get(m.ruta), target: '_blank', rel: 'noopener' }, icono('carpeta', { tam: 30 }), el('span', { class: 'texto-chico' }, m.nombre ?? m.tipo)),
    el('span', { class: 'texto-chico media-nombre', title: m.nombre ?? '' }, m.nombre ?? ''),
    el('span', { class: 'texto-chico texto-suave' }, CATEGORIAS_MEDIA.find((c) => c[0] === m.categoria)?.[1]),
    editableTrabajo ? el('div', { class: 'media-acciones' }, el('button', { type: 'button', class: 'boton-icono', title: 'Renombrar o cambiar la categoría', 'aria-label': 'Renombrar archivo', onclick: () => abrirFormulario({
      titulo: 'Renombrar archivo',
      campos: [{ id: 'nombre', etiqueta: 'Nombre', valor: m.nombre ?? '', requerido: true }, { id: 'categoria', etiqueta: 'Categoría', opciones: CATEGORIAS_MEDIA, valor: m.categoria }],
      alGuardar: async (x) => {
        const { error: e } = await ctx.api.from('tal_media').update({ nombre: x.nombre.trim().slice(0, 120), categoria: x.categoria }).eq('id', m.id);
        if (e) throw new Error(e.message);
        avisar('Archivo actualizado.'); ctx.refrescar();
      },
    }) }, icono('editar', { tam: 15 })), el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar archivo', onclick: async () => {
      const { error: e } = await ctx.api.from('tal_media').delete().eq('id', m.id);
      if (e) { avisar(e.message, 'error'); return; }
      await eliminarArchivo(ctx.api, m.ruta).catch(() => {});
      ctx.refrescar();
    } }, icono('basura', { tam: 15 }))) : null);

  // Filtro de la galería por categoría (solo las que tienen archivos)
  const galeria = el('div', { class: 'galeria' }, (media.data ?? []).map((m) => { const n = tarjetaMedia(m); n.dataset.cat = m.categoria; return n; }));
  const conArchivos = CATEGORIAS_MEDIA.filter(([k]) => (media.data ?? []).some((m) => m.categoria === k));
  let filtroCat = '';
  const filtroMedia = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Filtrar por categoría' },
    [['', 'Todas'], ...conArchivos].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(k === filtroCat), onclick: (ev) => {
      filtroCat = k;
      ev.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
      galeria.querySelectorAll('.media-tarjeta').forEach((t) => { t.hidden = !!k && t.dataset.cat !== k; });
    } }, `${n} (${k ? (media.data ?? []).filter((m) => m.categoria === k).length : media.data?.length ?? 0})`)));

  // ---- Cobro
  const cobrar = () => abrirFormulario({
    titulo: `Registrar cobro · N° ${o.numero}`,
    mensaje: `${o.tipo_venta === 'normal' ? `Total ${dinero(t.total)}${t.abono ? `, abono ${dinero(t.abono)}, saldo ${dinero(t.saldo)}` : ''}` : `Venta tipo ${TIPOS_VENTA.find((x) => x[0] === o.tipo_venta)[1].toLowerCase()}: no se cobra; ingreso ${dinero(t.ingreso)}`}. La orden queda bloqueada hasta reabrir el cobro.`,
    campos: [], textoGuardar: 'Registrar cobro',
    alGuardar: async () => {
      if (o.tipo_venta === 'normal' && !lineas.length) throw new Error('La orden no tiene servicios.');
      if (!(await guardar({ cobrado: true, cobrado_at: new Date().toISOString(), cobrado_por: ctx.usuario.id }, 'Cobro registrado.'))) throw new Error('No se pudo registrar.');
      ctx.refrescar();
    },
  });

  // ---- Estado
  const i = ESTADOS.findIndex(([k]) => k === o.estado);
  const telefono = esTelefono();
  const acciones = [];
  let siguiente = null;   // en el teléfono, el paso siguiente va en el pie fijo
  if (!anulada && ctx.puede('taller', 'editar')) {
    if (i > 0) acciones.push(boton('Volver', { icono: 'volver', onclick: async () => { if (await mover(ctx, o, -1)) ctx.refrescar(); } }));
    if (ESTADOS[i]?.[2]) {
      const avanzar = async () => { if (await mover(ctx, o, 1)) ctx.refrescar(); };
      if (telefono) siguiente = el('button', { type: 'button', class: 'om-siguiente', onclick: avanzar }, ESTADOS[i][2], icono('derecha', { tam: 20 }));
      else acciones.push(boton(ESTADOS[i][2], { icono: 'derecha', tipo: 'primario', onclick: avanzar }));
    }
    if (!o.cobrado && o.estado !== 'entregado') acciones.push(boton('Anular', { icono: 'cerrar', onclick: () => abrirFormulario({
      titulo: `Anular orden N° ${o.numero}`, mensaje: 'La orden queda anulada (no se borra). Se puede reactivar después.', campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true }], textoGuardar: 'Anular',
      alGuardar: async (x) => { if (!(await guardar({ estado: 'anulada', notas: [o.notas, `Anulada: ${x.motivo.trim()}`].filter(Boolean).join('\n') }, 'Orden anulada.'))) throw new Error('No se pudo anular.'); ctx.refrescar(); },
    }) }));
  }
  if (!anulada && ctx.puede('cotizaciones', 'crear')) acciones.push(boton('Cotizar', { icono: 'documento', onclick: (ev) => cotizar(ctx, o, lineas, ev.currentTarget) }));
  if (anulada && ctx.puede('taller', 'editar')) acciones.push(boton('Reactivar', { icono: 'editar', onclick: async () => { if (await guardar({ estado: 'agendado' }, 'Orden reactivada.')) ctx.refrescar(); } }));

  const dur = minutosTrabajo(o);
  const MARCAS = { agendado: o.fecha_cita ? `${fechaCorta(o.fecha_cita)}${o.hora_cita ? ` ${hhmm(o.hora_cita)}` : ''}` : '', espera: hora(o.ingreso_at), proceso: hora(o.inicio_at), terminado: hora(o.termino_at), entregado: hora(o.entregado_at) };
  const avance = anulada ? null : el('ol', { class: 'orden-avance', 'aria-label': 'Avance de la orden' },
    ESTADOS.map(([k, n], j) => el('li', { class: j < i ? 'hecho' : j === i ? 'actual' : '' },
      el('span', { class: 'orden-paso' }, j < i ? icono('check', { tam: 14 }) : String(j + 1)),
      el('span', { class: 'orden-paso-texto' }, el('strong', {}, n), el('span', { class: 'texto-chico texto-suave' }, MARCAS[k] || (j === i ? 'ahora' : '')))))) ;
  // Zona para soltar fotos y documentos
  const zona = el('div', { class: 'orden-zona', hidden: !editableTrabajo }, icono('camara', { tam: 22 }), el('span', {}, 'Suelta aquí fotos, videos o PDF, o usa "Subir"'));
  if (editableTrabajo) {
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('activa'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('activa'));
    zona.addEventListener('drop', (ev) => { ev.preventDefault(); zona.classList.remove('activa'); if (ev.dataTransfer.files.length) subir([...ev.dataTransfer.files]); });
  }
  const bloqueTareas = [
    el('h2', {}, `Tareas${o.tareas.length ? ` (${o.tareas.filter((x) => x.ok).length}/${o.tareas.length})` : ''}`),
    o.tareas.length ? el('span', { class: 'tal-progreso-barra orden-barra' }, el('i', { style: `width:${Math.round((o.tareas.filter((x) => x.ok).length / o.tareas.length) * 100)}%` })) : null,
    o.tareas.length ? o.tareas.map(filaTarea) : el('p', { class: 'texto-suave' }, 'Sin tareas. Se agregan con los servicios o a mano.'),
    editableTrabajo && !o.cobrado ? nuevaTarea : null];
  const fotos = el('div', { class: 'ficha doc-grupo', id: 'orden-fotos' },
    el('div', { class: 'listado-cabecera' },
      el('h2', {}, `Fotos y documentos (${media.data?.length ?? 0})`),
      editableTrabajo ? el('div', { class: 'listado-acciones' }, selCat, boton('Subir', { icono: 'camara', tipo: 'primario', onclick: () => entrada.click() }), entrada) : null),
    media.data?.length ? filtroMedia : null,
    media.data?.length ? galeria : el('p', { class: 'texto-suave' }, 'Fotos del vehículo al ingresar y al entregar, boleta o voucher.'),
    zona);
  // Teléfono (dirección B): barra con volver y N°, la placa grande, la línea de etapas con horas y avance, las tareas
  // primero y un pie fijo con Fotos y el paso siguiente. Debajo, los datos, servicios, tiempos y cobro de siempre.
  const cabMovil = telefono ? [
    el('header', { class: 'om-barra' },
      el('a', { class: 'boton-icono om-volver', href: ctx.ruta('taller.tablero'), 'aria-label': 'Volver al taller' }, icono('volver', { tam: 22 })),
      el('span', {}, `Orden N° ${o.numero}`),
      el('span', { class: `chip ${anulada ? 'chip-na' : o.estado === 'entregado' ? 'chip-ok' : 'chip-prox'}` }, nombreEstado[o.estado]),
      o.cobrado ? el('span', { class: 'chip chip-ok' }, 'Cobrado') : null),
    el('section', { class: 'om-heroe' },
      placa(v.patente, { tam: 'grande', href: ctx.ruta('taller.vehiculo', { id: v.id }), titulo: 'Ver el vehículo' }),
      el('div', { class: 'om-heroe-texto' },
        el('h1', {}, nombreVehiculo(v)),
        el('span', {}, [`Talla ${v.talla}`, o.terceros ? nombreTercero(o.terceros) : ''].filter(Boolean).join(' · ')))),
    anulada ? null : el('section', { class: 'om-etapa' },
      pasosEtapa(o, { horas: true }),
      el('div', { class: 'om-etapa-pie' }, el('span', {}, tiempoOrden(o)), el('strong', {}, `${avanceOrden(o)}%`))),
    acciones.length ? el('div', { class: 'om-acciones' }, acciones) : null,
    el('section', { class: 'ficha doc-grupo om-tareas' }, bloqueTareas),
  ] : null;
  const pieMovil = telefono && (editableTrabajo || siguiente) ? el('footer', { class: 'om-pie' },
    el('button', { type: 'button', class: 'om-fotos', onclick: () => (editableTrabajo ? entrada.click() : fotos.scrollIntoView({ behavior: 'smooth' })) }, icono('camara', { tam: 20 }), `Fotos${media.data?.length ? ` (${media.data.length})` : ''}`),
    siguiente) : null;
  // Desde Cobros: ir directo a la sección de cobro
  if (ctx.params.ir === 'cobro') setTimeout(() => document.getElementById('orden-cobro')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  return el('section', { class: `listado${telefono ? ' orden-movil' : ''}` },
    telefono ? cabMovil : [volver,
    el('header', { class: 'listado-cabecera orden-cabecera' },
      el('div', { class: 'orden-titulo' },
        el('span', { class: 'texto-suave texto-chico' }, `Orden de trabajo N° ${o.numero}`),
        el('h1', {}, nombreVehiculo(v)),
        el('div', { class: 'orden-datos' },
          el('a', { class: 'tal-placa', href: ctx.ruta('taller.vehiculo', { id: v.id }), title: 'Ver el vehículo' }, verPatente(v.patente) || 'Sin patente'),
          el('span', { class: 'chip chip-pend' }, `Talla ${v.talla}`),
          o.terceros ? el('span', { class: 'texto-suave' }, nombreTercero(o.terceros)) : null)),
      el('div', { class: 'listado-acciones' },
        el('span', { class: `chip ${anulada ? 'chip-na' : o.estado === 'entregado' ? 'chip-ok' : 'chip-prox'}` }, nombreEstado[o.estado]),
        o.cobrado ? el('span', { class: 'chip chip-ok' }, 'Cobrado') : null, acciones)),
    avance],
    (cotizaciones.data ?? []).filter((x) => x.cot_cotizaciones && !x.cot_cotizaciones.deleted_at).length
      ? el('p', { class: 'texto-chico' }, icono('documento', { tam: 14 }), ' Cotización: ', (cotizaciones.data ?? []).filter((x) => x.cot_cotizaciones && !x.cot_cotizaciones.deleted_at)
        .flatMap((x, i) => [i ? ', ' : '', el('a', { href: ctx.ruta('cotizaciones.editor', { id: x.cot_cotizaciones.id }) }, `N° ${String(x.cot_cotizaciones.numero).padStart(6, '0')} (${x.cot_cotizaciones.estado})`)]))
      : null,
    o.cobrado ? el('p', { class: 'aviso-bandeja' }, icono('check', { tam: 16 }), `Cobrada el ${fechaLarga(diaLocal(o.cobrado_at))}: servicios y cobro bloqueados. Para corregir, reabre el cobro.`) : null,
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        campo('tercero_id', 'Cliente', { opciones: [['', 'Sin cliente'], ...(clientes.data ?? []).map((c) => [c.id, nombreTercero(c)])], refrescar: true }),
        campo('contacto', 'Teléfono de contacto'),
        el('div', { class: 'rejilla-campos' },
          campo('prioridad', 'Prioridad', { opciones: PRIORIDADES, puede: !anulada && ctx.puede('taller', 'editar') }),
          campo('trabajador_id', 'Trabajador', { opciones: [['', 'Sin asignar'], ...trabajadores.lista.filter((x) => x.estado === 'activo' || x.id === o.trabajador_id).map((x) => [x.id, x.nombre])], puede: editableTrabajo })),
        el('div', { class: 'rejilla-campos' },
          campo('fecha_cita', 'Fecha de la cita', { tipo: 'date' }),
          campo('hora_cita', 'Hora', { tipo: 'time', conv: { a: hhmm, de: (x) => x || null } })),
        campo('notas', 'Notas', { tipo: 'textarea' })),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, `Servicios · ${dinero(t.bruto)}`),
        lineas.length ? lineas.map(filaServicio) : el('p', { class: 'texto-suave' }, 'Sin servicios.'),
        editable ? agregarServicio : null,
        telefono ? null : bloqueTareas)),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Tiempos'),
        el('div', { class: 'rejilla-campos' },
          campo('ingreso_at', 'Ingreso', { tipo: 'datetime-local', conv: { a: aLocal, de: deLocal }, puede: editableTrabajo && !o.cobrado }),
          campo('inicio_at', 'Inicio del trabajo', { tipo: 'datetime-local', conv: { a: aLocal, de: deLocal }, puede: editableTrabajo && !o.cobrado })),
        el('div', { class: 'rejilla-campos' },
          campo('termino_at', 'Término', { tipo: 'datetime-local', conv: { a: aLocal, de: deLocal }, puede: editableTrabajo }),
          campo('entregado_at', 'Entrega', { tipo: 'datetime-local', conv: { a: aLocal, de: deLocal }, puede: editableTrabajo })),
        campo('t_muerto_min', 'Tiempo muerto (minutos)', { tipo: 'number', puede: editableTrabajo && !o.cobrado, refrescar: true }),
        dur != null ? el('p', {}, icono('reloj', { tam: 14 }), ` ${o.termino_at ? 'Demoró' : 'Lleva'} ${textoMinutos(dur)} de trabajo`) : null),
      el('div', { class: 'ficha doc-grupo', id: 'orden-cobro' },
        el('h2', {}, 'Cobro'),
        el('div', { class: 'rejilla-campos' },
          campo('doc_tipo', 'Documento', { opciones: [['boleta', 'Boleta'], ['factura', 'Factura (+ IVA)']], refrescar: true }),
          campo('modo_pago', 'Modo de pago', { opciones: MODOS_PAGO })),
        el('div', { class: 'rejilla-campos' },
          campo('tipo_venta', 'Tipo de venta', { opciones: TIPOS_VENTA, refrescar: true }),
          campo('descuento', 'Descuento ($)', { tipo: 'number', refrescar: true })),
        campo('abono', 'Abono o anticipo ($)', { tipo: 'number', refrescar: true }),
        el('div', { class: 'cobro-resumen' },
          el('div', {}, el('span', {}, 'Servicios'), el('span', {}, dinero(t.bruto))),
          t.bruto !== t.neto ? el('div', {}, el('span', {}, 'Descuento'), el('span', {}, `− ${dinero(t.bruto - t.neto)}`)) : null,
          el('div', {}, el('span', {}, 'Precio neto'), el('span', {}, dinero(t.neto))),
          t.iva ? el('div', {}, el('span', {}, 'IVA 19 % (factura)'), el('span', {}, dinero(t.iva))) : null,
          el('div', {}, el('strong', {}, t.iva ? 'Total c/IVA' : 'Total'), el('strong', {}, dinero(t.total))),
          t.abono ? el('div', {}, el('span', {}, 'Abono'), el('span', {}, dinero(t.abono))) : null,
          el('div', { class: 'cobro-saldo' }, el('strong', {}, 'Saldo'), el('strong', {}, dinero(t.saldo))),
          o.tipo_venta !== 'normal' ? el('p', { class: 'texto-suave texto-chico' }, 'Venta sin cobro: el ingreso es solo el abono.') : null),
        // Se cobra en un cierre mensual o una cuenta corriente: no se cobra sola
        !o.cobrado && externo
          ? el('p', { class: 'aviso-bandeja' }, icono('documento', { tam: 16 }), `${externo.texto} `, el('a', { href: externo.ruta }, externo.enlace))
          : !anulada && ctx.puede('taller', 'editar')
          ? (o.cobrado
            ? boton('Reabrir cobro', { icono: 'editar', onclick: async () => { if (await guardar({ cobrado: false, cobrado_at: null, cobrado_por: null }, 'Cobro reabierto.')) ctx.refrescar(); } })
            : boton('Registrar cobro', { icono: 'check', tipo: 'primario', onclick: cobrar }))
          : null)),
    await seccionInsumos(ctx, o, anulada),
    await seccionCostosPatente(ctx, o, v),
    fotos,
    pieMovil,
  );
}

// Crea una cotización con este vehículo y los servicios de la orden (queda ligada a la orden)
async function cotizar(ctx, o, lineas, b) {
  b.disabled = true;
  try {
    const { nueva } = await import('../../cotizaciones/vistas/lista.js?v=64a4e9f');
    const { data: t } = o.tercero_id ? await ctx.api.from('terceros').select('*').eq('id', o.tercero_id).maybeSingle() : { data: null };
    const v = o.tal_vehiculos;
    // Sin servicios con precio ("Pendiente de cotización"): las tareas, con la lista de precios del cliente y la talla
    const { trabajosOrden, listaCliente } = await import('../../cotizaciones/trabajos-orden.js?v=64a4e9f');
    const trabajos = trabajosOrden(o, lineas, await listaCliente(ctx, o.tercero_id), v.talla);
    await nueva(ctx, {
      tercero: t ?? null,
      grupo: { titulo: [v.marca, v.modelo].filter(Boolean).join(' ') || null, patente: v.patente, anio: v.anio, talla: v.talla, vehiculo_id: v.id },
      // Más los costos de la orden (trabajo de terceros, compras con la patente, insumos) como ítems con costo y precio 0
      lineas: [...trabajos.map((x) => ({ tipo: 'item', descripcion: x.descripcion, cantidad: 1, precio: x.precio })),
        ...await import('../../cotizaciones/costos-orden.js?v=64a4e9f').then(async (m) => m.lineasCosto((await m.costosDeOrdenes(ctx, [{ ...o, patente: v.patente }])).get(o.id) ?? []))],
      ordenId: o.id,
    });
  } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
}
