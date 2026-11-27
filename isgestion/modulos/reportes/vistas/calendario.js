// Calendario de reportes (Enzo, 2026-11-22): el mes con solo lo que lleva informe, por color de estado.
// Cada faena-día que lleva informe (marcado en la faena o por su cliente) y cada parte aparecen en su día:
// Falta parte (ya pasó y no tiene), Programada (hoy o más adelante, sin parte), Borrador y Confirmado.
// Tocar un parte lo abre; tocar una faena sin parte crea el parte con esa faena marcada.
import { el } from '../../../core/ui/dom.js?v=db6ddb1';
import { icono } from '../../../core/ui/iconos.js?v=db6ddb1';
import { boton } from '../../../core/ui/tabla.js?v=db6ddb1';
import { hoyISO, sumarDias, rangoMes, moverMes, nombreMes, nombreDia, diaSemana, fechaLarga } from '../../../core/ui/formato.js?v=db6ddb1';
import { faenasSinParte, nombreTercero, cargarClientes, cargarFaenas } from '../datos.js?v=db6ddb1';
import { nuevo } from './lista.js?v=db6ddb1';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTADOS = [
  ['falta', 'Falta parte', 'venc'],
  ['programada', 'Programada', 'pend'],
  ['borrador', 'Borrador', 'prox'],
  ['confirmado', 'Confirmado', 'ok'],
];
const estado = { mes: hoyISO().slice(0, 7), ocultos: new Set(), dia: null };

async function cargar(ctx, desde, hasta) {
  const hoy = hoyISO();
  const [partes, porFaena, clientes, sinParte] = await Promise.all([
    ctx.api.from('rep_partes').select('id, fecha, estado, lugar, tercero_id, rep_parte_faenas(fecha, faena_id), rep_media(id)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta),
    // Partes que empiezan antes del mes pero tienen faenas-día dentro de él
    ctx.api.from('rep_parte_faenas').select('parte_id').eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta),
    cargarClientes(ctx),
    faenasSinParte(ctx, desde, hasta),
  ]);
  if (partes.error) throw partes.error;
  if (porFaena.error) throw porFaena.error;
  let lista = partes.data;
  const faltan = [...new Set(porFaena.data.map((x) => x.parte_id))].filter((id) => !lista.some((p) => p.id === id));
  if (faltan.length) {
    const r = await ctx.api.from('rep_partes').select('id, fecha, estado, lugar, tercero_id, rep_parte_faenas(fecha, faena_id), rep_media(id)')
      .in('id', faltan).is('deleted_at', null);
    if (r.error) throw r.error;
    lista = lista.concat(r.data);
  }
  const ids = [...new Set(lista.flatMap((p) => p.rep_parte_faenas.map((x) => x.faena_id)))];
  const faenas = new Map((ids.length ? await cargarFaenas(ctx, '2000-01-01', '2000-01-01', ids) : []).map((f) => [f.id, f]));
  const cli = new Map(clientes.map((c) => [c.id, c]));

  const items = [];
  for (const p of lista) {
    const cliente = nombreTercero(cli.get(p.tercero_id));
    // Un parte aparece una vez por cada día con faenas (o en su fecha si no tiene faenas)
    const porDia = new Map();
    for (const x of p.rep_parte_faenas) {
      if (!porDia.has(x.fecha)) porDia.set(x.fecha, []);
      const t = faenas.get(x.faena_id)?.titulo; if (t && !porDia.get(x.fecha).includes(t)) porDia.get(x.fecha).push(t);
    }
    if (!porDia.size) porDia.set(p.fecha, []);
    for (const [fecha, titulos] of porDia) {
      if (fecha < desde || fecha > hasta) continue;
      items.push({ fecha, tipo: p.estado === 'confirmado' ? 'confirmado' : 'borrador', cliente, detalle: titulos.join(' · ') || p.lugar || '', fotos: p.rep_media.length, parte: p });
    }
  }
  for (const f of sinParte) {
    if (!f.pide_informe) continue;
    items.push({ fecha: f.fecha, tipo: f.fecha < hoy ? 'falta' : 'programada', cliente: f.cliente, detalle: [f.titulo, f.sitio].filter(Boolean).join(' · '), faena: f });
  }
  const orden = { falta: 0, borrador: 1, programada: 2, confirmado: 3 };
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha) || orden[a.tipo] - orden[b.tipo] || a.cliente.localeCompare(b.cliente));
}

