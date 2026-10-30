export default {
  id: 'nucleo',
  nombre: 'Administración',
  version: '1.0.0',
  icono: 'escudo',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { nucleo: { label: 'Administración', icono: 'ajustes' } },
  categoria: 'Administración',
  depende: [],
  rubros: ['todos'],
  acciones: ['ver', 'editar', 'eliminar'],
  menu: [
    { id: 'nucleo.empresa', label: 'Empresa', vista: () => import('./vistas/empresa.js?v=605af68') },
    { id: 'nucleo.modulos', label: 'Módulos', icono: 'columnas', vista: () => import('./vistas/modulos.js?v=605af68') },
    { id: 'nucleo.usuarios', label: 'Usuarios', vista: () => import('./vistas/usuarios.js?v=605af68') },
    { id: 'nucleo.roles', label: 'Roles y permisos', vista: () => import('./vistas/roles.js?v=605af68') },
    { id: 'nucleo.auditoria', label: 'Auditoría', vista: () => import('./vistas/auditoria.js?v=605af68') },
  ],
  config: {},
  migraciones: [],   // sus tablas están en db/nucleo/
};
