export default {
  id: 'cierres',
  nombre: 'Cierres y cuentas',
  version: '1.0.0',
  icono: 'documento',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { cierres: { label: 'Cierres y cuentas', icono: 'lista' } },
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros', 'taller', 'cotizaciones'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'exportar'],
  menu: [
    { id: 'cierres.mensuales', label: 'Cierres', vista: () => import('./vistas/mensuales.js?v=c9a2c01') },
    { id: 'cierres.cierre', label: 'Cierre', oculto: true, padre: 'cierres.mensuales', vista: () => import('./vistas/cierre.js?v=c9a2c01') },
    { id: 'cierres.clientes', label: 'Clientes con cierre', oculto: true, padre: 'cierres.mensuales', vista: () => import('./vistas/clientes.js?v=c9a2c01') },
    { id: 'cierres.cuentas', label: 'Cuentas corrientes', vista: () => import('./vistas/cuentas.js?v=c9a2c01') },
    { id: 'cierres.cuenta', label: 'Cuenta corriente', oculto: true, padre: 'cierres.cuentas', vista: () => import('./vistas/cuenta.js?v=c9a2c01') },
  ],
  config: {},
  migraciones: ['db/001_cierres.sql', 'db/002_faenas.sql', 'db/003_montos_miembro.sql', 'db/004_arrastre.sql', 'db/005_mes_entrega.sql', 'db/006_cotizacion.sql'],
};
