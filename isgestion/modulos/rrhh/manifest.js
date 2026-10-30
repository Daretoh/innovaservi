export default {
  id: 'rrhh',
  nombre: 'Recursos Humanos',
  version: '1.0.0',
  icono: 'carpeta',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { rrhh: { label: 'Trabajadores', icono: 'users' } },
  categoria: 'Personas',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'rrhh.trabajadores', label: 'Trabajadores', vista: () => import('./vistas/trabajadores.js?v=af5b0f2') },
    { id: 'rrhh.ficha', label: 'Ficha', oculto: true, padre: 'rrhh.trabajadores', vista: () => import('./vistas/ficha.js?v=af5b0f2') },
    { id: 'rrhh.fichas', label: 'Fichas de ingreso', vista: () => import('./vistas/fichas.js?v=af5b0f2') },
    { id: 'rrhh.ingreso', label: 'Ficha de ingreso', oculto: true, padre: 'rrhh.fichas', vista: () => import('./vistas/ingreso.js?v=af5b0f2') },
    { id: 'rrhh.documentos', label: 'Estado documental', vista: () => import('./vistas/documentos.js?v=af5b0f2') },
    { id: 'rrhh.proximas', label: 'Asignados a faenas próximas', oculto: true, padre: 'rrhh.documentos', vista: () => import('./vistas/proximas.js?v=af5b0f2') },
    { id: 'rrhh.lectura', label: 'Leer vencimientos de cédulas', oculto: true, padre: 'rrhh.documentos', vista: () => import('./vistas/lectura.js?v=af5b0f2') },
    { id: 'rrhh.finiquitos', label: 'Finiquitos', pestana: 'Finiquitos', icono: 'documento', vista: () => import('./vistas/finiquitos.js?v=af5b0f2') },
    { id: 'rrhh.nomina', label: 'Nómina para clientes', pestana: 'Nómina para clientes', icono: 'correo', vista: () => import('./vistas/nomina.js?v=af5b0f2') },
    { id: 'rrhh.tipos', ajustes: true, label: 'Tipos de documento', vista: () => import('./vistas/tipos.js?v=af5b0f2') },
  ],
  config: {
    // Integración con Buk (InnovaServi la usa para generar documentos legales). Apagada por defecto.
    usa_buk: { tipo: 'bool', etiqueta: 'Usa Buk (marca por trabajador y exportación Datos para Buk)', default: false },
  },
  migraciones: ['db/001_rrhh.sql', 'db/002_fichas_ingreso.sql', 'db/003_actividad.sql', 'db/004_contrato_finiquitos.sql'],
};
