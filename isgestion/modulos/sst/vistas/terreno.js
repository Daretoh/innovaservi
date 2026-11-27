// Prevención SST → En terreno (pedido de Enzo y Yocelyn, 2026-11-24): las faenas de la semana con lo que se lleva a cada
// una: la carpeta a terreno (AST, permiso de trabajo, reporte) y la lista de carga (EPP, herramientas, maquinaria y
// materiales) de la Preparación de Faenas; si la faena-día aún no se prepara, lo que pide su Matriz de trabajos.
// Lee las tablas de Faenas (necesita ver Faenas, como la prevencionista).
import { el } from '../../../core/ui/dom.js?v=503c912';
import { icono } from '../../../core/ui/iconos.js?v=503c912';
import { boton } from '../../../core/ui/tabla.js?v=503c912';
import { avisar } from '../../../core/ui/aviso.js?v=503c912';
import { hoyISO, lunesDe, sumarDias, fechaLarga, nombreDia, hhmm, numSemana } from '../../../core/ui/formato.js?v=503c912';
import { plegable } from '../../../core/ui/plegable.js?v=503c912';
import { navSemana, cabeceraDia } from '../../../core/ui/semana.js?v=503c912';
import { cargarDocsTerreno, bloqueDocsTerreno, estadoCarpeta, chipsCarpeta, formatosParaImprimir, bloqueFormatosImprimir } from '../../ope/terreno-docs.js?v=503c912';

const estado = { lunes: null };
const TIPOS = [['epp', 'EPP'], ['herramienta', 'Herramientas'], ['maquinaria', 'Maquinaria'], ['material', 'Materiales'], ['ropa', 'Ropa de trabajo']];

