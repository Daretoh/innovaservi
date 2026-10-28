export default {
  id: 'ope',
  nombre: 'Faenas y planificación',
  version: '1.0.0',
  icono: 'calendario',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas', 'terceros', 'asistencia'],
  rubros: ['servicios'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  // El Calendario va como opción propia del menú (como en InnovaGestión), antes de Faenas y planificación
  apartados: { calendario: { label: 'Calendario', icono: 'calendario' } },
  menu: [
    { id: 'ope.calendario', label: 'Calendario', apartado: 'calendario', vista: () => import('./vistas/calendario.js?v=a4abe71') },
    { id: 'ope.planificacion', label: 'Planificación semanal', pestana: 'Planificación', vista: () => import('./vistas/planificacion.js?v=a4abe71') },
    { id: 'ope.plan', label: 'Planificar faena', oculto: true, padre: 'ope.planificacion', vista: () => import('./vistas/plan.js?v=a4abe71') },
    { id: 'ope.matrices', label: 'Matriz de trabajos', pestana: 'Matriz', vista: () => import('./vistas/matrices.js?v=a4abe71') },
    { id: 'ope.clientes', ajustes: true, label: 'Clientes y sitios', vista: () => import('./vistas/clientes.js?v=a4abe71') },
    { id: 'ope.roles', ajustes: true, label: 'Roles operativos', pestana: 'Roles', vista: () => import('./vistas/roles.js?v=a4abe71') },
  ],
  config: {},
  migraciones: ['db/001_ope.sql', 'db/002_matriz_preparacion.sql', 'db/003_planificacion.sql', 'db/004_dias_obs.sql'],
};
