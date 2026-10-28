// Matriz de trabajos: plantillas de lo que hay que llevar (EPP, herramientas, maquinaria, materiales)
// por cliente y sitio. Una matriz sin cliente sirve para cualquiera; sin sitio, para todos los sitios del cliente.
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { boton } from '../../../core/ui/tabla.js?v=cb36eb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { cargarBase } from '../datos.js?v=cb36eb2';

export const TIPOS_ITEM = [['epp', 'EPP'], ['herramienta', 'Herramientas'], ['maquinaria', 'Maquinaria'], ['material', 'Materiales']];

export default async function vista(ctx) {
  if (ctx.params.m) return editor(ctx, ctx.params.m);
  const [base, matrices] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('ope_matrices').select('*, ope_matriz_items(id)').eq('empresa_id', ctx.empresa.id).order('nombre'),
  ]);
  if (matrices.error) throw matrices.error;

  const grupos = [[null, 'Cualquier cliente'], ...base.clientes.map((c) => [c.id, c.nombre])];
  const bloques = grupos.map(([id, nombre]) => {
    const lista = matrices.data.filter((m) => m.tercero_id === id);
    if (!lista.length) return null;
    const color = base.clientes.find((c) => c.id === id)?.color;
    return el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, color ? el('span', { class: 'punto', style: `background:${color}` }) : null, ` ${nombre}`),
      lista.map((m) => el('a', { class: 'doc-fila fila-enlace', href: ctx.ruta('ope.matrices', { m: m.id }) },
        el('div', { class: 'doc-nombre' }, el('strong', {}, m.nombre),
          el('span', { class: 'etiqueta' }, m.sitio_id ? base.sitios.find((s) => s.id === m.sitio_id)?.nombre ?? 'Sitio' : 'Todos los sitios'),
          !m.activo ? el('span', { class: 'chip chip-na' }, 'Inactiva') : null),
        el('span', { class: 'texto-suave' }, `${m.ope_matriz_items.length} ítems`),
        icono('derecha', { tam: 16 }))));
  }).filter(Boolean);

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Matriz de trabajos'),
      ctx.puede('ope', 'crear') ? boton('Nueva matriz', { icono: 'mas', tipo: 'primario', onclick: () => datosMatriz(ctx, base, null) }) : null),
    el('p', { class: 'texto-suave' }, 'Lo que hay que llevar a cada tipo de trabajo. En la planificación se aplica al checklist de preparación.'),
    bloques.length ? bloques : el('p', { class: 'texto-suave' }, 'Aún no hay matrices.'));
}

function datosMatriz(ctx, base, m) {
  const sitios = [['', 'Todos los sitios'], ...base.sitios.map((s) => [s.id, `${base.clientes.find((c) => c.id === s.tercero_id)?.nombre ?? '?'} · ${s.nombre}`])];
  abrirFormulario({
    titulo: m ? 'Editar matriz' : 'Nueva matriz',
    campos: [
      { id: 'nombre', etiqueta: 'Tipo de trabajo', requerido: true, valor: m?.nombre },
      { id: 'tercero_id', etiqueta: 'Cliente', opciones: [['', 'Cualquier cliente'], ...base.clientes.map((c) => [c.id, c.nombre])], valor: m?.tercero_id ?? '' },
      { id: 'sitio_id', etiqueta: 'Sitio (debe ser del cliente)', opciones: sitios, valor: m?.sitio_id ?? '' },
      ...(m ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activa'], ['false', 'Inactiva']], valor: String(m.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), tercero_id: v.tercero_id || null, sitio_id: v.sitio_id || null, ...(m ? { activo: v.activo === 'true' } : {}) };
      const r = m
        ? await ctx.api.from('ope_matrices').update(datos).eq('id', m.id).select('id')
        : await ctx.api.from('ope_matrices').insert({ ...datos, empresa_id: ctx.empresa.id }).select('id');
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso.');
      avisar(m ? 'Matriz actualizada.' : 'Matriz creada. Agrega sus ítems.');
      if (m) ctx.refrescar(); else location.hash = ctx.ruta('ope.matrices', { m: r.data[0].id });
    },
  });
}

async function editor(ctx, id) {
  const [base, m, items] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('ope_matrices').select('*').eq('id', id).maybeSingle(),
    ctx.api.from('ope_matriz_items').select('*').eq('matriz_id', id).order('orden').order('item'),
  ]);
  if (m.error) throw m.error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('ope.matrices') }, icono('volver', { tam: 16 }), 'Matriz de trabajos');
  if (!m.data) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Matriz no encontrada'));
  const mat = m.data;
  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear');
  const cli = base.clientes.find((c) => c.id === mat.tercero_id);
  const sitio = base.sitios.find((s) => s.id === mat.sitio_id);

  const secciones = TIPOS_ITEM.map(([tipo, titulo]) => {
    const lista = items.data.filter((i) => i.tipo === tipo);
    return el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `${titulo} (${lista.length})`),
        editable ? boton('Agregar', { icono: 'mas', onclick: () => item(ctx, mat, tipo, null) }) : null),
      lista.length ? lista.map((i) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, i.item)),
        el('span', { class: 'texto-suave' }, `Cant. ${Number(i.cantidad)}`),
        editable ? el('div', { class: 'doc-acciones' },
          el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${i.item}`, onclick: () => item(ctx, mat, tipo, i) }, icono('editar', { tam: 16 })),
          el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${i.item}`, onclick: () => quitar(ctx, i) }, icono('basura', { tam: 16 }))) : null))
        : el('p', { class: 'texto-suave' }, 'Nada.'));
  });

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, mat.nombre),
        el('p', { class: 'texto-suave' }, `${cli?.nombre ?? 'Cualquier cliente'} · ${sitio?.nombre ?? 'todos los sitios'}${mat.activo ? '' : ' · inactiva'}`)),
      editable ? boton('Editar datos', { icono: 'editar', onclick: () => datosMatriz(ctx, base, mat) }) : null),
    el('div', { class: 'plan-editor' }, secciones));
}

function item(ctx, mat, tipo, i) {
  abrirFormulario({
    titulo: i ? 'Editar ítem' : 'Agregar ítem',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ITEM, valor: i?.tipo ?? tipo },
      { id: 'item', etiqueta: 'Ítem', requerido: true, valor: i?.item },
      { id: 'cantidad', etiqueta: 'Cantidad', tipo: 'number', valor: String(i ? Number(i.cantidad) : 1) },
    ],
    alGuardar: async (v) => {
      const datos = { tipo: v.tipo, item: v.item.trim(), cantidad: Math.max(0.01, Number(v.cantidad) || 1) };
      const r = i
        ? await ctx.api.from('ope_matriz_items').update(datos).eq('id', i.id).select('id')
        : await ctx.api.from('ope_matriz_items').insert({ ...datos, matriz_id: mat.id, empresa_id: ctx.empresa.id }).select('id');
      if (r.error) throw new Error(r.error.message);
      avisar('Guardado.');
      ctx.refrescar();
    },
  });
}

async function quitar(ctx, i) {
  const { data, error } = await ctx.api.from('ope_matriz_items').delete().eq('id', i.id).select('id');
  if (error || !data?.length) { avisar(error?.message ?? 'No tienes permiso.', 'error'); return; }
  avisar('Ítem quitado.');
  ctx.refrescar();
}
