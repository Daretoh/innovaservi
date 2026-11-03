export default {
  id: 'tareas',
  nombre: 'Tareas',
  version: '2.1.0',
  icono: 'check',
  categoria: '',   // sin categoría: fija arriba del menú, junto a Inicio (Enzo, 2026-11-02)
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'tareas.lista', label: 'Tareas', vista: () => import('./vistas/lista.js?v=0ad8916') },
  ],
  config: {},
  migraciones: ['db/001_tareas.sql', 'db/002_v2.sql', 'db/003_categorias.sql'],
};
