export default {
  id: 'marcaje',
  nombre: 'Marcaje en tablet',
  version: '1.0.0',
  icono: 'reloj',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { asistencia: { label: 'Asistencia', icono: 'reloj' } },
  categoria: 'RRHH',
  // Teléfono: "Marcar asistencia" en el "+" (2026-11-16, Enzo). `unir`: también se suma a un "+" de una sola acción
  // (Taller: Agendar vehículo), que pasa a abanico
  movil: {
    extra: [{ label: 'Marcar asistencia', icono: 'reloj', requiere: ['marcaje', 'crear'], ruta: 'marcaje.tablet', unir: true, abrir: () => { location.hash = '#/marcaje.tablet'; } }],
  },
  depende: ['nucleo', 'personas', 'asistencia'],
  rubros: ['todos'],
  acciones: ['ver', 'crear'],
  menu: [
    { id: 'marcaje.tablet', label: 'Marcar asistencia', pestana: 'Marcar en tablet', apartado: 'asistencia', vista: () => import('./vistas/tablet.js?v=40804ef') },
    { id: 'marcaje.terreno', label: 'Asistencia en terreno', pestana: 'En terreno', apartado: 'asistencia', icono: 'users', vista: () => import('./vistas/terreno.js?v=40804ef') },
    { id: 'marcaje.vueltas', label: 'Vueltas del chofer', pestana: 'Vueltas', apartado: 'asistencia', icono: 'camion', vista: () => import('./vistas/vueltas.js?v=40804ef') },
    { id: 'marcaje.mias', label: 'Mis horas', apartado: 'asistencia', vista: () => import('./vistas/mias.js?v=40804ef') },
  ],
  config: {},
  migraciones: ['db/001_marcaje.sql', 'db/002_terreno.sql', 'db/003_vueltas.sql', 'db/004_motivo_salida.sql', 'db/005_solo_fijos.sql', 'db/006_varias_empresas.sql'],
};
