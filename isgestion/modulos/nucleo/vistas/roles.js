// Roles de la empresa y matriz rol × módulo × acción.
// Las plantillas (Administrador, Solo lectura…) se ven pero no se editan: se copian.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';

const ACCIONES = [
  ['ver', 'Ver'], ['crear', 'Crear'], ['editar', 'Editar'],
  ['eliminar', 'Eliminar'], ['aprobar', 'Aprobar'], ['exportar', 'Exportar'],
];

let seleccionado = null;   // id del rol abierto (se mantiene al refrescar)

export default async function vista(ctx) {
  const empresa = ctx.empresa.id;
  const [roles, modulos] = await Promise.all([
    ctx.api.from('roles').select('id, nombre, empresa_id').or(`empresa_id.is.null,empresa_id.eq.${empresa}`).order('nombre'),
    ctx.api.from('empresa_modulos').select('modulo_id, modulos(nombre, es_nucleo)').eq('empresa_id', empresa),
  ]);
  if (roles.error) throw roles.error;
  if (modulos.error) throw modulos.error;

  const lista = roles.data;
  if (!lista.some((r) => r.id === seleccionado)) seleccionado = lista.find((r) => r.empresa_id)?.id ?? lista[0]?.id ?? null;
  const rol = lista.find((r) => r.id === seleccionado);
  const puedeEditar = ctx.puede('nucleo', 'editar');
  const filasModulo = modulos.data
    .map((m) => ({ id: m.modulo_id, nombre: m.modulos?.nombre ?? m.modulo_id, nucleo: m.modulos?.es_nucleo }))
    .sort((a, b) => Number(b.nucleo) - Number(a.nucleo) || a.nombre.localeCompare(b.nombre));

  const acciones = puedeEditar
    ? [boton('Nuevo rol', { icono: 'mas', tipo: 'primario', onclick: () => nuevoRol(ctx, lista) })]
    : [];

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Roles y permisos'),
      el('div', { class: 'listado-acciones' }, acciones)),
    el('div', { class: 'roles' },
      el('nav', { class: 'roles-lista', 'aria-label': 'Roles' }, lista.map((r) =>
        el('button', {
          type: 'button', class: 'roles-item', 'aria-current': String(r.id === seleccionado),
          onclick: () => { seleccionado = r.id; ctx.refrescar(); },
        }, el('span', {}, r.nombre), r.empresa_id ? null : el('span', { class: 'etiqueta' }, 'Plantilla')))),
      rol ? await matriz(ctx, rol, filasModulo, puedeEditar, lista) : el('p', { class: 'texto-suave' }, 'No hay roles.'),
    ),
  );
}

async function matriz(ctx, rol, filasModulo, puedeEditar, lista) {
  const { data, error } = await ctx.api.from('rol_permisos').select('modulo_id, accion').eq('rol_id', rol.id);
  if (error) throw error;
  const tiene = new Set(data.map((p) => `${p.modulo_id}:${p.accion}`));
  const editable = puedeEditar && rol.empresa_id;

  const casilla = (modulo, accion) => {
    const input = el('input', {
      type: 'checkbox', checked: tiene.has(`${modulo.id}:${accion}`), disabled: !editable,
      'aria-label': `${modulo.nombre}: ${accion}`,
    });
    input.addEventListener('change', async () => {
      input.disabled = true;
      const { error: e } = input.checked
        ? await ctx.api.from('rol_permisos').insert({ rol_id: rol.id, modulo_id: modulo.id, accion })
        : await ctx.api.from('rol_permisos').delete().match({ rol_id: rol.id, modulo_id: modulo.id, accion });
      if (e) {
        input.checked = !input.checked;
        avisar(e.message, 'error');
      }
      input.disabled = false;
    });
    return el('td', { class: 'centro' }, input);
  };

  const herramientas = [];
  if (puedeEditar) {
    herramientas.push(boton('Copiar', { icono: 'copiar', onclick: () => nuevoRol(ctx, lista, rol.id) }));
    if (rol.empresa_id) {
      herramientas.push(
        boton('Renombrar', { icono: 'editar', onclick: () => renombrar(ctx, rol) }),
        boton('Eliminar', { icono: 'basura', onclick: () => eliminar(ctx, rol) }),
      );
    }
  }

  return el('div', { class: 'roles-detalle' },
    el('div', { class: 'listado-cabecera' },
      el('div', {},
        el('h2', {}, rol.nombre),
        el('p', { class: 'texto-suave' }, rol.empresa_id
          ? 'Los cambios se guardan al marcar. Cada usuario los ve al volver a cargar la página.'
          : 'Rol plantilla de la plataforma: no se modifica. Usa "Copiar" para crear uno propio.')),
      el('div', { class: 'listado-acciones' }, herramientas)),
    el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla matriz' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Módulo'), ACCIONES.map(([, t]) => el('th', { class: 'centro' }, t)))),
        el('tbody', {}, filasModulo.map((m) =>
          el('tr', {}, el('td', {}, m.nombre), ACCIONES.map(([a]) => casilla(m, a))))),
      )),
  );
}

function mensajeRol(error) {
  if (error.code === '23505') return 'Ya existe un rol con ese nombre.';
  if (error.code === '23503') return 'Este rol está asignado a usuarios: cámbialos de rol antes de eliminarlo.';
  return error.message;
}

function nuevoRol(ctx, lista, copiarDe = '') {
  abrirFormulario({
    titulo: copiarDe ? 'Copiar rol' : 'Nuevo rol',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'base', etiqueta: 'Permisos iniciales', valor: copiarDe,
        opciones: [['', 'Sin permisos'], ...lista.map((r) => [r.id, `Copiar de ${r.nombre}`])] },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const { data: nuevo, error } = await ctx.api.from('roles')
        .insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim() }).select('id').single();
      if (error) throw new Error(mensajeRol(error));
      if (v.base) {
        const { data: base, error: e1 } = await ctx.api.from('rol_permisos').select('modulo_id, accion').eq('rol_id', v.base);
        if (e1) throw new Error(e1.message);
        if (base.length) {
          const { error: e2 } = await ctx.api.from('rol_permisos').insert(base.map((p) => ({ ...p, rol_id: nuevo.id })));
          if (e2) throw new Error(`El rol se creó, pero no se copiaron los permisos: ${e2.message}`);
        }
      }
      seleccionado = nuevo.id;
      avisar('Rol creado.');
      ctx.refrescar();
    },
  });
}

function renombrar(ctx, rol) {
  abrirFormulario({
    titulo: 'Renombrar rol',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: rol.nombre }],
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('roles').update({ nombre: v.nombre.trim() }).eq('id', rol.id);
      if (error) throw new Error(mensajeRol(error));
      avisar('Rol renombrado.');
      ctx.refrescar();
    },
  });
}

function eliminar(ctx, rol) {
  abrirFormulario({
    titulo: `Eliminar el rol "${rol.nombre}"`,
    mensaje: 'Se eliminan el rol y sus permisos. No se puede deshacer. Si hay usuarios con este rol, primero cámbialos a otro.',
    campos: [],
    textoGuardar: 'Eliminar',
    alGuardar: async () => {
      const { data, error } = await ctx.api.from('roles').delete().eq('id', rol.id).select('id');
      if (error) throw new Error(mensajeRol(error));
      if (!data.length) throw new Error('No tienes permiso para eliminar roles.');
      seleccionado = null;
      avisar('Rol eliminado.');
      ctx.refrescar();
    },
  });
}
