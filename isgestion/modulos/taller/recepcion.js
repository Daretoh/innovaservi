// Recepción: agendar un vehículo (nuevo o ya conocido por su patente) y crear su orden de trabajo.
import { abrirFormulario } from '../../core/ui/modal.js';
import { avisar } from '../../core/ui/aviso.js';
import { hoyISO } from '../../core/ui/formato.js';
import { PRIORIDADES, TALLAS, normalizarPatente, verPatente, nombreTercero, precioTalla, cargarServicios, cargarTrabajadores, siguienteNumero } from './datos.js';

export async function recepcion(ctx, { fecha = hoyISO(), vehiculo = null } = {}) {
  const [servicios, trabajadores, clientes] = await Promise.all([
    cargarServicios(ctx),
    cargarTrabajadores(ctx),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, telefono').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
  ]);
  const v = vehiculo;
  abrirFormulario({
    titulo: v ? `Agendar · ${verPatente(v.patente) || 'vehículo'}` : 'Agendar vehículo',
    mensaje: v ? null : 'Si la patente ya está registrada se usan sus datos y su historial.',
    campos: [
      ...(v ? [] : [
        { id: 'patente', etiqueta: 'Patente', ayuda: 'Déjala vacía si aún no la sabes.' },
        { id: 'marca', etiqueta: 'Marca' },
        { id: 'modelo', etiqueta: 'Modelo' },
        { id: 'anio', etiqueta: 'Año', tipo: 'number' },
        { id: 'talla', etiqueta: 'Talla', opciones: TALLAS.map((t) => [t, t]), valor: 'M', ayuda: 'S: city car · M: sedán · L: SUV · XL: camioneta o van.' },
        { id: 'tercero_id', etiqueta: 'Cliente', opciones: [['', 'Cliente nuevo (escribirlo abajo)'], ...(clientes.data ?? []).map((c) => [c.id, nombreTercero(c)])] },
        { id: 'cliente_nuevo', etiqueta: 'Nombre del cliente nuevo' },
      ]),
      { id: 'contacto', etiqueta: 'Teléfono de contacto' },
      { id: 'servicios', etiqueta: 'Servicios', tipo: 'checks', opciones: servicios.map((s) => [s.id, `${s.nombre}${s.variable ? ' (a convenir)' : ''}`]) },
      { id: 'fecha_cita', etiqueta: 'Fecha de la cita', tipo: 'date', requerido: true, valor: fecha },
      { id: 'hora_cita', etiqueta: 'Hora', tipo: 'time' },
      { id: 'prioridad', etiqueta: 'Prioridad', opciones: PRIORIDADES, valor: 'normal' },
      { id: 'trabajador_id', etiqueta: 'Trabajador', opciones: [['', 'Sin asignar'], ...trabajadores.lista.filter((t) => t.estado === 'activo').map((t) => [t.id, t.nombre])] },
      { id: 'llego', etiqueta: '¿Ya está en el taller?', opciones: [['no', 'No, es una cita'], ['si', 'Sí, ingresó ahora']], valor: 'no' },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea' },
    ],
    textoGuardar: 'Agendar',
    alGuardar: async (x) => {
      let veh = v;
      // Vehículo: el conocido, uno existente con esa patente o uno nuevo
      if (!veh) {
        const patente = normalizarPatente(x.patente);
        if (patente) {
          const { data } = await ctx.api.from('tal_vehiculos').select('*').eq('empresa_id', ctx.empresa.id).eq('patente', patente).is('deleted_at', null).maybeSingle();
          veh = data;
        }
        let terceroId = x.tercero_id || null;
        if (!terceroId && x.cliente_nuevo.trim()) {
          const { data, error } = await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, razon_social: x.cliente_nuevo.trim(), tipo: ['cliente'], telefono: x.contacto.trim() || null }).select('id').single();
          if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`);
          terceroId = data.id;
        }
        if (!veh) {
          if (!patente && !x.marca.trim() && !x.modelo.trim()) throw new Error('Indica la patente o la marca y modelo.');
          const { data, error } = await ctx.api.from('tal_vehiculos').insert({
            empresa_id: ctx.empresa.id, tercero_id: terceroId, patente, marca: x.marca.trim() || null, modelo: x.modelo.trim() || null,
            anio: x.anio ? Number(x.anio) : null, talla: x.talla,
          }).select('*').single();
          if (error) throw new Error(error.message);
          veh = data;
        } else if (terceroId && !veh.tercero_id) {
          await ctx.api.from('tal_vehiculos').update({ tercero_id: terceroId }).eq('id', veh.id);
          veh.tercero_id = terceroId;
        }
        veh.terceroOrden = terceroId ?? veh.tercero_id;
      }
      const elegidos = servicios.filter((s) => x.servicios.includes(s.id));
      const numero = await siguienteNumero(ctx);
      const llego = x.llego === 'si';
      const { data: orden, error } = await ctx.api.from('tal_ordenes').insert({
        empresa_id: ctx.empresa.id, numero, vehiculo_id: veh.id, tercero_id: veh.terceroOrden ?? veh.tercero_id ?? null, contacto: x.contacto.trim() || null,
        estado: llego ? 'espera' : 'agendado', prioridad: x.prioridad, trabajador_id: x.trabajador_id || null,
        fecha_cita: x.fecha_cita, hora_cita: x.hora_cita || null, ingreso_at: llego ? new Date().toISOString() : null, notas: x.notas.trim() || null,
        tareas: elegidos.flatMap((s) => s.tareas.map((t) => ({ t, ok: false }))),
      }).select('id').single();
      if (error) throw new Error(error.message);
      if (elegidos.length) {
        const { error: e2 } = await ctx.api.from('tal_orden_servicios').insert(elegidos.map((s, i) => ({
          orden_id: orden.id, empresa_id: ctx.empresa.id, servicio_id: s.id, nombre: s.nombre, precio: precioTalla(s, veh.talla) ?? 0, orden: i + 1,
        })));
        if (e2) throw new Error(e2.message);
      }
      avisar(`Orden N° ${numero} creada.`);
      location.hash = ctx.ruta('taller.orden', { id: orden.id });
    },
  });
}
