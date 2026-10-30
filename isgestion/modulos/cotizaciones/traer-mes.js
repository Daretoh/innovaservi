// "Traer autos del mes" (como "Traer de Cierre GM" del OS, 2026-10-27): elige un mes y los autos que el cliente de la
// cotización tuvo en el taller ese mes; cada uno entra como un grupo (vehículo, patente, talla, orden ligada) con sus
// servicios de la orden: los normales en una sección (GM: "Preparación de Venta y Pulido / Realce de Brillo") y los
// extras en "Extras". Así se arma la cotización del mes de un cliente de flota y se ve qué autos tuvo.
import { abrirFormulario } from '../../core/ui/modal.js?v=462b5ff';
import { avisar } from '../../core/ui/aviso.js?v=462b5ff';
import { diaLocal, hoyISO } from '../../core/ui/formato.js?v=462b5ff';
import { numeroTexto, verPatente } from './datos.js?v=462b5ff';

const SECCION_FLOTA = 'Preparación de Venta y Pulido / Realce de Brillo';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esExtra = (n) => /^\s*extras?\b/i.test(n ?? '');
const porCotizar = (n) => /cotiz/i.test(n ?? '');   // "Pendiente de cotización": no es un servicio
const diaDe = (o) => o.fecha_cita || diaLocal(o.ingreso_at) || diaLocal(o.created_at);

export async function traerMes(ctx, c, grupos) {
  if (!c.tercero_id) { avisar('Elige primero el cliente de la cotización.', 'error'); return; }
  const { data: ords, error } = await ctx.api.from('tal_ordenes')
    .select('id, numero, estado, fecha_cita, ingreso_at, created_at, descuento, tal_vehiculos(id, marca, modelo, patente, talla), tal_orden_servicios(nombre, precio, orden)')
    .eq('empresa_id', ctx.empresa.id).eq('tercero_id', c.tercero_id).neq('estado', 'anulada');
  if (error) { avisar(error.message, 'error'); return; }
  const meses = [...new Set((ords ?? []).map((o) => diaDe(o)?.slice(0, 7)).filter(Boolean))].sort().reverse();
  if (!meses.length) { avisar('Este cliente no tiene autos en el taller.', 'error'); return; }
  const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const contar = (m) => (ords ?? []).filter((o) => diaDe(o)?.startsWith(m)).length;

  abrirFormulario({
    titulo: 'Traer autos del mes',
    mensaje: 'Elige el mes: luego marcas qué autos de ese mes entran a esta cotización.',
    campos: [{ id: 'mes', etiqueta: 'Mes', opciones: meses.map((m) => [m, `${nombreMes(m)} · ${contar(m)} auto(s)`]), valor: meses[0] }],
    textoGuardar: 'Ver autos',
    alGuardar: async ({ mes }) => { setTimeout(() => elegirAutos(ctx, c, grupos, ords.filter((o) => diaDe(o)?.startsWith(mes)), nombreMes(mes)), 0); },
  });
}

async function elegirAutos(ctx, c, grupos, delMes, mes) {
  // Autos que ya están en una cotización (esta u otra): se avisa y quedan sin marcar
  const { data: ya } = await ctx.api.from('cot_grupos').select('orden_id, cot_cotizaciones!inner(numero, deleted_at)')
    .in('orden_id', delMes.map((o) => o.id)).is('cot_cotizaciones.deleted_at', null);
  const enCot = new Map((ya ?? []).map((g) => [g.orden_id, g.cot_cotizaciones.numero]));
  const orden = [...delMes].sort((a, b) => String(diaDe(a)).localeCompare(String(diaDe(b))));
  const etiqueta = (o) => {
    const v = o.tal_vehiculos ?? {};
    const n = enCot.get(o.id);
    return [`${diaDe(o).slice(8, 10)}/${diaDe(o).slice(5, 7)}`, [v.marca, v.modelo].filter(Boolean).join(' ') || 'Vehículo', verPatente(v.patente), v.talla ? `talla ${v.talla}` : null,
      n ? `ya en la N° ${numeroTexto(n)}` : null].filter(Boolean).join(' · ');
  };
  abrirFormulario({
    titulo: `Autos de ${mes}`,
    mensaje: `${orden.length} auto(s). Cada uno entra como un vehículo con los servicios de su orden.`,
    campos: [{ id: 'ordenes', etiqueta: 'Autos', tipo: 'checks', opciones: orden.map((o) => [o.id, etiqueta(o)]), valor: orden.filter((o) => !enCot.has(o.id)).map((o) => o.id) }],
    textoGuardar: 'Traer a la cotización',
    alGuardar: async ({ ordenes }) => {
      if (!ordenes.length) throw new Error('Marca al menos un auto.');
      // El grupo vacío con que nace una cotización nueva se reemplaza por los autos
      const vacios = grupos.filter((g) => !g.titulo && !g.patente && !g.orden_id && !c.cot_lineas.some((l) => l.grupo_id === g.id));
      if (vacios.length) await ctx.api.from('cot_grupos').delete().in('id', vacios.map((g) => g.id));
      let pos = Math.max(0, ...grupos.filter((g) => !vacios.includes(g)).map((g) => g.orden));
      for (const id of ordenes) {
        const o = delMes.find((x) => x.id === id); const v = o.tal_vehiculos ?? {};
        const { data: g, error } = await ctx.api.from('cot_grupos').insert({
          cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: ++pos, titulo: [v.marca, v.modelo].filter(Boolean).join(' ') || null,
          patente: v.patente ?? null, talla: v.talla ?? null, vehiculo_id: v.id ?? null, orden_id: o.id,
        }).select('id').single();
        if (error) throw new Error(error.message);
        const svs = [...(o.tal_orden_servicios ?? [])].sort((a, b) => a.orden - b.orden).filter((s) => !porCotizar(s.nombre));
        const normales = svs.filter((s) => !esExtra(s.nombre)); const extras = svs.filter((s) => esExtra(s.nombre));
        const lineas = [];
        if (normales.length) lineas.push({ tipo: 'seccion', descripcion: SECCION_FLOTA }, ...normales.map((s) => ({ tipo: 'item', descripcion: s.nombre, cantidad: 1, precio: s.precio })));
        if (extras.length) lineas.push({ tipo: 'seccion', descripcion: 'Extras' }, ...extras.map((s) => ({ tipo: 'item', descripcion: s.nombre.replace(/^\s*extras?\s*:?\s*/i, '') || 'Extra', cantidad: 1, precio: s.precio })));
        if (Number(o.descuento) > 0) avisar(`La orden N° ${o.numero} tiene un descuento de $${Number(o.descuento).toLocaleString('es-CL')}: aplícalo en la cotización.`);
        if (lineas.length) {
          const { error: e2 } = await ctx.api.from('cot_lineas').insert(lineas.map((l, i) => ({ cantidad: 1, precio: 0, desc_pct: 0, ...l, grupo_id: g.id, cotizacion_id: c.id, empresa_id: ctx.empresa.id, orden: i + 1 })));
          if (e2) throw new Error(e2.message);
        }
      }
      // Si la cotización no tiene período, queda el del mes
      if (!c.fecha_hasta) {
        const m = (delMes[0] && diaDe(delMes[0]).slice(0, 7)) || hoyISO().slice(0, 7);
        const fin = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
        if (c.fecha <= `${m}-${fin}`) await ctx.api.from('cot_cotizaciones').update({ fecha_hasta: `${m}-${fin}` }).eq('id', c.id);
      }
      avisar(`${ordenes.length} auto(s) agregados.`);
      ctx.refrescar();
    },
  });
}
