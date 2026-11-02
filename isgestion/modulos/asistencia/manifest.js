export default {
  id: 'asistencia',
  nombre: 'Asistencia',
  version: '1.0.0',
  icono: 'reloj',
  categoria: 'RRHH',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'asistencia.horas', label: 'Registro de horas', vista: () => import('./vistas/horas.js?v=cbd7cda') },
    { id: 'asistencia.marcajes', label: 'Marcajes', vista: () => import('./vistas/marcajes.js?v=cbd7cda') },
  ],
  config: {},
  migraciones: ['db/001_asistencia.sql', 'db/002_origen.sql', 'db/003_solo_vueltas.sql', 'db/004_fijos_automatico.sql', 'db/005_condiciones_editar.sql', 'db/006_licencias.sql'],
};
