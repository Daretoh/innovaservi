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
    { id: 'postulantes.tablero', label: 'Postulantes', pestana: 'Tablero', icono: 'users', vista: () => import('./vistas/tablero.js?v=09fc2dc') },
    { id: 'postulantes.ficha', label: 'Postulante', oculto: true, padre: 'postulantes.tablero', vista: () => import('./vistas/postulante.js?v=09fc2dc') },
    { id: 'postulantes.procesos', label: 'Procesos de selección', pestana: 'Procesos', icono: 'briefcase', vista: () => import('./vistas/procesos.js?v=09fc2dc') },
    { id: 'postulantes.etapas', ajustes: true, label: 'Etapas', icono: 'columnas', vista: () => import('./vistas/etapas.js?v=09fc2dc') },
  ],
  config: {},
  migraciones: ['db/001_postulantes.sql'],
};
