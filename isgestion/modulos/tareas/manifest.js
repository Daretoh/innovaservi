export default {
  id: 'tareas',
  nombre: 'Tareas',
  version: '1.0.0',
  icono: 'check',
  categoria: 'Gestión',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'tareas.lista', label: 'Tareas', vista: () => import('./vistas/lista.js') },
  ],
  config: {},
  migraciones: ['db/001_tareas.sql'],
};
