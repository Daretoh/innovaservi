// Clientes (del maestro de Clientes y proveedores) con su color en el calendario y sus sitios de faena.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { abrirFormulario } from '../../../core/ui/modal.js';
import { avisar } from '../../../core/ui/aviso.js';
import { cargarBase } from '../datos.js';
import { fichaTercero } from '../../terceros/formulario.js';

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const editable = ctx.puede('ope', 'editar') && ctx.puede('ope', 'crear');
  const conReportes = ctx.puede('reportes', 'ver');

  const tarjetas = base.clientes.map((c) => {
    const sitios = base.sitios.filter((s) => s.tercero_id === c.id);
    const color = el('input', { type: 'color', class: 'campo campo-color', value: c.color, disabled: !editable, 'aria-label': `Color de ${c.nombre}` });
    color.addEventListener('change', async () => {
      if (await guardarCliente(ctx, c, { color: color.value })) avisar('Color guardado.');
    });
    // Con Reportes: el cliente pide informe → sus faenas sin parte se avisan en Partes de trabajo y en Planificación
    const pide = conReportes ? el('input', { type: 'checkbox', class: 'interruptor', checked: c.pideInforme, disabled: !editable }) : null;
    pide?.addEventListener('change', async () => {
      if (await guardarCliente(ctx, c, { pide_informe: pide.checked })) avisar(pide.checked ? 'Sus faenas llevan informe por omisión.' : 'Sus faenas no llevan informe por omisión.');
      else pide.checked = !pide.checked;
    });
    return el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' },
        el('div', { class: 'caja-enlace-titulo' }, color, el('h2', {}, c.nombre)),
        pide ? el('label', { class: 'casilla', title: 'Valor inicial de sus faenas; en cada faena se puede cambiar (Editor de la faena → Parte de trabajo)' }, pide, 'Pide informe por omisión') : null,
        el('div', { class: 'listado-acciones' },
          ctx.puede('terceros', 'editar') ? boton('Datos del cliente', { icono: 'editar', onclick: () => editarCliente(ctx, c) }) : null,
          editable ? boton('Agregar sitio', { icono: 'mas', onclick: () => sitio(ctx, c, null) }) : null)),
      sitios.length
        ? sitios.map((s) => el('div', { class: 'doc-fila' },
            el('div', { class: 'doc-nombre' }, el('strong', {}, s.nombre), s.direccion ? el('span', { class: 'texto-suave' }, s.direccion) : null,
              !s.activo ? el('span', { class: 'chip chip-na' }, 'Inactivo') : null),
            editable ? el('div', { class: 'doc-acciones' }, el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${s.nombre}`, onclick: () => sitio(ctx, c, s) }, icono('editar', { tam: 16 }))) : null))
        : el('p', { class: 'texto-suave' }, 'Sin sitios. Agrega los lugares donde se hacen faenas para este cliente.'));
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Clientes y sitios'),
      el('a', { class: 'boton boton-secundario', href: ctx.ruta('terceros.listado') }, 'Ir a Clientes y proveedores')),
    el('p', { class: 'texto-suave' }, `Los clientes vienen de "Clientes y proveedores". Aquí se define su color en el calendario${conReportes ? ', si sus faenas llevan informe por omisión (cada faena se puede cambiar)' : ''} y sus sitios de faena.`),
    tarjetas.length ? tarjetas : el('p', { class: 'texto-suave' }, 'No hay clientes. Créalos en Clientes y proveedores (tipo Cliente).'));
}

// Actualizar o crear la fila del cliente (la empresa del registro no se puede cambiar, por eso no se usa upsert)
async function guardarCliente(ctx, c, datos) {
  const u = await ctx.api.from('ope_clientes').update(datos).eq('tercero_id', c.id).select('tercero_id');
  const { error } = u.error || u.data?.length ? u
    : await ctx.api.from('ope_clientes').insert({ tercero_id: c.id, empresa_id: ctx.empresa.id, color: c.color, ...datos });
  if (error) { avisar(error.message, 'error'); return false; }
  Object.assign(c, datos.pide_informe === undefined ? {} : { pideInforme: datos.pide_informe });
  return true;
}

// Razón social, RUT, dirección, etc. (maestro de Clientes y proveedores)
async function editarCliente(ctx, c) {
  const { data, error } = await ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia, giro, direccion, tipo, contacto, email, telefono').eq('id', c.id).single();
  if (error) { avisar(error.message, 'error'); return; }
  fichaTercero(ctx, data);
}

function sitio(ctx, c, s) {
  abrirFormulario({
    titulo: s ? `Editar sitio · ${c.nombre}` : `Nuevo sitio · ${c.nombre}`,
    campos: [
      { id: 'nombre', etiqueta: 'Nombre del sitio', requerido: true, valor: s?.nombre },
      { id: 'direccion', etiqueta: 'Dirección o referencia', valor: s?.direccion ?? '' },
      ...(s ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(s.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), direccion: v.direccion.trim() || null, ...(s ? { activo: v.activo === 'true' } : {}) };
      const r = s
        ? await ctx.api.from('ope_sitios').update(datos).eq('id', s.id).select('id')
        : await ctx.api.from('ope_sitios').insert({ ...datos, empresa_id: ctx.empresa.id, tercero_id: c.id }).select('id');
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ese cliente ya tiene un sitio con ese nombre.' : r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso.');
      avisar('Sitio guardado.');
      ctx.refrescar();
    },
  });
}
