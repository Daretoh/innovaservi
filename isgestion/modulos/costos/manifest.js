export default {
  id: 'costos',
  nombre: 'Costos y gastos',
  version: '1.3.0',
  icono: 'dinero',
  categoria: 'Finanzas',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],
  // Teléfono: "Escanear documentos" en el abanico del "+" (cámara con varias fotos seguidas → bandeja Por cargar)
  movil: {
    // unir (2026-11-17): también junto a un "+" de una sola acción, como "Agendar vehículo" del taller (Administrativa de
    // Performance: taller.crear y costos.crear). Quien no puede crear en Costos no la ve.
    extra: [{ label: 'Escanear documentos', icono: 'camara', requiere: ['costos', 'crear'], ruta: 'costos.bandeja', unir: true, abrir: (ctx) => import('./vistas/bandeja.js?v=0cc60b3').then((m) => m.escanearABandeja(ctx)) }],
  },
  // Orden de Finanzas (2026-11-24, pedido de Enzo), separado como el SII:
  // - Compras y gastos (este módulo): todo entra por la Bandeja → queda en Gastos → se sigue a los proveedores que
  //   importan → Recurrentes y Estadísticas. Flujo de caja y Balance pasaron al Grupo (Caja del grupo): aquí quedan
  //   como pantallas ocultas, que abre esa vista para anotar saldos y deudas.
  // - Ventas y cobros (apartado `finventas`): Facturas (de Cotizaciones, orden 1; arriba trae las ventas del SII por registrar)
  //   y Otros ingresos.
  // - Estadísticas (apartado `finest`): Gastos (este módulo), Ventas y Comparación (Resultados, quien lo ve).
  // - Cuadre SII (apartado `finsii`): compras y ventas del mes contra el SII.
  etiqueta: 'Compras y gastos',
  apartados: { finventas: { label: 'Ventas y cobros', icono: 'documento' }, finest: { label: 'Estadísticas', icono: 'grafico' }, finsii: { label: 'Cuadre SII', icono: 'escudo' } },
  menu: [
    { id: 'costos.bandeja', label: 'Bandeja de compras', pestana: 'Bandeja', icono: 'lista', vista: () => import('./vistas/bandeja.js?v=0cc60b3') },
    { id: 'costos.registros', label: 'Gastos', pestana: 'Gastos', vista: () => import('./vistas/registros.js?v=0cc60b3') },
    { id: 'costos.registro', label: 'Registro', oculto: true, padre: 'costos.registros', compartida: true, vista: () => import('./vistas/registro.js?v=0cc60b3') },
    { id: 'costos.pagos', label: 'Proveedores y cuentas', pestana: 'Proveedores', icono: 'users', vista: () => import('./vistas/pagos.js?v=0cc60b3') },
    { id: 'costos.cuenta', label: 'Cuenta del proveedor', oculto: true, padre: 'costos.pagos', vista: () => import('./vistas/cuenta.js?v=0cc60b3') },
    { id: 'costos.proveedores', ajustes: true, oculto: true, padre: 'costos.pagos', label: 'Todos los proveedores', vista: () => import('./vistas/proveedores.js?v=0cc60b3') },
    { id: 'costos.recurrentes', ajustes: true, label: 'Recurrentes', pestana: 'Recurrentes', vista: () => import('./vistas/recurrentes.js?v=0cc60b3') },
    { id: 'costos.config', ajustes: true, label: 'Categorías y centros', pestana: 'Categorías', vista: () => import('./vistas/config.js?v=0cc60b3') },
    // Las ventas del SII por registrar ya salen arriba en Facturas: esta ruta (antes pestaña Ventas de la Bandeja) lleva allá
    { id: 'costos.ventas', oculto: true, padre: 'costos.ingresos', compartida: true, label: 'Ventas por registrar', vista: () => import('./vistas/bandeja.js?v=0cc60b3').then((m) => ({ default: m.vistaVentas })) },
    { id: 'costos.ingresos', apartado: 'finventas', orden: 3, label: 'Otros ingresos', pestana: 'Otros ingresos', icono: 'dinero', vista: () => import('./vistas/ingresos.js?v=0cc60b3') },
    // Estadísticas: opción propia de Finanzas (apartado finest) con Gastos, y Ventas y Comparación de Resultados
    { id: 'costos.estadisticas', apartado: 'finest', orden: 1, label: 'Estadísticas de gastos', pestana: 'Gastos', icono: 'grafico', vista: () => import('./vistas/estadisticas.js?v=0cc60b3') },
    // Cuadre con el SII (OpenFactura, Núcleo 021): RCV y diferencias documento a documento; costos.aprobar
    { id: 'costos.sii', apartado: 'finsii', label: 'Cuadre SII', pestana: 'Cuadre SII', icono: 'escudo', vista: () => import('./vistas/sii.js?v=0cc60b3') },
    { id: 'costos.flujo', label: 'Flujo de caja', oculto: true, padre: 'costos.registros', icono: 'grafico', vista: () => import('./vistas/flujo.js?v=0cc60b3') },
    { id: 'costos.balance', label: 'Balance de gestión', oculto: true, padre: 'costos.registros', icono: 'columnas', vista: () => import('./vistas/balance.js?v=0cc60b3') },
    { id: 'costos.subir', label: 'Subir documentos', oculto: true, padre: 'costos.bandeja', vista: () => import('./vistas/subir.js?v=0cc60b3') },
    { id: 'costos.lector', label: 'Leer boleta o factura', oculto: true, padre: 'costos.bandeja', compartida: true, vista: () => import('./vistas/lector.js?v=0cc60b3') },
  ],
  config: {
    // Centros de costo (2026-11-05): apagado, el gasto se ordena por categoría (y faena en Innova). Para clientes que
    // separan sus gastos por área o proyecto. Apagarlo no borra los centros ya puestos: solo dejan de pedirse y verse.
    centros: { tipo: 'bool', etiqueta: 'Usar centros de costo (separar los gastos por área o proyecto)', default: false },
    // ¿A qué va? (2026-11-12, pedido de Enzo para Performance): al cargar un documento hay que decir si es de un vehículo,
    // de un tercero (a su cuenta, ej. D&P), de una faena o gasto general de la empresa.
    exigir_destino: { tipo: 'bool', etiqueta: 'Al cargar un gasto, exigir a qué va (vehículo, tercero, faena o gasto general)', default: false },
  },
  migraciones: ['db/001_costos.sql', 'db/002_lector.sql', 'db/003_estados.sql', 'db/004_pagos.sql', 'db/005_carga.sql', 'db/006_tesoreria.sql', 'db/007_a_cuenta.sql', 'db/008_bandeja.sql', 'db/009_categorias_nuevas.sql', 'db/010_imposiciones.sql', 'db/011_declarado.sql', 'db/012_declarado_factura.sql'],
};
