// Datos compartidos de la consola: clientes, planes, empresas (con uso) y cálculo del cobro.
export const ESTADOS = [['piloto', 'Piloto'], ['activo', 'Activo'], ['suspendido', 'Suspendido'], ['baja', 'Dado de baja']];
export const nombreEstado = Object.fromEntries(ESTADOS);

export async function cargarTodo(ctx) {
  const [clientes, planes, empresas] = await Promise.all([
    ctx.api.from('con_clientes').select('*').order('nombre'),
    ctx.api.from('con_planes').select('*').order('nombre'),
    ctx.api.rpc('con_empresas'),
  ]);
  for (const r of [clientes, planes, empresas]) if (r.error) throw new Error(r.error.message);
  const planDe = new Map(planes.data.map((p) => [p.id, p]));
  const empresasDe = (id) => empresas.data.filter((e) => e.cliente_id === id);
  return {
    planes: planes.data, planDe, empresas: empresas.data, empresasDe,
    clientes: clientes.data.map((c) => {
      const emp = empresasDe(c.id);
      return { ...c, plan: planDe.get(c.plan_id) ?? null, empresas: emp,
        trabajadores: emp.reduce((s, e) => s + e.trabajadores, 0), usuarios: emp.reduce((s, e) => s + e.usuarios, 0) };
    }),
  };
}

// Cobro mensual estimado en UF: base + trabajadores activos sobre los incluidos × UF por trabajador
export function cobroUF(c) {
  if (!c.plan) return null;
  const extra = Math.max(0, c.trabajadores - c.plan.incluidos);
  return { base: Number(c.plan.uf_base), extra, porExtra: Number(c.plan.uf_trabajador), total: Number(c.plan.uf_base) + extra * Number(c.plan.uf_trabajador) };
}

// Valor de la UF que escribe el equipo (se recuerda en este navegador; no se consulta a ningún servicio)
export const leerUF = () => { try { return Number(localStorage.getItem('isg.consola.uf')) || null; } catch { return null; } };
export const guardarUF = (v) => { try { localStorage.setItem('isg.consola.uf', String(v || '')); } catch { /* sin almacenamiento */ } };
export const uf = (n) => `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF`;
export const diasHasta = (iso) => (iso ? Math.round((new Date(`${iso}T12:00`) - new Date()) / 864e5) : null);
