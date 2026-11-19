// Proyectos → Modelo SketchUp: inventario del modelo ligado al proyecto, por recinto (o por grupo del modelo, o todo
// sumado). Los conjuntos se despliegan con sus piezas y lo que no tiene conjunto va en "Sueltos". Cada fila tiene 3D y
// "Agregar", que crea una partida ligada a ese objeto. Aquí se sube la exportación de SketchUp y el respaldo del prototipo.
// Ruta: #/proyectos.modelo?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=9619ac3';
import { icono } from '../../../core/ui/iconos.js?v=9619ac3';
import { boton } from '../../../core/ui/tabla.js?v=9619ac3';
import {
  plegado, cargarTodo, cargarEstilos, selectorProyecto, llave2, mapasInv, medTxt, zonasDe, fichaPartida, subirExportacion, traerRespaldo, guardarProyecto,
} from '../datos.js?v=9619ac3';
import { avisar } from '../../../core/ui/aviso.js?v=9619ac3';
import { ventana3d, olvidarMallas } from '../visor3d.js?v=9619ac3';

const filtro = { texto: '', agrupar: 'recinto', recinto: '', tipo: '', falta: false };
const TIPO = { componente: 'Mueble', conjunto: 'Conjunto', pieza: 'Pieza' };

export default async function vista(ctx) {
  cargarEstilos();
  const d = await cargarTodo(ctx);
  const pl = plegado(ctx);
  const I = d.inventario;
  const mp = mapasInv(I);
  const cuerpo = el('div', { class: 'pro-lista' });
  const puedeCrear = ctx.puede('proyectos', 'crear');

  const acciones = [
    puedeCrear ? boton('Subir exportación', { icono: 'descargar', tipo: 'primario', onclick: () => subirExportacion(ctx, d, (m) => { olvidarMallas(m.id); ctx.refrescar(); }) }) : null,
    puedeCrear ? boton('Traer respaldo del prototipo', { icono: 'carpeta', onclick: () => traerRespaldo(ctx, d, () => ctx.refrescar()) }) : null,
  ];
  const cabecera = el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Modelo SketchUp'), el('div', { class: 'listado-acciones' }, acciones));
  const base = (contenido) => el('section', { class: 'listado pro' }, cabecera, d.proyecto ? selectorProyecto(ctx, d, 'proyectos.modelo') : null, contenido);
  const instrucciones = (titulo) => el('div', { class: 'pro-instr' }, el('b', {}, titulo),
    el('p', {}, 'Abre el modelo en SketchUp y en la Consola de Ruby pega:'),
    el('code', {}, "load 'C:/Users/Acer/Documents/COTIZADOR PROYECTOS/exportar_al_cotizador.rb'"),
    el('p', {}, 'Después usa "Subir exportación" y elige el inventario_<id>.json y la carpeta modelos3d_<id>. Si el proyecto se llama igual que el modelo, queda ligado solo; si no, elígelo en "Modelo SketchUp", arriba de la hoja Proyecto.'),
    d.modelos.length ? el('p', { class: 'texto-suave' }, 'Modelos subidos:') : null,
    d.modelos.length ? el('div', { class: 'listado-acciones' }, d.modelos.map((m) => (d.proyecto && ctx.puede('proyectos', 'editar') && m.id !== d.modelo?.id
      ? boton(`Ligar a ${m.nombre}${m.fecha ? ` (${m.fecha})` : ''}`, { icono: 'enlace', onclick: async () => {
        try { await guardarProyecto(ctx, d.proyecto, { modelo_id: m.id, sin_modelo: false }); avisar(`Proyecto ligado a ${m.nombre}`); ctx.refrescar(); } catch (e) { avisar(e.message, 'error'); }
      } })
      : el('span', { class: 'chip' }, `${m.nombre}${m.fecha ? ` (${m.fecha})` : ''}`)))) : null);

  if (!d.proyecto) return base(instrucciones('Aún no hay proyectos.'));
  if (!I) return base(instrucciones(d.modelo ? 'El modelo ligado todavía no tiene su inventario subido.' : d.proyecto.sin_modelo ? 'Este proyecto está marcado "Sin modelo".' : 'Este proyecto todavía no está ligado a un modelo.'));

  // Qué objetos ya están en la cotización
  const enCotiz = new Map();
  const sumar = (k) => enCotiz.set(k, (enCotiz.get(k) || 0) + 1);
  for (const x of d.partidas) { if (x.clave) { sumar(x.clave); sumar(`~${llave2(x.clave)}`); } if (x.modelo) sumar(`n:${x.modelo}`); }
  const ya = (i) => enCotiz.get(i.clave) || enCotiz.get(`~${llave2(i.clave)}`) || (i.tipo !== 'pieza' && enCotiz.get(`n:${i.nombre}`)) || 0;

  function agregar(it) {
    const zonas = zonasDe(d.proyecto, d.partidas);
    const rec = it.recinto.toLowerCase();
    const todo = filtro.agrupar === 'todo';
    fichaPartida(ctx, d, null, {
      prellenado: {
        item: it.nombre, detalle: `${medTxt(it.medidas_cm)}${it.padre ? ` · en ${it.padre}` : ''}`,
        zona: zonas.find((z) => z.toLowerCase().includes(rec.split(' - ')[0]) || rec.includes(z.toLowerCase().split(' - ')[0])) || it.recinto,
        grupo: it.tipo === 'pieza' ? (it.padre || it.grupo_modelo) : (it.grupo_modelo || ''),
        categoria: it.tipo === 'pieza' ? 'Material' : 'Mueble', estado: 'por_cotizar', fuente: 'modelo',
        cantidad: todo ? (mp.m2.get(llave2(it.clave)) || it.cant) : it.cant, unidad: 'un', clave: todo ? `~|${llave2(it.clave)}` : it.clave,
      },
      alGuardar: (f) => { d.partidas.push(f); sumar(f.clave); sumar(`~${llave2(f.clave)}`); dibujar(); },
    });
  }

  function filaModelo(i, hijo, nHijos, kc) {
    const metros = i.tipo === 'pieza' ? Math.round(i.cant * (i.medidas_cm?.[0] || 0) / 10) / 10 : null;
    const n = ya(i);
    const sub = [i.padre && !hijo ? `en ${i.padre}` : '', i.grupo_modelo && i.grupo_modelo !== i.padre ? i.grupo_modelo : ''].filter(Boolean).join(' · ');
    const abre = nHijos ? { tabindex: 0, 'aria-expanded': String(pl.abierto(kc)), onclick: (ev) => { if (ev.target.closest('button')) return; pl.alternar(kc); dibujar(); },
      onkeydown: (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === ev.currentTarget) { ev.preventDefault(); pl.alternar(kc); dibujar(); } } } : {};
    return el('tr', { class: [nHijos ? 'pro-plegable' : '', hijo ? 'pro-hijo' : ''].join(' ').trim() || null, ...abre },
      el('td', {}, nHijos
        ? el('span', { class: 'pro-conj' }, icono('derecha', { tam: 12, clase: `icono pro-chev${pl.abierto(kc) ? ' abierto' : ''}` }), el('b', {}, i.nombre), el('span', { class: 'texto-suave texto-chico' }, ` ${nHijos} tipos de piezas`))
        : el('div', { class: 'pro-item' }, i.nombre), sub ? el('div', { class: 'det' }, sub) : null),
      el('td', {}, el('span', { class: `chip pro-tipo-${i.tipo}` }, TIPO[i.tipo] || i.tipo)),
      el('td', { class: 'det' }, medTxt(i.medidas_cm)),
      el('td', { class: 'num' }, i.cant),
      el('td', { class: 'num' }, metros !== null ? `${String(metros).replace('.', ',')} m` : ''),
      el('td', { class: 'det' }, i.material || ''),
      el('td', { class: 'pro-acc-l' },
        i.m3d ? boton('3D', { icono: 'caja', class: 'boton boton-secundario boton-chico', onclick: () => ventana3d(ctx, i.nombre, { modeloId: d.modelo.id, m3d: i.m3d }) }) : null,
        n ? el('span', { class: 'chip chip-ok' }, `En la cotización${n > 1 ? ` (${n})` : ''}`)
          : puedeCrear ? boton('Agregar', { class: 'boton boton-secundario boton-chico', onclick: () => agregar(i) }) : null));
  }

  function dibujar() {
    let items = I.items;
    if (filtro.agrupar === 'todo') {   // suma lo mismo de todos los recintos
      const m = new Map();
      for (const i of items) { const k2 = llave2(i.clave); const t = m.get(k2); if (t) t.cant += i.cant; else m.set(k2, { ...i, recinto: 'Todo el modelo' }); }
      items = [...m.values()];
    }
    const secDe = (i) => (filtro.agrupar === 'grupo' ? (i.grupo_modelo || 'Sin grupo') : i.recinto);
    const q = filtro.texto.trim().toLowerCase();
    const forzar = !!q;
    const pasa = (i) => (!filtro.recinto || i.recinto === filtro.recinto || filtro.agrupar === 'todo') && (!filtro.tipo || i.tipo === filtro.tipo)
      && (!filtro.falta || !ya(i)) && (!q || [i.nombre, i.padre, i.grupo_modelo, i.material, i.etiqueta].join(' ').toLowerCase().includes(q));
    const secciones = [...new Set(items.map(secDe))].sort((a, b) => a.localeCompare(b, 'es'));
    const cab = el('thead', {}, el('tr', {}, ['Objeto', 'Tipo', 'Medidas', 'Cantidad', 'Metros lineales', 'Material', ''].map((t, i) => el('th', { class: [3, 4].includes(i) ? 'num' : null }, t))));
    const html = secciones.map((s) => {
      const todos = items.filter((i) => secDe(i) === s);
      const fs = todos.filter(pasa);
      if (!fs.length) return null;
      const unidades = fs.filter((i) => i.tipo !== 'conjunto').reduce((t, i) => t + i.cant, 0);
      const ks = `msec:${d.proyecto.id}:${filtro.agrupar}:${s}`; const ab = forzar || pl.abierto(ks);
      let filas = [];
      if (ab) {
        const conjuntos = todos.filter((i) => i.tipo === 'conjunto');
        const nombresConj = new Set(conjuntos.map((c) => c.nombre));
        for (const c of conjuntos) {
          const hs = fs.filter((i) => i.padre === c.nombre && i.clave !== c.clave);
          if (!pasa(c) && !hs.length) continue;
          const kc = `conj:${d.proyecto.id}:${filtro.agrupar}:${c.clave}`;
          filas.push(filaModelo(c, false, hs.length, kc));
          if (forzar || pl.abierto(kc)) filas.push(...hs.filter((h) => h.tipo !== 'conjunto').map((h) => filaModelo(h, true)));
        }
        const sueltos = fs.filter((i) => i.tipo !== 'conjunto' && !nombresConj.has(i.padre));
        if (sueltos.length) {
          const ku = `conj:${d.proyecto.id}:${filtro.agrupar}:${s}:sueltos`; const abu = forzar || pl.abierto(ku) || !conjuntos.length;
          filas.push(el('tr', { class: 'pro-grupo-row', tabindex: 0, 'aria-expanded': String(abu), onclick: () => { pl.alternar(ku); dibujar(); } },
            el('td', { colspan: 7 }, icono('derecha', { tam: 12, clase: `icono pro-chev${abu ? ' abierto' : ''}` }), ' Sueltos (sin conjunto) ', el('span', { class: 'texto-suave' }, `(${sueltos.length})`))));
          if (abu) filas = filas.concat(sueltos.map((i) => filaModelo(i, true)));
        }
      }
      return el('section', { class: `pro-zona${ab ? ' abierta' : ''}` },
        el('div', { class: 'pro-zona-h', role: 'button', tabindex: 0, 'aria-expanded': String(ab), onclick: () => { pl.alternar(ks); dibujar(); }, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pl.alternar(ks); dibujar(); } } },
          el('h2', {}, icono('derecha', { tam: 14, clase: 'icono pro-chev' }), s, el('span', { class: 'texto-suave texto-chico' }, `${fs.length} tipos · ${unidades} unidades`))),
        ab ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla pro-tabla-l' }, cab.cloneNode(true), el('tbody', {}, filas))) : null);
    }).filter(Boolean);
    cuerpo.replaceChildren(...(html.length ? html : [el('div', { class: 'pro-vacio' }, icono('buscar', { tam: 26 }), 'Nada del modelo coincide con el filtro.')]));
  }

  const sel = (clave, etiqueta, opciones) => {
    const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v, selected: v === filtro[clave] }, t)));
    s.addEventListener('change', () => { filtro[clave] = s.value; dibujar(); });
    return s;
  };
  const recintos = [...new Set(I.items.map((i) => i.recinto))].sort((a, b) => a.localeCompare(b, 'es'));
  if (!recintos.includes(filtro.recinto)) filtro.recinto = '';
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar en el modelo', 'aria-label': 'Buscar en el modelo', value: filtro.texto });
  buscador.addEventListener('input', () => { filtro.texto = buscador.value; dibujar(); });
  const falta = el('input', { type: 'checkbox', checked: filtro.falta });
  falta.addEventListener('change', () => { filtro.falta = falta.checked; dibujar(); });
  dibujar();
  return base(el('div', {},
    el('p', { class: 'texto-suave pro-info-modelo' }, `${d.modelo.nombre} · exportado el ${I.fecha || d.modelo.fecha || '-'} · ${I.items.length} tipos de objetos`),
    el('div', { class: 'listado-acciones pro-herr' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador),
      sel('agrupar', 'Agrupar', [['recinto', 'Por recinto'], ['grupo', 'Por grupo del modelo'], ['todo', 'Todo sumado']]),
      sel('recinto', 'Recinto', [['', 'Todos los recintos'], ...recintos.map((r) => [r, r])]),
      sel('tipo', 'Tipo', [['', 'Muebles, conjuntos y piezas'], ['componente', 'Solo componentes (muebles)'], ['conjunto', 'Solo conjuntos'], ['pieza', 'Solo piezas']]),
      el('label', { class: 'casilla' }, falta, 'Solo lo que no está cotizado')),
    cuerpo));
}

