// Consumo de químicos (Taller 014 + Inventario 003). No se descuenta nada por orden (decisión de Enzo): se mira cuándo
// entra cada químico al almacén del taller y cuándo se da de baja (se terminó), y qué órdenes terminadas en ese tiempo
// tuvieron pasos que lo usan. Así sale cuántos autos rinde un envase y cuánto cuesta por auto.
// Una orden usa un químico si alguno de sus pasos (los marcados; si no marcó ninguno, todos) lo tiene en la ficha del
// servicio (Taller → Servicios y precios). Baja = salida o ajuste negativo del almacén del taller (no los traslados).
// Ruta: #/inventario.consumo?p=<mes|3m|anio>
import { el } from '../../../core/ui/dom.js?v=419b261';
import { icono } from '../../../core/ui/iconos.js?v=419b261';
import { boton } from '../../../core/ui/tabla.js?v=419b261';
import { abrirFormulario } from '../../../core/ui/modal.js?v=419b261';
import { avisar } from '../../../core/ui/aviso.js?v=419b261';
import { plegable } from '../../../core/ui/plegable.js?v=419b261';
import { dinero, hoyISO, sumarDias, diaLocal, fechaLarga } from '../../../core/ui/formato.js?v=419b261';
import { cargarBase, cargarProductos, cargarStock, registrar, cant } from '../datos.js?v=419b261';

