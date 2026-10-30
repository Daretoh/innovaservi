// Clientes (del maestro de Clientes y proveedores) con su color en el calendario y sus sitios de faena. Arriba, como
// InnovaGestión, un gráfico circular con el % de faenas por cliente en los últimos 12 meses (6 mayores + Otros).
import { el } from '../../../core/ui/dom.js?v=14ad9ff';
import { icono } from '../../../core/ui/iconos.js?v=14ad9ff';
import { boton } from '../../../core/ui/tabla.js?v=14ad9ff';
import { abrirFormulario } from '../../../core/ui/modal.js?v=14ad9ff';
import { avisar } from '../../../core/ui/aviso.js?v=14ad9ff';
import { cargarBase } from '../datos.js?v=14ad9ff';
import { hoyISO, sumarDias } from '../../../core/ui/formato.js?v=14ad9ff';
import { fichaTercero } from '../../terceros/formulario.js?v=14ad9ff';

export default async function vista(ctx) {
  const [base, fae] = await Promise.all([cargarBase(ctx),
    ctx.api.from('ope_faenas').select('tercero_id').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).neq('estado', 'cancelada').gte('fecha_inicio', sumarDias(hoyISO(), -365))]);
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
    torta(base, fae.data ?? []),
    tarjetas.length ? tarjetas : el('p', { class: 'texto-suave' }, 'No hay clientes. Créalos en Clientes y proveedores (tipo Cliente).'));
}

// % de faenas por cliente: torta SVG con los 6 mayores y "Otros"
function torta(base, faenas) {
  const conteo = new Map();
  for (const f of faenas) if (f.tercero_id) conteo.set(f.tercero_id, (conteo.get(f.tercero_id) ?? 0) + 1);
  const total = [...conteo.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  const orden = [...conteo].sort((a, b) => b[1] - a[1]);
  const trozos = orden.slice(0, 6).map(([id, n]) => { const c = base.clientes.find((x) => x.id === id); return { nombre: c?.nombre ?? 'Cliente', color: c?.color ?? 'var(--texto-suave)', n }; });
  const otros = orden.slice(6).reduce((a, [, n]) => a + n, 0);
  if (otros) trozos.push({ nombre: 'Otros', color: 'var(--borde)', n: otros });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 42 42'); svg.setAttribute('class', 'torta'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Faenas por cliente');
  let acumulado = 0;
  for (const t of trozos) {
    const c = document.createElementNS(NS, 'circle');
    const p = (t.n / total) * 100;
    Object.entries({ cx: 21, cy: 21, r: 15.915, fill: 'transparent', 'stroke-width': 8, 'stroke-dasharray': `${p} ${100 - p}`, 'stroke-dashoffset': 25 - acumulado }).forEach(([k, v]) => c.setAttribute(k, v));
    c.style.stroke = t.color;
    const titulo = document.createElementNS(NS, 'title'); titulo.textContent = `${t.nombre}: ${t.n} (${Math.round(p)}%)`; c.append(titulo);
    svg.append(c); acumulado += p;
  }
  return el('div', { class: 'ficha doc-grupo torta-caja' },
    el('div', {}, el('h2', {}, 'Faenas por cliente'), el('p', { class: 'texto-suave texto-chico' }, `${total} faenas en los últimos 12 meses · ${conteo.size} clientes`)),
    el('div', { class: 'torta-fila' }, svg,
      el('div', { class: 'torta-leyenda' }, trozos.map((t) => el('div', {}, el('i', { style: `background:${t.color}` }), el('span', {}, t.nombre), el('strong', {}, `${Math.round((t.n / total) * 100)}%`))))));
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
