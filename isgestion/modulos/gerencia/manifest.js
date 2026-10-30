export default {
  id: 'gerencia',
  nombre: 'Gerencia',
  version: '1.0.0',
  icono: 'inicio',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { gerencia: { label: 'Gerencia', icono: 'grafico' } },
  categoria: 'Gerencia',
  depende: ['nucleo', 'resultados'],
  rubros: ['todos'],
  acciones: ['ver', 'exportar'],
  menu: [
    { id: 'gerencia.panel', label: 'Panel de gerencia', pestana: 'Panel', vista: () => import('./vistas/panel.js?v=ca87e0a') },
    { id: 'gerencia.grupo', label: 'Vista Grupo', vista: () => import('./vistas/grupo.js?v=ca87e0a') },
  ],
  config: {},
  migraciones: ['db/001_gerencia.sql'],
};
