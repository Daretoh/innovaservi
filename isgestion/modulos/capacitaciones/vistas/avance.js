// Capacitaciones → Avance por trabajador: cada trabajador con rutas asignadas y cuánto ha visto y aprobado; al elegir
// uno (?p=<persona>) se ven sus rutas contenido por contenido, con aprobar / no aprobado. Excel con todo.
// Quien solo ve el módulo (sin editar ni aprobar) ve su propio avance.
// Ruta: #/capacitaciones.avance
import { el } from '../../../core/ui/dom.js?v=c3310e4';
import { icono } from '../../../core/ui/iconos.js?v=c3310e4';
import { boton } from '../../../core/ui/tabla.js?v=c3310e4';
import { abrirFormulario } from '../../../core/ui/modal.js?v=c3310e4';
import { exportarExcel } from '../../../core/excel.js?v=c3310e4';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=c3310e4';
import { cargarPersonas, miPersona, cargarEstilos, conCarga, TIPO_CORTO, ICONO_TIPO } from '../datos.js?v=c3310e4';
import { cargarRutas, barraAvance } from './ruta.js?v=c3310e4';

const estadoDe = (a) => (a?.aprobado === true ? 'Aprobado' : a?.aprobado === false ? 'No aprobado' : a?.visto_at ? 'Visto' : 'Pendiente');
const CHIP = { Aprobado: 'chip-ok', 'No aprobado': 'chip-venc', Visto: 'chip-ok', Pendiente: 'chip-pend' };

export default async function vista(ctx) {
  cargarEstilos();
  const supervisa = ctx.puede('capacitaciones', 'editar') || ctx.puede('capacitaciones', 'aprobar');
  const [d, yo] = await Promise.all([cargarRutas(ctx), miPersona(ctx)]);
  const personas = supervisa ? await cargarPersonas(ctx, { todas: true }) : { lista: [], de: new Map() };
  const rutasActivas = d.rutas.filter((r) => r.activa);
  const itemsDe = (rid) => d.itemsDe(rid).filter((i) => d.contenidoDe.has(i.contenido_id)).sort((a, b) => a.orden - b.orden);
  const rutasDe = (pid) => rutasActivas.filter((r) => d.personasDe(r.id).some((p) => p.persona_id === pid));
  // Contenidos únicos de todas las rutas de la persona
  const contenidosDe = (pid) => [...new Set(rutasDe(pid).flatMap((r) => itemsDe(r.id).map((i) => i.contenido_id)))];

  const pid = supervisa ? ctx.params.p : yo;
  if (pid) return detalle(ctx, d, personas, pid, { supervisa, rutasDe, itemsDe, propio: !supervisa });
  if (!supervisa) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Mi avance'),
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu cuenta no está ligada a una ficha de trabajador. Marca lo visto desde la biblioteca con tu RUT.'));
  }

  const ids = [...new Set(d.personas.filter((p) => rutasActivas.some((r) => r.id === p.ruta_id)).map((p) => p.persona_id))]
    .filter((id) => personas.de.has(id)).sort((a, b) => personas.de.get(a).nombre.localeCompare(personas.de.get(b).nombre));
  const resumen = ids.map((id) => {
    const cs = contenidosDe(id);
    const vistos = cs.filter((c) => d.avance.get(`${c}|${id}`)?.visto_at).length;
    const aprob = cs.filter((c) => d.avance.get(`${c}|${id}`)?.aprobado).length;
    return { id, p: personas.de.get(id), rutas: rutasDe(id), total: cs.length, vistos, aprob };
  });

  const excel = () => exportarExcel(ctx, {
    titulo: 'Avance de capacitaciones', nombre: 'avance-capacitaciones',
    columnas: ['Trabajador', 'Cargo', 'Ruta', 'Contenido', 'Tipo', 'Estado', { t: 'Visto', tipo: 'fecha' }, 'Nota'],
    filas: resumen.flatMap((x) => x.rutas.flatMap((r) => itemsDe(r.id).map((i) => {
      const c = d.contenidoDe.get(i.contenido_id);
      const a = d.avance.get(`${c.id}|${x.id}`);
      return [x.p.nombre, x.p.cargo ?? '', r.nombre, c.titulo, TIPO_CORTO[c.tipo], estadoDe(a), a?.visto_at ? diaLocal(a.visto_at) : null, a?.nota ?? ''];
    }))),
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Avance por trabajador'),
      el('div', { class: 'listado-acciones' }, ctx.puede('capacitaciones', 'exportar') && resumen.length ? boton('Excel', { icono: 'descargar', onclick: (ev) => conCarga(ev, excel) }) : null)),
    resumen.length
      ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Trabajador', 'Rutas', 'Avance', 'Aprobados'].map((t) => el('th', {}, t)))),
        el('tbody', {}, resumen.map((x) => el('tr', { class: 'fila-enlace', title: 'Abrir', onclick: () => { location.hash = ctx.ruta('capacitaciones.avance', { p: x.id }); } },
          el('td', {}, el('strong', {}, x.p.nombre), x.p.cargo ? el('span', { class: 'texto-suave texto-chico' }, ` · ${x.p.cargo}`) : null),
          el('td', { class: 'texto-chico' }, x.rutas.map((r) => r.nombre).join(', ')),
          el('td', {}, x.total ? barraAvance(x.vistos, x.aprob, x.total) : '—'),
          el('td', {}, `${x.aprob} de ${x.total}`))))))
      : el('div', { class: 'cap-vacio' }, icono('users', { tam: 28 }), el('p', {}, 'Nadie tiene rutas asignadas todavía.'),
        el('a', { href: ctx.ruta('capacitaciones.rutas') }, 'Ir a Rutas')));
}

