export default {
  id: 'resultados',
  nombre: 'Estado de resultados',
  version: '1.1.0',
  icono: 'documento',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { resultados: { label: 'Resultados', icono: 'grafico' } },
  categoria: 'Finanzas',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'exportar'],
  menu: [
    { id: 'resultados.estado', label: 'Estado de resultados', vista: () => import('./vistas/estado.js?v=419b261') },
    { id: 'resultados.ordenes', label: 'Utilidad por orden', pestana: 'Por orden', vista: () => import('./vistas/ordenes.js?v=419b261') },
    { id: 'resultados.clientes', label: 'Resultado por cliente', pestana: 'Por cliente', vista: () => import('./vistas/clientes.js?v=419b261') },
    { id: 'resultados.pendientes', label: 'Por cobrar y por pagar', pestana: 'Por cobrar y pagar', vista: () => import('./vistas/pendientes.js?v=419b261') },
    // Finanzas → Estadísticas (apartado finest de Costos, 2026-11-24): ventas y comparación, con el cálculo del Estado de resultados
    { id: 'resultados.ventas', apartado: 'finest', orden: 2, label: 'Estadísticas de ventas', pestana: 'Ventas', icono: 'grafico', vista: () => import('./vistas/ventas.js?v=419b261').then((m) => ({ default: m.vistaVentas })) },
    { id: 'resultados.comparacion', apartado: 'finest', orden: 3, label: 'Lo que entra y lo que sale', pestana: 'Comparación', icono: 'columnas', vista: () => import('./vistas/ventas.js?v=419b261').then((m) => ({ default: m.vistaComparacion })) },
  ],
  config: {},
  migraciones: ['db/001_resultados.sql', 'db/002_cierres.sql', 'db/003_intercompania.sql', 'db/004_por_cliente.sql'],
};
