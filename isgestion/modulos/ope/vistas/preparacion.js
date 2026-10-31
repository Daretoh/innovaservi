// Preparación de una faena en un día: checklist (matrices + ropa por talla + ítems sueltos),
// link para que la cuadrilla marque desde el celular y fotos de la carga general.
// Se puede preparar aunque la planificación esté enviada (es lo que pasa después de enviarla).
import { urlApp } from '../../../core/api.js?v=a7f53fa';
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { icono } from '../../../core/ui/iconos.js?v=a7f53fa';
import { boton } from '../../../core/ui/tabla.js?v=a7f53fa';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a7f53fa';
import { avisar } from '../../../core/ui/aviso.js?v=a7f53fa';
import { urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=a7f53fa';
import { fechaLarga } from '../../../core/ui/formato.js?v=a7f53fa';
import { nombreCorto } from '../datos.js?v=a7f53fa';
import { TIPOS_ITEM } from './matrices.js?v=a7f53fa';

const SECCIONES = [['epp', 'EPP'], ['ropa', 'Ropa de trabajo'], ['herramienta', 'Herramientas'], ['maquinaria', 'Maquinaria'], ['material', 'Materiales']];
const PRENDAS = [['Overol', 'ropa'], ['Botas', 'botas']];

export async function seccionPreparacion(ctx, { f, p, base, asegurarPlan }) {
  const items = p ? (await ctx.api.from('ope_prep_items').select('*').eq('plan_id', p.id).order('orden').order('item')).data ?? [] : [];
  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear');
  const listos = items.filter((i) => i.cargado).length;
  const quien = ctx.usuario.email;

  const marcar = async (ids, cargado) => {
    const { error } = await ctx.api.from('ope_prep_items')
      .update({ cargado, cargado_at: cargado ? new Date().toISOString() : null, cargado_por: cargado ? quien : null }).in('id', ids);
    if (error) avisar(error.message, 'error');
    ctx.refrescar();
  };
  const fila = (ids, texto, cant, cargado, extra) => el('label', { class: `check-fila ${cargado ? 'listo' : ''}` },
    el('input', { type: 'checkbox', checked: cargado, disabled: !editable, onchange: (ev) => marcar(ids, ev.target.checked) }),
    el('span', { class: 'check-texto' }, texto, extra),
    el('span', { class: 'texto-suave' }, cant),
    editable ? el('button', {
      type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${texto}`,
      onclick: async (ev) => { ev.preventDefault(); const { error } = await ctx.api.from('ope_prep_items').delete().in('id', ids); if (error) avisar(error.message, 'error'); ctx.refrescar(); },
    }, icono('basura', { tam: 15 })) : null);

  const bloques = SECCIONES.map(([tipo, titulo]) => {
    const lista = items.filter((i) => i.tipo === tipo);
    if (!lista.length) return null;
    let filas;
    if (tipo === 'ropa') {
      // Agrupada por prenda y talla (como en InnovaGestión); "sin talla" muestra de quién falta
      const grupos = new Map();
      for (const i of lista) {
        const k = `${i.item}|${i.talla ?? ''}`;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(i);
      }
      filas = [...grupos.values()].map((g) => fila(g.map((i) => i.id), `${g[0].item}${g[0].talla ? ` talla ${g[0].talla}` : ''}`, `× ${g.length}`, g.every((i) => i.cargado),
        g[0].talla ? null : el('span', { class: 'chip chip-venc' }, `sin talla: ${g.map((i) => { const v = base.personas.get(i.persona_id); return v ? nombreCorto(v.personas) : '?'; }).join(', ')}`)));
    } else {
      filas = lista.map((i) => fila([i.id], i.item, `× ${Number(i.cantidad)}`, i.cargado, i.cargado && i.cargado_por ? el('span', { class: 'texto-suave texto-chico' }, ` · ${i.cargado_por}`) : null));
    }
    const ok = lista.filter((i) => i.cargado).length;
    return el('div', { class: 'check-seccion' }, el('h3', {}, `${titulo} `, el('span', { class: `chip ${ok === lista.length ? 'chip-ok' : 'chip-pend'}` }, `${ok}/${lista.length}`)), filas);
  }).filter(Boolean);

  const acciones = editable ? [
    boton('Aplicar matriz', { icono: 'copiar', onclick: () => aplicarMatriz(ctx, f, items, asegurarPlan) }),
    boton('Ropa desde la cuadrilla', { onclick: () => ropaCuadrilla(ctx, p, base, items) }),
    boton('Agregar ítem', { icono: 'mas', onclick: () => agregarItem(ctx, asegurarPlan) }),
  ] : [];

  return el('div', { class: 'ficha doc-grupo seccion-prep' },
    el('div', { class: 'listado-cabecera' },
      el('h2', {}, 'Preparación ', items.length ? el('span', { class: `chip ${listos === items.length ? 'chip-ok' : 'chip-prox'}` }, `${listos}/${items.length} listos`) : null),
      el('div', { class: 'listado-acciones' }, acciones)),
    bloques.length ? bloques : el('p', { class: 'texto-suave' }, 'Checklist vacío. Aplica una matriz, agrega la ropa de la cuadrilla o ítems sueltos.'),
    p ? await cajaLink(ctx, p, editable) : null);
}

async function cajaLink(ctx, p, editable) {
  const url = p.prep_token ? urlApp(`checklist/?t=${p.prep_token}`) : '';
  const accion = async (a, msj) => {
    const { error } = await ctx.api.rpc('ope_prep_link', { p_plan: p.id, p_accion: a });
    if (error) { avisar(error.message, 'error'); return; }
    avisar(msj); ctx.refrescar();
  };
  const fotos = await Promise.all((p.prep_fotos ?? []).map(async (ruta) => ({ ruta, url: await urlFirmada(ctx.api, ruta, 600).catch(() => '') })));
  return el('div', { class: 'caja-link' },
    el('h3', {}, 'Link para la cuadrilla'),
    p.prep_token
      ? el('div', { class: 'caja-enlace' },
          el('input', { class: 'campo', value: url, readonly: true, 'aria-label': 'Link del checklist', onfocus: (ev) => ev.target.select() }),
          el('div', { class: 'listado-acciones' },
            boton('Copiar link', { icono: 'copiar', onclick: async () => { try { await navigator.clipboard.writeText(url); avisar('Link copiado. Envíalo por WhatsApp a la cuadrilla.'); } catch { avisar('Selecciona el link y cópialo.', 'error'); } } }),
            editable ? boton('Renovar', { onclick: () => accion('renovar', 'Se creó un link nuevo; el anterior dejó de funcionar.') }) : null,
            editable ? boton('Desactivar', { onclick: () => accion('desactivar', 'Link desactivado.') }) : null),
          el('p', { class: 'texto-suave texto-chico' }, `Sin cuenta: ven la faena y la cuadrilla, marcan lo cargado y suben la foto de la carga. Vence el ${fechaLarga(p.prep_vence)}.`))
      : editable ? el('div', {}, boton('Crear link', { icono: 'mas', onclick: () => accion('crear', 'Link creado.') }),
          el('p', { class: 'texto-suave texto-chico' }, 'La cuadrilla marca el checklist desde el celular, sin iniciar sesión.')) : el('p', { class: 'texto-suave' }, 'Sin link.'),
    fotos.length ? el('div', {},
      el('h3', {}, `Fotos de la carga (${fotos.length})`),
      el('div', { class: 'fotos-carga' }, fotos.map((ft) => el('div', { class: 'foto-carga' },
        el('a', { href: ft.url, target: '_blank', rel: 'noopener' }, el('img', { src: ft.url, alt: 'Foto de la carga', loading: 'lazy' })),
        editable ? el('button', {
          type: 'button', class: 'boton-icono', title: 'Quitar foto', 'aria-label': 'Quitar foto',
          onclick: async () => {
            const { error } = await ctx.api.from('ope_plan').update({ prep_fotos: p.prep_fotos.filter((r) => r !== ft.ruta) }).eq('id', p.id);
            if (error) { avisar(error.message, 'error'); return; }
            await eliminarArchivo(ctx.api, ft.ruta).catch(() => {});
            avisar('Foto quitada.'); ctx.refrescar();
          },
        }, icono('basura', { tam: 15 })) : null)))) : null);
}

async function aplicarMatriz(ctx, f, items, asegurarPlan) {
  const { data, error } = await ctx.api.from('ope_matrices').select('id, nombre, tercero_id, sitio_id, ope_matriz_items(tipo, item, cantidad, orden)')
    .eq('empresa_id', ctx.empresa.id).eq('activo', true).order('nombre');
  if (error) { avisar(error.message, 'error'); return; }
  const aplicables = data.filter((m) => (!m.tercero_id || m.tercero_id === f.tercero_id) && (!m.sitio_id || m.sitio_id === f.sitio_id));
  const usadas = new Set(items.map((i) => i.matriz_id).filter(Boolean));
  if (!aplicables.length) { avisar('No hay matrices para este cliente y sitio. Créalas en Matriz de trabajos.', 'error'); return; }
  abrirFormulario({
    titulo: 'Aplicar matriz',
    mensaje: 'Se copian sus ítems al checklist. Si después cambias la matriz, este checklist no cambia.',
    campos: [{ id: 'matrices', etiqueta: 'Matrices de este cliente y sitio', tipo: 'checks',
      opciones: aplicables.map((m) => [m.id, `${m.nombre} (${m.ope_matriz_items.length} ítems)${usadas.has(m.id) ? ' · ya aplicada' : ''}`]),
      valor: aplicables.filter((m) => !usadas.has(m.id)).length === 1 ? [aplicables.find((m) => !usadas.has(m.id)).id] : [] }],
    textoGuardar: 'Aplicar',
    alGuardar: async (v) => {
      const elegidas = aplicables.filter((m) => v.matrices.includes(m.id) && !usadas.has(m.id));
      if (!elegidas.length) throw new Error('Elige una matriz que no esté aplicada.');
      const planId = await asegurarPlan();
      const filas = elegidas.flatMap((m) => m.ope_matriz_items.map((i) => ({
        plan_id: planId, empresa_id: ctx.empresa.id, tipo: i.tipo, item: i.item, cantidad: i.cantidad, orden: i.orden, matriz_id: m.id,
      })));
      if (!filas.length) throw new Error('Las matrices elegidas no tienen ítems.');
      const { error: e } = await ctx.api.from('ope_prep_items').insert(filas);
      if (e) throw new Error(e.message);
      avisar(`Se agregaron ${filas.length} ítems.`);
      ctx.refrescar();
    },
  });
}

async function ropaCuadrilla(ctx, p, base, items) {
  const asignados = p?.ope_plan_personas ?? [];
  if (!asignados.length) { avisar('Primero asigna la cuadrilla.', 'error'); return; }
  const ya = new Set(items.filter((i) => i.tipo === 'ropa').map((i) => `${i.persona_id}|${i.item}`));
  const filas = [];
  for (const x of asignados) {
    const tallas = base.personas.get(x.persona_id)?.personas?.tallas ?? {};
    for (const [prenda, clave] of PRENDAS) {
      if (!ya.has(`${x.persona_id}|${prenda}`)) filas.push({ plan_id: p.id, empresa_id: ctx.empresa.id, tipo: 'ropa', item: prenda, talla: tallas[clave] || null, persona_id: x.persona_id });
    }
  }
  if (!filas.length) { avisar('La ropa de la cuadrilla ya está en el checklist.'); return; }
  const { error } = await ctx.api.from('ope_prep_items').insert(filas);
  if (error) { avisar(error.message, 'error'); return; }
  const sinTalla = filas.filter((x) => !x.talla).length;
  avisar(sinTalla ? `Ropa agregada. ${sinTalla} sin talla: complétalas en la ficha (RRHH).` : 'Ropa de la cuadrilla agregada.', sinTalla ? 'error' : 'ok');
  ctx.refrescar();
}

function agregarItem(ctx, asegurarPlan) {
  abrirFormulario({
    titulo: 'Agregar ítem',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ITEM },
      { id: 'item', etiqueta: 'Ítem', requerido: true },
      { id: 'cantidad', etiqueta: 'Cantidad', tipo: 'number', valor: '1' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const planId = await asegurarPlan();
      const { error } = await ctx.api.from('ope_prep_items').insert({ plan_id: planId, empresa_id: ctx.empresa.id, tipo: v.tipo, item: v.item.trim(), cantidad: Math.max(0.01, Number(v.cantidad) || 1) });
      if (error) throw new Error(error.message);
      avisar('Ítem agregado.');
      ctx.refrescar();
    },
  });
}
