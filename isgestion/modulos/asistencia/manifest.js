export default {
  id: 'asistencia',
  nombre: 'Asistencia',
  version: '1.0.0',
  icono: 'reloj',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'asistencia.horas', label: 'Registro de horas', vista: () => import('./vistas/horas.js?v=58a63ab') },
    { id: 'asistencia.marcajes', label: 'Marcajes', vista: () => import('./vistas/marcajes.js?v=58a63ab') },
    { id: 'asistencia.resumen', label: 'Resumen del mes', icono: 'reloj', vista: () => import('./vistas/resumen.js?v=58a63ab') },
  ],
  config: {},
  migraciones: ['db/001_asistencia.sql', 'db/002_origen.sql', 'db/003_solo_vueltas.sql', 'db/004_fijos_automatico.sql', 'db/005_condiciones_editar.sql', 'db/006_licencias.sql'],
};
