export default {
  id: 'sst',
  nombre: 'Prevención SST',
  version: '1.0.0',
  icono: 'escudo',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas', 'terceros'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  // Orden de Enzo (2026-11-26: Documentos preventivos primero, antes 2026-11-24): Preventivos, Entregas, En terreno (lo que lleva cada faena), Salidas médicas y al final la
  // estadística. Accidentes e Informe mensual se ocultan por empresa donde no se usan (en Innova, Salidas médicas los cubre).
  menu: [
    { id: 'sst.documentos', label: 'Documentos preventivos', pestana: 'Documentos preventivos', vista: () => import('./vistas/documentos.js?v=99f3bd0') },
    { id: 'sst.cargos', label: 'Documentos por cargo', oculto: true, padre: 'sst.documentos', icono: 'users', vista: () => import('./vistas/cargos.js?v=99f3bd0') },
    { id: 'sst.editar', label: 'Editar documento', oculto: true, padre: 'sst.documentos', icono: 'editar', vista: () => import('./vistas/editar.js?v=99f3bd0') },
    { id: 'sst.entregas', label: 'Registros de entrega', pestana: 'Entregas', vista: () => import('./vistas/entregas.js?v=99f3bd0') },
    { id: 'sst.entrega', label: 'Registro de entrega', oculto: true, padre: 'sst.entregas', vista: () => import('./vistas/entrega.js?v=99f3bd0') },
    { id: 'sst.lote', label: 'Entrega', oculto: true, padre: 'sst.entregas', vista: () => import('./vistas/lote.js?v=99f3bd0') },
    { id: 'sst.terreno', label: 'Faenas en terreno', pestana: 'En terreno', icono: 'camion', vista: () => import('./vistas/terreno.js?v=99f3bd0') },
    { id: 'sst.formatos', label: 'Formatos del cliente', pestana: 'Formatos del cliente', icono: 'documento', vista: () => import('./vistas/formatos.js?v=99f3bd0') },
    { id: 'sst.salidas', label: 'Salidas médicas', vista: () => import('./vistas/salidas.js?v=99f3bd0') },
    { id: 'sst.accidentes', label: 'Accidentes e incidentes', pestana: 'Accidentes', vista: () => import('./vistas/accidentes.js?v=99f3bd0') },
    { id: 'sst.accidente', label: 'Accidente', oculto: true, padre: 'sst.accidentes', vista: () => import('./vistas/accidente.js?v=99f3bd0') },
    { id: 'sst.informes', label: 'Informe mensual de accidentes', pestana: 'Informe mensual', vista: () => import('./vistas/informes.js?v=99f3bd0') },
    { id: 'sst.estadistica', label: 'Estadística de accidentabilidad', pestana: 'Estadística', icono: 'grafico', vista: () => import('./vistas/estadistica.js?v=99f3bd0') },
    // Datos del representante y la prevencionista con sus firmas: los mismos de los documentos (gen_config)
    { id: 'sst.config', ajustes: true, label: 'Datos y firmas', icono: 'ajustes', vista: () => import('../documentos/vistas/config.js?v=99f3bd0') },
    { id: 'sst.mandantes', ajustes: true, label: 'Mandantes del informe mensual', oculto: true, padre: 'sst.informes', vista: () => import('./vistas/config.js?v=99f3bd0') },
  ],
  config: {},
  migraciones: ['db/001_sst.sql', 'db/002_documentos.sql', 'db/003_estadistica.sql', 'db/004_revisiones_ia.sql', 'db/005_documentos_entrega.sql', 'db/006_lote_acreditacion.sql', 'db/007_documento_editable.sql', 'db/008_categorias.sql', 'db/009_formatos_cliente.sql', 'db/010_documentos_por_cargo.sql'],
};
