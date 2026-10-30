// Datos y reglas compartidas de Faenas y planificación.
import { aMin, hhmm, sumarDias, numSemana, fechaCorta } from '../../core/ui/formato.js?v=9d0da9e';

export const ROLES = [['op', 'Operario', 'Operarios'], ['sup', 'Supervisor', 'Supervisores'], ['prev', 'Prevencionista', 'Prevencionistas']];
export const nombreRol = Object.fromEntries(ROLES.map(([k, s]) => [k, s]));
export const nombreCompleto = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
export const nombreCorto = (p) => `${p.nombres.split(' ')[0]} ${p.apellido_paterno}`;

// Rol por defecto según el cargo (la misma regla que InnovaGestión), si no se eligió uno.
export function rolPorCargo(cargo) {
  const n = String(cargo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/prevenc/.test(n)) return 'prev';
  if (/capataz|encargad|supervis|gerent|jefe/.test(n)) return 'sup';
  return 'op';
}

// Noche si entra desde las 18:00, antes de las 06:00 o sale al día siguiente (regla de InnovaGestión).
export function turno(ini, fin) {
  if (!ini) return '';
  const a = aMin(ini);
  return a >= 1080 || a < 360 || (fin && aMin(fin) < a) ? 'noche' : 'dia';
}

export const dotTotal = (d) => (Number(d?.op) || 0) + (Number(d?.sup) || 0) + (Number(d?.prev) || 0);
export const dotTexto = (d) => ROLES.filter(([k]) => Number(d?.[k])).map(([k, s, pl]) => `${d[k]} ${(Number(d[k]) === 1 ? s : pl).toLowerCase()}`).join(' · ') || 'Sin dotación';

export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  const [clientes, colores, sitios, vinculos, roles] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('ope_clientes').select('tercero_id, color, pide_informe').eq('empresa_id', e),
    ctx.api.from('ope_sitios').select('*').eq('empresa_id', e).order('nombre'),
    ctx.api.from('persona_empresa').select('id, persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno, rut, tallas)').eq('empresa_id', e).is('deleted_at', null),
    ctx.api.from('ope_roles').select('vinculo_id, rol').eq('empresa_id', e),
  ]);
  for (const r of [clientes, colores, sitios, vinculos, roles]) if (r.error) throw r.error;
  const color = new Map(colores.data.map((c) => [c.tercero_id, c.color]));
  const pide = new Set(colores.data.filter((c) => c.pide_informe).map((c) => c.tercero_id));
  const rolDe = new Map(roles.data.map((r) => [r.vinculo_id, r.rol]));
  const activos = vinculos.data.filter((v) => v.estado === 'activo')
    .map((v) => ({ ...v, rol: rolDe.get(v.id) ?? rolPorCargo(v.cargo), rolElegido: rolDe.has(v.id) }))
    .sort((a, b) => nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));
  return {
    clientes: clientes.data.map((c) => ({ ...c, color: color.get(c.id) ?? '#5b6576', pideInforme: pide.has(c.id), nombre: c.nombre_fantasia || c.razon_social })),
    sitios: sitios.data,
    activos,
    personas: new Map(vinculos.data.map((v) => [v.persona_id, v])),
  };
}

// Faenas que tocan el rango y sus planificaciones (con personas y vehículos)
export async function cargarSemana(ctx, desde, hasta) {
  const e = ctx.empresa.id;
  const [faenas, planes] = await Promise.all([
    ctx.api.from('ope_faenas').select('*').eq('empresa_id', e).is('deleted_at', null).neq('estado', 'cancelada')
      .lte('fecha_inicio', hasta).gte('fecha_fin', desde).order('hora_inicio', { nullsFirst: false }),
    ctx.api.from('ope_plan').select('*, ope_plan_personas(persona_id, rol), ope_plan_vehiculos(*)')
      .eq('empresa_id', e).gte('fecha', desde).lte('fecha', hasta),
  ]);
  if (faenas.error) throw faenas.error;
  if (planes.error) throw planes.error;
  const plan = new Map(planes.data.map((p) => [`${p.faena_id}|${p.fecha}`, p]));
  return { faenas: faenas.data, plan, planDe: (f, fecha) => plan.get(`${f.id}|${fecha}`) ?? null };
}

// Partes de trabajo de las faenas-día de un rango (módulo Reportes): "faena|fecha" → { id, estado }.
// Si la empresa no tiene Reportes o el usuario no lo puede ver, devuelve null.
export async function partesDeRango(ctx, desde, hasta) {
  if (!ctx.puede('reportes', 'ver')) return null;
  const { data, error } = await ctx.api.from('rep_parte_faenas').select('faena_id, fecha, rep_partes(id, estado, deleted_at)')
    .eq('empresa_id', ctx.empresa.id).gte('fecha', desde).lte('fecha', hasta);
  if (error) return null;
  return new Map(data.filter((x) => x.rep_partes && !x.rep_partes.deleted_at).map((x) => [`${x.faena_id}|${x.fecha}`, x.rep_partes]));
}

