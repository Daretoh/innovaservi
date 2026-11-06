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
  // Teléfono (core/movil.js): el "+" de la barra agrega una tarea o una faena al calendario
  // Pestañas: Asistencia y Reportes de trabajo (fotos en terreno)
  movil: {
    accesos: [{ id: 'asistencia.horas', label: 'Asistencia', icono: 'reloj' }, { id: 'reportes.lista', label: 'Reportes', icono: 'camara' }],
    accion: { label: 'Agregar tarea o faena', icono: 'mas', opciones: [
      { label: 'Tarea', icono: 'check', requiere: ['tareas', 'crear'], ruta: 'tareas.lista', abrir: (ctx) => import('./movil.js?v=d781526').then((m) => m.nuevaTareaMovil(ctx)) },
      { label: 'Faena al calendario', icono: 'calendario', requiere: ['ope', 'crear'], ruta: 'ope.calendario', abrir: (ctx) => import('./movil.js?v=d781526').then((m) => m.nuevaFaena(ctx)) },
    ] },
  },
  apartados: { calendario: { label: 'Calendario', icono: 'calendario' } },
  menu: [
    { id: 'ope.calendario', label: 'Calendario', apartado: 'calendario', vista: () => import('./vistas/calendario.js?v=d781526') },
    { id: 'ope.planificacion', label: 'Planificación semanal', pestana: 'Planificación', vista: () => import('./vistas/planificacion.js?v=d781526') },
    { id: 'ope.plan', label: 'Planificar faena', oculto: true, padre: 'ope.planificacion', vista: () => import('./vistas/plan.js?v=d781526') },
    { id: 'ope.matrices', label: 'Matriz de trabajos', pestana: 'Matriz', vista: () => import('./vistas/matrices.js?v=d781526') },
    { id: 'ope.clientes', ajustes: true, label: 'Clientes y sitios', vista: () => import('./vistas/clientes.js?v=d781526') },
    { id: 'ope.roles', ajustes: true, label: 'Roles operativos', pestana: 'Roles', vista: () => import('./vistas/roles.js?v=d781526') },
  ],
  config: {},
  migraciones: ['db/001_ope.sql', 'db/002_matriz_preparacion.sql', 'db/003_planificacion.sql', 'db/004_dias_obs.sql', 'db/005_serie_editable.sql'],
};