function detalle(ctx, d, personas, pid, { supervisa, rutasDe, itemsDe, propio }) {
  const p = personas.de.get(pid);
  const puedeEval = ctx.puede('capacitaciones', 'aprobar');
  const volver = supervisa ? el('a', { class: 'volver', href: ctx.ruta('capacitaciones.avance') }, icono('volver', { tam: 16 }), 'Avance') : null;
  const evaluar = async (cid, aprobado, nota = null, quitar = false) => {
    const { error } = await ctx.api.rpc('cap_evaluar', { p_empresa: ctx.empresa.id, p_contenido: cid, p_persona: pid, p_aprobado: aprobado, p_nota: nota, p_quitar_visto: quitar });
    if (error) throw new Error(error.message);
    ctx.refrescar();
  };
  const rutas = rutasDe(pid);
  return el('section', { class: 'listado' },
    volver,
    el('h1', {}, propio ? 'Mi avance' : p?.nombre ?? 'Trabajador'),
    p?.cargo ? el('p', { class: 'texto-suave' }, p.cargo) : null,
    rutas.length ? null : el('p', { class: 'texto-suave' }, propio ? 'No tienes rutas asignadas.' : 'No tiene rutas asignadas.'),
    ...rutas.map((r) => {
      const items = itemsDe(r.id);
      const vistos = items.filter((i) => d.avance.get(`${i.contenido_id}|${pid}`)?.visto_at).length;
      const aprob = items.filter((i) => d.avance.get(`${i.contenido_id}|${pid}`)?.aprobado).length;
      return el('div', { class: 'cap-bloque' },
        el('div', { class: 'cap-quienes-cabecera' }, el('h2', {}, r.nombre), items.length ? barraAvance(vistos, aprob, items.length) : null),
        el('ol', { class: 'cap-caja cap-lista' }, items.map((i, n) => {
          const c = d.contenidoDe.get(i.contenido_id);
          const a = d.avance.get(`${c.id}|${pid}`);
          const est = estadoDe(a);
          return el('li', { class: 'cap-lista-fila' },
            el('span', { class: 'cap-num' }, String(n + 1)),
            icono(ICONO_TIPO[c.tipo], { tam: 18 }),
            el('a', { class: 'cap-lista-texto', href: ctx.ruta('capacitaciones.contenido', { id: c.id }) }, el('strong', {}, c.titulo),
              el('span', { class: 'texto-suave texto-chico' }, [a?.visto_at ? `Visto el ${fechaLarga(diaLocal(a.visto_at))}` : '', a?.nota ?? ''].filter(Boolean).join(' · '))),
            el('span', { class: `chip ${CHIP[est]}` }, est),
            puedeEval ? el('div', { class: 'cap-botones' },
              a?.aprobado !== true ? boton('Aprobar', { icono: 'check', class: 'boton boton-secundario boton-chico', onclick: (ev) => conCarga(ev, () => evaluar(c.id, true)) }) : null,
              a?.aprobado !== false ? boton('No aprobado', { icono: 'cerrar', class: 'boton boton-secundario boton-chico', onclick: () => abrirFormulario({
                titulo: 'No aprobado', campos: [{ id: 'nota', etiqueta: 'Qué le faltó (opcional)', tipo: 'textarea', filas: 2 }], alGuardar: (v) => evaluar(c.id, false, v.nota) }) }) : null,
              a ? boton('', { icono: 'deshacer', class: 'boton-icono', title: 'Quitar visto y evaluación', 'aria-label': 'Quitar visto y evaluación', onclick: (ev) => conCarga(ev, () => evaluar(c.id, null, null, true)) }) : null) : null);
        })));
    }));
}
