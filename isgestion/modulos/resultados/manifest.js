export default {
  id: 'resultados',
  nombre: 'Estado de resultados',
  version: '1.1.0',
  icono: 'documento',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { resultados: { label: 'Estado de resultados', icono: 'grafico' } },
  categoria: 'Finanzas',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'exportar'],
  menu: [
    { id: 'resultados.estado', label: 'Estado de resultados', vista: () => import('./vistas/estado.js?v=08113ef') },
    { id: 'resultados.ordenes', label: 'Utilidad por orden', pestana: 'Por orden', vista: () => import('./vistas/ordenes.js?v=08113ef') },
    { id: 'resultados.clientes', label: 'Resultado por cliente', pestana: 'Por cliente', vista: () => import('./vistas/clientes.js?v=08113ef') },
    { id: 'resultados.pendientes', label: 'Por cobrar y por pagar', pestana: 'Por cobrar y pagar', vista: () => import('./vistas/pendientes.js?v=08113ef') },
  ],
  config: {},
  migraciones: ['db/001_resultados.sql', 'db/002_cierres.sql', 'db/003_intercompania.sql', 'db/004_por_cliente.sql'],
};
