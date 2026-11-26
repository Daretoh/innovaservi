export default {
  id: 'marcaje',
  nombre: 'Marcaje en tablet',
  version: '1.0.0',
  icono: 'reloj',
  // Opción del menú (apartado) y, si se une con pantallas de otro módulo, a cuál
  apartados: { asistencia: { label: 'Asistencia', icono: 'reloj' } },
  categoria: 'RRHH',
  // Sin opción en el "+" del teléfono (2026-11-25, Enzo): marcar es cosa de la tablet, que entra por el menú
  depende: ['nucleo', 'personas', 'asistencia'],
  rubros: ['todos'],
  acciones: ['ver', 'crear'],
  menu: [
    { id: 'marcaje.tablet', label: 'Marcar asistencia', pestana: 'Marcar en tablet', apartado: 'asistencia', vista: () => import('./vistas/tablet.js?v=76c5d2a') },
    { id: 'marcaje.terreno', label: 'Asistencia en terreno', pestana: 'En terreno', apartado: 'asistencia', icono: 'users', vista: () => import('./vistas/terreno.js?v=76c5d2a') },
    { id: 'marcaje.vueltas', label: 'Vueltas del chofer', pestana: 'Vueltas', apartado: 'asistencia', icono: 'camion', vista: () => import('./vistas/vueltas.js?v=76c5d2a') },
    { id: 'marcaje.mias', label: 'Mis horas', apartado: 'asistencia', vista: () => import('./vistas/mias.js?v=76c5d2a') },
  ],
  config: {},
  migraciones: ['db/001_marcaje.sql', 'db/002_terreno.sql', 'db/003_vueltas.sql', 'db/004_motivo_salida.sql', 'db/005_solo_fijos.sql', 'db/006_varias_empresas.sql', 'db/007_salida_cierra.sql', 'db/008_licencia_vueltas.sql'],
};
