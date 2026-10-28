// Acciones sobre una cotización: duplicar, dividir por grupo y pasar a orden de trabajo (Taller).
import { avisar } from '../../core/ui/aviso.js?v=cb36eb2';
import { hoyISO } from '../../core/ui/formato.js?v=cb36eb2';
import { totalLinea, numeroTexto, siguienteNumero } from './datos.js?v=cb36eb2';

const CAMPOS_COT = ['fecha_hasta', 'validez_dias', 'tercero_id', 'cliente_nombre', 'cliente_rut', 'cliente_giro', 'cliente_contacto', 'cliente_correo', 'cliente_telefono', 'con_iva', 'desc_adic_pct', 'mostrar_valores'];
const CAMPOS_GRUPO = ['titulo', 'patente', 'anio', 'talla', 'vehiculo_id'];
const CAMPOS_LINEA = ['orden', 'tipo', 'descripcion', 'cantidad', 'precio', 'desc_pct', 'costos'];
const tomar = (o, campos) => Object.fromEntries(campos.map((k) => [k, o[k]]));

// Crea una cotización en borrador con los grupos indicados (copia de c)
async function copiar(ctx, c, grupos) {
  const numero = await siguienteNumero(ctx);
  const { data: nueva, error } = await ctx.api.from('cot_cotizaciones').insert({
    empresa_id: ctx.empresa.id, numero, fecha: hoyISO(), origen_id: c.id, ...tomar(c, CAMPOS_COT),
  }).select('id, numero').single();
  if (error) throw new Error(error.message);
  for (const [i, g] of grupos.entries()) {
    const { data: ng, error: e2 } = await ctx.api.from('cot_grupos').insert({ cotizacion_id: nueva.id, empresa_id: ctx.empresa.id, orden: i + 1, ...tomar(g, CAMPOS_GRUPO) }).select('id').single();
    if (e2) throw new Error(e2.message);
    const ls = c.cot_lineas.filter((l) => l.grupo_id === g.id);
    if (ls.length) {
      const { error: e3 } = await ctx.api.from('cot_lineas').insert(ls.map((l) => ({ ...tomar(l, CAMPOS_LINEA), grupo_id: ng.id, cotizacion_id: nueva.id, empresa_id: ctx.empresa.id })));
      if (e3) throw new Error(e3.message);
    }
  }
  return nueva;
}

export async function duplicar(ctx, c, b) {
  b.disabled = true;
  try {
    const nueva = await copiar(ctx, c, c.cot_grupos);
    avisar(`Copia creada: N° ${numeroTexto(nueva.numero)}.`);
    location.hash = ctx.ruta('cotizaciones.editor', { id: nueva.id });
  } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
}

// Una cotización nueva por cada grupo; la original queda igual (se puede eliminar después)
export async function dividir(ctx, c, b) {
  b.disabled = true;
  try {
    const nums = [];
    for (const g of c.cot_grupos) nums.push((await copiar(ctx, c, [g])).numero);
    avisar(`Creadas N° ${nums.map(numeroTexto).join(', ')}. La original sigue igual.`);
    location.hash = ctx.ruta('cotizaciones.lista');
  } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
}

