export default {
  id: 'acreditacion',
  nombre: 'Acreditación',
  version: '1.0.0',
  icono: 'carpeta',
  categoria: 'Operaciones',
  depende: ['nucleo', 'terceros'],
  rubros: ['contratistas'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'acreditacion.documentos', label: 'Documentos de empresa', pestana: 'Documentos', vista: () => import('./vistas/documentos.js') },
    { id: 'acreditacion.tipo', label: 'Documento', oculto: true, padre: 'acreditacion.documentos', vista: () => import('./vistas/tipo.js') },
    { id: 'acreditacion.mandantes', label: 'Requisitos por mandante', vista: () => import('./vistas/mandantes.js') },
    { id: 'acreditacion.mandante', label: 'Mandante', oculto: true, padre: 'acreditacion.mandantes', vista: () => import('./vistas/mandante.js') },
  ],
  config: {},
  migraciones: ['db/001_acreditacion.sql', 'db/002_nomina.sql'],
};
