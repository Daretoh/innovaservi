// Trabajos de una orden valorizados con la lista de precios del cliente (2026-10-31, pedido de Enzo).
// Guillermo Morales: la orden entra como "Pendiente de cotización" ($0) y lo hecho queda en sus tareas (Limpieza
// exterior, Corrección de barniz, Desc. de vidrios…). Al cotizar, si la orden no tiene servicios con precio, cada
// tarea se busca en la lista del cliente (cot_precios: "Exterior", "Corr. barniz", "Desc. vidrios"…) y entra con el
// precio de la talla del vehículo; la que no calza entra con precio 0 para valorizarla a mano.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const VACIAS = new Set(['de', 'del', 'la', 'el', 'y', 'limpieza', 'servicio']);
const palabras = (s) => norm(s).split(' ').filter((p) => p && !VACIAS.has(p));
const porCotizar = (n) => /cotiz/i.test(n ?? '');

// La lista calza con la tarea si cada palabra de la lista es el comienzo de alguna palabra de la tarea
// ("corr barniz" ↔ "correccion de barniz", "desc vidrios" ↔ "desc de vidrios", "motor" ↔ "limpieza estetica motor")
function calza(lista, tarea) {
  const l = palabras(lista); const t = palabras(tarea);
  return l.length > 0 && l.every((p) => t.some((q) => q.startsWith(p)));
}

export const precioTalla = (p, talla) => Number(p[`precio_${String(talla ?? '').toLowerCase()}`] ?? p.precio ?? 0) || Number(p.precio ?? 0);

// Lista de precios del cliente (cot_precios), o [] si no tiene
export async function listaCliente(ctx, terceroId) {
  if (!terceroId) return [];
  const { data } = await ctx.api.from('cot_precios').select('descripcion, precio, precio_s, precio_m, precio_l, precio_xl').eq('empresa_id', ctx.empresa.id).eq('tercero_id', terceroId);
  return data ?? [];
}

// Líneas de la cotización para una orden: sus servicios con precio; si no hay ninguno (solo "Pendiente de
// cotización" o $0), sus tareas valorizadas con la lista del cliente. servicios: [{ nombre, precio }]
export function trabajosOrden(o, servicios, lista, talla) {
  const conPrecio = servicios.filter((s) => !porCotizar(s.nombre) && Number(s.precio) > 0);
  if (conPrecio.length || !(o.tareas ?? []).length) return servicios.filter((s) => !porCotizar(s.nombre)).map((s) => ({ descripcion: s.nombre, precio: Number(s.precio) || 0 }));
  const usados = new Set();
  return o.tareas.map((x) => x.t).filter(Boolean).map((t) => {
    // La entrada de la lista más específica (más palabras) que calce y no se haya usado
    const p = lista.filter((l) => !usados.has(l) && calza(l.descripcion, t)).sort((a, b) => palabras(b.descripcion).length - palabras(a.descripcion).length)[0];
    if (p) usados.add(p);
    return { descripcion: p ? p.descripcion : t, precio: p ? precioTalla(p, talla) : 0 };
  });
}
