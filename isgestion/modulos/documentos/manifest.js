export default {
  id: 'documentos',
  nombre: 'Generador de documentos',
  version: '1.0.0',
  icono: 'documento',
  categoria: 'RRHH',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar'],
  menu: [
    { id: 'documentos.generar', label: 'Generar documentos', pestana: 'Generar', icono: 'documento', vista: () => import('./vistas/generar.js?v=f240e56') },
    { id: 'documentos.pts', label: 'Editar PTS', oculto: true, padre: 'documentos.generar', vista: () => import('./vistas/pts.js?v=f240e56') },
    { id: 'documentos.config', ajustes: true, label: 'Datos y firmas', pestana: 'Datos y firmas', icono: 'ajustes', vista: () => import('./vistas/config.js?v=f240e56') },
  ],
  config: {},
  migraciones: ['db/001_documentos.sql'],
};
