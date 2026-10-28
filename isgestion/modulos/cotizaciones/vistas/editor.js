// Editor de una cotización: cliente, datos, grupos (vehículos) con líneas y secciones, costos internos,
// totales y acciones (PDF, enviar, aceptar, rechazar, reabrir, duplicar, dividir, pasar a orden de trabajo).
// Las líneas se editan como planilla: Enter y flechas, pegar desde Excel y arrastrar filas o secciones.
// Ruta: #/cotizaciones.editor?id=<id>
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { abrirFormulario } from '../../../core/ui/modal.js?v=b8da9fc';
import { avisar } from '../../../core/ui/aviso.js?v=b8da9fc';
import { dinero, fechaLarga } from '../../../core/ui/formato.js?v=b8da9fc';
import {
  nombreEstado, CHIP_ESTADO, TALLAS, totales, totalLinea, costoLinea, numeroTexto, nombreTercero, verPatente, normalizarPatente,
  cargarCotizacion, cargarCatalogo, datosCliente,
} from '../datos.js?v=b8da9fc';
import { duplicar, dividir, pasarAOrden } from '../acciones.js?v=b8da9fc';
import { avance } from '../../taller/seguimiento.js?v=b8da9fc';
import { nombreEstado as estadoOrden } from '../../taller/datos.js?v=b8da9fc';

