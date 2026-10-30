export default {
  id: 'asistencia',
  nombre: 'Asistencia',
  version: '1.0.0',
  icono: 'reloj',
  categoria: 'Personas',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'asistencia.horas', label: 'Registro de horas', vista: () => import('./vistas/horas.js?v=14ad9ff') },
    { id: 'asistencia.marcajes', label: 'Marcajes', vista: () => import('./vistas/marcajes.js?v=14ad9ff') },
  ],
  config: {},
  migraciones: ['db/001_asistencia.sql', 'db/002_origen.sql', 'db/003_solo_vueltas.sql', 'db/004_fijos_automatico.sql'],
};