const PERIODOS = [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año']];
const ord = (n) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`;
const num = (n) => Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 });

function rango(p) {
  const hoy = hoyISO();
  if (p === 'mes') return [`${hoy.slice(0, 7)}-01`, hoy];
  if (p === 'anio') return [`${hoy.slice(0, 4)}-01-01`, hoy];
  return [sumarDias(hoy, -90), hoy];
}
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export default async function vista(ctx) {
  const periodo = PERIODOS.some(([k]) => k === ctx.params.p) ? ctx.params.p : '3m';
  const [desde, hasta] = rango(periodo);
  const titulo = el('header', { class: 'listado-cabecera' },
    el('div', {}, el('h1', {}, 'Consumo de químicos'),
      el('p', { class: 'texto-suave' }, 'Lo que entra al taller, lo que se da de baja y las órdenes que lo usaron en ese tiempo.')),
    el('div', { class: 'listado-acciones' }, PERIODOS.map(([k, t]) => el('a', {
      class: `boton boton-chico ${k === periodo ? 'boton-primario' : 'boton-secundario'}`, href: ctx.ruta('inventario.consumo', { p: k }), 'aria-current': k === periodo ? 'true' : null }, t))));
  const seccion = (...hijos) => el('section', { class: 'listado' }, titulo, ...hijos);
  if (!ctx.puede('taller', 'ver')) return seccion(el('p', { class: 'texto-suave' }, 'Se calcula con las órdenes del Taller: pide el permiso para verlo.'));

  const e = ctx.empresa.id;
  const [base, productos, stock, pasos, pq] = await Promise.all([
    cargarBase(ctx), cargarProductos(ctx, { todos: true }), cargarStock(ctx),
    ctx.api.from('tal_pasos').select('id, nombre').eq('empresa_id', e),
    ctx.api.from('tal_paso_quimicos').select('paso_id, producto_id').eq('empresa_id', e),
  ]);
  if (pasos.error || pq.error) {
    const x = pasos.error ?? pq.error;
    if (x.code === '42P01' || String(x.code).startsWith('PGRST2')) return seccion(el('p', { class: 'texto-suave' }, 'Falta instalar los pasos y químicos del Taller (Taller 014).'));
    throw x;
  }
  const taller = base.almacenes.find((a) => a.es_taller);
  if (!taller) return seccion(el('p', { class: 'texto-suave' }, 'Marca el almacén del taller en Inventario → Almacenes y tipos ("¿El taller usa los químicos desde aquí?").'));

  const prod = new Map(productos.map((p) => [p.id, p]));
  // Químico → nombres de los pasos que lo usan
  const nombrePaso = new Map(pasos.data.map((p) => [p.id, p.nombre]));
  const pasosDe = new Map();
  for (const q of pq.data) pasosDe.set(q.producto_id, new Set([...(pasosDe.get(q.producto_id) ?? []), nombrePaso.get(q.paso_id)]));
  const ids = [...pasosDe.keys()].filter((id) => prod.has(id));
  if (!ids.length) {
    return seccion(el('div', { class: 'estado-vacio' }, el('span', { class: 'estado-vacio-icono' }, icono('grafico', { tam: 28 })), el('h2', {}, 'Aún no hay químicos en los pasos'),
      el('p', { class: 'texto-suave' }, 'Cárgalos en Taller → Servicios y precios → ficha del servicio → cada paso.')));
  }

  // Movimientos del almacén del taller (todo el historial hasta hoy: las bajas se cuentan desde la anterior)
  const [movs, ords] = await Promise.all([
    ctx.api.from('inv_movimientos').select('producto_id, cantidad, inv_documentos!inner(tipo, fecha, estado, motivo, numero, id)')
      .eq('empresa_id', e).eq('almacen_id', taller.id).in('producto_id', ids).eq('inv_documentos.estado', 'vigente').limit(10000),
    ctx.api.from('tal_ordenes').select('id, numero, termino_at, tareas').eq('empresa_id', e).in('estado', ['terminado', 'entregado'])
      .not('termino_at', 'is', null).order('termino_at').limit(10000),
  ]);
  if (movs.error) throw movs.error;
  if (ords.error) throw ords.error;
  // Pasos de cada orden: los marcados; si no marcó ninguno, todos (como el checklist)
  const ordenes = ords.data.map((o) => {
    const marcados = (o.tareas ?? []).filter((t) => t.ok).map((t) => String(t.t).trim());
    return { ...o, dia: diaLocal(o.termino_at), pasos: new Set(marcados.length ? marcados : (o.tareas ?? []).map((t) => String(t.t).trim())) };
  });
  const usa = (o, id) => [...pasosDe.get(id)].some((n) => o.pasos.has(n));
  const entre = (o, a, b) => o.dia > a && o.dia <= b;   // después de a, hasta b inclusive

  const filas = ids.map((id) => {
    const p = prod.get(id);
    const m = movs.data.map((x) => ({ ...x, d: x.inv_documentos, c: Number(x.cantidad) })).sort((a, b) => a.d.fecha.localeCompare(b.d.fecha) || a.d.numero - b.d.numero)
      .filter((x) => x.producto_id === id);
    const entradas = m.filter((x) => x.c > 0);
    const bajas = m.filter((x) => x.c < 0 && x.d.tipo !== 'traslado');
    const enPeriodo = (x) => x.d.fecha >= desde && x.d.fecha <= hasta;
    const usadas = ordenes.filter((o) => o.dia >= desde && o.dia <= hasta && usa(o, id));
    const entro = entradas.filter(enPeriodo).reduce((s, x) => s + x.c, 0);
    const bajo = -bajas.filter(enPeriodo).reduce((s, x) => s + x.c, 0);
    // Cada baja: órdenes desde la baja anterior (la primera, desde la primera entrada al taller)
    const historial = bajas.map((b, i) => {
      const inicio = i ? bajas[i - 1].d.fecha : entradas[0]?.d.fecha ?? b.d.fecha;
      const n = ordenes.filter((o) => (i ? entre(o, inicio, b.d.fecha) : o.dia >= inicio && o.dia <= b.d.fecha) && usa(o, id)).length;
      return { fecha: b.d.fecha, cantidad: -b.c, motivo: b.d.motivo, desde: inicio, ordenes: n, porEnvase: -b.c ? n / -b.c : null, doc: b.d.id };
    }).reverse();
    const ultimaBaja = bajas.at(-1)?.d.fecha ?? entradas[0]?.d.fecha ?? null;
    const desdeUltima = ultimaBaja ? ordenes.filter((o) => o.dia > ultimaBaja && usa(o, id)).length : 0;
    const st = stock.get(id) ?? { total: 0 };
    return { id, p, entro, bajo, usadas: usadas.length, porEnvase: bajo ? usadas.length / bajo : null, costo: bajo * Number(p?.costo || 0),
      stTaller: st[taller.id] ?? 0, stTotal: st.total ?? 0, historial, ultimaBaja, desdeUltima, ultimaEntrada: entradas.at(-1)?.d.fecha ?? null };
  }).sort((a, b) => b.usadas - a.usadas || a.p.nombre.localeCompare(b.p.nombre));

  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const autos = new Set(ordenes.filter((o) => o.dia >= desde && o.dia <= hasta && ids.some((id) => usa(o, id))).map((o) => o.id)).size;

  const darBaja = (f) => abrirFormulario({
    titulo: `Se terminó: ${f.p.nombre}`,
    mensaje: `Sale del almacén ${taller.nombre} (hay ${cant(f.stTaller)} ${f.p.udm}). Con esto se cierra el envase y se cuentan las órdenes que lo usaron.`,
    campos: [
      { id: 'cantidad', etiqueta: `Cantidad (${f.p.udm})`, tipo: 'number', valor: '1' },
      { id: 'motivo', etiqueta: 'Motivo', valor: 'Envase terminado' },
    ],
    textoGuardar: 'Dar de baja',
    alGuardar: async (v) => {
      const c = Number(v.cantidad);
      if (!(c > 0)) throw new Error('La cantidad debe ser mayor a cero.');
      await registrar(ctx, { tipo: 'salida', fecha: hoyISO(), almacen: taller.id, lineas: [{ producto_id: f.id, cantidad: c }], motivo: v.motivo.trim() || 'Envase terminado' });
      avisar('Baja registrada.'); ctx.refrescar();
    },
  });

  const tarjeta = (f) => plegable({
    clave: `consumo-${f.id}`,
    titulo: f.p.nombre,
    meta: [ord(f.usadas), f.bajo ? `${num(f.bajo)} ${f.p.udm} de baja` : 'sin bajas', f.porEnvase != null ? `${num(f.porEnvase)} órdenes por ${f.p.udm}` : null].filter(Boolean).join(' · '),
    chips: [f.stTaller <= 0 ? el('span', { class: 'chip chip-venc' }, 'Sin stock en taller') : el('span', { class: 'chip chip-ok' }, `${cant(f.stTaller)} en taller`)],
    cuerpo: el('div', { class: 'tal-paso-cuerpo' },
      el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'En el periodo'),
        el('span', { class: 'texto-suave texto-chico' }, [`entró al taller ${cant(f.entro)}`, `de baja ${cant(f.bajo)}`, `${ord(f.usadas)} ${f.usadas === 1 ? 'lo usó' : 'lo usaron'}`,
          ctx.puede('inventario', 'ver') && f.costo ? `costo ${dinero(f.costo)}${f.usadas ? ` (${dinero(f.costo / f.usadas)} por orden)` : ''}` : null].filter(Boolean).join(' · ')))),
      el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'Envase actual'),
        el('span', { class: 'texto-suave texto-chico' }, f.ultimaBaja ? `${ord(f.desdeUltima)} desde ${f.historial.length ? 'la última baja' : 'que entró al taller'} (${fechaLarga(f.ultimaBaja)})` : 'Aún no entra al taller'))),
      el('div', { class: 'doc-fila' }, el('div', { class: 'doc-nombre' }, el('strong', {}, 'Stock'),
        el('span', { class: 'texto-suave texto-chico' }, [`${taller.nombre} ${cant(f.stTaller)}`, `total ${cant(f.stTotal)} ${f.p.udm}`, f.ultimaEntrada ? `última entrada al taller ${fechaLarga(f.ultimaEntrada)}` : null].filter(Boolean).join(' · ')))),
      el('p', { class: 'texto-suave texto-chico' }, `Pasos que lo usan: ${[...pasosDe.get(f.id)].join(', ')}.`),
      f.historial.length ? el('div', {}, el('h3', {}, 'Bajas'), f.historial.slice(0, 8).map((h) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('a', { href: ctx.ruta('inventario.documento', { id: h.doc }) }, el('strong', {}, `${fechaLarga(h.fecha)} · ${cant(h.cantidad)} ${f.p.udm}`)),
          el('span', { class: 'texto-suave texto-chico' }, [`${ord(h.ordenes)} en ${dias(h.desde, h.fecha)} días`, h.porEnvase != null ? `${num(h.porEnvase)} por ${f.p.udm}` : null, h.motivo].filter(Boolean).join(' · ')))))) : null,
      ctx.puede('inventario', 'crear') ? el('div', { class: 'tal-paso-botones' },
        boton('Se terminó (dar de baja)', { icono: 'menos', onclick: () => darBaja(f) }),
        el('a', { class: 'boton boton-secundario', href: ctx.ruta('inventario.documento', { tipo: 'traslado', producto: f.id }) }, icono('derecha', { tam: 16 }), 'Pasar de la Bodega')) : null),
  });

  const exportar = async () => {
    const { exportarExcel } = await import('../../../core/excel.js?v=419b261');
    await exportarExcel(ctx, { titulo: 'Consumo de químicos', subtitulo: `${fechaLarga(desde)} a ${fechaLarga(hasta)}`, nombre: 'consumo-quimicos',
      columnas: ['Químico', 'Unidad', { t: 'Órdenes que lo usaron', tipo: 'numero' }, { t: 'Entró al taller', tipo: 'numero' }, { t: 'De baja', tipo: 'numero' },
        { t: 'Órdenes por unidad', tipo: 'numero' }, { t: 'Costo de las bajas', tipo: 'dinero' }, { t: 'Costo por orden', tipo: 'dinero' },
        { t: 'Stock taller', tipo: 'numero' }, { t: 'Stock total', tipo: 'numero' }, { t: 'Órdenes desde la última baja', tipo: 'numero' }],
      filas: filas.map((f) => [f.p.nombre, f.p.udm, f.usadas, f.entro, f.bajo, f.porEnvase, f.costo, f.usadas ? f.costo / f.usadas : null, f.stTaller, f.stTotal, f.desdeUltima]) });
  };

  return seccion(
    el('div', { class: 'fin-tarjetas' },
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Órdenes con químicos'), el('strong', {}, String(autos))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Costo de lo dado de baja'), el('strong', {}, dinero(totalCosto))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Por orden'), el('strong', {}, dinero(autos ? totalCosto / autos : 0))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Sin stock en el taller'), el('strong', {}, String(filas.filter((f) => f.stTaller <= 0).length)))),
    el('div', { class: 'listado-acciones' }, boton('Excel', { icono: 'descargar', onclick: exportar })),
    el('div', { class: 'tal-pasos' }, filas.map(tarjeta)),
    el('p', { class: 'texto-suave texto-chico' }, `Periodo ${fechaLarga(desde)} a ${fechaLarga(hasta)}. Una orden cuenta para un químico si alguno de sus pasos marcados (o todos, si no marcó ninguno) lo usa. "Órdenes por ${'unidad'}" = órdenes del periodo / unidades dadas de baja en el periodo; en cada baja, las órdenes desde la baja anterior. Costo al último costo.`));
}
