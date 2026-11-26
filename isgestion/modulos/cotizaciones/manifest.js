export default {
  id: 'cotizaciones',
  nombre: 'Cotizaciones',
  version: '1.4.0',
  icono: 'documento',
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'cotizaciones.lista', label: 'Cotizaciones', vista: () => import('./vistas/lista.js?v=d971811') },
    { id: 'cotizaciones.editor', label: 'Cotización', oculto: true, padre: 'cotizaciones.lista', vista: () => import('./vistas/editor.js?v=d971811') },
    // Facturas va en Finanzas → Ventas y cobros (apartado finventas de Costos, 2026-11-24); sin Costos queda sola en Comercial
    { id: 'cotizaciones.oc', apartado: 'finventas', orden: 1, label: 'Facturas', icono: 'dinero', vista: () => import('./vistas/facturas.js?v=d971811') },
    { id: 'cotizaciones.precios', label: 'Listas de precios', vista: () => import('./vistas/precios.js?v=d971811') },
    { id: 'cotizaciones.config', ajustes: true, label: 'Diseño de la cotización', pestana: 'Diseño', vista: () => import('./vistas/config.js?v=d971811') },
  ],
  config: {},
  migraciones: ['db/001_cotizaciones.sql', 'db/002_mover_lineas.sql', 'db/003_editado.sql', 'db/004_agrupar.sql', 'db/005_seguimiento.sql', 'db/006_agrupar_cotizacion.sql', 'db/007_facturas.sql', 'db/008_factura_orden.sql', 'db/009_madre.sql', 'db/010_dte.sql', 'db/011_orden_al_dia.sql', 'db/012_factura_orden_cobrada.sql'],
};
