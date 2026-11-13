// Carga los manifiestos y arma el menú según la empresa activa.
import ids from './config/modulos.js?v=16e128e';

let manifiestos = null;

export async function cargarManifiestos() {
  if (manifiestos) return manifiestos;
  manifiestos = await Promise.all(
    ids.map((id) => import(`../modulos/${id}/manifest.js?v=16e128e`).then((m) => m.default)),
  );
  return manifiestos;
}

// Manifiestos visibles: módulo activo en la empresa + permiso 'ver', sin las pantallas que el equipo ocultó
// para esta empresa en la Consola (y sin sus vistas hijas, ej.: la ficha de una lista oculta, salvo las que usan
// varias pantallas: `compartida: true` en el ítem, ej.: el detalle de pago de Remuneraciones). Un ítem con `requiere: 'editar'`
// (u otra acción) solo se muestra a quien tiene ese permiso en el módulo (ej.: Cobros del taller, no para el operador).
export function modulosVisibles(lista, modulosEmpresa, puede) {
  const ocultas = modulosEmpresa.ocultas ?? new Set();
  return lista.filter((m) => modulosEmpresa.has(m.id) && puede(m.id, 'ver'))
    .map((m) => ({ ...m, menu: m.menu.filter((it) => !ocultas.has(it.id) && (it.compartida || !ocultas.has(it.padre)) && (!it.requiere || puede(m.id, it.requiere))) }))
    .filter((m) => m.menu.some((it) => !it.oculto));
}

// Apartados del menú, agrupados por categoría en el orden de aparición. Un apartado es una opción del menú
// con sus pantallas como pestañas: por omisión, todas las del módulo; un ítem con `apartado: 'x'` se une al
// apartado 'x' (aunque sea de otro módulo, ej.: Marcaje dentro de Asistencia). Nombre e icono del apartado:
// `etiqueta` del módulo (o su nombre) o `apartados: { x: { label, icono } }` del módulo que lo define primero.
export function apartadosPorCategoria(visibles) {
  const porId = new Map(); const grupos = new Map();
  // Dos vueltas: primero cada módulo con lo suyo y después las pantallas que van en el apartado de otro módulo
  // (así el apartado queda en el lugar y la categoría de su dueño)
  const ajeno = (m, item) => !!item.apartado && !m.apartados?.[item.apartado] && visibles.some((x) => x !== m && x.apartados?.[item.apartado]);
  for (const vuelta of [false, true]) for (const m of visibles) {
    for (const item of m.menu) {
      if (item.oculto || ajeno(m, item) !== vuelta) continue;
      const id = item.apartado ?? m.id;
      if (!porId.has(id)) {
        // Un apartado de otro módulo (p. ej. Servicios y precios del Taller dentro de Catálogo) toma nombre y categoría del dueño
        const dueno = visibles.find((x) => x.apartados?.[id]) ?? m;
        const meta = dueno.apartados?.[id] ?? (id === m.id ? { label: m.etiqueta ?? m.nombre, icono: m.icono } : { label: item.label, icono: m.icono });
        const ap = { id, label: meta.label, icono: meta.icono, categoria: dueno.categoria, dueno: dueno.id, items: [] };
        porId.set(id, ap);
        if (!grupos.has(dueno.categoria)) grupos.set(dueno.categoria, []);
        grupos.get(dueno.categoria).push(ap);
      }
      porId.get(id).items.push({ ...item, modulo: m });
    }
  }
  return { grupos, porId };
}

// Config del módulo para la empresa: valores por defecto del manifiesto + lo guardado.
export function configModulo(manifiesto, guardada = {}) {
  const base = Object.fromEntries(
    Object.entries(manifiesto.config ?? {}).map(([k, v]) => [k, v.default]),
  );
  return { ...base, ...guardada };
}
