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
    // Solo para quien edita clientes: el operador del taller ya los ve en Taller → Clientes (pedido de Enzo, 2026-10-27)
    { id: 'terceros.listado', label: 'Clientes y proveedores', apartado: 'maestros', requiere: 'editar', vista: () => import('./vistas/listado.js?v=25e9201') },
  ],
  config: {},
  migraciones: [],   // su tabla está en db/nucleo/001_nucleo.sql
};
