export default {
  id: 'cotizaciones',
  nombre: 'Cotizaciones',
  version: '1.1.0',
  icono: 'documento',
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'cotizaciones.lista', label: 'Cotizaciones', vista: () => import('./vistas/lista.js') },
    { id: 'cotizaciones.editor', label: 'Cotización', oculto: true, padre: 'cotizaciones.lista', vista: () => import('./vistas/editor.js') },
    { id: 'cotizaciones.precios', label: 'Listas de precios', vista: () => import('./vistas/precios.js') },
    { id: 'cotizaciones.config', ajustes: true, label: 'Diseño de la cotización', pestana: 'Diseño', vista: () => import('./vistas/config.js') },
  ],
  config: {},
  migraciones: ['db/001_cotizaciones.sql', 'db/002_mover_lineas.sql'],
};
