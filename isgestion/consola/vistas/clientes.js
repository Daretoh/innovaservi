// Clientes (organizaciones): estado, plan, empresas, trabajadores activos, renovación y cobro estimado.
import { el } from '../../core/ui/dom.js?v=a8e0f26';
import { listado, boton } from '../../core/ui/tabla.js?v=a8e0f26';
import { abrirFormulario } from '../../core/ui/modal.js?v=a8e0f26';
import { avisar } from '../../core/ui/aviso.js?v=a8e0f26';
import { fechaLarga, dinero } from '../../core/ui/formato.js?v=a8e0f26';
import { cargarTodo, ESTADOS, nombreEstado, cobroUF, leerUF, uf, diasHasta } from './datos.js?v=a8e0f26';

export default async function vista(ctx) {
  const d = await cargarTodo(ctx);
  const valorUF = leerUF();
  const vigentes = d.clientes.filter((c) => c.estado !== 'baja');
  const renuevan = vigentes.filter((c) => { const n = diasHasta(c.renovacion); return n != null && n <= 60; });
  const totalUF = vigentes.filter((c) => c.estado === 'activo').reduce((s, c) => s + (cobroUF(c)?.total ?? 0), 0);

  const nuevo = () => abrirFormulario({
    titulo: 'Nuevo cliente',
    mensaje: 'Organización que contrata ISgestión. Sus empresas se asocian desde la ficha.',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true },
      { id: 'rut', etiqueta: 'RUT' },
      { id: 'contacto_nombre', etiqueta: 'Contacto' },
      { id: 'contacto_correo', etiqueta: 'Correo del contacto', tipo: 'email' },
      { id: 'plan_id', etiqueta: 'Plan', opciones: [['', 'Sin plan'], ...d.planes.filter((p) => p.activo).map((p) => [p.id, p.nombre])] },
      { id: 'estado', etiqueta: 'Estado', opciones: ESTADOS.filter(([k]) => k !== 'baja'), valor: 'piloto' },
      { id: 'renovacion', etiqueta: 'Renovación', tipo: 'date' },
    ],
    textoGuardar: 'Crear cliente',
    alGuardar: async (v) => {
      const fila = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x).trim() || null]));
      const { data, error } = await ctx.api.from('con_clientes').insert({ ...fila, nombre: v.nombre.trim(), estado: v.estado }).select('id').single();
      if (error) throw new Error(error.message);
      avisar('Cliente creado.');
      location.hash = ctx.ruta('cliente', { id: data.id });
    },
  });

  const lista = listado({
    titulo: 'Clientes',
    filas: d.clientes,
    acciones: [boton('Nuevo cliente', { icono: 'mas', tipo: 'primario', onclick: nuevo })],
    vacio: 'Todavía no hay clientes.',
    columnas: [
      { titulo: 'Cliente', valor: (c) => el('a', { href: ctx.ruta('cliente', { id: c.id }) }, c.nombre) },
      { titulo: 'Estado', valor: (c) => el('span', { class: `chip con-estado-${c.estado}` }, nombreEstado[c.estado]) },
      { titulo: 'Plan', valor: (c) => c.plan?.nombre ?? '—' },
      { titulo: 'Empresas', valor: (c) => String(c.empresas.length) },
      { titulo: 'Trabajadores', valor: (c) => String(c.trabajadores) },
      { titulo: 'Usuarios', valor: (c) => String(c.usuarios) },
      { titulo: 'Renovación', valor: (c) => { const n = diasHasta(c.renovacion); return c.renovacion ? el('span', { class: n < 0 ? 'chip chip-venc' : n <= 60 ? 'chip chip-prox' : '' }, fechaLarga(c.renovacion)) : '—'; } },
      { titulo: 'Cobro estimado', valor: (c) => { const x = cobroUF(c); return x ? `${uf(x.total)}${valorUF ? ` · ${dinero(x.total * valorUF)}` : ''}` : '—'; } },
    ],
  });
  const tarjeta = (t, v, sub, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, v), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null);
  lista.insertBefore(el('div', { class: 'fin-tarjetas' },
    tarjeta('Clientes activos', String(vigentes.filter((c) => c.estado === 'activo').length), `${vigentes.filter((c) => c.estado === 'piloto').length} en piloto`),
    tarjeta('Trabajadores activos', String(vigentes.reduce((s, c) => s + c.trabajadores, 0)), 'base del cobro'),
    tarjeta('Cobro mensual estimado', uf(totalUF), valorUF ? dinero(totalUF * valorUF) : 'escribe el valor de la UF en Uso y cobro'),
    tarjeta('Renuevan en 60 días', String(renuevan.length), renuevan.map((c) => c.nombre).join(', ') || 'Ninguno', renuevan.length ? 'fin-alerta' : '')), lista.children[1]);
  return lista;
}
