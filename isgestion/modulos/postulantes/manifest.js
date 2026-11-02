export default {
  id: 'postulantes',
  nombre: 'Postulantes',
  version: '1.0.0',
  icono: 'briefcase',
  categoria: 'RRHH',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'postulantes.tablero', label: 'Postulantes', pestana: 'Tablero', icono: 'users', vista: () => import('./vistas/tablero.js?v=a2dff54') },
    { id: 'postulantes.ficha', label: 'Postulante', oculto: true, padre: 'postulantes.tablero', vista: () => import('./vistas/postulante.js?v=a2dff54') },
    { id: 'postulantes.procesos', label: 'Procesos de selección', pestana: 'Procesos', icono: 'briefcase', vista: () => import('./vistas/procesos.js?v=a2dff54') },
    { id: 'postulantes.etapas', ajustes: true, label: 'Etapas', icono: 'columnas', vista: () => import('./vistas/etapas.js?v=a2dff54') },
  ],
  config: {},
  migraciones: ['db/001_postulantes.sql'],
};
