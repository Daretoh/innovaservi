// Uso y cobro: por cliente, trabajadores y usuarios activos y el cobro mensual estimado según su plan
// (UF base + UF por trabajador activo sobre los incluidos). El valor de la UF lo escribe el equipo.
// También los planes (crear y editar).
import { el } from '../../core/ui/dom.js?v=faa3077';
import { listado, boton } from '../../core/ui/tabla.js?v=faa3077';
import { abrirFormulario } from '../../core/ui/modal.js?v=faa3077';
import { avisar } from '../../core/ui/aviso.js?v=faa3077';
import { dinero } from '../../core/ui/formato.js?v=faa3077';
import { cargarTodo, nombreEstado, cobroUF, leerUF, guardarUF, uf } from './datos.js?v=faa3077';

export default async function vista(ctx) {
  const d = await cargarTodo(ctx);
  const valorUF = leerUF();
  const filas = d.clientes.filter((c) => c.estado !== 'baja').map((c) => ({ ...c, x: cobroUF(c) }));
  const total = filas.filter((c) => c.estado === 'activo').reduce((s, c) => s + (c.x?.total ?? 0), 0);

  const campoUF = el('input', { class: 'campo campo-num', type: 'number', min: 0, step: '0.01', value: valorUF ?? '', placeholder: 'Valor UF', 'aria-label': 'Valor de la UF en pesos' });
  campoUF.addEventListener('change', () => { guardarUF(Number(campoUF.value) || null); ctx.refrescar(); });

  const plan = (p = null) => abrirFormulario({
    titulo: p ? `Plan ${p.nombre}` : 'Nuevo plan',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: p?.nombre ?? '' },
      { id: 'uf_base', etiqueta: 'Valor base (UF al mes)', tipo: 'number', requerido: true, valor: p?.uf_base ?? '' },
      { id: 'incluidos', etiqueta: 'Trabajadores incluidos en la base', tipo: 'number', valor: p?.incluidos ?? 0 },
      { id: 'uf_trabajador', etiqueta: 'UF por trabajador adicional', tipo: 'number', valor: p?.uf_trabajador ?? '' },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: p?.notas ?? '' },
    ],
    textoGuardar: p ? 'Guardar' : 'Crear plan',
    alGuardar: async (v) => {
      const fila = { nombre: v.nombre.trim(), uf_base: Number(v.uf_base) || 0, incluidos: Math.max(0, Math.round(Number(v.incluidos) || 0)), uf_trabajador: Number(v.uf_trabajador) || 0, notas: v.notas.trim() || null };
      const { error } = p ? await ctx.api.from('con_planes').update(fila).eq('id', p.id) : await ctx.api.from('con_planes').insert(fila);
      if (error) throw new Error(error.message);
      avisar(p ? 'Plan guardado.' : 'Plan creado.'); ctx.refrescar();
    },
  });

  const lista = listado({
    titulo: 'Uso y cobro',
    filas,
    acciones: [el('label', { class: 'form-fila con-uf' }, el('span', { class: 'texto-suave texto-chico' }, 'Valor UF ($)'), campoUF), boton('Nuevo plan', { icono: 'mas', onclick: () => plan() })],
    vacio: 'Sin clientes vigentes.',
    columnas: [
      { titulo: 'Cliente', valor: (c) => el('a', { href: ctx.ruta('cliente', { id: c.id }) }, c.nombre) },
      { titulo: 'Estado', valor: (c) => el('span', { class: `chip con-estado-${c.estado}` }, nombreEstado[c.estado]) },
      { titulo: 'Plan', valor: (c) => (c.plan ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); plan(c.plan); } }, c.plan.nombre) : '—') },
      { titulo: 'Trabajadores', valor: (c) => String(c.trabajadores) },
      { titulo: 'Usuarios', valor: (c) => String(c.usuarios) },
      { titulo: 'Base', valor: (c) => (c.x ? uf(c.x.base) : '—') },
      { titulo: 'Adicionales', valor: (c) => (c.x ? `${c.x.extra} × ${uf(c.x.porExtra)}` : '—') },
      { titulo: 'Total mes', valor: (c) => (c.x ? el('strong', {}, uf(c.x.total)) : '—') },
      { titulo: 'En pesos', valor: (c) => (c.x && valorUF ? dinero(c.x.total * valorUF) : '—') },
    ],
  });
  const planes = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, `Planes (${d.planes.length})`),
    d.planes.map((p) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre), el('span', { class: 'texto-suave texto-chico' }, `${uf(p.uf_base)} base con ${p.incluidos} trabajadores · ${uf(p.uf_trabajador)} por adicional${p.notas ? ` · ${p.notas}` : ''}`)),
      boton('Editar', { icono: 'editar', onclick: () => plan(p) }))));
  lista.insertBefore(el('div', { class: 'fin-tarjetas' },
    el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Cobro mensual (clientes activos)'), el('strong', {}, uf(total)), el('span', { class: 'texto-suave texto-chico' }, valorUF ? dinero(total * valorUF) : 'escribe el valor de la UF para verlo en pesos')),
    el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Trabajadores activos'), el('strong', {}, String(filas.reduce((s, c) => s + c.trabajadores, 0))), el('span', { class: 'texto-suave texto-chico' }, 'en clientes vigentes'))), lista.children[1]);
  lista.append(planes, el('p', { class: 'texto-suave texto-chico' }, 'Estimación: el cobro real se emite fuera de ISgestión. El valor de la UF se guarda solo en este navegador.'));
  return lista;
}
