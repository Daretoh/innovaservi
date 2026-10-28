export default {
  id: 'personas',
  nombre: 'Personas',
  version: '1.0.0',
  icono: 'users',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { maestros: { label: 'Personas y clientes', icono: 'users' } },
  categoria: 'Administración',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'personas.listado', label: 'Personas', apartado: 'maestros', vista: () => import('./vistas/listado.js?v=384ede1') },
  ],
  config: {},
  migraciones: [],   // sus tablas están en db/nucleo/001_nucleo.sql
};
