export default {
  id: 'mkt',
  nombre: 'Marketing y redes',
  version: '1.0.0',
  icono: 'megafono',
  // Etapa 1 (seguimiento sin conexión a Meta). Propuesta completa: bóveda 08 ISgestión/10 Módulo Marketing.md
  apartados: { mkt: { label: 'Marketing', icono: 'megafono' } },
  categoria: 'Comercial',
  depende: ['nucleo', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],
  menu: [
    { id: 'mkt.embudo', label: 'Embudo', icono: 'columnas', vista: () => import('./vistas/embudo.js?v=c9a2c01') },
    { id: 'mkt.contacto', label: 'Contacto', oculto: true, padre: 'mkt.embudo', compartida: true, vista: () => import('./vistas/contacto.js?v=c9a2c01') },
    { id: 'mkt.clientes', label: 'Clientes', icono: 'briefcase', vista: () => import('./vistas/clientes.js?v=c9a2c01') },
    { id: 'mkt.contactos', label: 'Oportunidades', icono: 'users', vista: () => import('./vistas/contactos.js?v=c9a2c01') },
    { id: 'mkt.campanas', label: 'Campañas', icono: 'megafono', vista: () => import('./vistas/campanas.js?v=c9a2c01') },
    { id: 'mkt.calendario', label: 'Calendario de contenido', pestana: 'Calendario', icono: 'calendario', vista: () => import('./vistas/calendario.js?v=c9a2c01') },
    { id: 'mkt.indicadores', label: 'Indicadores', icono: 'grafico', vista: () => import('./vistas/indicadores.js?v=c9a2c01') },
    { id: 'mkt.ajustes', label: 'Etapas y respuestas', pestana: 'Ajustes', icono: 'ajustes', ajustes: true, vista: () => import('./vistas/ajustes.js?v=c9a2c01') },
  ],
  config: {},
  migraciones: ['db/001_mkt.sql', 'db/002_origen_cliente.sql', 'db/003_formulario.sql', 'db/004_formulario_campana.sql'],
};