// ¿La faena lleva informe? Lo marcado en la faena; si no se marcó, lo del cliente (Clientes y sitios)
export const pideInformeFaena = (f, base) => f.pide_informe ?? !!base.clientes.find((c) => c.id === f.tercero_id)?.pideInforme;

// Chip con el estado del parte de una faena-día (null si no corresponde mostrar nada)
export function estadoParte(partes, f, fecha, base, hoy) {
  if (!partes) return null;
  const parte = partes.get(`${f.id}|${fecha}`);
  if (parte) return parte.estado === 'confirmado' ? { clase: 'chip-ok', texto: 'Informe listo', parte } : { clase: 'chip-prox', texto: 'Parte en borrador', parte };
  const pide = pideInformeFaena(f, base);
  return pide && fecha <= hoy ? { clase: 'chip-venc', texto: 'Sin parte', parte: null } : null;
}

// ¿La faena ocurre ese día? (rango, o solo los días elegidos si tiene días a elección)
export const enDiaFaena = (f, fecha) => f.fecha_inicio <= fecha && f.fecha_fin >= fecha && (!f.dias?.length || f.dias.includes(fecha));
export const faenasDelDia = (faenas, fecha) => faenas.filter((f) => enDiaFaena(f, fecha));

export function etiquetaFaena(f, base) {
  const cli = base.clientes.find((c) => c.id === f.tercero_id);
  const sitio = base.sitios.find((s) => s.id === f.sitio_id);
  return { cliente: cli?.nombre ?? 'Interno', sitio: sitio?.nombre ?? '', color: cli?.color ?? '#5b6576', texto: [cli?.nombre ?? 'Interno', sitio?.nombre].filter(Boolean).join(' · ') };
}

export const horarioDe = (f, p) => ({ ini: p?.hora_inicio ?? f.hora_inicio, fin: p?.hora_fin ?? f.hora_fin });
export const dotacionDe = (f, p) => p?.dotacion ?? f.dotacion;

// Ocupación de las personas en un día: persona_id → [{ faena, plan }]
export function ocupacion(semana, fecha) {
  const m = new Map();
  for (const f of faenasDelDia(semana.faenas, fecha)) {
    const p = semana.planDe(f, fecha);
    for (const x of p?.ope_plan_personas ?? []) {
      if (!m.has(x.persona_id)) m.set(x.persona_id, []);
      m.get(x.persona_id).push(f);
    }
  }
  return m;
}

// Resumen para WhatsApp: mismo formato que InnovaGestión (día → turno → faena con personas numeradas)
export function resumenWhatsApp(lunes, semana, base) {
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const TURNOS = [['dia', 'Día'], ['noche', 'Noche'], ['', 'Sin hora']];
  const out = [`*Planificación semana ${numSemana(lunes)}* (${fechaCorta(lunes)} – ${fechaCorta(sumarDias(lunes, 6))})`];
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    const fs = faenasDelDia(semana.faenas, fecha);
    if (!fs.length) continue;
    out.push('', `*${DIAS[i]} ${Number(fecha.slice(8))}*`);
    for (const [t, nombre] of TURNOS) {
      const arr = fs.filter((f) => { const h = horarioDe(f, semana.planDe(f, fecha)); return turno(h.ini, h.fin) === t; });
      if (!arr.length) continue;
      out.push(`_${nombre}_`);
      for (const f of arr) {
        const p = semana.planDe(f, fecha);
        const h = horarioDe(f, p);
        const pers = (p?.ope_plan_personas ?? []).map((x) => base.personas.get(x.persona_id)).filter(Boolean);
        const nec = dotTotal(dotacionDe(f, p));
        const e = etiquetaFaena(f, base);
        out.push(`${h.ini ? `${hhmm(h.ini)} ` : ''}${e.texto} — ${f.titulo} (${pers.length}/${nec || '?'})`);
        for (let k = 0; k < Math.max(nec, pers.length); k++) out.push(`   ${k + 1}. ${pers[k] ? nombreCorto(pers[k].personas) : '—'}`);
        for (const v of p?.ope_plan_vehiculos ?? []) {
          const ch = v.chofer_id ? base.personas.get(v.chofer_id) : null;
          out.push(`   Vehículo: ${v.vehiculo}${ch ? ` (chofer ${nombreCorto(ch.personas)})` : ''}`);
        }
        if (f.tareas?.length) { out.push('   _Tareas:_'); for (const t2 of f.tareas) out.push(`   - ${t2}`); }
      }
    }
  }
  return out.join('\n');
}