// Celda a enfocar después de recargar (ej.: la línea recién creada)
let foco = null;
// Número escrito en Chile o copiado de Excel: "$ 12.990", "1,5", "10 %" → número (null si no es)
function aNumero(s) {
  let x = String(s).replace(/[$%\s]/g, '');
  if (!x) return null;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default async function vista(ctx) {
  const c = await cargarCotizacion(ctx, ctx.params.id);
  const volver = el('a', { class: 'volver', href: ctx.ruta('cotizaciones.lista') }, icono('volver', { tam: 16 }), 'Cotizaciones');
  if (!c || c.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Cotización no encontrada'));
  const [catalogo, clientes] = await Promise.all([
    cargarCatalogo(ctx, c.tercero_id),
    ctx.api.from('terceros').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
  ]);
  const editable = c.estado === 'borrador' && ctx.puede('cotizaciones', 'editar');
  const conTaller = ctx.puede('taller', 'ver');
  const grupos = c.cot_grupos;
  const lineas = c.cot_lineas;

  // Avance desde el taller (como el OS): la orden ligada a cada grupo y el ítem en verde si su trabajo está hecho
  const idsOrden = grupos.map((g) => g.orden_id).filter(Boolean);
  const [ords, svs] = conTaller && idsOrden.length ? await Promise.all([
    ctx.api.from('tal_ordenes').select('id, numero, estado, tareas').in('id', idsOrden),
    ctx.api.from('tal_servicios').select('nombre, tareas').eq('empresa_id', ctx.empresa.id),
  ]) : [{ data: [] }, { data: [] }];
  const ordenDe = new Map((ords.data ?? []).map((o) => [o.id, o]));
  const tareasDe = new Map((svs.data ?? []).map((x) => [x.nombre.trim().toLowerCase(), x.tareas ?? []]));
  const hecho = (g, l) => {
    const o = ordenDe.get(g.orden_id); if (!o || l.tipo === 'seccion') return false;
    if (['terminado', 'entregado'].includes(o.estado)) return true;
    const suyas = tareasDe.get((l.descripcion ?? '').trim().toLowerCase()) ?? [];
    return o.estado === 'proceso' && suyas.length > 0 && suyas.every((t) => o.tareas.some((x) => x.t === t && x.ok));
  };
  const ligadas = [...ordenDe.values()];
  const avanceTotal = ligadas.length ? Math.round(ligadas.reduce((a, o) => a + avance(o), 0) / ligadas.length) : null;
  const barraAvance = (p, texto) => el('div', { class: 'cot-avance' }, el('span', { class: 'seg-barra' }, el('i', { style: `width:${p}%` })), el('span', { class: 'texto-chico' }, texto));

  // ---- Totales (se actualizan en pantalla sin recargar)
  const caja = {};
  const pintarTotales = () => {
    const t = totales(c, grupos, lineas);
    for (const g of grupos) if (caja[`g-${g.id}`]) caja[`g-${g.id}`].textContent = dinero(t.porGrupo.get(g.id) ?? 0);
    caja.sub.textContent = dinero(t.sub);
    caja.desc.textContent = `− ${dinero(t.desc)}`;
    caja.neto.textContent = dinero(t.neto);
    caja.iva.textContent = dinero(t.iva);
    caja.filaIva.hidden = !c.con_iva;
    caja.total.textContent = dinero(t.total);
    caja.costo.textContent = dinero(t.costo);
    caja.margen.textContent = `${dinero(t.margen)}${t.neto ? ` (${Math.round((t.margen / t.neto) * 100)} %)` : ''}`;
    caja.margen.classList.toggle('texto-error', t.margen < 0);
  };

  const guardarCot = async (cambios, aviso = null) => {
    const { error } = await ctx.api.from('cot_cotizaciones').update(cambios).eq('id', c.id);
    if (error) { avisar(error.message, 'error'); return false; }
    Object.assign(c, cambios); if (aviso) avisar(aviso); return true;
  };
  const campoCot = (id, etiqueta, { tipo = 'text', refrescar = false } = {}) => {
    const ctl = tipo === 'checkbox'
      ? el('input', { type: 'checkbox', id: `c-${id}`, checked: !!c[id], disabled: !editable })
      : tipo === 'textarea'
        ? Object.assign(el('textarea', { class: 'campo', id: `c-${id}`, rows: 2, disabled: !(ctx.puede('cotizaciones', 'editar')) }), { value: c[id] ?? '' })
        : el('input', { class: 'campo', id: `c-${id}`, type: tipo, value: c[id] ?? '', disabled: !editable, min: tipo === 'number' ? 0 : null });
    ctl.addEventListener('change', async () => {
      let v = tipo === 'checkbox' ? ctl.checked : ctl.value.trim();
      if (tipo === 'number') v = Math.max(0, Number(v) || 0);
      else if (v === '') v = null;
      if (await guardarCot({ [id]: v })) { if (refrescar) ctx.refrescar(); else pintarTotales(); }
    });
    if (tipo === 'checkbox') return el('label', { class: 'casilla' }, ctl, etiqueta);
    return el('div', { class: 'form-fila' }, el('label', { for: `c-${id}` }, etiqueta), ctl);
  };

  // Validez con atajos de 7, 15 y 30 días (como el OS)
  const campoValidez = () => {
    const nodo = campoCot('validez_dias', 'Validez (días)', { tipo: 'number' });
    const ctl = nodo.querySelector('input');
    if (editable) nodo.append(el('div', { class: 'segmento segmento-chico', role: 'group', 'aria-label': 'Vigencia' }, [7, 15, 30].map((d) => el('button', {
      type: 'button', 'aria-pressed': String(Number(c.validez_dias) === d), onclick: async (ev) => {
        const b = ev.currentTarget;
        if (!(await guardarCot({ validez_dias: d }))) return;
        ctl.value = d; b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      } }, `${d} días`))));
    return nodo;
  };

  // ---- Cliente
  const selCliente = el('select', { class: 'campo', disabled: !editable, 'aria-label': 'Cliente' },
    el('option', { value: '' }, 'Sin cliente del maestro'), (clientes.data ?? []).map((t) => el('option', { value: t.id, selected: t.id === c.tercero_id }, nombreTercero(t))));
  selCliente.addEventListener('change', async () => {
    const t = (clientes.data ?? []).find((x) => x.id === selCliente.value) ?? null;
    if (await guardarCot(datosCliente(t), 'Cliente actualizado.')) ctx.refrescar();
  });

  // ---- Líneas (planilla: Enter y flechas para moverse, pegar desde Excel, arrastrar filas y secciones)
  const datalist = el('datalist', { id: 'cot-catalogo' }, catalogo.nombres.map((n) => el('option', { value: n })));
  const pendientes = new Set();   // guardados en curso: se esperan antes de recargar
  const guardarLinea = (l, cambios) => {
    const p = (async () => {
      const { error } = await ctx.api.from('cot_lineas').update(cambios).eq('id', l.id);
      if (error) { avisar(error.message, 'error'); return false; }
      Object.assign(l, cambios); pintarTotales(); return true;
    })();
    pendientes.add(p); p.finally(() => pendientes.delete(p));
    return p;
  };
  const delGrupo = (g) => lineas.filter((x) => x.grupo_id === g.id);
  // Deja las líneas del grupo en el orden indicado (solo actualiza las que cambian; las que vienen de otro grupo se pasan a este)
  const reordenar = async (g, orden) => {
    await Promise.all(pendientes);
    const cambios = orden.map((l, i) => [l, i + 1]).filter(([l, n]) => l.orden !== n || l.grupo_id !== g.id);
    const res = await Promise.all(cambios.map(([l, n]) => ctx.api.from('cot_lineas').update(l.grupo_id === g.id ? { orden: n } : { orden: n, grupo_id: g.id }).eq('id', l.id)));
    const err = res.find((r) => r.error);
    if (err) avisar(err.error.message, 'error');
    ctx.refrescar();
  };
  // Bloque que se mueve: la línea, o la sección con sus líneas hasta la siguiente sección
  const bloque = (g, l) => {
    const del = delGrupo(g); const i = del.indexOf(l);
    if (l.tipo !== 'seccion') return [l];
    const fin = del.findIndex((x, j) => j > i && x.tipo === 'seccion');
    return del.slice(i, fin < 0 ? del.length : fin);
  };
  // Mueve el bloque de l (del grupo g) junto a destino en el grupo gd (el mismo u otro vehículo);
  // sin destino, al final de gd
  const mover = (g, l, destino, despues, gd = g) => {
    const mov = bloque(g, l);
    if (destino && mov.includes(destino)) return;
    const resto = delGrupo(gd).filter((x) => !mov.includes(x));
    const j = destino ? resto.indexOf(destino) + (despues ? 1 : 0) : resto.length;
    reordenar(gd, [...resto.slice(0, j), ...mov, ...resto.slice(j)]);
  };
  const subirBajar = (g, l, dir) => {
    const del = delGrupo(g); const otra = del[del.indexOf(l) + dir];
    if (otra) mover(g, l, otra, dir > 0);
  };
  const costos = (l, btn) => abrirFormulario({
    titulo: `Costos internos · ${l.descripcion || 'línea'}`,
    mensaje: 'No salen en el PDF. Uno por línea: detalle y monto total (ej.: Material 12000).',
    campos: [{ id: 'costos', etiqueta: 'Costos', tipo: 'textarea', filas: 5, valor: (l.costos ?? []).map((k) => `${k.desc} ${k.monto}`).join('\n') }],
    alGuardar: async (v) => {
      const lista = v.costos.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const m = x.match(/^(.*?)[\s;:$]+([\d.]+)$/); return m ? { desc: m[1].trim(), monto: Number(m[2].replace(/\./g, '')) } : { desc: x, monto: 0 }; });
      if (!(await guardarLinea(l, { costos: lista }))) throw new Error('No se pudo guardar.');
      btn.textContent = costoLinea(l) ? dinero(costoLinea(l)) : 'Costo';
    },
  });
  let arrastre = null;   // { g, l } mientras se arrastra una fila
  const filaLinea = (g, l) => {
    const fila = el('div', { class: `cot-fila${l.tipo === 'seccion' ? ' cot-fila-seccion' : ''}${hecho(g, l) ? ' cot-hecho' : ''}`, 'data-linea': l.id, title: hecho(g, l) ? 'Trabajo hecho en el taller' : null });
    const asa = el('button', { type: 'button', class: 'boton-icono cot-asa', title: l.tipo === 'seccion' ? 'Arrastrar la sección con sus líneas' : 'Arrastrar', 'aria-label': 'Arrastrar' }, icono('arrastrar', { tam: 14 }));
    asa.addEventListener('mousedown', () => { fila.draggable = true; });
    asa.addEventListener('mouseup', () => { fila.draggable = false; });
    fila.addEventListener('dragstart', (ev) => { arrastre = { g, l }; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', l.id); fila.classList.add('cot-arrastrando'); });
    fila.addEventListener('dragend', () => { fila.draggable = false; arrastre = null; fila.classList.remove('cot-arrastrando'); });
    fila.addEventListener('dragover', (ev) => {
      if (!arrastre) return;
      ev.preventDefault(); ev.stopPropagation();
      const r = fila.getBoundingClientRect(); const despues = ev.clientY > r.top + r.height / 2;
      fila.classList.toggle('cot-soltar-antes', !despues); fila.classList.toggle('cot-soltar-despues', despues);
    });
    fila.addEventListener('dragleave', () => fila.classList.remove('cot-soltar-antes', 'cot-soltar-despues'));
    fila.addEventListener('drop', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const despues = fila.classList.contains('cot-soltar-despues');
      fila.classList.remove('cot-soltar-antes', 'cot-soltar-despues');
      if (arrastre && arrastre.l !== l) mover(arrastre.g, arrastre.l, l, despues, g);
    });
    const acciones = editable ? el('span', { class: 'cot-acc' }, asa,
      el('button', { type: 'button', class: 'boton-icono', title: 'Subir', 'aria-label': 'Subir línea', onclick: () => subirBajar(g, l, -1) }, icono('arriba', { tam: 14 })),
      el('button', { type: 'button', class: 'boton-icono', title: 'Bajar', 'aria-label': 'Bajar línea', onclick: () => subirBajar(g, l, 1) }, icono('abajo', { tam: 14 })),
      el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar línea', onclick: async () => {
        await Promise.all(pendientes);
        const { error } = await ctx.api.from('cot_lineas').delete().eq('id', l.id);
        if (error) avisar(error.message, 'error'); else ctx.refrescar();
      } }, icono('cerrar', { tam: 14 }))) : el('span');
    if (l.tipo === 'seccion') {
      const tit = el('input', { class: 'campo cot-seccion', value: l.descripcion, placeholder: 'Título de la sección (ej.: INSTALACIÓN DE PPF)', disabled: !editable, 'data-col': 0, 'aria-label': 'Título de la sección' });
      tit.addEventListener('change', () => guardarLinea(l, { descripcion: tit.value.trim() }));
      fila.append(tit, acciones);
      return fila;
    }
    const desc = el('input', { class: 'campo', value: l.descripcion, list: 'cot-catalogo', placeholder: 'Descripción o servicio', disabled: !editable, 'aria-label': 'Descripción', 'data-col': 0 });
    const cant = el('input', { class: 'campo campo-num', type: 'number', min: 0, step: 'any', value: l.cantidad, disabled: !editable, 'aria-label': 'Cantidad', 'data-col': 1 });
    const precio = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: l.precio, disabled: !editable, 'aria-label': 'Precio', 'data-col': 2 });
    const dpct = el('input', { class: 'campo campo-num', type: 'number', min: 0, max: 100, step: 'any', value: l.desc_pct, disabled: !editable, 'aria-label': 'Descuento %', 'data-col': 3 });
    const tot = el('span', { class: 'cot-total' }, dinero(totalLinea(l)));
    const btnCosto = el('button', { type: 'button', class: `boton boton-secundario boton-chico ${costoLinea(l) ? 'cot-con-costo' : ''}`, disabled: !editable, title: 'Costos internos (no salen en el PDF)' }, costoLinea(l) ? dinero(costoLinea(l)) : 'Costo');
    btnCosto.addEventListener('click', () => costos(l, btnCosto));
    const recalcular = () => { tot.textContent = dinero(totalLinea(l)); };
    desc.addEventListener('change', async () => {
      const cambios = { descripcion: desc.value.trim() };
      const sugerido = catalogo.precio(cambios.descripcion, g.talla);
      if (sugerido != null && !Number(l.precio)) { cambios.precio = sugerido; precio.value = sugerido; }
      if (await guardarLinea(l, cambios)) recalcular();
    });
    for (const [inp, col] of [[cant, 'cantidad'], [precio, 'precio'], [dpct, 'desc_pct']]) {
      inp.addEventListener('change', async () => {
        const v = Math.max(0, Number(inp.value) || 0);
        if (await guardarLinea(l, { [col]: col === 'precio' ? Math.round(v) : Math.min(col === 'desc_pct' ? 100 : Infinity, v) })) recalcular();
      });
    }
    fila.append(desc, cant, precio, dpct, tot, btnCosto, acciones);
    return fila;
  };

  const agregarLinea = async (g, tipo) => {
    await Promise.all(pendientes);
    const max = Math.max(0, ...delGrupo(g).map((x) => x.orden));
    const { data, error } = await ctx.api.from('cot_lineas').insert({ grupo_id: g.id, cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: max + 1, tipo, descripcion: '' }).select('id').single();
    if (error) { avisar(error.message, 'error'); return; }
    foco = { linea: data.id, col: 0 };
    ctx.refrescar();
  };

  // Teclado: Enter baja (en la última fila crea una línea), Mayús+Enter sube; flechas arriba/abajo en
  // cantidades y precios (en la descripción quedan para elegir del catálogo); izquierda/derecha al borde del texto.
  const navegar = (g, hoja) => (ev) => {
    const t = ev.target;
    if (t.dataset?.col == null || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const filas = [...hoja.querySelectorAll('[data-linea]')];
    const fila = t.closest('[data-linea]'); const i = filas.indexOf(fila); const col = Number(t.dataset.col);
    const ir = (f, c) => { const x = f && (f.querySelector(`[data-col="${c}"]`) ?? f.querySelector('[data-col="0"]')); if (x) { x.focus(); x.select?.(); } return !!x; };
    const numero = t.type === 'number';
    const alBorde = (fin) => numero || (fin ? t.selectionStart === t.value.length : t.selectionEnd === 0);
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.shiftKey) { ir(filas[i - 1], col); return; }
      if (!ir(filas[i + 1], col) && editable) { t.blur(); agregarLinea(g, 'item'); }
    } else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (numero || fila.classList.contains('cot-fila-seccion'))) {
      ev.preventDefault();
      ir(filas[i + (ev.key === 'ArrowDown' ? 1 : -1)], col);
    } else if (ev.key === 'ArrowLeft' && col > 0 && alBorde(false)) {
      ev.preventDefault(); ir(fila, col - 1);
    } else if (ev.key === 'ArrowRight' && alBorde(true)) {
      const sig = fila.querySelector(`[data-col="${col + 1}"]`);
      if (sig) { ev.preventDefault(); sig.focus(); sig.select?.(); }
    }
  };

  // Pegar desde Excel (varias celdas): columnas Descripción, Cant., Precio, Desc. % a partir de la celda
  // donde se pega; rellena hacia abajo las líneas existentes (salta secciones) y crea las que falten.
  // Una fila pegada solo con texto en MAYÚSCULAS se crea como sección.
  const pegar = (g) => async (ev) => {
    const t = ev.target;
    if (!editable || t.dataset?.col == null) return;
    const texto = ev.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n]/.test(texto.trim())) return;   // una sola celda: pegado normal
    ev.preventDefault();
    await Promise.all(pendientes);
    const filasPeg = texto.replace(/\r/g, '').split('\n').filter((r) => r.trim()).map((r) => r.split('\t'));
    const col0 = Number(t.dataset.col);
    const del = delGrupo(g);
    const desde = del.findIndex((x) => x.id === t.closest('[data-linea]').dataset.linea);
    const destino = del.slice(desde).filter((x) => x.tipo === 'item');
    const valores = (celdas) => {
      const v = {};
      celdas.forEach((s, k) => {
        const col = col0 + k; const x = s.trim();
        if (col === 0) { if (x) v.descripcion = x; } else if (col <= 3) { const n = aNumero(x); if (n != null) v[['', 'cantidad', 'precio', 'desc_pct'][col]] = col === 2 ? Math.round(n) : col === 3 ? Math.min(100, n) : n; }
      });
      return v;
    };
    const conPrecio = (v, l) => {
      if (v.descripcion && v.precio == null && !Number(l?.precio)) { const p = catalogo.precio(v.descripcion, g.talla); if (p != null) v.precio = p; }
      return v;
    };
    try {
      const updates = []; const nuevas = [];
      const vacia = (l) => !l.descripcion.trim() && !Number(l.precio);
      filasPeg.forEach((celdas, k) => {
        const v = valores(celdas);
        if (!Object.keys(v).length) return;
        const seccion = col0 === 0 && celdas.slice(1).every((x) => !x.trim()) && /\p{L}/u.test(v.descripcion ?? '') && v.descripcion === v.descripcion.toUpperCase();
        if (k < destino.length) { updates.push([destino[k], seccion && vacia(destino[k]) ? { tipo: 'seccion', descripcion: v.descripcion } : conPrecio(v, destino[k])]); return; }
        // todas con las mismas columnas (en una inserción de varias filas, las que faltan quedarían nulas)
        nuevas.push(seccion ? { tipo: 'seccion', descripcion: v.descripcion, cantidad: 1, precio: 0, desc_pct: 0 }
          : { tipo: 'item', descripcion: '', cantidad: 1, precio: 0, desc_pct: 0, ...conPrecio(v) });
      });
      const max = Math.max(0, ...del.map((x) => x.orden));
      const res = await Promise.all([
        ...updates.map(([l, v]) => ctx.api.from('cot_lineas').update(v).eq('id', l.id)),
        nuevas.length ? ctx.api.from('cot_lineas').insert(nuevas.map((n, k) => ({ ...n, grupo_id: g.id, cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: max + k + 1 }))) : null,
      ].filter(Boolean));
      const err = res.find((r) => r.error);
      if (err) throw new Error(err.error.message);
      avisar(`Pegadas ${updates.length + nuevas.length} filas.`);
    } catch (e) { avisar(e.message, 'error'); }
    ctx.refrescar();
  };

  // ---- Grupos
  const tarjetaGrupo = (g, n) => {
    const campoG = (id, etiqueta, opciones) => {
      const ctl = opciones
        ? el('select', { class: 'campo', disabled: !editable, 'aria-label': etiqueta }, opciones.map(([k, t]) => el('option', { value: k, selected: String(g[id] ?? '') === k }, t)))
        : el('input', { class: 'campo', value: id === 'patente' ? verPatente(g.patente) : g[id] ?? '', placeholder: etiqueta, disabled: !editable, 'aria-label': etiqueta, type: id === 'anio' ? 'number' : 'text' });
      ctl.addEventListener('change', async () => {
        let v = ctl.value.trim();
        if (id === 'patente') v = normalizarPatente(v);
        else if (id === 'anio') v = v ? Number(v) : null;
        else if (v === '') v = null;
        const { error } = await ctx.api.from('cot_grupos').update({ [id]: v }).eq('id', g.id);
        if (error) { avisar(error.message, 'error'); return; }
        g[id] = v;
        if (id === 'patente') ctl.value = verPatente(v);
      });
      return ctl;
    };
    const del = delGrupo(g);
    caja[`g-${g.id}`] = el('strong', {}, '');
    const hoja = el('div', { class: 'cot-hoja' }, del.length ? del.map((l) => filaLinea(g, l)) : el('p', { class: 'texto-suave' }, 'Sin líneas.'));
    hoja.addEventListener('keydown', navegar(g, hoja));
    hoja.addEventListener('paste', pegar(g));
    // Soltar en el vehículo (fuera de una fila, o si no tiene líneas): al final de sus líneas
    hoja.addEventListener('dragover', (ev) => { if (arrastre) { ev.preventDefault(); hoja.classList.add('cot-soltar-hoja'); } });
    hoja.addEventListener('dragleave', (ev) => { if (!hoja.contains(ev.relatedTarget)) hoja.classList.remove('cot-soltar-hoja'); });
    hoja.addEventListener('drop', (ev) => { ev.preventDefault(); hoja.classList.remove('cot-soltar-hoja'); if (arrastre) mover(arrastre.g, arrastre.l, null, true, g); });
    return el('div', { class: 'ficha doc-grupo cot-grupo' },
      el('div', { class: 'cot-grupo-cab' },
        el('strong', {}, `${n}.`),
        campoG('titulo', conTaller ? 'Vehículo (marca y modelo)' : 'Título del grupo'),
        conTaller ? campoG('patente', 'Patente') : null,
        conTaller ? campoG('anio', 'Año') : null,
        conTaller ? campoG('talla', 'Talla', [['', 'Talla'], ...TALLAS.map((t) => [t, t])]) : null,
        editable && grupos.length > 1 ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar grupo', 'aria-label': 'Quitar grupo', onclick: async () => {
          const { error } = await ctx.api.from('cot_grupos').delete().eq('id', g.id);
          if (error) avisar(error.message, 'error'); else ctx.refrescar();
        } }, icono('basura', { tam: 16 })) : null),
      g.orden_id ? (ordenDe.get(g.orden_id)
        ? barraAvance(avance(ordenDe.get(g.orden_id)), el('a', { href: ctx.ruta('taller.orden', { id: g.orden_id }) }, `Orden N° ${ordenDe.get(g.orden_id).numero} · ${estadoOrden[ordenDe.get(g.orden_id).estado]} · ${avance(ordenDe.get(g.orden_id))}%`))
        : el('p', { class: 'texto-chico' }, icono('check', { tam: 14 }), ' Ligado a una ', el('a', { href: ctx.ruta('taller.orden', { id: g.orden_id }) }, 'orden de trabajo'))) : null,
      el('div', { class: 'cot-fila cot-fila-cab' }, el('span', {}, 'Descripción'), el('span', {}, 'Cant.'), el('span', {}, 'Precio'), el('span', {}, 'Desc. %'), el('span', {}, 'Total'), el('span', {}, 'Costo'), el('span')),
      hoja,
      el('div', { class: 'listado-cabecera' },
        editable ? el('div', { class: 'listado-acciones' },
          boton('Línea', { icono: 'mas', onclick: () => agregarLinea(g, 'item') }),
          boton('Sección', { icono: 'mas', onclick: () => agregarLinea(g, 'seccion') })) : el('span'),
        el('span', {}, 'Subtotal ', caja[`g-${g.id}`])));
  };

  // ---- Acciones según estado
  const acciones = [boton('Ver PDF', { icono: 'ojo', onclick: (ev) => pdf(ctx, c, ev.currentTarget) })];
  // Como el OS (2026-10-22): siempre queda claro que se está editando esta cotización, y se puede empezar una nueva
  if (ctx.puede('cotizaciones', 'crear')) acciones.push(boton('Nueva cotización', { icono: 'mas', onclick: async () => { const { nueva } = await import('./lista.js?v=b8da9fc'); nueva(ctx); } }));
  const puedeEditar = ctx.puede('cotizaciones', 'editar');
  if (puedeEditar && c.estado === 'borrador') acciones.push(boton('Marcar enviada', { icono: 'check', tipo: 'primario', onclick: () => abrirFormulario({
    titulo: `Enviar cotización N° ${numeroTexto(c.numero)}`, mensaje: 'Queda bloqueada para cambios. Si hay que corregirla, se reabre.', campos: [], textoGuardar: 'Marcar enviada',
    alGuardar: async () => { if (!lineas.some((l) => l.tipo === 'item' && totalLinea(l))) throw new Error('La cotización no tiene líneas con valor.'); if (!(await guardarCot({ estado: 'enviada', enviada_at: new Date().toISOString() }, 'Cotización enviada.'))) throw new Error('No se pudo.'); ctx.refrescar(); },
  }) }));
  if (puedeEditar && c.estado === 'enviada') {
    acciones.push(boton('Aceptada', { icono: 'check', tipo: 'primario', onclick: async () => { if (await guardarCot({ estado: 'aceptada', respondida_at: new Date().toISOString() }, 'Cotización aceptada.')) ctx.refrescar(); } }));
    acciones.push(boton('Rechazada', { icono: 'cerrar', onclick: async () => { if (await guardarCot({ estado: 'rechazada', respondida_at: new Date().toISOString() }, 'Cotización rechazada.')) ctx.refrescar(); } }));
  }
  if (puedeEditar && c.estado === 'aceptada' && conTaller && ctx.puede('taller', 'crear')) acciones.push(boton('Pasar a orden de trabajo', { icono: 'llave', tipo: 'primario', onclick: (ev) => pasarAOrden(ctx, c, ev.currentTarget) }));
  if (puedeEditar && c.estado !== 'borrador') acciones.push(boton('Reabrir', { icono: 'editar', onclick: async () => { if (await guardarCot({ estado: 'borrador', respondida_at: null }, 'Cotización reabierta.')) ctx.refrescar(); } }));
  if (ctx.puede('cotizaciones', 'crear')) acciones.push(boton('Duplicar', { icono: 'copiar', onclick: (ev) => duplicar(ctx, c, ev.currentTarget) }));
  if (ctx.puede('cotizaciones', 'crear') && grupos.length > 1) acciones.push(boton('Dividir por grupo', { onclick: (ev) => dividir(ctx, c, ev.currentTarget) }));
  if (ctx.puede('cotizaciones', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar cotización', mensaje: 'Deja de aparecer en el listado (no se borra; el número no se reutiliza).', campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { if (!(await guardarCot({ deleted_at: new Date().toISOString() }))) throw new Error('No se pudo.'); location.hash = ctx.ruta('cotizaciones.lista'); },
  }) }));

  const filaTot = (k, etiqueta, fuerte = false) => { caja[k] = el(fuerte ? 'strong' : 'span'); return el('div', {}, el(fuerte ? 'strong' : 'span', {}, etiqueta), caja[k]); };
  const resumen = el('div', { class: 'cobro-resumen' },
    filaTot('sub', 'Subtotal'), filaTot('desc', 'Descuento adicional'), filaTot('neto', 'Neto'),
    (caja.filaIva = filaTot('iva', 'IVA 19 %')), el('div', { class: 'cobro-saldo' }, el('strong', {}, 'Total'), (caja.total = el('strong'))),
    el('div', { class: 'texto-suave texto-chico' }, el('span', {}, 'Costo interno'), (caja.costo = el('span'))),
    el('div', { class: 'texto-suave texto-chico' }, el('span', {}, 'Margen'), (caja.margen = el('span'))));

  // De qué cotización nace (copiada o dividida), con enlace
  const origen = c.origen_id ? (await ctx.api.from('cot_cotizaciones').select('id, numero').eq('id', c.origen_id).maybeSingle()).data : null;
  const vista = el('section', { class: 'listado' },
    volver, datalist,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `Cotización N° ${numeroTexto(c.numero)}`),
        el('p', { class: 'texto-suave' }, [c.cliente_nombre, fechaLarga(c.fecha)].filter(Boolean).join(' · '),
          origen ? el('span', {}, ' · nace de la ', el('a', { href: ctx.ruta('cotizaciones.editor', { id: origen.id }) }, `N° ${numeroTexto(origen.numero)}`)) : null)),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${CHIP_ESTADO[c.estado]}` }, nombreEstado[c.estado]), acciones)),
    c.estado !== 'borrador' ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEstado[c.estado]}: bloqueada para cambios. Para corregirla, reábrela.`)
      : el('p', { class: 'aviso-bandeja cot-editando' }, icono('editar', { tam: 16 }), el('strong', {}, `Editando N° ${numeroTexto(c.numero)}`), ' · los cambios se guardan en esta cotización al escribir. Para otra, usa "Nueva cotización".'),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Cliente'),
        el('div', { class: 'form-fila' }, el('label', {}, 'Cliente del maestro'), selCliente),
        campoCot('cliente_nombre', 'Empresa o nombre'),
        el('div', { class: 'rejilla-campos' }, campoCot('cliente_rut', 'RUT'), campoCot('cliente_giro', 'Giro')),
        el('div', { class: 'rejilla-campos' }, campoCot('cliente_contacto', 'Persona de contacto'), campoCot('cliente_telefono', 'Teléfono')),
        campoCot('cliente_correo', 'Correo')),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        el('div', { class: 'rejilla-campos' }, campoCot('fecha', 'Fecha', { tipo: 'date' }), campoCot('fecha_hasta', 'Hasta (si es un período)', { tipo: 'date' })),
        el('div', { class: 'rejilla-campos' }, campoValidez(), campoCot('desc_adic_pct', 'Descuento adicional %', { tipo: 'number' })),
        campoCot('con_iva', 'Con IVA (19 %)', { tipo: 'checkbox' }),
        campoCot('mostrar_valores', 'Mostrar el valor de cada ítem en el PDF', { tipo: 'checkbox' }),
        campoCot('notas', 'Notas internas (no salen en el PDF)', { tipo: 'textarea' }),
        resumen)),
    avanceTotal != null ? el('div', { class: 'ficha doc-grupo' }, el('strong', {}, 'Avance en el taller'), barraAvance(avanceTotal, `${avanceTotal}% · ${ligadas.length} orden(es) de trabajo · los ítems hechos quedan en verde`)) : null,
    grupos.map((g, i) => tarjetaGrupo(g, i + 1)),
    editable ? boton(conTaller ? 'Agregar vehículo' : 'Agregar grupo', { icono: 'mas', onclick: async () => {
      const { error } = await ctx.api.from('cot_grupos').insert({ cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: Math.max(0, ...grupos.map((g) => g.orden)) + 1 });
      if (error) avisar(error.message, 'error'); else ctx.refrescar();
    } }) : null,
    // Traer los autos que el cliente tuvo en el taller en un mes (como "Traer de Cierre GM" del OS)
    editable && conTaller && c.tercero_id ? boton('Traer autos del mes', { icono: 'llave', onclick: async () => { const { traerMes } = await import('../traer-mes.js?v=b8da9fc'); traerMes(ctx, c, grupos); } }) : null,
    catalogo.tieneLista ? el('p', { class: 'texto-suave texto-chico' }, 'Este cliente tiene lista de precios: al escribir un servicio se usa su precio especial.') : null,
    editable ? el('p', { class: 'texto-suave texto-chico' }, 'Planilla: Enter baja de fila (en la última crea una línea), Mayús+Enter sube, flechas para moverse; se puede pegar un rango copiado de Excel (Descripción, Cant., Precio, Desc. %) y arrastrar filas o secciones desde el asa (también a otro vehículo).') : null,
  );
  pintarTotales();
  if (foco) {
    const f = foco; foco = null;
    let intentos = 0;
    const enfocar = () => { const x = document.querySelector(`[data-linea="${f.linea}"] [data-col="${f.col}"]`); if (x) x.focus(); else if (intentos++ < 20) setTimeout(enfocar, 25); };
    setTimeout(enfocar, 0);
  }
  return vista;
}

async function pdf(ctx, c, b) {
  b.disabled = true;
  try {
    const { pdfCotizacion } = await import('../documento.js?v=b8da9fc');
    const doc = await pdfCotizacion(ctx, c);
    window.open(doc.output('bloburl'), '_blank', 'noopener');
  } catch (e) { avisar(`No se pudo generar: ${e.message}`, 'error'); } finally { b.disabled = false; }
}