// Cada grupo con vehículo pasa a una orden de trabajo agendada para hoy (o actualiza la orden de origen
// si aún no está cobrada). El precio de cada servicio es el total de la línea; el descuento adicional va a la orden.
export async function pasarAOrden(ctx, c, b) {
  b.disabled = true;
  try {
    const { data: servicios } = await ctx.api.from('tal_servicios').select('nombre, tareas').eq('empresa_id', ctx.empresa.id);
    const tareasDe = new Map((servicios ?? []).map((s) => [s.nombre.toLowerCase(), s.tareas]));
    const hechos = [];
    for (const g of c.cot_grupos) {
      const items = c.cot_lineas.filter((l) => l.grupo_id === g.id && l.tipo === 'item' && l.descripcion.trim());
      if (!items.length) continue;
      const lineasOrden = items.map((l, i) => ({
        nombre: Number(l.cantidad) !== 1 ? `${l.descripcion} × ${Number(l.cantidad)}` : l.descripcion, precio: totalLinea(l), orden: i + 1,
      }));
      const bruto = lineasOrden.reduce((s, x) => s + x.precio, 0);
      const descuento = Math.round(bruto * Number(c.desc_adic_pct || 0) / 100);
      const tareas = items.flatMap((l) => (tareasDe.get(l.descripcion.trim().toLowerCase()) ?? []).map((t) => ({ t, ok: false })));

      // Orden de origen (la cotización salió de una orden): se actualiza si no está cobrada
      if (g.orden_id) {
        const { data: o } = await ctx.api.from('tal_ordenes').select('id, numero, cobrado, estado').eq('id', g.orden_id).maybeSingle();
        if (o && !o.cobrado && o.estado !== 'anulada') {
          await ctx.api.from('tal_orden_servicios').delete().eq('orden_id', o.id);
          const { error } = await ctx.api.from('tal_orden_servicios').insert(lineasOrden.map((x) => ({ ...x, orden_id: o.id, empresa_id: ctx.empresa.id })));
          if (error) throw new Error(error.message);
          await ctx.api.from('tal_ordenes').update({ descuento, doc_tipo: c.con_iva ? 'factura' : 'boleta' }).eq('id', o.id);
          hechos.push(`N° ${o.numero} actualizada`);
          continue;
        }
        if (o) { hechos.push(`N° ${o.numero} ya cobrada (sin cambios)`); continue; }
      }

      // Vehículo: el ligado, uno con esa patente o uno nuevo
      let vehiculoId = g.vehiculo_id;
      if (!vehiculoId && g.patente) {
        const { data } = await ctx.api.from('tal_vehiculos').select('id').eq('empresa_id', ctx.empresa.id).eq('patente', g.patente).is('deleted_at', null).maybeSingle();
        vehiculoId = data?.id ?? null;
      }
      if (!vehiculoId) {
        const [marca, ...modelo] = (g.titulo ?? '').trim().split(/\s+/);
        const { data, error } = await ctx.api.from('tal_vehiculos').insert({
          empresa_id: ctx.empresa.id, tercero_id: c.tercero_id, patente: g.patente, marca: marca || null, modelo: modelo.join(' ') || null, anio: g.anio, talla: g.talla || 'M',
        }).select('id').single();
        if (error) throw new Error(error.message);
        vehiculoId = data.id;
      }
      const { data: num, error: en } = await ctx.api.rpc('siguiente_correlativo', { p_empresa: ctx.empresa.id, p_modulo: 'taller', p_clave: 'taller.orden' });
      if (en) throw new Error(en.message);
      const { data: o, error: eo } = await ctx.api.from('tal_ordenes').insert({
        empresa_id: ctx.empresa.id, numero: num, vehiculo_id: vehiculoId, tercero_id: c.tercero_id, contacto: c.cliente_telefono,
        estado: 'agendado', prioridad: 'normal', fecha_cita: hoyISO(), tareas, descuento, doc_tipo: c.con_iva ? 'factura' : 'boleta',
        notas: `Desde la cotización N° ${numeroTexto(c.numero)}`,
      }).select('id').single();
      if (eo) throw new Error(eo.message);
      const { error: es } = await ctx.api.from('tal_orden_servicios').insert(lineasOrden.map((x) => ({ ...x, orden_id: o.id, empresa_id: ctx.empresa.id })));
      if (es) throw new Error(es.message);
      const { error: eg } = await ctx.api.from('cot_grupos').update({ vehiculo_id: vehiculoId, orden_id: o.id }).eq('id', g.id);
      if (eg) throw new Error(eg.message);
      hechos.push(`N° ${num} creada`);
    }
    avisar(hechos.length ? `Órdenes de trabajo: ${hechos.join(', ')}.` : 'No hay grupos con líneas para pasar.');
    ctx.refrescar();
  } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
}
