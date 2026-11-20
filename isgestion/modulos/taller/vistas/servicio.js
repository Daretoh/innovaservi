// Ficha de un servicio (Servicios y precios): lo que se vende (descripción como en la web), sus pasos en orden y los
// químicos o materiales que usa cada paso (Taller 014, sin cantidades: la estadística cruza entradas y bajas del
// almacén del taller con las órdenes). Pensada para el teléfono de Jhettro.
// Permisos (módulo "Servicios, pasos y químicos"): editar = pasos y químicos; aprobar = datos y precios del servicio.
// Un paso se define una vez por empresa: si está en varios servicios, sus químicos valen para todos.
// Ruta: #/taller.servicio?id=<id>
import { el } from '../../../core/ui/dom.js?v=a90bd70';
import { icono } from '../../../core/ui/iconos.js?v=a90bd70';
import { boton } from '../../../core/ui/tabla.js?v=a90bd70';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a90bd70';
import { avisar } from '../../../core/ui/aviso.js?v=a90bd70';
import { plegable } from '../../../core/ui/plegable.js?v=a90bd70';
import { dinero } from '../../../core/ui/formato.js?v=a90bd70';
import { TALLAS } from '../datos.js?v=a90bd70';
import { formulario } from './servicios.js?v=a90bd70';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const conInv = ctx.puede('inventario', 'ver');
  const [{ data: s, error }, servicios, pasos, quimicos, productos] = await Promise.all([
    ctx.api.from('tal_servicios').select('*').eq('id', ctx.params.id).maybeSingle(),
    ctx.api.from('tal_servicios').select('id, nombre, tareas').eq('empresa_id', e),
    ctx.api.from('tal_pasos').select('*').eq('empresa_id', e).order('nombre'),
    ctx.api.from('tal_paso_quimicos').select('*').eq('empresa_id', e),
    conInv ? import('../../inventario/datos.js?v=a90bd70').then((m) => m.cargarProductos(ctx)) : Promise.resolve([]),
  ]);
  if (error) throw error;
  for (const r of [servicios, pasos, quimicos]) if (r.error) throw r.error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('taller.servicios') }, icono('volver', { tam: 16 }), 'Servicios y precios');
  if (!s) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Servicio no encontrado'));

  const editaPasos = ctx.puede('servicios', 'editar');
  const editaDatos = ctx.puede('servicios', 'aprobar');
  const pasoDe = new Map(pasos.data.map((p) => [p.nombre, p]));
  const productoDe = new Map(productos.map((p) => [p.id, p]));
  const quimicosDe = (pasoId) => quimicos.data.filter((q) => q.paso_id === pasoId);
  const otrosServicios = (nombre) => servicios.data.filter((x) => x.id !== s.id && x.tareas.includes(nombre)).map((x) => x.nombre);
  const nombreProd = (id) => productoDe.get(id)?.nombre ?? 'Producto';

  const guardarPasos = async (tareas) => {
    const { error: e1 } = await ctx.api.from('tal_servicios').update({ tareas }).eq('id', s.id);
    if (e1) { avisar(e1.message, 'error'); return; }
    ctx.refrescar();
  };

  const filaQuimico = (q) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' },
      conInv ? el('a', { href: ctx.ruta('inventario.producto', { id: q.producto_id }) }, el('strong', {}, nombreProd(q.producto_id))) : el('strong', {}, nombreProd(q.producto_id)),
      el('span', { class: 'texto-suave texto-chico' }, [productoDe.get(q.producto_id)?.marca, q.nota].filter(Boolean).join(' · '))),
    editaPasos ? el('span', { class: 'listado-acciones' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Nota de ${nombreProd(q.producto_id)}`, title: 'Nota (ej.: dilución)',
        onclick: () => abrirFormulario({
          titulo: nombreProd(q.producto_id),
          campos: [{ id: 'nota', etiqueta: 'Nota (opcional)', valor: q.nota ?? '', ayuda: 'Ej.: diluido 1:10, solo en llantas.' }],
          alGuardar: async (v) => { const { error: e1 } = await ctx.api.from('tal_paso_quimicos').update({ nota: v.nota.trim() || null }).eq('id', q.id); if (e1) throw new Error(e1.message); ctx.refrescar(); },
        }) }, icono('editar', { tam: 16 })),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Quitar ${nombreProd(q.producto_id)}`, title: 'Quitar',
        onclick: async () => { const { error: e1 } = await ctx.api.from('tal_paso_quimicos').delete().eq('id', q.id); if (e1) avisar(e1.message, 'error'); else ctx.refrescar(); } },
      icono('basura', { tam: 16 }))) : null);

  const agregarQuimico = (paso) => {
    const usados = new Set(quimicosDe(paso.id).map((q) => q.producto_id));
    const lista = productos.filter((p) => !usados.has(p.id)).sort((a, b) => (a.categoria === b.categoria ? a.nombre.localeCompare(b.nombre) : a.categoria === 'insumo' ? -1 : 1));
    if (!lista.length) { avisar(productos.length ? 'Todos los productos ya están en este paso.' : 'El inventario no tiene productos: créalo con "Nuevo producto".', 'error'); return; }
    abrirFormulario({
      titulo: `Químicos de "${paso.nombre}"`,
      mensaje: 'Marca los productos del inventario que se usan en este paso.',
      campos: [{ id: 'productos', etiqueta: 'Productos', tipo: 'checks', opciones: lista.map((p) => [p.id, `${p.nombre}${p.marca ? ` · ${p.marca}` : ''}`]) }],
      textoGuardar: 'Agregar',
      alGuardar: async (v) => {
        if (!v.productos.length) throw new Error('Marca al menos un producto.');
        const { error: e1 } = await ctx.api.from('tal_paso_quimicos').insert(v.productos.map((id) => ({ empresa_id: e, paso_id: paso.id, producto_id: id })));
        if (e1) throw new Error(e1.message);
        ctx.refrescar();
      },
    });
  };

  const renombrar = (paso) => {
    const otros = otrosServicios(paso.nombre);
    abrirFormulario({
      titulo: 'Paso',
      mensaje: otros.length ? `También está en: ${otros.join(', ')}. El nombre y los químicos cambian en todos.` : null,
      campos: [
        { id: 'nombre', etiqueta: 'Nombre del paso', requerido: true, valor: paso.nombre },
        { id: 'nota', etiqueta: 'Cómo se hace (opcional)', tipo: 'textarea', valor: paso.nota ?? '' },
      ],
      alGuardar: async (v) => {
        if (v.nombre.trim() !== paso.nombre) {
          const { error: e1 } = await ctx.api.rpc('tal_renombrar_paso', { p_paso: paso.id, p_nombre: v.nombre });
          if (e1) throw new Error(e1.message);
        }
        const nota = v.nota.trim() || null;
        if (nota !== (paso.nota ?? null)) {
          const { error: e2 } = await ctx.api.from('tal_pasos').update({ nota }).eq('id', paso.id);
          if (e2) throw new Error(e2.message);
        }
        avisar('Paso guardado.'); ctx.refrescar();
      },
    });
  };

  const tarjetaPaso = (nombre, i) => {
    const paso = pasoDe.get(nombre);
    const qs = paso ? quimicosDe(paso.id) : [];
    const otros = otrosServicios(nombre);
    const mover = (d) => { const t = [...s.tareas]; const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; guardarPasos(t); };
    // Ordenar y quitar van dentro del paso abierto (en la cabecera se confundían con la flecha de abrir)
    const ordenar = editaPasos ? [
      boton('Subir', { icono: 'arriba', disabled: i === 0, onclick: () => mover(-1) }),
      boton('Bajar', { icono: 'abajo', disabled: i === s.tareas.length - 1, onclick: () => mover(1) }),
      boton('Quitar del servicio', { icono: 'basura', onclick: () => guardarPasos(s.tareas.filter((_, j) => j !== i)) }),
    ] : [];
    return plegable({
      clave: `tal-paso-${s.id}-${nombre}`,
      titulo: `${i + 1}. ${nombre}`,
      meta: qs.length ? qs.map((q) => nombreProd(q.producto_id)).join(', ') : 'Sin químicos',
      chips: [qs.length ? el('span', { class: 'chip chip-ok' }, String(qs.length)) : null],
      cuerpo: el('div', { class: 'tal-paso-cuerpo' },
        paso?.nota ? el('p', { class: 'texto-suave' }, paso.nota) : null,
        otros.length ? el('p', { class: 'texto-suave texto-chico' }, `También en: ${otros.join(', ')}. Sus químicos valen para todos.`) : null,
        qs.length ? qs.map(filaQuimico) : el('p', { class: 'texto-suave' }, 'Sin químicos.'),
        !conInv ? el('p', { class: 'texto-suave' }, 'Los químicos vienen del Inventario: pide el permiso para verlo.') : null,
        editaPasos && paso ? el('div', { class: 'tal-paso-botones' },
          conInv ? boton('Agregar químico', { icono: 'mas', onclick: () => agregarQuimico(paso) }) : null,
          conInv && ctx.puede('inventario', 'crear') ? boton('Nuevo producto', { icono: 'caja', onclick: () => nuevoQuimico(ctx, paso) }) : null,
          boton('Nombre y nota', { icono: 'editar', onclick: () => renombrar(paso) }), ...ordenar) : null),
    });
  };

  const agregarPaso = () => abrirFormulario({
    titulo: 'Agregar paso',
    mensaje: 'Elige uno que ya existe (con sus químicos) o escribe uno nuevo. Queda al final; después se puede mover.',
    campos: [{ id: 'nombre', etiqueta: 'Paso', requerido: true, sugerencias: pasos.data.map((p) => p.nombre).filter((n) => !s.tareas.includes(n)) }],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const n = v.nombre.trim();
      if (s.tareas.includes(n)) throw new Error('Ese paso ya está en el servicio.');
      await guardarPasos([...s.tareas, n]);
    },
  });

  // Químicos del servicio (sin repetir) con los pasos donde se usan
  const usos = new Map();
  for (const nombre of new Set(s.tareas)) {
    const paso = pasoDe.get(nombre);
    for (const q of paso ? quimicosDe(paso.id) : []) usos.set(q.producto_id, [...(usos.get(q.producto_id) ?? []), nombre]);
  }
  const precio = (t) => s[`precio_${t.toLowerCase()}`];

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, s.nombre),
        el('p', { class: 'texto-suave' }, [s.categoria, s.duracion, s.variable ? 'precio a convenir' : TALLAS.map((t) => (precio(t) != null ? `${t} ${dinero(precio(t))}` : null)).filter(Boolean).join(' · '), s.activo ? null : 'inactivo'].filter(Boolean).join(' · '))),
      editaDatos ? el('div', { class: 'listado-acciones' }, boton('Editar datos y precios', { icono: 'editar', onclick: () => formulario(ctx, s) })) : null),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Lo que se vende'),
      s.descripcion ? el('p', {}, s.descripcion) : el('p', { class: 'texto-suave' }, 'Sin descripción.'),
      el('p', { class: 'texto-suave texto-chico' }, 'Revisa que los pasos de abajo hagan lo que aquí se promete (y nada que no se cobre).')),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, `Pasos (${s.tareas.length})`),
        editaPasos ? boton('Agregar paso', { icono: 'mas', onclick: agregarPaso }) : null),
      el('p', { class: 'texto-suave texto-chico' }, 'Son el checklist de la orden. Toca un paso para ver o cargar sus químicos.'),
      s.tareas.length ? el('div', { class: 'tal-pasos' }, s.tareas.map(tarjetaPaso)) : el('p', { class: 'texto-suave' }, 'Sin pasos.')),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Químicos del servicio (${usos.size})`),
      usos.size ? [...usos].sort((a, b) => nombreProd(a[0]).localeCompare(nombreProd(b[0]))).map(([id, en]) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, nombreProd(id)), el('span', { class: 'texto-suave texto-chico' }, en.join(' · ')))))
        : el('p', { class: 'texto-suave' }, 'Aún no hay químicos en los pasos de este servicio.')));
}

// Producto nuevo del inventario (tipo Químico si existe) agregado al paso
async function nuevoQuimico(ctx, paso) {
  const inv = await import('../../inventario/datos.js?v=a90bd70');
  const base = await inv.cargarBase(ctx);
  const tipos = base.tipos.filter((t) => t.activo && t.categoria === 'insumo');
  const quimico = tipos.find((t) => /qu[ií]mic/i.test(t.nombre));
  abrirFormulario({
    titulo: 'Nuevo producto',
    mensaje: `Se crea en el Inventario y se agrega a "${paso.nombre}".`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'marca', etiqueta: 'Marca' },
      { id: 'tipo_id', etiqueta: 'Tipo', requerido: true, opciones: tipos.map((t) => [t.id, t.nombre]), valor: quimico?.id ?? tipos[0]?.id ?? '' },
      { id: 'udm', etiqueta: 'Se compra por', valor: 'bidón', ayuda: 'Bidón, botella, frasco, caja… Es la unidad del stock.' },
      { id: 'contenido', etiqueta: 'Contenido del envase', ayuda: 'Ej.: 5 L, 1 L, 500 ml.' },
    ],
    textoGuardar: 'Crear y agregar',
    alGuardar: async (v) => {
      if (!v.tipo_id) throw new Error('Crea primero un tipo de insumo en Inventario → Almacenes y tipos.');
      const { data: sku, error: e1 } = await ctx.api.rpc('inv_siguiente_sku', { p_empresa: ctx.empresa.id, p_tipo: v.tipo_id });
      if (e1) throw new Error(e1.message);
      const { data, error } = await ctx.api.from('inv_productos').insert({
        empresa_id: ctx.empresa.id, sku, nombre: v.nombre.trim(), tipo_id: v.tipo_id, categoria: 'insumo', marca: v.marca.trim() || null,
        udm: v.udm.trim() || 'unidad', contenido: v.contenido.trim() || null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('tal_paso_quimicos').insert({ empresa_id: ctx.empresa.id, paso_id: paso.id, producto_id: data.id });
      if (e2) throw new Error(e2.message);
      avisar(`Producto creado con SKU ${sku}.`); ctx.refrescar();
    },
  });
}
