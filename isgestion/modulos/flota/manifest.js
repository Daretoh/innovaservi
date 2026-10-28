export default {
  id: 'flota',
  nombre: 'Flota',
  version: '1.0.0',
  icono: 'camion',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'flota.lista', label: 'Vehículos', vista: () => import('./vistas/lista.js?v=dab9182') },
    { id: 'flota.vehiculo', label: 'Vehículo', oculto: true, padre: 'flota.lista', vista: () => import('./vistas/vehiculo.js?v=dab9182') },
    { id: 'flota.gastos', label: 'Gastos de la flota', pestana: 'Gastos', vista: () => import('./vistas/gastos.js?v=dab9182') },
  ],
  config: {},
  migraciones: ['db/001_flota.sql', 'db/002_mantenciones.sql'],
};
