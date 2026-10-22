export default {
  id: 'taller',
  nombre: 'Taller',
  version: '1.0.0',
  icono: 'llave',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas', 'terceros'],
  rubros: ['automotriz'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],
  menu: [
    { id: 'taller.tablero', label: 'Tablero del taller', pestana: 'Tablero', vista: () => import('./vistas/tablero.js') },
    { id: 'taller.orden', label: 'Orden de trabajo', oculto: true, padre: 'taller.tablero', vista: () => import('./vistas/orden.js') },
    { id: 'taller.calendario', label: 'Calendario', vista: () => import('./vistas/calendario.js') },
    { id: 'taller.agenda', label: 'Agenda', vista: () => import('./vistas/agenda.js') },
    { id: 'taller.cobros', label: 'Cobros', vista: () => import('./vistas/cobros.js') },
    { id: 'taller.clientes', label: 'Clientes', pestana: 'Clientes', vista: () => import('./vistas/clientes.js') },
    { id: 'taller.vehiculos', label: 'Vehículos de clientes', pestana: 'Vehículos', vista: () => import('./vistas/vehiculos.js') },
    { id: 'taller.vehiculo', label: 'Vehículo', oculto: true, padre: 'taller.vehiculos', vista: () => import('./vistas/vehiculo.js') },
    { id: 'taller.servicios', label: 'Servicios y precios', vista: () => import('./vistas/servicios.js') },
  ],
  config: {
    // VB del jefe de taller (flujo comercial y taller): el operador llega hasta Terminado; Entregado solo con VB y PIN
    vb_entrega: { tipo: 'bool', etiqueta: 'Entregar solo con VB del jefe de taller (permiso aprobar y PIN)', default: false },
  },
  migraciones: ['db/001_taller.sql', 'db/002_vb.sql', 'db/003_clientes.sql', 'db/004_prioridad_manual.sql'],
};
