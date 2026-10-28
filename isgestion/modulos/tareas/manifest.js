export default {
  id: 'tareas',
  nombre: 'Tareas',
  version: '2.0.0',
  icono: 'check',
  categoria: 'Gestión',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'tareas.lista', label: 'Tareas', vista: () => import('./vistas/lista.js?v=a4abe71') },
  ],
  config: {},
  migraciones: ['db/001_tareas.sql', 'db/002_v2.sql'],
};
