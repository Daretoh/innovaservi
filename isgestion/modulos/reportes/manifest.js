export default {
  id: 'reportes',
  nombre: 'Reportes de trabajo',
  version: '1.1.0',
  icono: 'camara',
  categoria: 'Operaciones',
  depende: ['nucleo', 'terceros', 'ope'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'reportes.lista', label: 'Partes de trabajo', pestana: 'Partes', vista: () => import('./vistas/lista.js?v=14e2347') },
    { id: 'reportes.parte', label: 'Parte de trabajo', oculto: true, padre: 'reportes.lista', vista: () => import('./vistas/parte.js?v=14e2347') },
    { id: 'reportes.config', ajustes: true, label: 'Diseño del informe', vista: () => import('./vistas/config.js?v=14e2347') },
  ],
  config: {},
  migraciones: ['db/001_reportes.sql', 'db/002_recordar_cliente.sql', 'db/003_portada.sql', 'db/004_informe_faena.sql'],
};
