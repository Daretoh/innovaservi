// Recepción: agendar un vehículo (nuevo o ya conocido por su patente) y crear su orden de trabajo.
// Como el OS: el cliente se busca por nombre o teléfono y trae su teléfono y sus vehículos; la patente conocida trae
// el vehículo y su dueño; un cliente "siempre por cotizar" (terceros.por_cotizar) agrega el servicio a convenir y Factura.
import { abrirFormulario } from '../../core/ui/modal.js?v=dab9182';
import { avisar } from '../../core/ui/aviso.js?v=dab9182';
import { hoyISO, telefono } from '../../core/ui/formato.js?v=dab9182';
import { PRIORIDADES, TALLAS, normalizarPatente, verPatente, nombreTercero, precioTalla, cargarServicios, cargarTrabajadores, siguienteNumero, esEmpresa } from './datos.js?v=dab9182';

export async function recepcion(ctx, { fecha = hoyISO(), vehiculo = null } = {}) {
  const [servicios, trabajadores, clientes, vehiculos] = await Promise.all([
    cargarServicios(ctx),
    cargarTrabajadores(ctx),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, telefono, rut, por_cotizar').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    vehiculo ? Promise.resolve({ data: [] }) : ctx.api.from('tal_vehiculos').select('id, tercero_id, patente, marca, modelo, anio, talla').eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
  ]);
  const v = vehiculo;
  const listaClientes = clientes.data ?? []; const listaVeh = vehiculos.data ?? [];
  const soloDigitos = (t) => (t ?? '').replace(/D/g, '');
  const etiqueta = (c) => [nombreTercero(c), c.telefono].filter(Boolean).join(' · ');
  const servicioCotizar = servicios.find((s) => /cotiz/i.test(s.nombre)) ?? servicios.find((s) => s.variable);
  const porCotizarDe = (tercero) => listaClientes.find((c) => c.id === tercero)?.por_cotizar;
  // Elegir un cliente: su teléfono, sus vehículos y, si va siempre por cotizar, el servicio a convenir
  const elegirCliente = (c, { poner, opciones }) => {
    poner('tercero_id', c.id);
    if (c.telefono) poner('contacto', c.telefono);
    const suyos = listaVeh.filter((x) => x.tercero_id === c.id);
    opciones('vehiculo_id', [['', suyos.length ? `Vehículo nuevo (o elige uno de sus ${suyos.length})` : 'Vehículo nuevo'], ...suyos.map((x) => [x.id, [verPatente(x.patente), x.marca, x.modelo].filter(Boolean).join(' · ')])]);
    if (suyos.length === 1) { poner('vehiculo_id', suyos[0].id); ponerVehiculo(suyos[0], poner); }
    if (c.por_cotizar && servicioCotizar) { poner('servicios', [servicioCotizar.id]); avisar(`${nombreTercero(c)} va por cotizar: se marcó "${servicioCotizar.nombre}" y la orden queda con Factura.`); }
  };
  const ponerVehiculo = (x, poner) => { poner('patente', verPatente(x.patente)); poner('marca', x.marca); poner('modelo', x.modelo); poner('anio', x.anio); poner('talla', x.talla); };
  abrirFormulario({
    titulo: v ? `Agendar · ${verPatente(v.patente) || 'vehículo'}` : 'Agendar vehículo',
    mensaje: v ? 'Si el cliente es empresa, la orden queda con Factura (el cobro suma el IVA).' : 'Si la patente ya está registrada se usan sus datos y su historial. Si el cliente es empresa, la orden queda con Factura (el cobro suma el IVA).',
    campos: [
      ...(v ? [] : [
        { id: 'buscar', etiqueta: 'Buscar cliente', ayuda: 'Escribe el nombre o el teléfono y elígelo de la lista.', sugerencias: listaClientes.map(etiqueta),
          alCambiar: (h) => {
            const q = h.valor.trim().toLowerCase(); if (!q) return;
            const dig = soloDigitos(q);
            const c = listaClientes.find((x) => etiqueta(x).toLowerCase() === q) ?? listaClientes.find((x) => (dig.length >= 6 && soloDigitos(x.telefono).endsWith(dig.slice(-8))) || nombreTercero(x).toLowerCase() === q);
            if (c) elegirCliente(c, h);
          } },
        { id: 'tercero_id', etiqueta: 'Cliente', opciones: [['', 'Cliente nuevo (escribirlo abajo)'], ...listaClientes.map((c) => [c.id, nombreTercero(c)])],
          alCambiar: (h) => { const c = listaClientes.find((x) => x.id === h.valor); if (c) elegirCliente(c, h); else h.opciones('vehiculo_id', [['', 'Vehículo nuevo']]); } },
        { id: 'cliente_nuevo', etiqueta: 'Nombre del cliente nuevo' },
        { id: 'vehiculo_id', etiqueta: 'Vehículo', opciones: [['', 'Vehículo nuevo']],
          alCambiar: (h) => { const x = listaVeh.find((y) => y.id === h.valor); if (x) ponerVehiculo(x, h.poner); } },
        { id: 'patente', etiqueta: 'Patente', ayuda: 'Déjala vacía si aún no la sabes. Si ya está registrada se traen sus datos y su dueño.',
          alCambiar: (h) => {
            const p = normalizarPatente(h.valor); const x = p && listaVeh.find((y) => y.patente === p); if (!x) return;
            ponerVehiculo(x, h.poner);
            const c = listaClientes.find((y) => y.id === x.tercero_id);
            if (c && h.valores.tercero_id !== c.id) elegirCliente(c, h);
            h.poner('vehiculo_id', x.id);
          } },
        { id: 'marca', etiqueta: 'Marca' },
        { id: 'modelo', etiqueta: 'Modelo' },
        { id: 'anio', etiqueta: 'Año', tipo: 'number' },
        { id: 'talla', etiqueta: 'Talla', opciones: TALLAS.map((t) => [t, t]), valor: 'M', ayuda: 'S: city car · M: sedán · L: SUV · XL: camioneta o van.' },
      ]),
      { id: 'contacto', etiqueta: 'Teléfono de contacto' },
      { id: 'servicios', etiqueta: 'Servicios', tipo: 'checks', opciones: servicios.map((s) => [s.id, `${s.nombre}${s.variable ? ' (a convenir)' : ''}`]), valor: v && porCotizarDe(v.tercero_id) && servicioCotizar ? [servicioCotizar.id] : [] },
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
        if (x.vehiculo_id) veh = { ...listaVeh.find((y) => y.id === x.vehiculo_id) };
        else if (patente) {
          const { data } = await ctx.api.from('tal_vehiculos').select('*').eq('empresa_id', ctx.empresa.id).eq('patente', patente).is('deleted_at', null).maybeSingle();
          veh = data;
        }
        let terceroId = x.tercero_id || null;
        if (!terceroId && x.cliente_nuevo.trim()) {
          const { data, error } = await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, razon_social: x.cliente_nuevo.trim(), tipo: ['cliente'], telefono: telefono(x.contacto) }).select('id').single();
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
      // Cliente empresa → factura automática
      const terceroOrden = veh.terceroOrden ?? veh.tercero_id ?? null;
      let cliente = listaClientes.find((c) => c.id === terceroOrden);
      if (terceroOrden && !cliente) cliente = (await ctx.api.from('terceros').select('rut').eq('id', terceroOrden).maybeSingle()).data;
      const numero = await siguienteNumero(ctx);
      const llego = x.llego === 'si';
      const { data: orden, error } = await ctx.api.from('tal_ordenes').insert({
        empresa_id: ctx.empresa.id, numero, vehiculo_id: veh.id, tercero_id: terceroOrden, contacto: telefono(x.contacto),
        doc_tipo: esEmpresa(cliente) || porCotizarDe(terceroOrden) ? 'factura' : 'boleta',
        estado: llego ? 'espera' : 'agendado', prioridad: x.prioridad, trabajador_id: x.trabajador_id || null,
        fecha_cita: x.fecha_cita, hora_cita: x.hora_cita || null, ingreso_at: llego ? new Date().toISOString() : null, notas: x.notas.trim() || null,
        tareas: [...new Set(elegidos.flatMap((s) => s.tareas))].map((t) => ({ t, ok: false })),   // sin repetir tareas comunes
      }).select('id').single();
      if (error) throw new Error(error.message);
      if (elegidos.length) {
        const { error: e2 } = await ctx.api.from('tal_orden_servicios').insert(elegidos.map((s, i) => ({
          orden_id: orden.id, empresa_id: ctx.empresa.id, servicio_id: s.id, nombre: s.nombre, precio: precioTalla(s, veh.talla) ?? 0, orden: i + 1,
        })));
        if (e2) throw new Error(e2.message);
      }
      avisar(`Orden N° ${numero} creada${esEmpresa(cliente) || porCotizarDe(terceroOrden) ? ' con Factura' : ''}.`);
      location.hash = ctx.ruta('taller.orden', { id: orden.id });
    },
  });
}
