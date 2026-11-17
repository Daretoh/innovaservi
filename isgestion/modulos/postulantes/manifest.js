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
    { id: 'postulantes.tablero', label: 'Postulantes', pestana: 'Tablero', icono: 'users', vista: () => import('./vistas/tablero.js?v=f07c4a3') },
    { id: 'postulantes.ficha', label: 'Postulante', oculto: true, padre: 'postulantes.tablero', vista: () => import('./vistas/postulante.js?v=f07c4a3') },
    { id: 'postulantes.procesos', label: 'Procesos de selección', pestana: 'Procesos', icono: 'briefcase', vista: () => import('./vistas/procesos.js?v=f07c4a3') },
    { id: 'postulantes.etapas', ajustes: true, label: 'Etapas', icono: 'columnas', vista: () => import('./vistas/etapas.js?v=f07c4a3') },
  ],
  config: {},
  migraciones: ['db/001_postulantes.sql'],
};
