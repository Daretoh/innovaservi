export default {
  id: 'taller',
  nombre: 'Taller',
  version: '1.0.0',
  icono: 'auto',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas', 'terceros'],
  rubros: ['automotriz'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],
  // Teléfono (core/movil.js): Taller y Agenda en la barra de abajo; el "+" del centro agenda un vehículo (recepción)
  movil: {
    accesos: [{ id: 'taller.tablero', label: 'Taller', icono: 'auto' }, { id: 'taller.agenda', label: 'Agenda', icono: 'calendario' }],
    accion: { label: 'Agendar vehículo', icono: 'mas', requiere: 'crear', abrir: (ctx) => import('./recepcion.js?v=64a4e9f').then((m) => m.recepcion(ctx)) },
  },
  menu: [
    { id: 'taller.tablero', label: 'Tablero del taller', pestana: 'Tablero', vista: () => import('./vistas/tablero.js?v=64a4e9f') },
    { id: 'taller.orden', label: 'Orden de trabajo', oculto: true, padre: 'taller.tablero', vista: () => import('./vistas/orden.js?v=64a4e9f') },
    { id: 'taller.calendario', label: 'Calendario', vista: () => import('./vistas/calendario.js?v=64a4e9f') },
    { id: 'taller.agenda', label: 'Agenda', vista: () => import('./vistas/agenda.js?v=64a4e9f') },
    { id: 'taller.cobros', label: 'Cobros', requiere: 'editar', vista: () => import('./vistas/cobros.js?v=64a4e9f') },
    { id: 'taller.clientes', label: 'Clientes', pestana: 'Clientes', vista: () => import('./vistas/clientes.js?v=64a4e9f') },
    { id: 'taller.vehiculos', label: 'Vehículos de clientes', pestana: 'Vehículos', vista: () => import('./vistas/vehiculos.js?v=64a4e9f') },
    { id: 'taller.vehiculo', label: 'Vehículo', oculto: true, padre: 'taller.vehiculos', vista: () => import('./vistas/vehiculo.js?v=64a4e9f') },
    { id: 'taller.servicios', label: 'Servicios y precios', vista: () => import('./vistas/servicios.js?v=64a4e9f') },
  ],
  config: {
    // VB del jefe de taller (flujo comercial y taller): el operador llega hasta Terminado; Entregado solo con VB y PIN
    vb_entrega: { tipo: 'bool', etiqueta: 'Entregar solo con VB del jefe de taller (permiso aprobar y PIN)', default: false },
  },
  migraciones: ['db/001_taller.sql', 'db/002_vb.sql', 'db/003_clientes.sql', 'db/004_prioridad_manual.sql', 'db/005_por_cotizar.sql', 'db/006_catalogo_aprobar.sql', 'db/007_roles_tablet.sql', 'db/008_operador_agenda.sql', 'db/009_unir_eliminar.sql', 'db/010_unir_vehiculos.sql'],
};
