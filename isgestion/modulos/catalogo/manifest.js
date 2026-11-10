export default {
  id: 'catalogo',
  nombre: 'Catálogo de equipamiento',
  version: '1.1.0',
  icono: 'etiqueta',
  apartados: { catalogo: { label: 'Catálogo', icono: 'etiqueta' } },
  categoria: 'Comercial',
  depende: ['nucleo'],
  rubros: ['automotriz'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'exportar'],   // aprobar: ver y cambiar costos y márgenes
  menu: [
    { id: 'catalogo.productos', label: 'Catálogo de equipamiento', pestana: 'Productos', icono: 'etiqueta', vista: () => import('./vistas/productos.js?v=dd03031') },
    { id: 'catalogo.producto', label: 'Producto', oculto: true, padre: 'catalogo.productos', vista: () => import('./vistas/producto.js?v=dd03031') },
    { id: 'catalogo.ajustes', label: 'Categorías y marcas', pestana: 'Categorías y marcas', icono: 'ajustes', ajustes: true, vista: () => import('./vistas/ajustes.js?v=dd03031') },
  ],
  config: {
    frase: { tipo: 'text', etiqueta: 'Frase bajo el título del PDF', default: 'Protección, diseño y funcionalidad para tu camioneta' },
    aviso: { tipo: 'text', etiqueta: 'Aviso al pie de cada página del PDF', default: 'Consulta por compatibilidad con tu camioneta' },
    whatsapp: { tipo: 'text', etiqueta: 'WhatsApp para el PDF (si no, el teléfono de la empresa)', default: '' },
    instagram: { tipo: 'text', etiqueta: 'Instagram para el PDF', default: '' },
    cierre: { tipo: 'text', etiqueta: 'Texto de la última página del PDF', default: 'Gracias por confiar en nosotros.' },
  },
  migraciones: ['db/001_catalogo.sql', 'db/002_versiones_galeria.sql'],
};
