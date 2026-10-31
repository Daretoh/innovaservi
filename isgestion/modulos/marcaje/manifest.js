export default {
  id: 'marcaje',
  nombre: 'Marcaje en tablet',
  version: '1.0.0',
  icono: 'reloj',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { asistencia: { label: 'Asistencia', icono: 'reloj' } },
  categoria: 'Personas',
  depende: ['nucleo', 'personas', 'asistencia'],
  rubros: ['todos'],
  acciones: ['ver', 'crear'],
  menu: [
    { id: 'marcaje.tablet', label: 'Marcar asistencia', pestana: 'Marcar en tablet', apartado: 'asistencia', vista: () => import('./vistas/tablet.js?v=66a811d') },
    { id: 'marcaje.terreno', label: 'Asistencia en terreno', pestana: 'En terreno', apartado: 'asistencia', icono: 'users', vista: () => import('./vistas/terreno.js?v=66a811d') },
    { id: 'marcaje.vueltas', label: 'Vueltas del chofer', pestana: 'Vueltas', apartado: 'asistencia', icono: 'camion', vista: () => import('./vistas/vueltas.js?v=66a811d') },
    { id: 'marcaje.mias', label: 'Mis horas', apartado: 'asistencia', vista: () => import('./vistas/mias.js?v=66a811d') },
  ],
  config: {},
  migraciones: ['db/001_marcaje.sql', 'db/002_terreno.sql', 'db/003_vueltas.sql'],
};
