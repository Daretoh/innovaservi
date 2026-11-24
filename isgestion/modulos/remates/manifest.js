// Remates (prueba, Enzo 2026-11-23): pantallas del espacio Grupo, en su propia categoría "Inversiones" debajo de lo
// demás. Los datos son de la empresa donde el módulo está activo (Innova); `requiere` muestra las pantallas solo a quien
// tiene Remates en alguna empresa. La configuración se guarda en empresa_modulos.config de esa empresa.
export default {
  id: 'remates',
  nombre: 'Remates',
  version: '1.0.0',
  icono: 'martillo',
  espacio: 'grupo',
  apartados: { remates: { label: 'Remates', icono: 'martillo' } },
  categoria: 'Inversiones',
  depende: ['nucleo'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'remates.lista', label: 'Remates', pestana: 'Oportunidades', icono: 'martillo', requiere: ['remates', 'ver'], vista: () => import('./vistas/lista.js?v=9dd99fc') },
    { id: 'remates.ficha', label: 'Oportunidad', oculto: true, padre: 'remates.lista', requiere: ['remates', 'ver'], vista: () => import('./vistas/ficha.js?v=9dd99fc') },
    { id: 'remates.aprender', label: 'Aprender', pestana: 'Aprender', icono: 'birrete', requiere: ['remates', 'ver'], vista: () => import('./vistas/aprender.js?v=9dd99fc') },
    { id: 'remates.guia', label: 'Cómo funciona', pestana: 'Cómo funciona y fuentes', icono: 'documento', requiere: ['remates', 'ver'], vista: () => import('./vistas/guia.js?v=9dd99fc') },
  ],
  config: {
    comunas: { tipo: 'text', etiqueta: 'Comunas de interés (separadas por coma; la primera es el filtro por defecto y suman puntaje)', default: 'Puerto Montt' },
    centro: { tipo: 'text', etiqueta: 'Centro de referencia para medir la distancia (latitud, longitud)', default: '-41.4718,-72.9396' },
    centro_nombre: { tipo: 'text', etiqueta: 'Nombre del centro de referencia', default: 'Plaza de Armas de Puerto Montt' },
    regiones: { tipo: 'text', etiqueta: 'Regiones de interés (separadas por coma; suman menos puntaje que la comuna)', default: 'Los Lagos' },
    tope_normal: { tipo: 'number', etiqueta: 'Presupuesto para un sitio o propiedad normal ($)', default: 50000000 },
    tope_grande: { tipo: 'number', etiqueta: 'Presupuesto para algo más grande: terreno de 5.000 m² o más, galpón, maquinaria ($)', default: 100000000 },
    gastos_inmueble: { tipo: 'number', etiqueta: 'Gastos de compra estimados de un inmueble: escritura, CBR, abogado (% del mínimo)', default: 4 },
    gastos_otros: { tipo: 'number', etiqueta: 'Gastos de compra estimados de vehículos y maquinaria: comisión del martillero con IVA, transferencia (% del mínimo)', default: 12 },
  },
  migraciones: ['db/001_remates.sql'],
};
