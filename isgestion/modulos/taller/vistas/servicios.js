// Servicios y precios por talla (S/M/L/XL), con las tareas que incluye cada uno.
import { el } from '../../../core/ui/dom.js?v=7860387';
import { listado, boton } from '../../../core/ui/tabla.js?v=7860387';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7860387';
import { avisar } from '../../../core/ui/aviso.js?v=7860387';
import { dinero } from '../../../core/ui/formato.js?v=7860387';
import { cargarServicios, TALLAS } from '../datos.js?v=7860387';
import { SERVICIOS } from '../sugeridos.js?v=7860387';

export default async function vista(ctx) {
  const servicios = await cargarServicios(ctx, { todos: true });
  // El catálogo lo cambia solo quien aprueba en Taller (Administrador, Jefe de taller): Taller 006
  const editable = ctx.puede('taller', 'aprobar');
  const acciones = [];
  if (editable) acciones.push(boton('Nuevo servicio', { icono: 'mas', tipo: 'primario', onclick: () => formulario(ctx, null) }));
  if (editable && !servicios.length) acciones.push(boton('Cargar servicios sugeridos', { icono: 'mas', onclick: (ev) => sugeridos(ctx, ev.currentTarget) }));

  const lista = listado({
    titulo: 'Servicios y precios',
    filas: servicios,
    acciones,
    vacio: 'Aún no hay servicios.',
    columnas: [
      { titulo: 'Servicio', valor: (s) => el('div', {},
        editable ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); formulario(ctx, s); } }, el('strong', {}, s.nombre)) : el('strong', {}, s.nombre),
        el('div', { class: 'texto-suave texto-chico' }, [s.categoria, s.duracion, s.tareas.length ? `${s.tareas.length} tareas` : null, s.activo ? null : 'inactivo'].filter(Boolean).join(' · '))) },
      ...TALLAS.map((t) => ({ titulo: t, valor: (s) => (s.variable ? 'A convenir' : s[`precio_${t.toLowerCase()}`] != null ? dinero(s[`precio_${t.toLowerCase()}`]) : '') })),
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Talla S: city car · M: sedán o hatchback · L: SUV · XL: camioneta, van o 7 asientos. Al agregar un servicio a una orden se copia el precio de la talla del vehículo (se puede ajustar en la orden).'));
  return lista;
}

function formulario(ctx, s) {
  abrirFormulario({
    titulo: s ? s.nombre : 'Nuevo servicio',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: s?.nombre ?? '' },
      { id: 'categoria', etiqueta: 'Categoría', valor: s?.categoria ?? '' },
      { id: 'variable', etiqueta: 'Precio', opciones: [['no', 'Por talla'], ['si', 'A convenir (se escribe en la orden)']], valor: s?.variable ? 'si' : 'no' },
      ...TALLAS.map((t) => ({ id: `precio_${t.toLowerCase()}`, etiqueta: `Precio talla ${t}`, tipo: 'number', valor: s?.[`precio_${t.toLowerCase()}`] != null ? String(s[`precio_${t.toLowerCase()}`]) : '' })),
      { id: 'duracion', etiqueta: 'Duración', valor: s?.duracion ?? '', ayuda: 'Ej.: 2-3 horas, 1-2 días.' },
      { id: 'tareas', etiqueta: 'Tareas que incluye', tipo: 'lista', valor: s?.tareas ?? [], textoAgregar: 'Agregar tarea', placeholder: 'Ej.: Lavado exterior con espuma',
        ayuda: 'Son el checklist de la orden: al agregar este servicio a un auto, sus tareas aparecen en el Seguimiento para ir marcándolas. Enter agrega otra.' },
      { id: 'orden', etiqueta: 'Orden en la lista', tipo: 'number', valor: String(s?.orden ?? 0) },
      ...(s ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo (no se ofrece)']], valor: String(s.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const variable = v.variable === 'si';
      const precio = (t) => (variable || v[`precio_${t}`] === '' ? null : Math.max(0, Math.round(Number(v[`precio_${t}`]))));
      const datos = {
        nombre: v.nombre.trim(), categoria: v.categoria.trim() || null, variable, precio_s: precio('s'), precio_m: precio('m'), precio_l: precio('l'), precio_xl: precio('xl'),
        duracion: v.duracion.trim() || null, tareas: v.tareas, orden: Number(v.orden) || 0,
        ...(s ? { activo: v.activo === 'true' } : {}),
      };
      const r = s ? await ctx.api.from('tal_servicios').update(datos).eq('id', s.id) : await ctx.api.from('tal_servicios').insert({ ...datos, empresa_id: ctx.empresa.id });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe un servicio con ese nombre.' : r.error.message);
      avisar('Servicio guardado.'); ctx.refrescar();
    },
  });
}

async function sugeridos(ctx, b) {
  b.disabled = true;
  const { error } = await ctx.api.from('tal_servicios').insert(SERVICIOS.map(([nombre, categoria, p, duracion, tareas], i) => ({
    empresa_id: ctx.empresa.id, nombre, categoria, variable: !p, precio_s: p?.[0] ?? null, precio_m: p?.[1] ?? null, precio_l: p?.[2] ?? null, precio_xl: p?.[3] ?? null,
    duracion, tareas, orden: i + 1,
  })));
  if (error) { avisar(error.message, 'error'); b.disabled = false; return; }
  avisar('Servicios sugeridos cargados. Ajusta los precios a los tuyos.'); ctx.refrescar();
}
