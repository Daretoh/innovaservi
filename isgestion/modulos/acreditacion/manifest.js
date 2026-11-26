export default {
  id: 'acreditacion',
  nombre: 'Acreditación',
  version: '1.0.0',
  icono: 'carpeta',
  categoria: 'RRHH',
  depende: ['nucleo', 'terceros'],
  rubros: ['contratistas'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'acreditacion.mandantes', label: 'Requisitos por mandante', vista: () => import('./vistas/mandantes.js?v=cd68dd0') },
    { id: 'acreditacion.mandante', label: 'Mandante', oculto: true, padre: 'acreditacion.mandantes', vista: () => import('./vistas/mandante.js?v=cd68dd0') },
    { id: 'acreditacion.documentos', label: 'Documentos de empresa', pestana: 'Empresa', vista: () => import('./vistas/documentos.js?v=cd68dd0') },
    { id: 'acreditacion.tipo', label: 'Documento', oculto: true, padre: 'acreditacion.documentos', vista: () => import('./vistas/tipo.js?v=cd68dd0') },
  ],
  config: {},
  migraciones: ['db/001_acreditacion.sql', 'db/002_nomina.sql', 'db/003_trabajadores.sql', 'db/004_requisitos_lugar.sql'],
};
