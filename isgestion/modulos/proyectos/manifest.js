export default {
  id: 'proyectos',
  nombre: 'Proyectos',
  version: '1.0.0',
  icono: 'building',
  apartados: { proyectos: { label: 'Proyectos', icono: 'building' } },
  categoria: 'Comercial',
  depende: ['nucleo'],
  rubros: ['servicios'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'proyectos.hoja', label: 'Proyectos', pestana: 'Proyecto', icono: 'building', vista: () => import('./vistas/hoja.js?v=32a213c') },
    { id: 'proyectos.modelo', label: 'Modelo SketchUp', pestana: 'Modelo SketchUp', icono: 'caja', vista: () => import('./vistas/modelo.js?v=32a213c') },
    { id: 'proyectos.resumen', label: 'Resumen para imprimir', pestana: 'Resumen', icono: 'documento', vista: () => import('./vistas/resumen.js?v=32a213c') },
    { id: 'proyectos.lista', label: 'Lista detallada', pestana: 'Lista detallada', icono: 'lista', vista: () => import('./vistas/lista.js?v=32a213c') },
  ],
  migraciones: ['db/001_proyectos.sql'],
};
