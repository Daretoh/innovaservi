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
    { id: 'cierres.mensuales', label: 'Cierres mensuales', vista: () => import('./vistas/mensuales.js?v=9d0da9e') },
    { id: 'cierres.cierre', label: 'Cierre', oculto: true, padre: 'cierres.mensuales', vista: () => import('./vistas/cierre.js?v=9d0da9e') },
    { id: 'cierres.clientes', label: 'Clientes con cierre', oculto: true, padre: 'cierres.mensuales', vista: () => import('./vistas/clientes.js?v=9d0da9e') },
    { id: 'cierres.cuentas', label: 'Cuentas corrientes', vista: () => import('./vistas/cuentas.js?v=9d0da9e') },
    { id: 'cierres.cuenta', label: 'Cuenta corriente', oculto: true, padre: 'cierres.cuentas', vista: () => import('./vistas/cuenta.js?v=9d0da9e') },
  ],
  config: {},
  migraciones: ['db/001_cierres.sql', 'db/002_faenas.sql', 'db/003_montos_miembro.sql'],
};
