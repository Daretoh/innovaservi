// Capacitaciones: biblioteca de contenidos por área (videos, enlaces de YouTube/Instagram/TikTok, guías y PDF),
// rutas por cargo con avance por trabajador (visto / aprobado) y sesiones con asistentes, evaluación y registro firmado.
// Innova usa Biblioteca y Sesiones; Performance, Biblioteca, Rutas y Avance (pantallas_ocultas por empresa).
export default {
  id: 'capacitaciones',
  nombre: 'Capacitaciones',
  version: '1.0.0',
  icono: 'birrete',
  apartados: { capacitaciones: { label: 'Capacitaciones', icono: 'birrete' } },
  categoria: 'RRHH',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],   // aprobar: evaluar (aprobado / no aprobado)
  menu: [
    { id: 'capacitaciones.biblioteca', label: 'Capacitaciones', pestana: 'Biblioteca', icono: 'birrete', vista: () => import('./vistas/biblioteca.js?v=0eddacc') },
    { id: 'capacitaciones.contenido', label: 'Contenido', oculto: true, padre: 'capacitaciones.biblioteca', compartida: true, vista: () => import('./vistas/contenido.js?v=0eddacc') },
    { id: 'capacitaciones.sesiones', label: 'Sesiones de capacitación', pestana: 'Sesiones', icono: 'calendario', vista: () => import('./vistas/sesiones.js?v=0eddacc') },
    { id: 'capacitaciones.sesion', label: 'Sesión', oculto: true, padre: 'capacitaciones.sesiones', vista: () => import('./vistas/sesion.js?v=0eddacc') },
    { id: 'capacitaciones.rutas', label: 'Rutas de capacitación', pestana: 'Rutas', icono: 'lista', vista: () => import('./vistas/rutas.js?v=0eddacc') },
    { id: 'capacitaciones.ruta', label: 'Ruta', oculto: true, padre: 'capacitaciones.rutas', vista: () => import('./vistas/ruta.js?v=0eddacc') },
    { id: 'capacitaciones.avance', label: 'Avance por trabajador', pestana: 'Avance', icono: 'users', vista: () => import('./vistas/avance.js?v=0eddacc') },
    { id: 'capacitaciones.areas', label: 'Áreas', pestana: 'Áreas', icono: 'ajustes', ajustes: true, vista: () => import('./vistas/areas.js?v=0eddacc') },
  ],
  migraciones: ['db/001_capacitaciones.sql'],
};
