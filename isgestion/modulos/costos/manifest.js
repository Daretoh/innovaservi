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
    extra: [{ label: 'Escanear documentos', icono: 'camara', requiere: ['costos', 'crear'], ruta: 'costos.bandeja', abrir: (ctx) => import('./vistas/bandeja.js?v=dcd938a').then((m) => m.escanearABandeja(ctx)) }],
  },
  menu: [
    { id: 'costos.registros', label: 'Gastos e ingresos', vista: () => import('./vistas/registros.js?v=dcd938a') },
    { id: 'costos.registro', label: 'Registro', oculto: true, padre: 'costos.registros', vista: () => import('./vistas/registro.js?v=dcd938a') },
    { id: 'costos.subir', label: 'Subir documentos', pestana: 'Subir', icono: 'camara', vista: () => import('./vistas/subir.js?v=dcd938a') },
    { id: 'costos.bandeja', label: 'Por cargar', pestana: 'Por cargar', icono: 'lista', vista: () => import('./vistas/bandeja.js?v=dcd938a') },
    { id: 'costos.pagos', label: 'Pagos', pestana: 'Pagos', icono: 'check', vista: () => import('./vistas/pagos.js?v=dcd938a') },
    { id: 'costos.cuenta', label: 'Cuenta de contratista', oculto: true, padre: 'costos.pagos', vista: () => import('./vistas/cuenta.js?v=dcd938a') },
    { id: 'costos.flujo', label: 'Flujo de caja', pestana: 'Flujo de caja', icono: 'grafico', vista: () => import('./vistas/flujo.js?v=dcd938a') },
    { id: 'costos.balance', label: 'Balance de gestión', pestana: 'Balance', icono: 'columnas', vista: () => import('./vistas/balance.js?v=dcd938a') },
    { id: 'costos.lector', label: 'Leer boleta o factura', oculto: true, padre: 'costos.subir', compartida: true, vista: () => import('./vistas/lector.js?v=dcd938a') },
    { id: 'costos.recurrentes', ajustes: true, label: 'Gastos recurrentes', pestana: 'Recurrentes', vista: () => import('./vistas/recurrentes.js?v=dcd938a') },
    { id: 'costos.proveedores', ajustes: true, label: 'Proveedores', pestana: 'Proveedores', vista: () => import('./vistas/proveedores.js?v=dcd938a') },
    { id: 'costos.config', ajustes: true, label: 'Categorías y centros', pestana: 'Categorías', vista: () => import('./vistas/config.js?v=dcd938a') },
  ],
  config: {
    // Centros de costo (2026-11-05): apagado, el gasto se ordena por categoría (y faena en Innova). Para clientes que
    // separan sus gastos por área o proyecto. Apagarlo no borra los centros ya puestos: solo dejan de pedirse y verse.
    centros: { tipo: 'bool', etiqueta: 'Usar centros de costo (separar los gastos por área o proyecto)', default: false },
  },
  migraciones: ['db/001_costos.sql', 'db/002_lector.sql', 'db/003_estados.sql', 'db/004_pagos.sql', 'db/005_carga.sql', 'db/006_tesoreria.sql', 'db/007_a_cuenta.sql', 'db/008_bandeja.sql'],
};
