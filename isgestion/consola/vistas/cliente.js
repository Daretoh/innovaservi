// Ficha de un cliente: datos (se guardan al salir del campo), estado, plan, proyecto y dominios,
// empresas del cliente (asociar o quitar) y cobro estimado. Ruta: #/cliente?id=
import { el } from '../../core/ui/dom.js?v=faa3077';
import { icono } from '../../core/ui/iconos.js?v=faa3077';
import { boton } from '../../core/ui/tabla.js?v=faa3077';
import { abrirFormulario } from '../../core/ui/modal.js?v=faa3077';
import { avisar } from '../../core/ui/aviso.js?v=faa3077';
import { dinero } from '../../core/ui/formato.js?v=faa3077';
import { cargarTodo, ESTADOS, nombreEstado, cobroUF, leerUF, uf } from './datos.js?v=faa3077';

export default async function vista(ctx) {
  const d = await cargarTodo(ctx);
  const c = d.clientes.find((x) => x.id === ctx.params.id);
  const volver = el('a', { class: 'volver', href: '#/clientes' }, icono('volver', { tam: 16 }), 'Clientes');
  if (!c) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Cliente no encontrado'));

  const guardar = async (cambios, aviso = 'Guardado.') => {
    const { error } = await ctx.api.from('con_clientes').update(cambios).eq('id', c.id);
    if (error) { avisar(error.message, 'error'); return false; }
    Object.assign(c, cambios); if (aviso) avisar(aviso); return true;
  };
  const campo = (id, etiqueta, { tipo = 'text', opciones, refrescar = false, conv } = {}) => {
    const valor = conv?.a ? conv.a(c[id]) : c[id] ?? '';
    const ctl = opciones
      ? el('select', { class: 'campo', id: `c-${id}` }, opciones.map(([k, t]) => el('option', { value: k, selected: String(valor) === k }, t)))
      : tipo === 'textarea' ? Object.assign(el('textarea', { class: 'campo', id: `c-${id}`, rows: 3 }), { value: valor })
        : el('input', { class: 'campo', id: `c-${id}`, type: tipo, value: valor });
    ctl.addEventListener('change', async () => {
      let v = conv?.de ? conv.de(ctl.value) : ctl.value.trim();
      if (v === '') v = null;
      if (await guardar({ [id]: v }) && refrescar) ctx.refrescar();
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `c-${id}` }, etiqueta), ctl);
  };
  const lista = { a: (x) => (x ?? []).join(', '), de: (t) => t.split(',').map((s) => s.trim()).filter(Boolean) };

  // ---- Empresas del cliente
  const sinCliente = d.empresas.filter((e) => !e.cliente_id);
  const agregar = () => abrirFormulario({
    titulo: `Asociar empresa a ${c.nombre}`,
    mensaje: 'Empresas de este proyecto que todavía no tienen cliente.',
    campos: [{ id: 'empresa', etiqueta: 'Empresa', requerido: true, opciones: [['', 'Elige…'], ...sinCliente.map((e) => [e.empresa_id, e.nombre_fantasia || e.razon_social])] }],
    textoGuardar: 'Asociar',
    alGuardar: async (v) => {
      const { error } = await ctx.api.from('con_cliente_empresas').insert({ cliente_id: c.id, empresa_id: v.empresa });
      if (error) throw new Error(error.message);
      avisar('Empresa asociada.'); ctx.refrescar();
    },
  });
  const quitar = async (e) => {
    const { error } = await ctx.api.from('con_cliente_empresas').delete().eq('cliente_id', c.id).eq('empresa_id', e.empresa_id);
    if (error) avisar(error.message, 'error'); else { avisar('Empresa quitada del cliente.'); ctx.refrescar(); }
  };

  const x = cobroUF(c);
  const valorUF = leerUF();
  const darDeBaja = c.estado !== 'baja'
    ? boton('Dar de baja', { icono: 'cerrar', onclick: () => abrirFormulario({
      titulo: `Dar de baja a ${c.nombre}`, mensaje: 'El cliente queda como "Dado de baja" (no se borra). Sus empresas y datos no se tocan desde aquí.', campos: [], textoGuardar: 'Dar de baja',
      alGuardar: async () => { if (!(await guardar({ estado: 'baja' }, 'Cliente dado de baja.'))) throw new Error('No se pudo.'); ctx.refrescar(); },
    }) })
    : boton('Reactivar', { icono: 'check', onclick: async () => { if (await guardar({ estado: 'activo' }, 'Cliente reactivado.')) ctx.refrescar(); } });

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, c.nombre), el('p', { class: 'texto-suave' }, [c.rut ? `RUT ${c.rut}` : null, c.supabase_ref ? `Proyecto ${c.supabase_ref}` : 'Sin proyecto asignado'].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip con-estado-${c.estado}` }, nombreEstado[c.estado]), darDeBaja)),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        campo('nombre', 'Nombre'),
        el('div', { class: 'rejilla-campos' }, campo('rut', 'RUT'), campo('estado', 'Estado', { opciones: ESTADOS, refrescar: true })),
        el('div', { class: 'rejilla-campos' }, campo('contacto_nombre', 'Contacto'), campo('contacto_telefono', 'Teléfono')),
        campo('contacto_correo', 'Correo del contacto', { tipo: 'email' }),
        campo('notas', 'Notas', { tipo: 'textarea' })),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Contrato y plataforma'),
        campo('plan_id', 'Plan', { opciones: [['', 'Sin plan'], ...d.planes.map((p) => [p.id, `${p.nombre} · ${uf(p.uf_base)} + ${uf(p.uf_trabajador)} por trabajador sobre ${p.incluidos}`])], refrescar: true }),
        el('div', { class: 'rejilla-campos' }, campo('desde', 'Cliente desde', { tipo: 'date' }), campo('renovacion', 'Renovación', { tipo: 'date' })),
        campo('supabase_ref', 'Proyecto de Supabase (ref)'),
        campo('dominios', 'Dominios (separados por coma)', { conv: lista }),
        el('div', { class: 'cobro-resumen' },
          el('div', {}, el('span', {}, 'Trabajadores activos'), el('strong', {}, String(c.trabajadores))),
          el('div', {}, el('span', {}, 'Usuarios activos'), el('span', {}, String(c.usuarios))),
          x ? el('div', {}, el('span', {}, 'Valor base'), el('span', {}, uf(x.base))) : null,
          x ? el('div', {}, el('span', {}, `${x.extra} trabajadores sobre los incluidos`), el('span', {}, uf(x.extra * x.porExtra))) : null,
          el('div', { class: 'cobro-saldo' }, el('strong', {}, 'Cobro mensual estimado'), el('strong', {}, x ? `${uf(x.total)}${valorUF ? ` · ${dinero(x.total * valorUF)}` : ''}` : 'Sin plan'))))),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `Empresas (${c.empresas.length})`),
        sinCliente.length ? boton('Asociar empresa', { icono: 'mas', onclick: agregar }) : null),
      c.empresas.length ? c.empresas.map((e) => el('div', { class: 'doc-fila' },
        el('span', { class: 'punto', style: `background:${e.color || 'var(--empresa)'}` }),
        el('div', { class: 'doc-nombre' }, el('strong', {}, e.nombre_fantasia || e.razon_social), el('span', { class: 'texto-suave texto-chico' }, `RUT ${e.rut} · ${e.trabajadores} trabajadores · ${e.usuarios} usuarios · ${e.modulos.length} módulos`),
          e.activa ? null : el('span', { class: 'chip chip-venc' }, 'Suspendida')),
        el('a', { class: 'boton boton-secundario boton-chico', href: `#/empresas?e=${e.empresa_id}` }, 'Módulos'),
        el('button', { type: 'button', class: 'boton-icono', title: 'Quitar del cliente', 'aria-label': 'Quitar del cliente', onclick: () => quitar(e) }, icono('cerrar', { tam: 16 }))))
        : el('p', { class: 'texto-suave' }, c.supabase_ref ? 'Sin empresas asociadas en este proyecto.' : 'Este cliente todavía no tiene proyecto: sus empresas se crean al pasar a producción.')));
}
