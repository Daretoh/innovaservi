export default {
  id: 'pos',
  nombre: 'Ventas en mesón',
  version: '1.1.0',
  icono: 'dinero',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { pos: { label: 'Ventas en mesón', icono: 'etiqueta' } },
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros', 'inventario'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'aprobar', 'exportar'],
  menu: [
    { id: 'pos.venta', label: 'Venta en mesón', pestana: 'Vender', vista: () => import('./vistas/venta.js?v=3b97680') },
    { id: 'pos.caja', label: 'Caja', vista: () => import('./vistas/caja.js?v=3b97680') },
    { id: 'pos.ventas', label: 'Ventas', vista: () => import('./vistas/ventas.js?v=3b97680') },
    { id: 'pos.detalle', label: 'Venta', oculto: true, padre: 'pos.ventas', vista: () => import('./vistas/detalle.js?v=3b97680') },
  ],
  config: {},
  migraciones: ['db/001_pos.sql', 'db/002_caja.sql'],
};
