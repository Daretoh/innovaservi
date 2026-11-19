// Proyectos → Modelo SketchUp: el modelo completo en 3D (recintos para mostrar u ocultar, clic para ver qué es y
// agregarlo, medir con dos clics) y, plegada, la lista del inventario por recinto (o por grupo del modelo, o todo
// sumado). Los conjuntos se despliegan con sus piezas y lo que no tiene conjunto va en "Sueltos". Cada fila tiene 3D y
// "Agregar", que crea una partida ligada a ese objeto. Aquí se sube la exportación de SketchUp y el respaldo del prototipo.
// Ruta: #/proyectos.modelo?p=<proyecto>
import { el } from '../../../core/ui/dom.js?v=75c4885';
import { icono } from '../../../core/ui/iconos.js?v=75c4885';
import { boton } from '../../../core/ui/tabla.js?v=75c4885';
import {
  plegado, cargarTodo, cargarEstilos, selectorProyecto, llave2, mapasInv, medTxt, zonasDe, fichaPartida, subirExportacion, traerRespaldo, guardarProyecto,
} from '../datos.js?v=75c4885';
import { avisar } from '../../../core/ui/aviso.js?v=75c4885';
import { ventana3d, olvidarMallas, vistaModelo } from '../visor3d.js?v=75c4885';
import { conectarSketchup } from '../sketchup.js?v=75c4885';

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
    d.proyecto && ctx.puede('proyectos', 'editar') ? boton('Conectar SketchUp', { icono: 'enlace', tipo: 'primario', onclick: () => conectarSketchup(ctx, d) }) : null,
    puedeCrear ? boton('Subir archivos', { icono: 'descargar', title: 'Subir a mano el inventario y la carpeta de mallas del exportador antiguo', onclick: () => subirExportacion(ctx, d, (m) => { olvidarMallas(m.id); ctx.refrescar(); }) }) : null,
    puedeCrear ? boton('Traer respaldo del prototipo', { icono: 'carpeta', onclick: () => traerRespaldo(ctx, d, () => ctx.refrescar()) }) : null,
  ];
  const cabecera = el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Modelo SketchUp'), el('div', { class: 'listado-acciones' }, acciones));
  const base = (contenido) => el('section', { class: 'listado pro' }, cabecera, d.proyecto ? selectorProyecto(ctx, d, 'proyectos.modelo') : null, contenido);
  const instrucciones = (titulo) => el('div', { class: 'pro-instr' }, el('b', {}, titulo),
    el('p', {}, 'Para traer el modelo: aprieta "Conectar SketchUp", descarga el script y córrelo en SketchUp con el modelo abierto. Envía el inventario y los muebles en 3D directo a este proyecto; las veces siguientes basta con Extensiones → Enviar a ISgestión.'),
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
      alGuardar: (f) => { d.partidas.push(f); sumar(f.clave); sumar(`~${llave2(f.clave)}`); dibujar(); mostrarFicha(it); },
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
  // ---- Vista 3D del modelo completo
  const visor = el('div', { class: 'pro-m3-visor' }, el('div', { class: 'pro-v3-msg' }, 'Cargando el modelo en 3D…'));
  const lado = el('aside', { class: 'pro-m3-lado' });
  const ficha = el('div', { class: 'pro-m3-ficha texto-suave' }, 'Haz clic en un objeto para ver qué es.');
  const medida = el('span', { class: 'pro-m3-medida' });
  let ctl = null;
  const medir = el('input', { type: 'checkbox' });
  medir.addEventListener('change', () => { ctl?.medir(medir.checked); medida.textContent = medir.checked ? 'Haz clic en dos puntos del modelo.' : ''; });
  const aristasChk = el('input', { type: 'checkbox' });
  aristasChk.addEventListener('change', () => ctl?.aristas(aristasChk.checked));
  const coma = (n) => String(n).replace('.', ',');
  // Recorrer: caminar por dentro del modelo (W A S D, mirar arrastrando, doble clic para ir a un punto)
  const ayudaRecorrido = el('div', { class: 'pro-m3-ayuda', hidden: true },
    el('b', {}, 'Recorrido: '), 'W A S D o flechas para caminar · arrastra para mirar · Q / E bajar y subir · Shift más rápido · rueda avanza · doble clic para ir a ese punto');
  const ayudaOrbita = el('div', { class: 'pro-m3-ayuda' }, 'Arrastra para girar · clic derecho para desplazar · rueda para acercar · doble clic para centrar ahí · "Recorrer" para caminar por dentro');
  const recorrer = boton('Recorrer', { icono: 'play', class: 'boton boton-secundario boton-chico', 'aria-pressed': 'false', onclick: () => {
    const on = recorrer.getAttribute('aria-pressed') !== 'true';
    recorrer.setAttribute('aria-pressed', String(on)); recorrer.classList.toggle('boton-primario', on); recorrer.classList.toggle('boton-secundario', !on);
    ayudaRecorrido.hidden = !on; ayudaOrbita.hidden = on;
    ctl?.recorrer(on);
    if (on) visor.querySelector('canvas')?.focus();
  } });
  const barra = el('div', { class: 'pro-m3-barra' },
    ['iso', 'frente', 'lado', 'arriba'].map((m, i) => boton(['3D', 'Frente', 'Lado', 'Arriba'][i], { class: 'boton boton-secundario boton-chico', onclick: () => {
      if (recorrer.getAttribute('aria-pressed') === 'true') recorrer.click();
      ctl?.camara(m);
    } })),
    recorrer,
    el('label', { class: 'casilla pro-m3-medir' }, medir, 'Medir'),
    el('label', { class: 'casilla' }, aristasChk, 'Aristas'), medida);
  function mostrarFicha(it) {
    if (!it) { ficha.replaceChildren('Haz clic en un objeto para ver qué es.'); ficha.className = 'pro-m3-ficha texto-suave'; return; }
    const n = ya(it);
    ficha.className = 'pro-m3-ficha';
    ficha.replaceChildren(el('b', {}, it.nombre),
      el('div', { class: 'texto-suave texto-chico' }, [TIPO[it.tipo] || it.tipo, medTxt(it.medidas_cm), it.recinto, `${it.cant} en el modelo`].filter(Boolean).join(' · ')),
      it.material ? el('div', { class: 'texto-suave texto-chico' }, it.material) : null,
      el('div', { class: 'pro-pv-acc' },
        n ? el('span', { class: 'chip chip-ok' }, `En la cotización${n > 1 ? ` (${n})` : ''}`)
          : puedeCrear ? boton('Agregar a la cotización', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => agregar(it) }) : null,
        it.m3d ? boton('Ver el mueble', { icono: 'caja', class: 'boton boton-secundario boton-chico', onclick: () => ventana3d(ctx, it.nombre, { modeloId: d.modelo.id, m3d: it.m3d }) }) : null));
  }
  const tres = el('section', { class: 'pro-m3' }, lado, el('div', { class: 'pro-m3-centro' }, barra, ayudaOrbita, ayudaRecorrido, visor, ficha));
  const mensaje = (t) => visor.querySelector('.pro-v3-msg')?.replaceChildren(t);
  (async () => {
    try {
      ctl = await vistaModelo(ctx, visor, {
        modeloId: d.modelo.id, inv: I, alElegir: mostrarFicha, alProgreso: mensaje,
        alMedida: (m) => { medida.textContent = m ? `${coma(m.total)} cm  (ancho ${coma(m.x)} · fondo ${coma(m.y)} · alto ${coma(m.z)})` : 'Ahora el segundo punto.'; },
      });
      if (ctl.sinPosiciones) {
        mensaje('Este modelo se exportó antes de que se guardara dónde está cada objeto. Envíalo de nuevo desde SketchUp con "Conectar SketchUp" para verlo completo en 3D.');
        barra.hidden = true; ficha.hidden = true; ayudaOrbita.hidden = true; lado.hidden = true; tres.classList.add('sin-lado');
        return;
      }
      visor.querySelector('.pro-v3-msg')?.remove();
      const marcar = (on) => () => { lado.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = on; ctl.mostrar(c.value, on); }); };
      lado.replaceChildren(el('div', { class: 'pro-m3-lado-cab' }, el('b', {}, 'Recintos'),
        el('span', { class: 'texto-chico' }, el('button', { type: 'button', class: 'pro-enlace', onclick: marcar(true) }, 'Todos'), ' · ',
          el('button', { type: 'button', class: 'pro-enlace', onclick: marcar(false) }, 'Ninguno'))),
        ...ctl.recintos.map((r) => {
          const c = el('input', { type: 'checkbox', value: r.nombre, checked: true });
          c.addEventListener('change', () => ctl.mostrar(r.nombre, c.checked));
          return el('label', { class: 'casilla pro-m3-recinto' }, c, el('span', {}, r.nombre), el('span', { class: 'texto-suave texto-chico' }, r.n));
        }));
    } catch (e) { mensaje(`No se pudo mostrar el modelo: ${e.message}`); }
  })();

  // ---- Lista del inventario (plegada)
  const lista = el('div', { class: 'pro-m3-lista', hidden: true });
  const verLista = boton('Ver lista del inventario', { icono: 'lista', onclick: () => {
    lista.hidden = !lista.hidden;
    verLista.lastChild.textContent = lista.hidden ? 'Ver lista del inventario' : 'Ocultar lista';
    if (!lista.hidden) dibujar();
  } });
  lista.append(el('div', { class: 'listado-acciones pro-herr' }, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador),
    sel('agrupar', 'Agrupar', [['recinto', 'Por recinto'], ['grupo', 'Por grupo del modelo'], ['todo', 'Todo sumado']]),
    sel('recinto', 'Recinto', [['', 'Todos los recintos'], ...recintos.map((r) => [r, r])]),
    sel('tipo', 'Tipo', [['', 'Muebles, conjuntos y piezas'], ['componente', 'Solo componentes (muebles)'], ['conjunto', 'Solo conjuntos'], ['pieza', 'Solo piezas']]),
    el('label', { class: 'casilla' }, falta, 'Solo lo que no está cotizado')), cuerpo);
  return base(el('div', { class: 'pro-m3-todo' },
    el('p', { class: 'texto-suave pro-info-modelo' }, `${d.modelo.nombre} · enviado el ${I.fecha || d.modelo.fecha || '-'} · ${I.items.length} tipos de objetos`),
    tres, el('div', {}, verLista), lista));
}
