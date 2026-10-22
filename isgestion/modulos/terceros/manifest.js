export default {
  id: 'terceros',
  nombre: 'Clientes y proveedores',
  version: '1.0.0',
  icono: 'briefcase',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { maestros: { label: 'Personas y clientes', icono: 'users' } },
  categoria: 'Administración',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'terceros.listado', label: 'Clientes y proveedores', apartado: 'maestros', vista: () => import('./vistas/listado.js') },
  ],
  config: {},
  migraciones: [],   // su tabla está en db/nucleo/001_nucleo.sql
};