// El calendario va arriba del listado de partes (Enzo, 2026-11-22): lo arma la vista Partes (lista.js) con
// `refrescar` propio para que cambiar de mes o de filtro no vuelva a pedir el listado.
export async function calendario(ctx, { refrescar = ctx.refrescar } = {}) {
  const mes = estado.mes;
  const { desde, hasta } = rangoMes(mes);
  const hoy = hoyISO();
  const items = await cargar(ctx, desde, hasta);
  const puedeCrear = ctx.puede('reportes', 'crear');
  const mover = (n) => { estado.mes = n === 0 ? hoy.slice(0, 7) : moverMes(estado.mes, n); estado.dia = null; refrescar(); };

  const cuenta = Object.fromEntries(ESTADOS.map(([k]) => [k, items.filter((i) => i.tipo === k).length]));
  const visibles = items.filter((i) => !estado.ocultos.has(i.tipo));
  const porDia = new Map();
  for (const i of visibles) { if (!porDia.has(i.fecha)) porDia.set(i.fecha, []); porDia.get(i.fecha).push(i); }
  if (!estado.dia || estado.dia < desde || estado.dia > hasta) estado.dia = hoy >= desde && hoy <= hasta ? hoy : (visibles[0]?.fecha ?? desde);

  const seccion = el('section', { class: 'listado rcal' });

  // Un trabajo del día: enlace al parte o botón para crearlo
  const tarjeta = (i) => {
    const titulo = `${ESTADOS.find(([k]) => k === i.tipo)[1]} · ${i.cliente}${i.detalle ? ` · ${i.detalle}` : ''}`;
    const cuerpo = [el('strong', {}, i.cliente), i.detalle ? el('span', { class: 'rcal-det' }, i.detalle) : null,
      i.parte ? el('span', { class: 'rcal-fotos' }, icono('camara', { tam: 12 }), String(i.fotos)) : null];
    if (i.parte) return el('a', { class: `rcal-item rcal-${i.tipo}`, href: ctx.ruta('reportes.parte', { id: i.parte.id }), title: titulo }, cuerpo);
    if (puedeCrear) return el('button', { type: 'button', class: `rcal-item rcal-${i.tipo}`, title: `${titulo} · Crear parte`, onclick: () => nuevo(ctx, i.faena) }, cuerpo);
    return el('span', { class: `rcal-item rcal-${i.tipo}`, title: titulo }, cuerpo);
  };

  // Leyenda: también filtra (tocar un estado lo oculta o lo muestra)
  const leyenda = el('div', { class: 'rcal-leyenda', role: 'group', 'aria-label': 'Estados' }, ESTADOS.map(([k, t]) =>
    el('button', { type: 'button', class: `rcal-chip rcal-${k}`, 'aria-pressed': String(!estado.ocultos.has(k)), title: estado.ocultos.has(k) ? 'Mostrar' : 'Ocultar',
      onclick: () => { estado.ocultos.has(k) ? estado.ocultos.delete(k) : estado.ocultos.add(k); refrescar(); } },
    el('span', { class: 'rcal-punto' }), t, el('b', {}, String(cuenta[k])))));

  // Detalle del día elegido (en el teléfono, debajo del mes)
  const detalleDia = el('div', { class: 'rcal-detalle' });
  const pintarDetalle = () => {
    const lista = porDia.get(estado.dia) ?? [];
    detalleDia.replaceChildren(el('h2', {}, `${nombreDia(estado.dia)} ${fechaLarga(estado.dia)}`),
      lista.length ? el('div', { class: 'rcal-detalle-lista' }, lista.map(tarjeta)) : el('p', { class: 'texto-suave' }, 'Nada que lleve informe este día.'));
  };

  const celdas = DIAS.map((d) => el('div', { class: 'rcal-cab' }, d));
  for (let i = 0; i < diaSemana(desde); i++) celdas.push(el('div', { class: 'rcal-vacio' }));
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const lista = porDia.get(f) ?? [];
    const fecha = f;
    const celda = el('div', { class: `rcal-dia${f === hoy ? ' hoy' : ''}${diaSemana(f) >= 5 ? ' finde' : ''}${f === estado.dia ? ' elegido' : ''}`,
      onclick: (ev) => {
        if (ev.target.closest('a, button')) return;
        estado.dia = fecha; seccion.querySelectorAll('.rcal-dia.elegido').forEach((x) => x.classList.remove('elegido'));
        celda.classList.add('elegido'); pintarDetalle();
      } },
      el('span', { class: 'rcal-num' }, String(Number(f.slice(8)))),
      el('div', { class: 'rcal-items' }, lista.map(tarjeta)),
      lista.length ? el('div', { class: 'rcal-puntos', 'aria-hidden': 'true' }, lista.map((i) => el('span', { class: `rcal-punto rcal-${i.tipo}` }))) : null);
    celdas.push(celda);
  }
  pintarDetalle();

  const resumen = cuenta.falta ? el('p', { class: 'rcal-aviso' }, icono('alerta', { tam: 16 }), ` ${cuenta.falta} ${cuenta.falta === 1 ? 'faena que lleva informe ya pasó y no tiene parte' : 'faenas que llevan informe ya pasaron y no tienen parte'} en ${nombreMes(mes).toLowerCase()}.`) : null;

  seccion.append(
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Reportes de trabajo'),
      el('div', { class: 'listado-acciones' }, puedeCrear ? boton('Nuevo parte', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx, null) }) : null)),
    el('div', { class: 'rcal-barra' },
      el('div', { class: 'rcal-nav' },
        el('button', { type: 'button', class: 'boton', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, '‹'),
        el('h2', {}, nombreMes(mes)),
        el('button', { type: 'button', class: 'boton', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, '›'),
        mes !== hoy.slice(0, 7) ? el('button', { type: 'button', class: 'boton', onclick: () => mover(0) }, 'Hoy') : null),
      leyenda),
    resumen,
    el('div', { class: 'rcal-mes' }, celdas),
    detalleDia);
  return seccion;
}

export default (ctx) => calendario(ctx);
