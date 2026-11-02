// Espacio Grupo (02 Arquitectura §7): todas las empresas del usuario juntas. Se entra desde el selector de empresa
// ("Grupo"); no se activa por empresa (espacio: 'grupo'). Cada pantalla calcula cada empresa con los permisos que el
// usuario tiene en ella; `requiere` = permiso que debe tener en al menos una empresa. Reemplaza a Gerencia (Enzo, 2026-10-31).
export default {
  id: 'grupo',
  nombre: 'Grupo',
  version: '1.1.0',
  icono: 'building',
  espacio: 'grupo',
  categoria: 'Grupo',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: [],
  menu: [
    { id: 'grupo.alertas', label: 'Alertas y pendientes', icono: 'campana', vista: () => import('./vistas/alertas.js?v=eb25cc4') },
    { id: 'grupo.tareas', label: 'Tareas del grupo', icono: 'check', requiere: ['tareas', 'ver'], vista: () => import('./vistas/tareas.js?v=eb25cc4') },
    { id: 'grupo.remu', label: 'Cierre de remuneraciones', icono: 'dinero', requiere: ['remu', 'ver'], vista: () => import('./vistas/remu.js?v=eb25cc4') },
    { id: 'grupo.personal', label: 'Personal del grupo', icono: 'users', requiere: ['rrhh', 'ver'], vista: () => import('./vistas/personal.js?v=eb25cc4') },
    { id: 'grupo.resultados', label: 'Resultados del grupo', icono: 'grafico', requiere: ['resultados', 'ver'], vista: () => import('./vistas/resultados.js?v=eb25cc4') },
  ],
  config: {},
  migraciones: [],
};
