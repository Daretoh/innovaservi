// Editar un PTS desde la app (como en InnovaGestión): objetivo, alcance, normativa, responsabilidades, desarrollo por
// subtemas, riesgos y medidas, EPP, plan de rescate y registros. Cada guardado es una versión nueva (03, 04…) con la
// descripción del cambio, que queda en el control de cambios del documento. "Volver al original" borra las ediciones.
// Ruta: #/documentos.pts?s=<slug>
import { el } from '../../../core/ui/dom.js?v=14e2347';
import { icono } from '../../../core/ui/iconos.js?v=14e2347';
import { boton } from '../../../core/ui/tabla.js?v=14e2347';
import { avisar } from '../../../core/ui/aviso.js?v=14e2347';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=14e2347';
import { cargarPlantillas, abrirDocumento } from '../editor.js?v=14e2347';

// Sin etiquetas HTML posibles (igual que InnovaGestión): < y > pasan a ‹ ›
const limpio = (s) => String(s ?? '').replace(/</g, '‹').replace(/>/g, '›').trim();
const fFaena = (iso) => iso.split('-').reverse().join('-');

export default async function vista(ctx) {
  const slug = ctx.params.s;
  const volver = el('a', { class: 'volver', href: ctx.ruta('documentos.generar') }, icono('volver', { tam: 16 }), 'Generar documentos');
  const { P } = await cargarPlantillas(ctx);
  if (!P.PTS_DOC[slug]) return el('section', { class: 'listado' }, volver, el('h1', {}, 'PTS no encontrado'));
  if (!ctx.puede('documentos', 'editar')) return el('section', { class: 'listado' }, volver, el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no puede editar procedimientos.'));
  const D = P.ptsDatos(slug);
  const C = P.ptsCambios(D);
  const sig = String(Number(C.at(-1)[0]) + 1).padStart(2, '0');

  // ---- Controles: filas con subir, bajar y quitar
  const crecer = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
  const area = (v, ph = '', filas = 1) => { const t = el('textarea', { class: 'campo', rows: filas, placeholder: ph }); t.value = v ?? ''; t.addEventListener('input', () => crecer(t)); return t; };
  const mover = (fila, contenedor) => el('span', { class: 'ped-b' },
    el('button', { type: 'button', class: 'boton-icono', title: 'Subir', 'aria-label': 'Subir', onclick: () => { const a = fila.previousElementSibling; if (a) contenedor.insertBefore(fila, a); } }, icono('arriba', { tam: 14 })),
    el('button', { type: 'button', class: 'boton-icono', title: 'Bajar', 'aria-label': 'Bajar', onclick: () => { const b = fila.nextElementSibling; if (b) contenedor.insertBefore(b, fila); } }, icono('abajo', { tam: 14 })),
    el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar', onclick: () => fila.remove() }, icono('cerrar', { tam: 14 })));
  const lista = (valores, ph) => {
    const cont = el('div', { class: 'ped-lista' });
    const agregar = (v) => { const fila = el('div', { class: 'ped-fila' }); fila.append(area(v, ph), mover(fila, cont)); cont.append(fila); return fila; };
    for (const v of valores ?? []) agregar(v);
    return { nodo: el('div', {}, cont, el('button', { type: 'button', class: 'ped-agregar', onclick: () => agregar('').querySelector('textarea').focus() }, `Agregar ${ph.toLowerCase()}`)),
      leer: () => [...cont.children].map((f) => limpio(f.querySelector('textarea').value)).filter(Boolean) };
  };
  const tabla = (filas, cols) => {
    const cont = el('div', { class: 'ped-lista' });
    const agregar = (r) => { const fila = el('div', { class: 'ped-fila ped-tabla', style: `--cols:${cols.length}` }); fila.append(...cols.map((c, i) => area(r?.[i], c)), mover(fila, cont)); cont.append(fila); return fila; };
    for (const r of filas ?? []) agregar(r);
    return { nodo: el('div', {}, el('div', { class: 'ped-cab', style: `--cols:${cols.length}` }, cols.map((c) => el('span', {}, c))), cont,
      el('button', { type: 'button', class: 'ped-agregar', onclick: () => agregar(null).querySelector('textarea').focus() }, 'Agregar fila')),
      leer: () => [...cont.children].map((f) => [...f.querySelectorAll('textarea')].map((t) => limpio(t.value))).filter((r) => r.some(Boolean)) };
  };
  const secciones = (valores) => {
    const cont = el('div', { class: 'ped-secs' });
    const agregar = ([t, items] = ['', ['']]) => {
      const titulo = el('input', { type: 'text', class: 'campo', value: t ?? '', placeholder: 'Título del subtema' });
      const pts = lista(items, 'Punto');
      const sec = el('div', { class: 'ped-sec' });
      sec.append(el('div', { class: 'ped-fila' }, titulo, mover(sec, cont)), pts.nodo);
      sec._leer = () => [limpio(titulo.value), pts.leer()];
      cont.append(sec);
      return titulo;
    };
    for (const s of valores ?? []) agregar(s);
    return { nodo: el('div', {}, cont, el('button', { type: 'button', class: 'ped-agregar', onclick: () => agregar().focus() }, 'Agregar subtema')),
      leer: () => [...cont.children].map((s) => s._leer()).filter((s) => s[0] || s[1].length) };
  };
  const bloque = (titulo, nodo, nota) => el('div', { class: 'ficha ped-bloque' }, el('h2', {}, titulo), nota ? el('p', { class: 'texto-suave texto-chico' }, nota) : null, nodo);

  const obj = area(D.obj, '', 3); const alc = area(D.alc, '', 3);
  const norm = lista(D.norm, 'Norma o referencia');
  const resp = tabla(D.resp, ['Cargo', 'Responsabilidad']);
  const des = secciones(D.des);
  const ries = tabla(D.ries, ['Actividad / peligro', 'Riesgo', 'Medidas de control']);
  const epp = lista(D.epp, 'Elemento');
  const rescTit = el('input', { type: 'text', class: 'campo', value: D.rescateTit ?? '', placeholder: 'Título de la sección (ej.: Plan de rescate en altura)' });
  const resc = secciones(D.rescate);
  const regs = lista(D.registros, 'Registro');
  const cambio = area('', 'Ej.: Se amplía la evaluación de riesgos según observaciones del mandante.', 2);

  const leer = () => {
    const d = { obj: limpio(obj.value), alc: limpio(alc.value), norm: norm.leer(), resp: resp.leer(), des: des.leer(), ries: ries.leer(), epp: epp.leer(),
      rescateTit: limpio(rescTit.value), rescate: resc.leer(), registros: regs.leer(), cambios: [...(D.cambios ?? [])] };
    if (!d.rescate.length) { delete d.rescate; delete d.rescateTit; }
    if (!d.registros.length) delete d.registros;
    if (!D.orig) d.f01 = D.f01 || 'oct. 2026'; else d.f02 = D.f02 || 'oct. 2026';
    return d;
  };
  const vistaPrevia = () => {
    const d = leer(); d.cambios.push([sig, fFaena(hoyISO()), limpio(cambio.value) || '(borrador sin guardar)']);
    abrirDocumento({ titulo: `${D.titulo} · vista previa`, construir: () => P.docPTSDoc(slug, d) });
  };
  const guardar = async (ev) => {
    const desc = limpio(cambio.value);
    if (!desc) { avisar('Describe el cambio para el control de cambios.', 'error'); cambio.focus(); return; }
    const b = ev.currentTarget; b.classList.add('cargando'); b.disabled = true;
    const d = leer(); d.cambios.push([sig, fFaena(hoyISO()), desc]);
    const { error } = await ctx.api.from('gen_pts').insert({ empresa_id: ctx.empresa.id, slug, version: sig, datos: d, cambio: desc });
    b.classList.remove('cargando'); b.disabled = false;
    if (error) { avisar(error.code === '23505' ? 'Otra persona guardó una versión recién: recarga la página.' : error.message, 'error'); return; }
    avisar(`Versión ${sig} guardada.`);
    location.hash = ctx.ruta('documentos.generar');
  };
  const original = async () => {
    if (!confirm('¿Volver al contenido original del PTS? Se borran todas las ediciones guardadas.')) return;
    const { error } = await ctx.api.from('gen_pts').delete().eq('empresa_id', ctx.empresa.id).eq('slug', slug);
    if (error) { avisar(error.message, 'error'); return; }
    avisar('PTS restaurado al original.'); ctx.refrescar();
  };

  const nodo = el('section', { class: 'listado ped' }, volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, `Editar ${D.cod} · ${D.titulo}`),
      el('p', { class: 'texto-suave' }, `Versión vigente ${C.at(-1)[0]} (${C.at(-1)[1]}). Al guardar pasa a la ${sig}; el formato (membrete, firmas, emergencias) se mantiene solo.`))),
    bloque('Objetivo', obj), bloque('Alcance', alc),
    bloque('Normativa y referencias', norm.nodo), bloque('Responsabilidades', resp.nodo),
    bloque('Desarrollo', des.nodo, 'Cada subtema tiene un título y sus puntos.'),
    bloque('Riesgos y medidas de control', ries.nodo), bloque('Elementos de protección personal', epp.nodo),
    bloque('Plan de rescate o sección adicional', el('div', {}, rescTit, resc.nodo), 'Opcional.'),
    bloque('Registros', regs.nodo, 'El registro de entrega del PTS se agrega siempre.'),
    bloque(`Descripción del cambio (versión ${sig})`, cambio),
    el('div', { class: 'listado-acciones ped-acciones' },
      boton('Vista previa', { icono: 'ojo', onclick: vistaPrevia }),
      D.cambios?.length && ctx.puede('documentos', 'eliminar') ? boton('Volver al original', { icono: 'volver', onclick: original }) : null,
      boton(`Guardar versión ${sig}`, { icono: 'check', tipo: 'primario', onclick: guardar })),
    el('p', { class: 'texto-suave texto-chico' }, `Historial: ${C.map((x) => `${x[0]} (${x[1]})`).join(' · ')}. Fecha de hoy: ${fechaLarga(hoyISO())}.`));
  requestAnimationFrame(() => { for (const t of nodo.querySelectorAll('textarea')) crecer(t); });
  return nodo;
}
