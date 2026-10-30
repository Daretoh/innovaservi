export default {
  id: 'cotizaciones',
  nombre: 'Cotizaciones',
  version: '1.2.0',
  icono: 'documento',
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'cotizaciones.lista', label: 'Cotizaciones', vista: () => import('./vistas/lista.js?v=9d0da9e') },
    { id: 'cotizaciones.editor', label: 'Cotización', oculto: true, padre: 'cotizaciones.lista', vista: () => import('./vistas/editor.js?v=9d0da9e') },
    { id: 'cotizaciones.oc', label: 'OC y facturas', icono: 'dinero', vista: () => import('./vistas/oc.js?v=9d0da9e') },
    { id: 'cotizaciones.precios', label: 'Listas de precios', vista: () => import('./vistas/precios.js?v=9d0da9e') },
    { id: 'cotizaciones.config', ajustes: true, label: 'Diseño de la cotización', pestana: 'Diseño', vista: () => import('./vistas/config.js?v=9d0da9e') },
  ],
  config: {},
  migraciones: ['db/001_cotizaciones.sql', 'db/002_mover_lineas.sql', 'db/003_editado.sql', 'db/004_agrupar.sql', 'db/005_seguimiento.sql'],
};