export default async function vista(ctx) {
  const titulo = el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Faenas en terreno'),
    el('p', { class: 'texto-suave' }, 'Lo que lleva cada faena: la carpeta a terreno (AST, permiso de trabajo) y la carga (EPP, herramientas, maquinaria y materiales).')));
  if (!ctx.puede('ope', 'ver')) return el('section', { class: 'listado' }, titulo, el('p', { class: 'texto-suave' }, 'Necesitas permiso para ver Faenas y planificación.'));
  const { cargarBase, cargarSemana, faenasDelDia, etiquetaFaena, carpetaTerreno, dotacionDe, dotTotal, horarioDe } = await import('../../ope/datos.js?v=503c912');
  const lunes = estado.lunes ?? lunesDe(hoyISO());
  const domingo = sumarDias(lunes, 6);
  const [base, semana, matrices, docs] = await Promise.all([
    cargarBase(ctx), cargarSemana(ctx, lunes, domingo),
    ctx.api.from('ope_matrices').select('id, nombre, tercero_id, sitio_id, activo, ope_matriz_items(tipo, item, cantidad, orden)').eq('empresa_id', ctx.empresa.id).eq('activo', true),
    cargarDocsTerreno(ctx, lunes, domingo),
  ]);
  // Formatos del cliente (SST 009) y lo ya rellenado esta semana
  const [fmts, llen] = await Promise.all([
    ctx.api.from('sst_formatos').select('id, nombre, tipo, tercero_id, campos').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('activo', true).order('nombre'),
    ctx.api.from('sst_formato_llenados').select('id, formato_id, faena_id, fecha, archivo').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', lunes).lte('fecha', domingo),
  ]);
  const nuestros = await formatosParaImprimir(ctx);
  const formatosDe = (f) => (fmts.data ?? []).filter((x) => !x.tercero_id || x.tercero_id === f.tercero_id);
  const rellenado = (fm, f, d) => (llen.data ?? []).find((x) => x.formato_id === fm.id && x.faena_id === f.id && x.fecha === d);
  if (matrices.error) throw matrices.error;
  const planes = [...semana.plan.values()];
  const prep = planes.length ? await ctx.api.from('ope_prep_items').select('plan_id, tipo, item, cantidad, talla, cargado').in('plan_id', planes.map((p) => p.id)) : { data: [] };
  if (prep.error) throw prep.error;
  const itemsDe = new Map();
  for (const i of prep.data) { if (!itemsDe.has(i.plan_id)) itemsDe.set(i.plan_id, []); itemsDe.get(i.plan_id).push(i); }

  // Sin preparar: la matriz del lugar solo si es una sola (si hay varias, no se adivina cuál usa la faena)
  const carga = (f, p) => {
    const reales = p ? itemsDe.get(p.id) ?? [] : [];
    if (reales.length) return { fuente: 'Preparación de la faena', items: reales };
    const delSitio = matrices.data.filter((m) => m.tercero_id === f.tercero_id && f.sitio_id && m.sitio_id === f.sitio_id);
    if (delSitio.length === 1) return { fuente: `Matriz del lugar "${delSitio[0].nombre}" (la faena aún no se prepara)`, items: delSitio[0].ope_matriz_items ?? [] };
    const posibles = delSitio.length ? delSitio : matrices.data.filter((m) => m.tercero_id === f.tercero_id);
    return { fuente: null, items: [], posibles: posibles.map((m) => m.nombre) };
  };
  const resumen = (items) => TIPOS.map(([k, t]) => {
    const de = items.filter((i) => i.tipo === k);
    if (!de.length) return null;
    // Juntar repetidos (la ropa va por persona y talla)
    const junta = new Map();
    for (const i of de) { const n = `${i.item}${i.talla ? ` talla ${i.talla}` : ''}`; junta.set(n, (junta.get(n) ?? 0) + (Number(i.cantidad) || 1)); }
    return el('div', { class: 'ter-grupo' }, el('strong', {}, t),
      el('ul', {}, [...junta.entries()].map(([n, c]) => el('li', {}, c > 1 ? `${n} × ${c}` : n))));
  }).filter(Boolean);

  // Cada faena es un desplegable: en la cabecera lo que pide y si ya está adjunto; adentro, sus documentos y la carga
  const hoy = hoyISO();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const bloques = dias.map((d) => {
    const fs = faenasDelDia(semana.faenas, d);
    if (!fs.length) return null;
    return el('div', { class: `ter-dia ficha${d === hoy ? ' ter-dia-hoy' : ''}` },
      cabeceraDia(d, el('span', { class: 'texto-suave texto-chico' }, `${fs.length} faena${fs.length === 1 ? '' : 's'}`)),
      fs.map((f) => {
        const p = semana.planDe(f, d);
        const c = carpetaTerreno(f, base);
        const k = carga(f, p);
        const h = horarioDe(f, p);
        const gente = p?.ope_plan_personas?.length ?? dotTotal(dotacionDe(f, p));
        const lista = docs.get(`${f.id}|${d}`) ?? [];
        const est = estadoCarpeta(c, lista);
        const nCarga = k.items.length;
        return plegable({
          clave: `ter|${f.id}|${d}`,
          titulo: [f.titulo, etiquetaFaena(f, base).texto].filter(Boolean).join(' · '),
          meta: [h.ini ? `${hhmm(h.ini)}${h.fin ? `–${hhmm(h.fin)}` : ''}` : null, gente ? `${gente} persona${gente === 1 ? '' : 's'}` : null,
            nCarga ? `${nCarga} ítem${nCarga === 1 ? '' : 's'} de carga` : 'sin carga', lista.length ? `${lista.length} adjunto${lista.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
          ico: 'camion',
          chips: [...chipsCarpeta(est), c.informe ? el('span', { class: 'chip chip-na' }, icono('camara', { tam: 12 }), 'Reporte') : null],
          cuerpo: [
            el('div', { class: 'listado-cabecera' }, el('h3', {}, 'Carpeta a terreno'),
              el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('ope.plan', { f: f.id, d }) }, 'Ver faena', icono('derecha', { tam: 14 }))),
            est.length ? null : el('p', { class: 'texto-suave texto-chico' }, 'No pide AST ni permiso de trabajo (se marca en el Calendario o en la faena).'),
            formatosDe(f).length ? el('div', { class: 'ter-formatos' },
              el('span', { class: 'texto-chico texto-suave' }, 'Formatos del cliente para imprimir:'),
              formatosDe(f).map((fm) => {
                const ya = rellenado(fm, f, d);
                return ya
                  ? el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('sst.formatos', { id: fm.id, l: ya.id }) }, icono(ya.archivo ? 'check' : 'editar', { tam: 14 }), `${fm.nombre}${ya.archivo ? ' (listo)' : ' (borrador)'}`)
                  : ctx.puede('sst', 'crear') || ctx.puede('ope', 'crear') ? boton(`Rellenar ${fm.nombre}`, { icono: 'editar', onclick: async () => {
                    try { const { abrirLlenado } = await import('./formatos.js?v=503c912'); await abrirLlenado(ctx, fm, { faenaId: f.id, fecha: d }); } catch (e) { avisar(e.message, 'error'); }
                  } }) : null;
              })) : null,
            bloqueFormatosImprimir(ctx, nuestros, etiquetaFaena(f, base).texto, { faenaId: f.id, fecha: d }),
            bloqueDocsTerreno(ctx, { f, fecha: d, docs: lista, alCambiar: () => ctx.refrescar() }),
            el('h3', {}, 'Carga'),
            k.fuente ? el('p', { class: 'texto-suave texto-chico' }, k.fuente) : null,
            nCarga ? el('div', { class: 'ter-carga' }, resumen(k.items))
              : el('p', { class: 'texto-suave texto-chico' }, k.posibles?.length ? `Aún sin preparar. Matrices de este cliente: ${k.posibles.join(', ')}.` : 'Sin lista de carga: se arma en la Preparación de la faena (Faenas → Planificación).'),
          ],
        });
      }));
  }).filter(Boolean);
  // Resumen de la semana: cuánto falta adjuntar
  // (solo hasta hoy: una faena futura todavía no tiene su AST firmada)
  const pendientes = dias.filter((d) => d <= hoy).flatMap((d) => faenasDelDia(semana.faenas, d).flatMap((f) => estadoCarpeta(carpetaTerreno(f, base), docs.get(`${f.id}|${d}`) ?? []).filter((x) => !x.ok)));

  const mover = (n) => { estado.lunes = sumarDias(lunes, n); ctx.refrescar(); };
  return el('section', { class: 'listado' }, titulo,
    navSemana({ lunes, alMover: (n) => mover(n * 7), alHoy: () => { estado.lunes = null; ctx.refrescar(); } }),
    pendientes.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `Falta adjuntar ${pendientes.length}: ${['AST', 'Permiso de trabajo'].map((t) => { const n = pendientes.filter((x) => x.texto === t).length; return n ? `${n} ${t}` : null; }).filter(Boolean).join(' y ')}.`) : null,
    bloques.length ? bloques : el('p', { class: 'texto-suave' }, 'No hay faenas esta semana.'),
    el('p', { class: 'texto-suave texto-chico' }, 'AST y permiso de trabajo se marcan en el Calendario o en la faena (por omisión, lo de cada cliente en Faenas → Clientes y sitios) y se adjuntan aquí o en la faena, firmados (foto o PDF; varias fotos se juntan en un PDF). La carga sale de la Preparación de la faena.'));
}
