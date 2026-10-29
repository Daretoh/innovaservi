// Calendario del taller (como el Calendario del OS de IS Performance): el mes completo con cada vehículo en su día
// (cita, o ingreso si no tiene cita), color según el estado, marca + modelo + patente y servicios, y el flujo de los
// "por cotizar": P.C (servicio a convenir) → COTIZADO (tiene cotización) → PAGADO (cobrado). También las tareas del
// equipo con fecha. Hasta 4 por día ("+N más" abre el día); tocar uno abre su detalle. Clic en un día vacío: agendar.
import { el } from '../../../core/ui/dom.js?v=14e2347';
import { icono } from '../../../core/ui/iconos.js?v=14e2347';
import { boton } from '../../../core/ui/tabla.js?v=14e2347';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14e2347';
import { dinero, hoyISO, rangoMes, moverMes, nombreMes, sumarDias, lunesDe, diaLocal, hhmm, fechaLarga } from '../../../core/ui/formato.js?v=14e2347';
import { nombreEstado, verPatente, nombreVehiculo, nombreTercero, totales } from '../datos.js?v=14e2347';
import { recepcion } from '../recepcion.js?v=14e2347';

const estado = { mes: hoyISO().slice(0, 7) };
const CLASE = { agendado: 'agendado', espera: 'espera', proceso: 'proc', terminado: 'term', entregado: 'entreg' };
const servicioCorto = (n) => { const i = String(n ?? '').indexOf('—'); return (i > 0 ? n.slice(0, i) : n ?? '').trim(); };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  const ini = lunesDe(desde); const fin = sumarDias(lunesDe(hasta), 6);
  const [ord, cot, tar] = await Promise.all([
    ctx.api.from('tal_ordenes').select('id, numero, estado, cobrado, fecha_cita, hora_cita, ingreso_at, created_at, descuento, doc_tipo, tipo_venta, abono, contacto, tal_vehiculos(marca, modelo, patente, talla), terceros(razon_social, nombre_fantasia, telefono), tal_orden_servicios(nombre, precio, tal_servicios(variable))')
      .eq('empresa_id', ctx.empresa.id).neq('estado', 'anulada'),
    ctx.puede('cotizaciones', 'ver') ? ctx.api.from('cot_grupos').select('orden_id').eq('empresa_id', ctx.empresa.id).not('orden_id', 'is', null) : Promise.resolve({ data: [] }),
    ctx.puede('tareas', 'ver') ? ctx.api.from('tar_tareas').select('id, titulo, detalle, fecha, hora, prioridad, estado').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', ini).lte('fecha', fin) : Promise.resolve({ data: [] }),
  ]);
  if (ord.error) throw ord.error;
  const cotizadas = new Set((cot.data ?? []).map((g) => g.orden_id));
  // Flujo de los "por cotizar": P.C → COTIZADO → PAGADO
  const porCotizar = (o) => o.tal_orden_servicios.some((s) => s.tal_servicios?.variable || /cotiz/i.test(s.nombre));
  const marca = (o) => {
    if (!porCotizar(o) && !cotizadas.has(o.id)) return null;
    if (o.cobrado) return ['PAGADO', 'ec-pago'];
    if (cotizadas.has(o.id)) return ['COTIZADO', 'ec-cot'];
    return ['P.C', 'ec-pc'];
  };
  const porDia = new Map();
  const poner = (f, x) => { if (f >= ini && f <= fin) { if (!porDia.has(f)) porDia.set(f, []); porDia.get(f).push(x); } };
  ord.data.forEach((o) => poner(o.fecha_cita || diaLocal(o.ingreso_at) || diaLocal(o.created_at), { o, hora: o.hora_cita ? hhmm(o.hora_cita) : '' }));
  (tar.data ?? []).forEach((t) => poner(t.fecha, { t, hora: t.hora ? hhmm(t.hora) : '' }));

  const detalle = (x) => {
    if (x.t) {
      abrirFormulario({ titulo: 'Tarea', mensaje: [x.t.titulo, x.t.fecha ? `${fechaLarga(x.t.fecha)}${x.hora ? ` ${x.hora}` : ''}` : null, `Prioridad: ${x.t.prioridad}`, `Estado: ${x.t.estado.replace('_', ' ')}`, x.t.detalle].filter(Boolean).join('\n'),
        campos: [], textoGuardar: 'Ver tareas', alGuardar: () => { location.hash = ctx.ruta('tareas.lista'); } });
      return;
    }
    const o = x.o; const v = o.tal_vehiculos; const tt = totales(o, o.tal_orden_servicios);
    abrirFormulario({
      titulo: `${nombreVehiculo(v)}${v?.patente ? ` · ${verPatente(v.patente)}` : ''}`,
      mensaje: [
        `Orden N° ${o.numero} · ${o.cobrado ? 'Cobrada' : nombreEstado[o.estado]}`,
        `Talla: ${v?.talla ?? '—'}`,
        `Servicios: ${o.tal_orden_servicios.map((s) => s.nombre).join(', ') || '—'}`,
        o.fecha_cita ? `Cita: ${fechaLarga(o.fecha_cita)}${x.hora ? ` ${x.hora}` : ''}` : null,
        o.terceros ? `Cliente: ${nombreTercero(o.terceros)}${o.contacto || o.terceros.telefono ? ` · ${o.contacto || o.terceros.telefono}` : ''}` : null,
        tt.total ? `Precio: ${dinero(tt.total)}${o.cobrado ? ' (cobrado)' : ''}` : null,
      ].filter(Boolean).join('\n'),
      campos: [], textoGuardar: 'Abrir la orden', alGuardar: () => { location.hash = ctx.ruta('taller.orden', { id: o.id }); },
    });
  };
  const evento = (x) => {
    if (x.t) return el('button', { type: 'button', class: `tcal-ev tarea${x.t.estado === 'hecha' ? ' hecha' : ''}`, title: x.t.titulo, onclick: (ev) => { ev.stopPropagation(); detalle(x); } },
      x.hora ? el('span', { class: 'tcal-h' }, x.hora) : null, icono('check', { tam: 11 }), ' ', x.t.titulo);
    const o = x.o; const v = o.tal_vehiculos; const m = marca(o);
    const veh = [nombreVehiculo(v), v?.patente ? verPatente(v.patente) : null].filter(Boolean).join(' · ');
    const titulo = `${veh} — ${o.tal_orden_servicios.map((s) => s.nombre).join(' + ') || 'sin servicio'}${o.terceros ? ` — ${nombreTercero(o.terceros)}` : ''}`;
    return el('button', { type: 'button', class: `tcal-ev ${CLASE[o.estado] ?? 'agendado'}${porCotizar(o) ? ' cotizar' : ''}`, title: titulo, onclick: (ev) => { ev.stopPropagation(); detalle(x); } },
      m ? el('span', { class: `tcal-pc ${m[1]}`, title: m[0] }, m[0]) : null,
      x.hora ? el('span', { class: 'tcal-h' }, x.hora) : null,
      m ? veh : [o.tal_orden_servicios.map((s) => servicioCorto(s.nombre)).join(' + ') || '—', ' · ', veh]);
  };
  const verDia = (f) => {
    const l = porDia.get(f) ?? [];
    abrirFormulario({ titulo: `Todo el ${fechaLarga(f)}`, mensaje: l.map((x) => (x.t ? `Tarea: ${x.t.titulo}` : `${x.hora ? `${x.hora} ` : ''}${nombreVehiculo(x.o.tal_vehiculos)} ${verPatente(x.o.tal_vehiculos?.patente)} · ${nombreEstado[x.o.estado]} · N° ${x.o.numero}`)).join('\n'),
      campos: [], textoGuardar: ctx.puede('taller', 'crear') ? 'Agendar en este día' : 'Cerrar', alGuardar: () => { if (ctx.puede('taller', 'crear')) recepcion(ctx, { fecha: f }); } });
  };

  const hoy = hoyISO();
  const dias = []; for (let f = ini; f <= fin; f = sumarDias(f, 1)) dias.push(f);
  const celdas = dias.map((f) => {
    const l = (porDia.get(f) ?? []).sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
    return el('div', { class: `tcal-cel${f.slice(0, 7) !== estado.mes ? ' out' : ''}${f === hoy ? ' today' : ''}`, onclick: () => (l.length ? verDia(f) : ctx.puede('taller', 'crear') ? recepcion(ctx, { fecha: f }) : null) },
      el('span', { class: 'tcal-dn' }, String(Number(f.slice(8)))),
      l.slice(0, 4).map(evento),
      l.length > 4 ? el('button', { type: 'button', class: 'tcal-mas', onclick: (ev) => { ev.stopPropagation(); verDia(f); } }, `+${l.length - 4} más`) : null);
  });
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Calendario'),
      el('div', { class: 'listado-acciones' }, ctx.puede('taller', 'crear') ? boton('Agendar vehículo', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx) }) : null)),
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, nombreMes(estado.mes)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')),
      boton('Este mes', { onclick: () => { estado.mes = hoyISO().slice(0, 7); ctx.refrescar(); } })),
    el('div', { class: 'tcal' },
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => el('div', { class: 'tcal-cab' }, d)), celdas),
    el('div', { class: 'tcal-leyenda texto-chico' },
      ['agendado', 'espera', 'proc', 'term', 'entreg'].map((k, i) => el('span', { class: `tcal-ev ${k}` }, ['Agendado', 'En espera', 'En proceso', 'Terminado', 'Entregado'][i])),
      el('span', {}, el('span', { class: 'tcal-pc ec-pc' }, 'P.C'), ' por cotizar'), el('span', {}, el('span', { class: 'tcal-pc ec-cot' }, 'COTIZADO')), el('span', {}, el('span', { class: 'tcal-pc ec-pago' }, 'PAGADO'))));
}
