export default {
  id: 'costos',
  nombre: 'Costos y gastos',
  version: '1.1.0',
  icono: 'dinero',
  categoria: 'Finanzas',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'costos.registros', label: 'Gastos e ingresos', vista: () => import('./vistas/registros.js') },
    { id: 'costos.registro', label: 'Registro', oculto: true, padre: 'costos.registros', vista: () => import('./vistas/registro.js') },
    { id: 'costos.lector', label: 'Leer boleta o factura', pestana: 'Leer boleta', vista: () => import('./vistas/lector.js') },
    { id: 'costos.recurrentes', ajustes: true, label: 'Gastos recurrentes', pestana: 'Recurrentes', vista: () => import('./vistas/recurrentes.js') },
    { id: 'costos.config', ajustes: true, label: 'Categorías y centros', pestana: 'Categorías', vista: () => import('./vistas/config.js') },
  ],
  config: {},
  migraciones: ['db/001_costos.sql', 'db/002_lector.sql'],
};
